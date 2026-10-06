// Agent sign-in and the per-agent AEP dashboard.
//
// Routes (all outside the board key — agents never see it):
//   GET  /             sign-in page, or straight to /me when already signed in
//   POST /login        NPN in, signed session cookie out
//   GET  /logout       clears the session
//   GET  /me           the signed-in agent's dashboard (a manager adds ?agent=<npn>)
//   GET  /api/me       that dashboard's numbers (the page polls this)
//   GET  /team         managers only: every agent, each a link to their dashboard
//   GET  /api/team     that list's numbers
//   GET  /me/logo.png  the Get Health-e logo the pages carry
//   POST /ingest/agents  roster + per-agent AEP counts (bearer secret, same as /ingest)
//
// Between pushes, sales move the dashboards straight off the Onyx webhook: each
// delivery names the agent's NPN, so it is recorded against that NPN and added
// on top of the last push (see liveSales). The hourly push stays the source of
// truth and clears what it has absorbed, so a missed or duplicated delivery
// heals within the hour instead of compounding.
//
// Sign-in is by NPN alone, by design: the page shows an agent's own sales
// counts and goals, nothing about any customer. An NPN is a public number, so
// this identifies an agent rather than proving who is at the keyboard — the
// rate limit below only stops someone walking the number space.

import AGENT_LOGIN_PAGE from './boards/agent_login.html';
import AGENT_DASHBOARD_PAGE from './boards/agent_dashboard.html';
import TEAM_PAGE from './boards/agent_team.html';
import MANAGERS from './managers.json';
import GAME_PLANS from './agent_goals.json';
import GHE_LOGO from '../assets/ghe-logo.png';

const SESSION_COOKIE = 'ghe_agent';
const SESSION_DAYS = 30;

// Failed sign-ins per IP before a short lockout. The whole floor can share one
// office IP, so this is set for a room full of typos, not one person.
const FAIL_LIMIT = 30;
const FAIL_WINDOW_MS = 10 * 60 * 1000;

// The manager view also needs a PIN. Wrong PINs are counted per manager as well
// as per IP, so a four-digit PIN can't be walked from many addresses at once.
const PIN_FAIL_LIMIT = 10;
const PIN_COOKIE = 'ghe_pin';
const PIN_STEP_SECONDS = 5 * 60;

const DEFAULT_GOALS = { core: 140, combo: 30 };

// Each agent's Core goal comes from their AEP Game Plan (Jotform), by NPN.
// Which plan an agent signed (Option A or B) is for managers only: it is
// returned by /api/team and never by /api/me.
const PLANS = GAME_PLANS.goals || {};

function goalsFor(feed, r) {
  return {
    core: r.core_goal || PLANS[r.npn]?.core_goal || feed.goals?.core || DEFAULT_GOALS.core,
    combo: r.combo_goal || feed.goals?.combo || DEFAULT_GOALS.combo,
  };
}
const DEFAULT_QUOTE = 'Success is the sum of small efforts, repeated day in and day out.';

const PAGE_HEADERS = {
  'content-type': 'text/html;charset=utf-8',
  'cache-control': 'no-store',
  'content-security-policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; form-action 'self'; base-uri 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
};

export const AGENT_PATHS = new Set(['/', '/login', '/logout', '/me', '/api/me', '/team', '/api/team', '/me/logo.png', '/ingest/agents']);

// Managers sign in with their NPN like anyone else, but they are not on the
// floor roster the Routine pushes, so they are listed here. A manager lands on
// the team list and can open any agent's dashboard. Adding one is a line in
// managers.json and a deploy. A manager NPN alone opens nothing: the sign-in
// asks for the admin PIN next, and only a session minted after the PIN carries
// manager rights.
const MANAGER_BY_NPN = new Map(MANAGERS.managers.map((m) => [String(m.npn), m]));

