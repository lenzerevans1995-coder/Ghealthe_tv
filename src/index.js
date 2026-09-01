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
//   GET  /board/sales             Live Sales — the latest write, big, plus today's tally
//   GET  /board/sales/feed.js     that board's feed, rendered from the snapshot
//   GET  /board/paperchase        The Paper Chase — September contest standings (own screen)
//   GET  /board/paperchase/feed.js  that board's standings, pushed to /ingest/paperchase
//   GET  /console                 desk view: left menu rail + the boards in a frame
//   GET  /unlock                  saves the key on this device (?key=…&to=…), then redirects
//   GET  /k/<key>                 same, key in the path — survives link shorteners
//   GET  /api/stats               current merged snapshot (JSON)
//   POST /ingest                  snapshot push from the Claude Routine (bearer secret)
//   POST /ingest/paperchase       contest standings push (bearer secret, same as /ingest)
//   POST /webhooks/onyx           Onyx POLICY_CREATED/POLICY_UPDATED (HMAC verified)
//   GET  /healthz                 liveness probe (no auth)

import { DISABLED_BOARDS, renderConsole, renderDaily, renderLive, renderLeadersSthhc, renderMtd, renderRotation } from './boards.js';
import { STATIC_BOARDS } from './static_boards.js';
import { withTicker } from './ticker.js';
import { RUN15_BOARD } from './run15.js';
import { LIVE_SALES_BOARD } from './live_sales.js';
import { PAPER_CHASE_BOARD } from './paperchase.js';
import CONTEST_FLYER from '../assets/contest-flyer-august.jpg';
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
  if (path === '/ingest/paperchase' && request.method === 'POST') return handlePaperChaseIngest(request, env);
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

  // What the Onyx webhook endpoint has actually received. Behind the board
  // key like every other read; no payloads, just counts and the last event.
  if (path === '/api/webhook-status') {
    const row = await env.DB.prepare('SELECT v, updated_at FROM kv WHERE k = ?').bind('webhook_stats').first();
    return json(row ? { ...JSON.parse(row.v), updated_at: row.updated_at } : { received: 0, note: 'no deliveries recorded' });
  }

  if (path === '/api/stats') {
    const { snap } = await loadMergedSnapshot(env);
    return json(snap);
  }

  // Board imagery. Boards pass their own ?key= through on the <img src>,
  // so this stays behind the same gate as everything else. Immutable —
  // a new picture gets a new filename.
  if (path === '/assets/contest-flyer-aug11.jpg') {
    return new Response(CONTEST_FLYER, {
      headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=86400' },
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

  // Live Sales stands alone the same way: its own screen, its own feed, and
  // its own ticker along the foot, so the shared bar is not stacked on top.
  if (path === '/board/sales') return html(LIVE_SALES_BOARD);
  if (path === '/board/sales/feed.js') {
    const { snap } = await loadMergedSnapshot(env);
    return new Response(salesFeed(snap), {
      headers: { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  // The Paper Chase carries its own header, rail and ask band, so it stands
  // alone too. Its standings live in their own row rather than on the snapshot:
  // the refresh Routine overwrites the snapshot wholesale and would drop them.
  if (path === '/board/paperchase') return html(PAPER_CHASE_BOARD);
  if (path === '/board/paperchase/feed.js') {
    const feed = JSON.stringify(await loadContestStandings(env));
    return new Response(`window.PAPER_CHASE = ${feed};`, {
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

// ---------- live sales ----------

// The Live Sales board reads today's writes one by one. Names come from the
// snapshot's ticker rail (newest first, Eastern wall-clock time); the tallies
// beside them come from `today`, which webhooks also move — so the rail can
// run a sale behind without the counters being wrong.
const SALES_PRODUCTS = new Set(['CORE', 'STHHC', 'HI']);

function salesFeed(snap) {
  const day = snap.board_date || '';
  const sales = (Array.isArray(snap.ticker) ? snap.ticker : [])
    .filter((t) => t && SALES_PRODUCTS.has(t.bucket) && String(t.at || '').startsWith(day))
    .map((t) => {
      const at = String(t.at); // 'YYYY-MM-DD HH:MM'
      const name = String(t.agent || '').trim();
      const sp = name.indexOf(' ');
      return {
        id: saleId(at, name, t.bucket),
        first: sp > 0 ? name.slice(0, sp) : name,
        last: sp > 0 ? name.slice(sp + 1) : '',
        product: t.bucket,
        carrier: t.carrier || '',
        plan: t.plan || '',
        time: clock12(at.slice(11, 16)),
        ts: at,
      };
    });

  const today = snap.today || {};
  const feed = {
    date_label: today.label || '',
    generated_at: snap.generated_at,
    demo: !!snap.demo,
    totals: {
      CORE: Number(today.core) || 0,
      STHHC: Number(today.sthhc) || 0,
      HI: Number(today.hi) || 0,
    },
    sales,
  };
  return `window.SALES = ${JSON.stringify(feed)};`;
}

// A write carries no id of its own, so one is derived from the write itself:
// the minute puts ids in time order, the name/product hash separates two
// writes landing in the same minute. Derived rather than counted, because the
// board flags a sale as NEW on an id it has not seen before — an id that
// shifted between refreshes would flash sales that are already on the wall.
function saleId(at, name, bucket) {
  const minutes = Math.floor(Date.parse(`${at.slice(0, 10)}T${at.slice(11, 16)}:00Z`) / 60000) || 0;
  let h = 0;
  for (const ch of `${name}|${bucket}`) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return minutes * 1000 + h;
}

// '14:07' -> '2:07 PM'. The rail's times are already Eastern, so this is a
// reformat, never a conversion.
function clock12(hhmm) {
  const [h, m] = hhmm.split(':');
  const hour = Number(h);
  if (!Number.isFinite(hour) || !m) return hhmm;
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
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

// The standings the board renders: the last pushed baseline with any webhook
// deliveries newer than it folded on top. Same shape as the snapshot boards —
// the ten-minute push is the source of truth and resets the baseline; webhooks
// only move it forward in between, so a missed or duplicated delivery heals on
// the next push rather than compounding.
async function loadContestStandings(env) {
  const row = await env.DB.prepare('SELECT v FROM kv WHERE k = ?').bind('paper_chase').first();
  const base = row ? JSON.parse(row.v) : { generated_at: null, rows: [] };
  const rows = (base.rows || []).map((r) => ({ ...r }));
  const since = base.generated_at || '1970-01-01T00:00:00Z';

  const events = await env.DB.prepare(
    'SELECT policy_id, ts, bucket, agent, premium, lead_id, scorable FROM contest_events WHERE ts > ?'
  ).bind(since).all();
  const fresh = events.results || [];
  if (!fresh.length) return base;

  // An STHHC written on the same call as a Core scores zero. The delivery
  // carries no call id, so the lead stands in for it: two policies keyed for
  // one customer in the same stretch are the attached case the rule is about.
  // Only an approximation — the next push recomputes it from the call itself.
  const coreLeads = new Set(fresh.filter((e) => e.bucket === 'CORE' && e.lead_id).map((e) => e.lead_id));

  const byAgent = new Map(rows.map((r) => [r.agent, r]));
  let latest = base.generated_at;
  let applied = 0;

  for (const e of fresh) {
    if (e.ts > latest) latest = e.ts;
    if (!e.scorable || !e.agent || e.bucket === 'CORE') continue;
    const attached = e.bucket === 'STHHC' && e.lead_id && coreLeads.has(e.lead_id);
    const points = attached ? 0 : contestPoints(e.bucket, e.premium);
    const prem = Number(e.premium) || 0;

    let row = byAgent.get(e.agent);
    if (!row) {
      row = { agent: e.agent, points: 0, points_week: 0, sthhc_apps: 0, sthhc_apps_q: 0, sthhc_prem: 0, hi_apps: 0, hi_prem: 0 };
      byAgent.set(e.agent, row);
      rows.push(row);
    }
    row.points = Number(row.points || 0) + points;
    row.points_week = Number(row.points_week || 0) + points; // deliveries are always this week
    if (e.bucket === 'STHHC') {
      row.sthhc_apps = Number(row.sthhc_apps || 0) + 1;
      if (prem >= 50) row.sthhc_apps_q = Number(row.sthhc_apps_q || 0) + 1;
      row.sthhc_prem = Number(row.sthhc_prem || 0) + prem;
    } else {
      row.hi_apps = Number(row.hi_apps || 0) + 1;
      row.hi_prem = Number(row.hi_prem || 0) + prem;
    }
    applied++;
  }

  rows.sort((a, b) => Number(b.points) - Number(a.points));
  return { generated_at: applied > 0 ? latest : base.generated_at, rows, live_adds: applied };
}

// ---------- contest standings ingest ----------

// The Paper Chase standings are one Onyx query, pushed here the same way the
// snapshot is. Stored under their own key so a snapshot push cannot clear them.
async function handlePaperChaseIngest(request, env) {
  if (!env.INGEST_SECRET) return new Response('ingest not configured', { status: 503 });
  const auth = request.headers.get('authorization') || '';
  if (!timingSafeEqual(auth, `Bearer ${env.INGEST_SECRET}`)) {
    return new Response('unauthorized', { status: 401 });
  }
  const body = await request.json();
  if (!Array.isArray(body.rows)) {
    return new Response('standings missing required field (rows)', { status: 400 });
  }
  const feed = { generated_at: body.generated_at || new Date().toISOString(), rows: body.rows };
  await env.DB.prepare(
    'INSERT INTO kv (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at'
  ).bind('paper_chase', JSON.stringify(feed), new Date().toISOString()).run();
  // Deliveries at or before the new baseline are already counted in it.
  await env.DB.prepare('DELETE FROM contest_events WHERE ts <= ?').bind(feed.generated_at).run();
  return json({ ok: true, rows: feed.rows.length });
}

// ---------- Onyx webhook ----------

async function handleWebhook(request, env) {
  if (!env.ONYX_SIGNING_SECRET) return new Response('webhook not configured', { status: 503 });

  const raw = await request.text();
  const sig = request.headers.get('x-onyx-signature-256') || '';
  if (!(await verifyHmac(raw, sig, env.ONYX_SIGNING_SECRET))) {
    // Counted, not just refused: "nothing is arriving" and "everything is
    // arriving and being rejected" look identical from the events table,
    // which every snapshot push prunes.
    await noteWebhook(env, { signature: 'rejected', raw });
    return new Response('bad signature', { status: 401 });
  }

  const event = JSON.parse(raw);
  await noteWebhook(env, { signature: 'verified', raw, type: event.event ?? event.event_type ?? event.type ?? null });
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

  // The Paper Chase scores off the same delivery, but needs more of it than
  // the counters do: premium, the lead (for the attached-STHHC rule) and a
  // display name. Recorded separately so a missing field degrades that board
  // alone, and never the counts.
  await recordContestEvent(env, { event, policy, product, policyId });

  return json({ ok: true, product });
}

// ---------- contest scoring from webhooks ----------

// Points, straight from the contest rules: an STHHC at $50+ or an HI at $30+
// scores its premium, below the bar it scores half, and an STHHC written on
// the same call as a Core scores nothing. The zero rule is applied at read
// time — the Core may not have arrived yet when the STHHC does.
function contestPoints(bucket, premium) {
  const prem = Number(premium) || 0;
  if (bucket === 'STHHC') return Math.round(prem >= 50 ? prem : prem / 2);
  if (bucket === 'HI') return Math.round(prem >= 30 ? prem : prem / 2);
  return 0;
}

const CONTEST_BUCKET = { sthhc: 'STHHC', hi: 'HI', core: 'CORE' };

// Onyx names the agent by email and user id, never by display name, so the
// name comes from a roster stored alongside the standings. An agent the
// roster doesn't know is recorded but not scored: the board would rather be
// ten minutes behind than put a wrong name on the wall.
async function resolveAgentName(env, key) {
  if (key == null) return null;
  const row = await env.DB.prepare('SELECT v FROM kv WHERE k = ?').bind('agent_roster').first();
  if (!row) return null;
  const roster = JSON.parse(row.v);
  const k = String(key).toLowerCase();
  return roster.byId?.[k] ?? roster.byEmail?.[k] ?? null;
}

async function recordContestEvent(env, { event, policy, product, policyId }) {
  const bucket = CONTEST_BUCKET[product];
  if (!bucket) return; // ancillary: no part in this contest

  const details = policy.medicare_details ?? event.medicare_details ?? {};
  const premium = firstNumber([
    details.premium, details.premium_amount,
    policy.premium, policy.premium_amount, event.premium,
  ]);
  const agentKey =
    event.agent?.user_id ?? policy.agent?.user_id ?? event.agent_user_id ??
    event.agent?.email ?? policy.agent?.email ?? null;
  const leadId = event.lead?.id ?? event.lead_id ?? policy.lead_id ?? event.person?.id ?? null;
  const agent = await resolveAgentName(env, agentKey);

  // Scored only when every input the rules need is actually present. A Core
  // needs no premium — it is recorded purely so an STHHC on the same call can
  // be zeroed.
  const scorable = agent != null && (bucket === 'CORE' || premium != null) ? 1 : 0;

  await env.DB.prepare(
    'INSERT INTO contest_events (policy_id, ts, bucket, agent, agent_key, premium, lead_id, scorable) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(policy_id) DO UPDATE SET ' +
    'ts = excluded.ts, bucket = excluded.bucket, agent = excluded.agent, agent_key = excluded.agent_key, ' +
    'premium = excluded.premium, lead_id = excluded.lead_id, scorable = excluded.scorable'
  ).bind(
    policyId, new Date().toISOString(), bucket, agent,
    agentKey != null ? String(agentKey) : null,
    premium ?? 0, leadId != null ? String(leadId) : null, scorable
  ).run();
}

function firstNumber(candidates) {
  for (const c of candidates) {
    const n = Number(c);
    if (c != null && c !== '' && Number.isFinite(n)) return n;
  }
  return null;
}

// Durable record of what the endpoint actually receives — survives the
// policy_events pruning, so it answers whether Onyx is delivering at all.
// Keeps one raw payload so the field names can be read off a real event
// rather than guessed from the docs.
async function noteWebhook(env, { signature, raw, type }) {
  try {
    const row = await env.DB.prepare('SELECT v FROM kv WHERE k = ?').bind('webhook_stats').first();
    const stats = row ? JSON.parse(row.v) : { received: 0, verified: 0, rejected: 0 };
    stats.received = (stats.received || 0) + 1;
    stats[signature] = (stats[signature] || 0) + 1;
    stats.last_at = new Date().toISOString();
    stats.last_signature = signature;
    if (type) stats.last_type = type;
    const now = new Date().toISOString();
    await env.DB.prepare(
      'INSERT INTO kv (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at'
    ).bind('webhook_stats', JSON.stringify(stats), now).run();
    if (signature === 'verified') {
      await env.DB.prepare(
        'INSERT INTO kv (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at'
      ).bind('webhook_last', raw.slice(0, 8000), now).run();
    }
  } catch {
    // Telemetry must never cost a delivery: a failed write here would make
    // Onyx retry an event the board already has.
  }
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
