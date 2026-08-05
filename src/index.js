// Get Health-e floor TV boards — Cloudflare Worker.
//
// Routes:
//   GET  /board/live              today's running board
//   GET  /board/daily             yesterday's recap board
//   GET  /board/leaders/sthhc     MTD/last-month STHHC leaderboard
//   GET  /board/rotation          cycles the above (one URL per TV)
//   GET  /api/stats               current merged snapshot (JSON)
//   POST /ingest                  snapshot push from the Claude Routine (bearer secret)
//   POST /webhooks/onyx           Onyx POLICY_CREATED/POLICY_UPDATED (HMAC verified)
//   GET  /healthz                 liveness probe (no auth)

import { renderDaily, renderLive, renderLeadersSthhc, renderRotation } from './boards.js';
import { classify } from './classify.js';
import { DEMO_SNAPSHOT } from './demo.js';

const STALE_AFTER_MS = 30 * 60 * 1000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    try {
      if (path === '/healthz') return new Response('ok');

      if (path === '/ingest' && request.method === 'POST') return handleIngest(request, env);
      if (path === '/webhooks/onyx' && request.method === 'POST') return handleWebhook(request, env);

      // Everything below is a read; gate on the board key.
      if (!checkBoardKey(url, env)) return new Response('Missing or bad key', { status: 403 });

      if (path === '/api/stats') {
        const { snap } = await loadMergedSnapshot(env);
        return json(snap);
      }

      if (path === '/board/rotation') {
        const boards = (url.searchParams.get('boards') || 'live,daily,leaders/sthhc')
          .split(',').map((s) => s.trim()).filter(Boolean);
        const dwell = parseInt(url.searchParams.get('dwell') || '20', 10) || 20;
        return html(renderRotation(boards, dwell, url.searchParams.get('key') || ''));
      }

      if (path.startsWith('/board/')) {
        const { snap, meta } = await loadMergedSnapshot(env);
        const which = path.slice('/board/'.length);
        if (which === 'live') return html(renderLive(snap, meta));
        if (which === 'daily') return html(renderDaily(snap, meta));
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
  const events = await env.DB.prepare('SELECT product FROM policy_events WHERE ts > ?').bind(since).all();
  let liveAdds = 0;
  for (const e of events.results || []) {
    if (snap.today && e.product in snap.today) {
      snap.today[e.product] += 1;
      snap.today.total += 1;
      liveAdds++;
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

  await env.DB.prepare(
    'INSERT INTO policy_events (policy_id, ts, product, agent, payload) VALUES (?, ?, ?, ?, ?) ' +
    'ON CONFLICT(policy_id) DO UPDATE SET ts = excluded.ts, product = excluded.product, agent = excluded.agent, payload = excluded.payload'
  ).bind(policyId, new Date().toISOString(), product, policy.agent?.email ?? null, raw).run();

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