export async function handleAgentRoute(request, env, path, { checkBearer }) {
  if (path === '/ingest/agents') {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    return handleAgentIngest(request, env, checkBearer);
  }

  if (path === '/me/logo.png') {
    return new Response(GHE_LOGO, {
      headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' },
    });
  }

  if (path === '/logout') {
    return redirect('/', [clearCookie(), clearPinCookie()]);
  }

  if (path === '/login' && request.method === 'POST') return handleLogin(request, env);

  const session = await readSession(request, env);
  const npn = session?.npn || null;
  const manager = session?.admin ? MANAGER_BY_NPN.get(npn) || null : null;
  const self = npn && !manager ? await findAgent(env, npn) : null;

  if (path === '/' || path === '/login') {
    if (manager) return redirect('/team');
    if (self) return redirect('/me');
    const q = url(request).searchParams;
    if (q.get('step') === 'pin' && (await pendingPinNpn(request, env))) return pinPage(q.get('e'));
    return loginPage(q.get('e'));
  }

  if (path === '/team') {
    if (!manager) return redirect(self ? '/me' : '/');
    return new Response(TEAM_PAGE, { headers: PAGE_HEADERS });
  }

  if (path === '/api/team') {
    if (!manager) return jsonNoStore({ error: 'signed_out' }, 401);
    return jsonNoStore(await teamView(env, manager));
  }

  if (path === '/me') {
    if (manager) return new Response(AGENT_DASHBOARD_PAGE, { headers: PAGE_HEADERS });
    if (!self) return redirect('/', clearCookie());
    return new Response(AGENT_DASHBOARD_PAGE, { headers: PAGE_HEADERS });
  }

  if (path === '/api/me') {
    // An agent always gets their own numbers, whatever ?agent= says; only a
    // manager can look at someone else's.
    if (manager) {
      const who = String(url(request).searchParams.get('agent') || '').replace(/\D/g, '');
      const agent = who ? await findAgent(env, who) : null;
      if (!agent) return jsonNoStore({ error: 'not_found', manager: true }, 404);
      return jsonNoStore({ ...agent, viewer: { manager: true, name: manager.name } });
    }
    if (!self) return jsonNoStore({ error: 'signed_out' }, 401);
    return jsonNoStore(self);
  }

  return new Response('Not found', { status: 404 });
}

// ---------- sign-in ----------

async function handleLogin(request, env) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  if (await lockedOut(env, ip)) return redirect('/?e=wait');

  let npn = '';
  let pin = null;
  try {
    const form = await request.formData();
    npn = String(form.get('npn') || '').replace(/\D/g, '');
    if (form.has('pin')) pin = String(form.get('pin') || '').trim();
  } catch (e) { /* not a form post: falls through as an unknown NPN */ }

  // Second step for managers: the PIN, checked against the NPN the first step
  // vouched for in a short-lived signed cookie.
  if (pin !== null) {
    const who = await pendingPinNpn(request, env);
    if (!who) return redirect('/');
    const npnKey = `pin:${who}`;
    if (await lockedOut(env, npnKey, PIN_FAIL_LIMIT)) return redirect('/?step=pin&e=wait');
    if (!(await pinMatches(env, pin))) {
      await noteFailure(env, ip);
      await noteFailure(env, npnKey);
      return redirect('/?step=pin&e=pin');
    }
    return redirect('/team', [await sessionCookie(env, who, true), clearPinCookie()]);
  }

  if (npn && MANAGER_BY_NPN.has(npn)) return redirect('/?step=pin', await pinCookie(env, npn));
  const agent = npn ? await findAgent(env, npn) : null;
  if (!agent) {
    await noteFailure(env, ip);
    return redirect('/?e=nf');
  }
  return redirect('/me', await sessionCookie(env, npn));
}

function pinPage(errorCode) {
  const messages = {
    pin: "That PIN isn't right. Try again.",
    wait: 'Too many wrong PINs. Wait a few minutes and try again.',
  };
  const msg = messages[errorCode] || '';
  const form = `<form method="post" action="/login" autocomplete="off">
    <label for="pin">ADMIN PIN</label>
    <input id="pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]{4,8}" maxlength="8" required autofocus placeholder="••••">
    <button type="submit">OPEN MANAGER VIEW</button>
  </form>
  <p class="note"><a href="/" style="color:#8fb2c9">Not a manager? Start over</a></p>`;
  const page = AGENT_LOGIN_PAGE
    .replace(/<!--FORM-->[\s\S]*<!--\/FORM-->/, form)
    .replace('Enter your NPN to see your AEP dashboard.', 'Enter the admin PIN for the manager view.')
    .replace('<!--ERROR-->', msg ? `<p class="err" role="alert">${msg}</p>` : '');
  return new Response(page, { headers: PAGE_HEADERS });
}

