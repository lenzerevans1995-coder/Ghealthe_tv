// Get Health-e floor TV boards — Cloudflare Worker.
//
// Routes:
//   GET  /board/live              today's running board
//   GET  /board/daily             yesterday's recap board
//   GET  /board/leaders/sthhc     MTD/last-month STHHC leaderboard
//   GET  /board/month-open        static month-open flyer (self-dating)
//   GET  /board/early-out         static early-out points counter (?sthhc=&core=&hi=&goal=&asof=)
//   GET  /board/rotation          cycles the above (one URL per TV)
//   GET  /console                 desk view: left menu rail + the boards in a frame
//   GET  /api/stats               current merged snapshot (JSON)
//   POST /ingest                  snapshot push from the Claude Routine (bearer secret)
//   POST /webhooks/onyx           Onyx POLICY_CREATED/POLICY_UPDATED (HMAC verified)
//   GET  /healthz                 liveness probe (no auth)

import { renderConsole, renderDaily, renderLive, renderLeadersSthhc, renderMtd, renderRotation } from './boards.js';
import { STATIC_BOARDS } from './static_boards.js';
import CONTEST_FLYER from '../assets/contest-Flyer_august.jpg';
import { classify } from './classify.js';
import { DEMO_SNAPSHOT } from './demo.js';

// Snapshots arrive every 10 min (six staggered hourly Routines); the badge
// threshold tolerates one missed cycle plus generation time so it only shows
// when refreshes are actually failing.
const STALE_AFTER_MS = 25 * 60 * 1000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    try {
      if (path === '/healthz') return new Response('ok');

      // Browsers request this on their own without the key; answer it quietly
      // instead of logging a 403 in every TV/browser console.
      if (path === '/favicon.ico') return new Response(null, { status: 204 });

      if (path === '/ingest' && request.method === 'POST') return handleIngest(request, env);
      if (path === '/webhooks/onyx' && request.method === 'POST') return handleWebhook(request, env);

      // Everything below is a read; gate on the board key. Say what arrived
      // (length only, never the expected key) so a truncated copy-paste is
      // obvious from the error page itself.
      if (!checkBoardKey(url, env)) {
        const got = url.searchParams.get('key') || '';
        const detail = got
          ? `a key of ${got.length} characters arrived, which doesn't match`
          : 'no ?key= parameter arrived at all';
        return new Response(
          `Missing or bad key: ${detail}. The URL must end with ?key=<the full ${env.BOARD_KEY.length}-character board key> — check that nothing was cut off or altered when copying.`,
          { status: 403 }
        );
      }

      if (path === '/api/stats') {
        const { snap } = await loadMergedSnapshot(env);
        return json(snap);
      }

      // Board imagery. Boards pass their own ?key= through on the <img src>,
      // so this stays behind the same gate as everything else. Immutable —
      // a new picture gets a new filename.
      if (path === '/assets/contest-flyer.jpg') {
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
          .split(',').map((s) => s.trim()).filter(Boolean);
        const dwell = parseInt(url.searchParams.get('dwell') || '20', 10) || 20;
        return html(renderRotation(boards, dwell, url.searchParams.get('key') || ''));
      }

      if (path.startsWith('/board/')) {
        const which = path.slice('/board/'.length);
        if (STATIC_BOARDS[which]) return html(STATIC_BOARDS[which]);
        const { snap, meta } = await loadMergedSnapshot(env);
        if (which === 'live') return html(renderLive(snap, meta));
        if (which === 'daily') return html(renderDaily(snap, meta));
        if (which === 'mtd') return html(renderMtd(snap, meta));
        if (which === 'leaders/sthhc') return html(renderLeadersSthhc(snap, meta));
        return new Response('Unknown board', { status: 404 });
      }

      if (path === '/') {
        return new Response('ghealthe-tv-boards. Boards live under /board/*.', { status: 200 });
      }

      return new Response('Not found', { status: 404 });
    } catch (err) {
      // A broken board on a wall of TVs is worse than a stale one; keep the
      // response minimal and let the page poller retry.
      return new Response(`error: ${err.message}`, { status: 500 });
    }
  },
};

// ---------- auth ----------

function checkBoardKey(url, env) {
  if (!env.BOARD_KEY) return true; // not yet configured (dev)
  return timingSafeEqual(url.searchParams.get('key') || '', env.BOARD_KEY);
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
