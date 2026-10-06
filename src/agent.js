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
// Sign-in is by NPN alone, by design: the page shows an agent's own sales
// counts and goals, nothing about any customer. An NPN is a public number, so
// this identifies an agent rather than proving who is at the keyboard — the
// rate limit below only stops someone walking the number space.

import AGENT_LOGIN_PAGE from './boards/agent_login.html';
import AGENT_DASHBOARD_PAGE from './boards/agent_dashboard.html';
import TEAM_PAGE from './boards/agent_team.html';
import MANAGERS from './managers.json';
import GHE_LOGO from '../assets/ghe-logo.png';

const SESSION_COOKIE = 'ghe_agent';
const SESSION_DAYS = 30;

// Failed sign-ins per IP before a short lockout. The whole floor can share one
// office IP, so this is set for a room full of typos, not one person.
const FAIL_LIMIT = 30;
const FAIL_WINDOW_MS = 10 * 60 * 1000;

const DEFAULT_GOALS = { core: 140, combo: 30 };
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
// managers.json and a deploy.
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
    return new Response(null, { status: 302, headers: { location: '/', 'set-cookie': clearCookie() } });
  }

  if (path === '/login' && request.method === 'POST') return handleLogin(request, env);

  const npn = await sessionNpn(request, env);
  const manager = npn ? MANAGER_BY_NPN.get(npn) || null : null;
  const self = npn && !manager ? await findAgent(env, npn) : null;

  if (path === '/' || path === '/login') {
    if (manager) return redirect('/team');
    if (self) return redirect('/me');
    return loginPage(url(request).searchParams.get('e'));
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
  try {
    const form = await request.formData();
    npn = String(form.get('npn') || '').replace(/\D/g, '');
  } catch (e) { /* not a form post: falls through as an unknown NPN */ }

  if (npn && MANAGER_BY_NPN.has(npn)) return redirect('/team', await sessionCookie(env, npn));
  const agent = npn ? await findAgent(env, npn) : null;
  if (!agent) {
    await noteFailure(env, ip);
    return redirect('/?e=nf');
  }
  return redirect('/me', await sessionCookie(env, npn));
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

async function lockedOut(env, ip) {
  const row = await env.DB.prepare('SELECT v FROM kv WHERE k = ?').bind(`loginfail:${ip}`).first();
  if (!row) return false;
  try {
    const { count, since } = JSON.parse(row.v);
    return Date.now() - since < FAIL_WINDOW_MS && count >= FAIL_LIMIT;
  } catch (e) {
    return false;
  }
}

async function noteFailure(env, ip) {
  const k = `loginfail:${ip}`;
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
  return {
    name: r.agent,
    core: { sales: r.core, goal: r.core_goal || feed.goals?.core || DEFAULT_GOALS.core },
    combo: { sales: r.combo, goal: r.combo_goal || feed.goals?.combo || DEFAULT_GOALS.combo },
    quote: feed.quote || DEFAULT_QUOTE,
    window: feed.window || null,
    generated_at: feed.generated_at || null,
    server_now: new Date().toISOString(),
  };
}

async function teamView(env, manager) {
  const feed = await loadAgentFeed(env);
  const rows = (feed?.rows || []).map((r) => ({
    npn: r.npn,
    name: r.agent,
    core: { sales: r.core, goal: r.core_goal || feed.goals?.core || DEFAULT_GOALS.core },
    combo: { sales: r.combo, goal: r.combo_goal || feed.goals?.combo || DEFAULT_GOALS.combo },
  }));
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

async function sessionCookie(env, npn) {
  const exp = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const body = `${npn}.${exp}`;
  const sig = await sign(env, body);
  if (!sig) throw new Error('agent sign-in is not configured');
  return `${SESSION_COOKIE}=${body}.${sig}; Path=/; Max-Age=${SESSION_DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`;
}

function clearCookie() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

async function sessionNpn(request, env) {
  const raw = readCookie(request, SESSION_COOKIE);
  const m = /^(\d{5,12})\.(\d{10,16})\.([A-Za-z0-9_-]+)$/.exec(raw);
  if (!m) return null;
  const [, npn, exp, sig] = m;
  if (Number(exp) < Date.now()) return null;
  const want = await sign(env, `${npn}.${exp}`);
  if (!want || !constantTimeEqual(want, sig)) return null;
  return npn;
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
  const headers = { location, 'cache-control': 'no-store' };
  if (setCookie) headers['set-cookie'] = setCookie;
  return new Response(null, { status: 303, headers });
}

function jsonNoStore(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