// The PIN is never in the code: the database holds a salted SHA-256 of it under
// kv 'admin_pin'. No row means no manager can get in — closed, not open.
async function pinMatches(env, pin) {
  if (!/^\d{4,8}$/.test(pin)) return false;
  const row = await env.DB.prepare('SELECT v FROM kv WHERE k = ?').bind('admin_pin').first();
  if (!row) return false;
  let rec;
  try { rec = JSON.parse(row.v); } catch (e) { return false; }
  if (!rec?.salt || !rec?.sha256) return false;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${rec.salt}:${pin}`));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return constantTimeEqual(hex, String(rec.sha256).toLowerCase());
}

function loginPage(errorCode) {
  const messages = {
    nf: "We couldn't find that NPN on the floor roster. Check the number and try again.",
    wait: 'Too many tries from this network. Wait a few minutes and try again.',
  };
  const msg = messages[errorCode] || '';
  // The page is static; the one dynamic piece is which fixed message to show,
  // and it is chosen from the table above, never echoed from the request.
  const page = AGENT_LOGIN_PAGE.replace('<!--ERROR-->', msg ? `<p class="err" role="alert">${msg}</p>` : '');
  return new Response(page, { headers: PAGE_HEADERS });
}

async function lockedOut(env, key, limit = FAIL_LIMIT) {
  const row = await env.DB.prepare('SELECT v FROM kv WHERE k = ?').bind(`loginfail:${key}`).first();
  if (!row) return false;
  try {
    const { count, since } = JSON.parse(row.v);
    return Date.now() - since < FAIL_WINDOW_MS && count >= limit;
  } catch (e) {
    return false;
  }
}

async function noteFailure(env, key) {
  const k = `loginfail:${key}`;
  const now = Date.now();
  const row = await env.DB.prepare('SELECT v FROM kv WHERE k = ?').bind(k).first();
  let rec = { count: 0, since: now };
  if (row) {
    try {
      const prev = JSON.parse(row.v);
      if (now - prev.since < FAIL_WINDOW_MS) rec = prev;
    } catch (e) { /* unreadable: start a fresh window */ }
  }
  rec.count += 1;
  await env.DB.prepare(
    'INSERT INTO kv (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at'
  ).bind(k, JSON.stringify(rec), new Date(now).toISOString()).run();
  // Old windows are dead weight; sweep them on the way past.
  await env.DB.prepare("DELETE FROM kv WHERE k LIKE 'loginfail:%' AND updated_at < ?")
    .bind(new Date(now - 24 * 60 * 60 * 1000).toISOString()).run();
}

// ---------- the agent's numbers ----------

async function loadAgentFeed(env) {
  const row = await env.DB.prepare('SELECT v FROM kv WHERE k = ?').bind('agent_dash').first();
  if (!row) return null;
  try { return JSON.parse(row.v); } catch (e) { return null; }
}

// The roster is the last push: an agent who drops off the floor loses access
// at the next refresh, without anyone having to remember to remove them.
async function findAgent(env, npn) {
  const feed = await loadAgentFeed(env);
  if (!feed || !Array.isArray(feed.rows)) return null;
  const r = feed.rows.find((x) => x.npn === npn);
  if (!r) return null;
  const live = await liveSales(env, feed, npn);
  const add = live.byNpn.get(npn) || { core: 0, combo: 0 };
  const goal = goalsFor(feed, r);
  return {
    name: r.agent,
    core: { sales: r.core + add.core, goal: goal.core },
    combo: { sales: r.combo + add.combo, goal: goal.combo },
    quote: feed.quote || DEFAULT_QUOTE,
    window: feed.window || null,
    generated_at: feed.generated_at || null,
    as_of: add.core + add.combo > 0 ? live.newest : feed.generated_at || null,
    server_now: new Date().toISOString(),
  };
}

// Sales the webhook has delivered since the last push, per NPN. Only policies
// *written* after the push count: anything submitted before it is already in
// the pushed numbers, and an edit to an old policy arrives now but belongs to
// then. Same window and same no-future-dates rule as the Routine's query.
async function liveSales(env, feed, npn) {
  const out = { byNpn: new Map(), newest: null };
  if (!feed?.generated_at) return out;
  const sql = 'SELECT npn, product, submitted_at, ts FROM agent_dash_events WHERE submitted_at > ?' + (npn ? ' AND npn = ?' : '');
  let rows;
  try {
    const stmt = env.DB.prepare(sql);
    rows = (await (npn ? stmt.bind(isoZ(feed.generated_at), npn) : stmt.bind(isoZ(feed.generated_at))).all()).results || [];
  } catch (e) {
    return out; // table not there yet: the pushed numbers alone are still right
  }
  const from = feed.window?.from || '2026-10-15';
  const to = feed.window?.to || '2026-12-07';
  const now = Date.now();
  for (const e of rows) {
    const t = Date.parse(e.submitted_at);
    const day = etDate(e.submitted_at);
    if (!day || day < from || day > to || t > now) continue;
    const cur = out.byNpn.get(e.npn) || { core: 0, combo: 0 };
    if (e.product === 'core') cur.core += 1;
    else if (e.product === 'sthhc' || e.product === 'hi') cur.combo += 1;
    else continue;
    out.byNpn.set(e.npn, cur);
    if (!out.newest || e.ts > out.newest) out.newest = e.ts;
  }
  return out;
}

// Called from the Onyx webhook for every verified delivery. Upserts by policy,
// so an update replaces the earlier record rather than adding a second sale.
export async function recordAgentSale(env, { policyId, product, npn, submittedAt }) {
  const n = String(npn ?? '').replace(/\D/g, '');
  if (!n || policyId == null || !submittedAt) return;
  await env.DB.prepare(
    'INSERT INTO agent_dash_events (policy_id, ts, submitted_at, product, npn) VALUES (?, ?, ?, ?, ?) ' +
    'ON CONFLICT(policy_id) DO UPDATE SET ts = excluded.ts, submitted_at = excluded.submitted_at, product = excluded.product, npn = excluded.npn'
  ).bind(policyId, new Date().toISOString(), isoZ(submittedAt), product, n).run();
}

function etDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

// Normalise to the one ISO form (UTC, milliseconds, Z) so string comparisons in
// SQL line up between pushed and delivered timestamps.
function isoZ(value) {
  const s = String(value);
  const d = new Date(/[Zz]|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s}Z`);
  return isNaN(d) ? s : d.toISOString();
}

