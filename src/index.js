// Get Health-e floor TV boards — Cloudflare Worker.
//
// Routes:
//   GET  /board/live              today's running board
//   GET  /board/daily             yesterday's recap board
//   GET  /board/leaders/sthhc     MTD/last-month STHHC leaderboard
//   GET  /board/month-open        static month-open flyer (self-dating)
//   GET  /board/early-out         static early-out points counter (?sthhc=&core=&hi=&goal=&asof=)
//   GET  /board/rotation          cycles the above (one URL per TV)
//   GET  /board/run15             standalone STHHC "Run to 15" gauge (own screen)
//   GET  /board/run15/feed.js     that gauge's feed, rendered from the snapshot
//   GET  /console                 desk view: left menu rail + the boards in a frame
//   GET  /unlock                  saves the key on this device (?key=…&to=…), then redirects
//   GET  /k/<key>                 same, key in the path — survives link shorteners
//   GET  /api/stats               current merged snapshot (JSON)
//   POST /ingest                  snapshot push from the Claude Routine (bearer secret)
//   POST /webhooks/onyx           Onyx POLICY_CREATED/POLICY_UPDATED (HMAC verified)
//   GET  /healthz                 liveness probe (no auth)

import { DISABLED_BOARDS, renderConsole, renderDaily, renderLive, renderLeadersSthhc, renderMtd, renderRotation } from './boards.js';
import { STATIC_BOARDS } from './static_boards.js';
import { withTicker } from './ticker.js';
import { RUN15_BOARD } from './run15.js';
import CONTEST_FLYER from '../assets/contest-Flyer_august.png';
import { classify } from './classify.js';
import { DEMO_SNAPSHOT } from './demo.js';

// Snapshots arrive every 10 min (six staggered hourly Routines); the badge
// threshold tolerates one missed cycle plus generation time so it only shows
// when refreshes are actually failing.
const STALE_AFTER_MS = 25 * 60 * 1000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      // A key in the URL is remembered on the way out, whatever the route
      // answered, so any keyed link arms the device it was opened on.
      return rememberKey(await route(request, env, url), url, env);
    } catch (err) {
      // A broken board on a wall of TVs is worse than a stale one; keep the
      // response minimal and let the page poller retry.
      return new Response(`error: ${err.message}`, { status: 500 });
    }
  },
};

async function route(request, env, url) {
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (path === '/healthz') return new Response('ok');

  // Browsers request this on their own without the key; answer it quietly
  // instead of logging a 403 in every TV/browser console.
  if (path === '/favicon.ico') return new Response(null, { status: 204 });

  if (path === '/ingest' && request.method === 'POST') return handleIngest(request, env);
  if (path === '/webhooks/onyx' && request.method === 'POST') return handleWebhook(request, env);

  // Key in the path, not the query: /k/<key> survives link shorteners and chat
  // apps that drop query strings, so one link can be handed to the whole floor.
  // It arms the visitor's own device, then sends them on to a clean URL.
  if (path.startsWith('/k/')) {
    const supplied = decodeURIComponent(path.slice('/k/'.length));
    if (env.BOARD_KEY && !timingSafeEqual(supplied, env.BOARD_KEY)) {
      return new Response('That link is missing part of the key — copy it again in full.', { status: 403 });
    }
    const to = url.searchParams.get('to') || '/console';
    const dest = /^\/(?!\/)/.test(to) ? to : '/console'; // same-origin paths only
    return new Response(null, { status: 302, headers: { location: dest, 'set-cookie': keyCookie(env) } });
  }

  // Everything below is a read; gate on the board key, from ?key= or from
  // the cookie a previous keyed visit left behind. Say what arrived
  // (length only, never the expected key) so a truncated copy-paste is
  // obvious from the error page itself.
  if (!checkBoardKey(request, url, env)) {
    const got = url.searchParams.get('key') || '';
    const detail = got
      ? `a key of ${got.length} characters arrived, which doesn't match`
      : 'no ?key= parameter and no saved key on this device';
    return new Response(
      `Missing or bad key: ${detail}. Add ?key=<the full ${env.BOARD_KEY.length}-character board key> to the URL — check that nothing was cut off or altered when copying. Visiting /unlock?key=… once saves it on this device so later URLs can drop it.`,
      { status: 403 }
    );
  }

  // One keyed visit to /unlock remembers the key on this device, then
  // sends you on with a clean URL. Boards keep working with ?key= either
  // way, so a screen that loses its cookies never locks itself out.
  if (path === '/unlock') {
    const to = url.searchParams.get('to') || '/console';
    const dest = /^\/(?!\/)/.test(to) ? to : '/console'; // same-origin paths only
    return new Response(null, { status: 302, headers: { location: dest } });
  }

  if (path === '/api/stats') {
    const { snap } = await loadMergedSnapshot(env);
    return json(snap);
  }

  // Board imagery. Boards pass their own ?key= through on the <img src>,
  // so this stays behind the same gate as everything else. Immutable —
  // a new picture gets a new filename.
  if (path === '/assets/contest-flyer-aug11.png') {
    return new Response(CONTEST_FLYER, {
      headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' },
    });
  }

  // Desk view: menu rail + the boards in a frame. Only here — /board/*
  // stays chrome-free so the TVs never show navigation.
  if (path === '/console') {
    return html(renderConsole(url.searchParams.get('key') || '', url.searchParams.get('board') || ''));
  }

  if (path === '/board/rotation') {
    const boards = (url.searchParams.get('boards') || 'live,daily,mtd,leaders/sthhc')
      .split(',').map((s) => s.trim()).filter(Boolean)
      .filter((s) => !DISABLED_BOARDS.has(s));
    const dwell = parseInt(url.searchParams.get('dwell') || '20', 10) || 20;
    return html(renderRotation(boards, dwell, url.searchParams.get('key') || ''));
  }

  // Run to 15 stands alone: its own screen, its own feed, no ticker bar and
  // no place in the console menu or the rotation. Routed ahead of /board/*
  // so the shared ticker wrapper never touches it.
  if (path === '/board/run15') return html(RUN15_BOARD);
  if (path === '/board/run15/feed.js') {
    const { snap } = await loadMergedSnapshot(env);
    return new Response(run15Feed(snap), {
      headers: { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  // Every board wears the live sales ticker as its header bar. Injected here
  // rather than in each template so static and rendered boards stay in step.
  if (path.startsWith('/board/')) {
    const which = path.slice('/board/'.length);
    // A switched-off board answers like one that was never built, so a TV still
    // pinned to its URL fails loudly instead of showing a dead window.
    if (DISABLED_BOARDS.has(which)) return new Response('Board disabled', { status: 404 });
    if (STATIC_BOARDS[which]) return html(withTicker(STATIC_BOARDS[which]));
    const { snap, meta } = await loadMergedSnapshot(env);
    if (which === 'live') return html(withTicker(renderLive(snap, meta)));
    if (which === 'daily') return html(withTicker(renderDaily(snap, meta)));
    if (which === 'mtd') return html(withTicker(renderMtd(snap, meta)));
    if (which === 'leaders/sthhc') return html(withTicker(renderLeadersSthhc(snap, meta)));
    return new Response('Unknown board', { status: 404 });
  }

  if (path === '/') {
    return new Response('ghealthe-tv-boards. Boards live under /board/*.', { status: 200 });
  }

  return new Response('Not found', { status: 404 });
}

// ---------- run to 15 ----------

// Floor record as of Aug 19 2026: 14, set twice (Aug 10 and Aug 11). Kept
// here rather than recomputed per request; a snapshot may override it.
const RUN15_DEFAULTS = { goal: 15, record: 14, record_note: 'AUG 10 · AUG 11' };

// Today's STHHC writes, oldest first. The refresh Routine stores them on the
// snapshot; failing that they are recovered from the ticker rail, which keeps
// only its most recent rows and so can come up short on a busy day.
function sthhcToday(snap) {
  if (Array.isArray(snap.sthhc_today)) return snap.sthhc_today;
  const day = snap.board_date || '';
  return (Array.isArray(snap.ticker) ? snap.ticker : [])
    .filter((t) => t && t.bucket === 'STHHC' && String(t.at || '').startsWith(day))
    .map((t) => ({ agent: t.agent, premium: t.premium, at: String(t.at).slice(11) }))
    .reverse();
}

function run15Feed(snap) {
  const named = sthhcToday(snap);
  const counted = Number(snap.today && snap.today.sthhc) || 0;

  // A webhook can move the count before the next push carries the name.
  // Pad the tail so the gauge reads the true number; the padding carries no
  // agent, so it fills a segment without claiming a writer.
  const sales = named.slice();
  for (let i = sales.length; i < counted; i++) sales.push({ agent: null });

  // Per-selling-day average over completed days only — today is still running.
  const done = Number(snap.month && snap.month.selling_days_done) || 0;
  const mtd = Number(snap.mtd && snap.mtd.sthhc) || 0;
  const average = done > 0 ? Math.round(((mtd - counted) / done) * 10) / 10 : null;

  const cfg = { ...RUN15_DEFAULTS, ...(snap.run15 || {}) };
  const feed = {
    goal: cfg.goal,
    record: cfg.record,
    record_note: cfg.record_note,
    average: average == null ? undefined : average,
    generated_at: snap.generated_at,
    sales,
  };
  return `window.STHHC = ${JSON.stringify(feed)};`;
}

// ---------- auth ----------

const KEY_COOKIE = 'gtv_key';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function checkBoardKey(request, url, env) {
  if (!env.BOARD_KEY) return true; // not yet configured (dev)
  const fromUrl = url.searchParams.get('key');
  if (fromUrl != null) return timingSafeEqual(fromUrl, env.BOARD_KEY);
  return timingSafeEqual(cookie(request, KEY_COOKIE), env.BOARD_KEY);
}

function cookie(request, name) {
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return '';
}

function keyCookie(env) {
  return `${KEY_COOKIE}=${encodeURIComponent(env.BOARD_KEY || '')}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;
}

// Remember a key that arrived in the URL, so the same device can drop it
// afterwards. HttpOnly keeps it out of reach of anything running on the page.
function rememberKey(response, url, env) {
  if (!env.BOARD_KEY || url.searchParams.get('key') !== env.BOARD_KEY) return response;
  const out = new Response(response.body, response);
  out.headers.append('set-cookie', keyCookie(env));
  return out;
}

function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

// ---------- snapshot ----------

async function loadMergedSnapshot(env) {
  const row = await env.DB.prepare('SELECT v, updated_at FROM kv WHERE k = ?').bind('snapshot').first();
  const snap = row ? JSON.parse(row.v) : structuredClone(DEMO_SNAPSHOT);

  // Fold in webhook events newer than the snapshot, so counts move between
  // Routine pushes. Snapshot remains the source of truth: each push resets
  // the baseline and obsoletes older events.
  const since = snap.generated_at || '1970-01-01T00:00:00Z';
  const events = await env.DB.prepare('SELECT product, agent FROM policy_events WHERE ts > ?').bind(since).all();
  // Webhooks fire for every policy in the org; the board tracks one worker
  // profile. Only count events from agents on the snapshot's roster — and if
  // the snapshot carries no roster, count nothing (stale-accurate beats live-wrong).
  const roster = Array.isArray(snap.roster) ? new Set(snap.roster.map(String)) : null;
  let liveAdds = 0;
  for (const e of events.results || []) {
    if (!roster || !roster.has(String(e.agent ?? ''))) continue;
    if (snap.today && e.product in snap.today) {
      snap.today[e.product] += 1;
      snap.today.total += 1;
      liveAdds++;
    }
    if (snap.mtd && e.product in snap.mtd) {
      snap.mtd[e.product] += 1;
      snap.mtd.total += 1;
    }
  }
  snap.live_adds = liveAdds;

  const asOfMs = Date.parse(snap.generated_at || 0);
  const stale = Date.now() - asOfMs > STALE_AFTER_MS && !snap.demo;
  const asOf = new Date(liveAdds > 0 ? Date.now() : asOfMs).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
  });
  return { snap, meta: { asOf: snap.demo ? 'demo data' : asOf, stale } };
}

// ---------- ingest (Claude Routine) ----------

async function handleIngest(request, env) {
  if (!env.INGEST_SECRET) return new Response('ingest not configured', { status: 503 });
  const auth = request.headers.get('authorization') || '';
  if (!timingSafeEqual(auth, `Bearer ${env.INGEST_SECRET}`)) {
    return new Response('unauthorized', { status: 401 });
  }
  const snap = await request.json();
  if (!snap.generated_at || !snap.today || !snap.month) {
    return new Response('snapshot missing required fields (generated_at, today, month)', { status: 400 });
  }
  delete snap.demo;
  await env.DB.prepare(
    'INSERT INTO kv (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at'
  ).bind('snapshot', JSON.stringify(snap), new Date().toISOString()).run();
  // Events at or before the new baseline are folded into the snapshot already.
  await env.DB.prepare('DELETE FROM policy_events WHERE ts <= ?').bind(snap.generated_at).run();
  return json({ ok: true });
}

// ---------- Onyx webhook ----------

async function handleWebhook(request, env) {
  if (!env.ONYX_SIGNING_SECRET) return new Response('webhook not configured', { status: 503 });

  const raw = await request.text();
  const sig = request.headers.get('x-onyx-signature-256') || '';
  if (!(await verifyHmac(raw, sig, env.ONYX_SIGNING_SECRET))) {
    return new Response('bad signature', { status: 401 });
  }

  const event = JSON.parse(raw);
  const policy = event.policy || event; // payload shape verified at milestone 3
  const product = classify({
    policy_type: policy.policy_type ?? policy.type,
    carrier_name: policy.carrier_name ?? policy.carrier,
    policy_name: policy.policy_name ?? policy.name,
  });
  if (!product) return json({ ok: true, skipped: 'stripped (HRA) or unclassifiable' });

  const policyId = event.policy_id ?? policy.policy_id ?? policy.id;
  if (policyId == null) return new Response('no policy_id', { status: 400 });

  // The roster filter matches on user id; keep the email as a fallback key so
  // a payload without ids still records who wrote it.
  const agent =
    event.agent?.user_id ?? policy.agent?.user_id ??
    event.agent_user_id ?? policy.agent_user_id ??
    event.agent?.email ?? policy.agent?.email ?? null;

  await env.DB.prepare(
    'INSERT INTO policy_events (policy_id, ts, product, agent, payload) VALUES (?, ?, ?, ?, ?) ' +
    'ON CONFLICT(policy_id) DO UPDATE SET ts = excluded.ts, product = excluded.product, agent = excluded.agent, payload = excluded.payload'
  ).bind(policyId, new Date().toISOString(), product, agent != null ? String(agent) : null, raw).run();

  return json({ ok: true, product });
}

async function verifyHmac(body, header, secret) {
  const expectedHex = header.replace(/^sha256=/, '');
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return timingSafeEqual(hex, expectedHex.toLowerCase());
}

// ---------- helpers ----------

const json = (o) => new Response(JSON.stringify(o), { headers: { 'content-type': 'application/json' } });
const html = (s) =>
  new Response(s, { headers: { 'content-type': 'text/html;charset=utf-8', 'cache-control': 'no-store' } });