async function teamView(env, manager) {
  const feed = await loadAgentFeed(env);
  const live = await liveSales(env, feed, null);
  const rows = (feed?.rows || []).map((r) => {
    const add = live.byNpn.get(r.npn) || { core: 0, combo: 0 };
    const goal = goalsFor(feed, r);
    return {
      npn: r.npn,
      name: r.agent,
      plan: PLANS[r.npn]?.plan || null,
      core: { sales: r.core + add.core, goal: goal.core },
      combo: { sales: r.combo + add.combo, goal: goal.combo },
    };
  });
  return {
    viewer: { manager: true, name: manager.name },
    window: feed?.window || null,
    generated_at: feed?.generated_at || null,
    rows,
  };
}

async function handleAgentIngest(request, env, checkBearer) {
  const denied = checkBearer(request, env);
  if (denied) return denied;
  const body = await request.json();
  const seen = new Set();
  const rows = Array.isArray(body.rows)
    ? body.rows.map((r) => ({
        npn: String(r.npn ?? '').replace(/\D/g, ''),
        agent: String(r.agent || '').trim(),
        core: Number(r.core),
        combo: Number(r.combo),
        ...(Number(r.core_goal) > 0 ? { core_goal: Number(r.core_goal) } : {}),
        ...(Number(r.combo_goal) > 0 ? { combo_goal: Number(r.combo_goal) } : {}),
      }))
    : null;
  const count = (n) => Number.isInteger(n) && n >= 0;
  // An empty or malformed roster is a failed query, not a floor with nobody on
  // it — refuse it so nobody is locked out by a bad push. A repeated NPN would
  // sign two people into one dashboard; refuse that too.
  const bad = !rows || !rows.length || rows.some((r) => {
    const dup = seen.has(r.npn);
    seen.add(r.npn);
    return dup || r.npn.length < 5 || !r.agent || !count(r.core) || !count(r.combo);
  });
  if (bad) {
    return new Response('rows must be a non-empty list of {npn, agent, core, combo} with unique NPNs', { status: 400 });
  }
  const feed = {
    generated_at: body.generated_at || new Date().toISOString(),
    window: body.window || { from: '2026-10-15', to: '2026-12-07' },
    goals: body.goals || DEFAULT_GOALS,
    quote: typeof body.quote === 'string' && body.quote.trim() ? body.quote.trim().slice(0, 300) : null,
    rows,
  };
  // A push without a quote keeps the one already showing.
  if (!feed.quote) {
    const prev = await loadAgentFeed(env);
    feed.quote = prev?.quote || null;
  }
  await env.DB.prepare(
    'INSERT INTO kv (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at'
  ).bind('agent_dash', JSON.stringify(feed), new Date().toISOString()).run();
  // Sales written before this push are in its numbers now; anything left past
  // two days is stale either way.
  try {
    await env.DB.prepare('DELETE FROM agent_dash_events WHERE submitted_at <= ? OR ts < ?')
      .bind(isoZ(feed.generated_at), new Date(Date.now() - 2 * 86400000).toISOString()).run();
  } catch (e) { /* table not created yet: nothing to prune */ }
  return jsonNoStore({ ok: true, rows: rows.length });
}

// ---------- session cookie ----------

// <npn>.<expiry ms>.<hmac>. Signed with a key derived from the Worker's own
// secret, so no new secret has to be provisioned; rotating that secret signs
// everyone out, which is the right outcome.
async function signingKey(env) {
  const base = env.AGENT_SESSION_SECRET || env.BOARD_KEY;
  if (!base) return null;
  return crypto.subtle.importKey(
    'raw', new TextEncoder().encode(`agent-session:${base}`),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
  );
}

async function sign(env, msg) {
  const key = await signingKey(env);
  if (!key) return null;
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// An admin session is marked in the cookie (".a") and signed over a different
// message, so an agent cookie can't be turned into one by editing it.
async function sessionCookie(env, npn, admin = false) {
  const exp = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const sig = await sign(env, `${admin ? 'admin:' : ''}${npn}.${exp}`);
  if (!sig) throw new Error('agent sign-in is not configured');
  const value = `${npn}.${exp}${admin ? '.a' : ''}.${sig}`;
  return `${SESSION_COOKIE}=${value}; Path=/; Max-Age=${SESSION_DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`;
}

// Proof that the NPN step named a manager, good for five minutes, so the PIN
// step knows whose PIN it is checking without trusting a form field.
async function pinCookie(env, npn) {
  const exp = Date.now() + PIN_STEP_SECONDS * 1000;
  const sig = await sign(env, `pin:${npn}.${exp}`);
  if (!sig) throw new Error('agent sign-in is not configured');
  return `${PIN_COOKIE}=${npn}.${exp}.${sig}; Path=/; Max-Age=${PIN_STEP_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}

function clearPinCookie() {
  return `${PIN_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

async function pendingPinNpn(request, env) {
  const m = /^(\d{5,12})\.(\d{10,16})\.([A-Za-z0-9_-]+)$/.exec(readCookie(request, PIN_COOKIE));
  if (!m) return null;
  const [, npn, exp, sig] = m;
  if (Number(exp) < Date.now() || !MANAGER_BY_NPN.has(npn)) return null;
  const want = await sign(env, `pin:${npn}.${exp}`);
  return want && constantTimeEqual(want, sig) ? npn : null;
}

function clearCookie() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

async function readSession(request, env) {
  const raw = readCookie(request, SESSION_COOKIE);
  const m = /^(\d{5,12})\.(\d{10,16})(\.a)?\.([A-Za-z0-9_-]+)$/.exec(raw);
  if (!m) return null;
  const [, npn, exp, flag, sig] = m;
  if (Number(exp) < Date.now()) return null;
  const admin = flag === '.a';
  const want = await sign(env, `${admin ? 'admin:' : ''}${npn}.${exp}`);
  if (!want || !constantTimeEqual(want, sig)) return null;
  return { npn, admin };
}

function readCookie(request, name) {
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return '';
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------- helpers ----------

function url(request) {
  return new URL(request.url);
}

function redirect(location, setCookie) {
  const headers = new Headers({ location, 'cache-control': 'no-store' });
  for (const c of [].concat(setCookie || [])) headers.append('set-cookie', c);
  return new Response(null, { status: 303, headers });
}

function jsonNoStore(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
