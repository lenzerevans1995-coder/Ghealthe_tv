// TPV completions floor board.
//
//   GET  /board/tpv     the board: template.html with the latest counts filled in
//   POST /ingest/tpv    counts from the TPV Routine (bearer secret, same as /ingest)
//
// Counts come from Onyx (since 10/17; before that, the TPV Tracker sheet).
// The Routine runs one query and posts per-rep counts only:
//   TPV  policies whose TPV_Completed custom field is checked, credited to the
//        rep named in the TPV_Agent custom field (HRA policies excluded)
//   HRA  HRA policies submitted by one of the TPV reps, counted only once the
//        same client has a TPV credited to that rep (and never more HRAs than
//        TPVs for a client), so HRAs can't run ahead of the TPVs behind them
// both for the current month by Eastern submitted date. A checked TPV with no
// TPV_Agent lands in the muted row. The page is the user's template minus the
// Mail-Order, Video and IHWV columns (Onyx has no field for them).
//
// Between pushes the Onyx webhook moves the board: a delivery whose policy
// already carries TPV_Completed, or an HRA policy from a TPV rep, is recorded in
// tpv_events the first time it is seen and added on top of the last push if it
// arrived after it. A live HRA counts only against a live TPV for the same
// client and rep; any other HRA waits for the push, which matches it properly. The hourly push is the source of truth, so anything the
// webhook misses or double-counts heals within the hour. The page fetches
// itself every minute and swaps in the new numbers without a reload.

import TPV_BOARD from './boards/tpv_board.html';

const COLS = ['tpv', 'hra'];

// The TPV reps: Onyx user id (who submits their HRA policies), the TPV_Agent
// dropdown label, and the name the board shows (their Onyx name). Same list as
// the Routine's query; a rep added to one belongs in the other.
const TPV_REPS = [
  { id: 4740, label: 'Bruce Blumenfeld', name: 'Bruce Blumenfeld' },
  { id: 1579, label: 'Jaimie Strong', name: 'Jaime Strong' },
  { id: 1604, label: 'Jeahne Spann-Davis', name: 'Jeahne Spann Davis' },
  { id: 7052, label: 'Erika Mendez', name: 'Erika Mendez' },
  { id: 7051, label: 'Felicia Martin', name: 'Felicia Martin' },
  { id: 6833, label: 'Jessica Barnum', name: 'Jessica Barnum' },
  { id: 7053, label: 'Jessica Stonestrom', name: 'Jessica Stonestrom' },
  { id: 7050, label: 'Sheila Pinero', name: 'Sheila Pinero' },
  { id: 7049, label: 'Tracey Meitzen', name: 'Tracey Meitzen' },
  { id: 7397, label: 'Andreina Rotundo', name: 'Andreina Rotundo' },
];
const REP_BY_ID = new Map(TPV_REPS.map((r) => [r.id, r.name]));
const REP_BY_LABEL = new Map(TPV_REPS.map((r) => [r.label.toLowerCase(), r.name]));

const TPV_TABLE = 'CREATE TABLE IF NOT EXISTS tpv_events (policy_id INTEGER PRIMARY KEY, kind TEXT NOT NULL, rep TEXT, person_id INTEGER, submitted_at TEXT NOT NULL, first_at TEXT NOT NULL)';

function etDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

// Onyx sends naive UTC timestamps.
function utc(value) {
  if (!value) return null;
  const s = String(value);
  const d = new Date(/[Zz]|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s}Z`);
  return isNaN(d) ? null : d.toISOString();
}

// Called from the Onyx webhook for every verified delivery. Only the first
// sighting of a policy is kept: later deliveries of it change nothing, and
// an unchecked TPV is left for the hourly push to settle.
export async function recordTpvEvent(env, event, policy) {
  const policyId = Number(policy?.policy_id ?? event?.policy_id ?? policy?.id);
  const submitted = utc(policy?.submitted_timestamp ?? event?.timestamp);
  if (!Number.isInteger(policyId) || !submitted) return;
  let kind = null;
  let rep = null;
  if (String(policy.policy_type || '').toLowerCase() === 'hra') {
    rep = REP_BY_ID.get(Number(event?.agent?.user_id ?? policy?.agent?.user_id)) || null;
    if (rep) kind = 'hra';
  } else {
    const cf = policy.custom_fields || {};
    if (cf.TPV_Completed === true) {
      kind = 'tpv';
      const raw = Array.isArray(cf.TPV_Agent) ? cf.TPV_Agent[0] : cf.TPV_Agent;
      const label = typeof raw === 'string' ? raw.trim() : '';
      rep = label ? REP_BY_LABEL.get(label.toLowerCase()) || (NAME.test(label) ? label : null) : null;
    }
  }
  if (!kind) return;
  const person = Number(event?.person?.person_id);
  const insert = () => env.DB.prepare(
    'INSERT OR IGNORE INTO tpv_events (policy_id, kind, rep, person_id, submitted_at, first_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(policyId, kind, rep, Number.isInteger(person) ? person : null, submitted, new Date().toISOString()).run();
  try {
    await insert();
  } catch (e) {
    await env.DB.prepare(TPV_TABLE).run();
    await insert();
  }
}

// Deliveries since the push, added onto its counts. Same month only: a new
// month starts from its own first push.
async function withLive(env, rec) {
  if (!rec || rec.source !== 'onyx') return rec;
  const today = etDate(new Date().toISOString());
  if (!today || today.slice(0, 7) !== rec.date.slice(0, 7)) return rec;
  let rows = [];
  try {
    rows = (await env.DB.prepare('SELECT kind, rep, person_id, submitted_at FROM tpv_events WHERE first_at > ? ORDER BY kind DESC')
      .bind(rec.generated_at).all()).results || [];
  } catch (e) { return rec; }
  const out = { ...rec, date: today, reps: rec.reps.map((r) => ({ ...r })), no_rep: { ...rec.no_rep }, floor: { ...rec.floor } };
  // TPVs first (kind DESC), so each live HRA can claim a live TPV for the same
  // client and rep; one TPV backs at most one HRA.
  const backing = new Map();
  for (const e of rows) {
    const day = etDate(e.submitted_at);
    if (!day || day.slice(0, 7) !== today.slice(0, 7) || day > today) continue;
    const key = `${e.person_id}|${e.rep}`;
    if (e.kind === 'tpv' && e.rep && e.person_id != null) backing.set(key, (backing.get(key) || 0) + 1);
    if (e.kind === 'hra') {
      if (!backing.get(key)) continue;
      backing.set(key, backing.get(key) - 1);
    }
    if (e.kind === 'tpv' && !e.rep) {
      out.no_rep.tpv += 1;
    } else {
      let r = out.reps.find((x) => x.name === e.rep);
      if (!r) out.reps.push(r = { name: e.rep, tpv: 0, hra: 0 });
      r[e.kind] += 1;
    }
    out.floor[e.kind] += 1;
  }
  return out;
}
const NAME = /^[A-Za-z][A-Za-z' -]{0,40}$/;

const count = (n) => Number.isInteger(n) && n >= 0 && n < 100000;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function handleTpvIngest(request, env, checkBearer) {
  const denied = checkBearer(request, env);
  if (denied) return denied;
  let body;
  try { body = await request.json(); } catch (e) { return new Response('bad json', { status: 400 }); }

  const date = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : null;
  const reps = Array.isArray(body.reps) ? body.reps.slice(0, 60) : null;
  const nobody = body.no_rep || {};
  const floor = body.floor || {};
  const bad = !date || !reps || !reps.length ||
    reps.some((r) => !NAME.test(String(r?.name || '')) || COLS.some((c) => !count(r[c]))) ||
    !count(nobody.tpv) || !count(nobody.hra) || COLS.some((c) => !count(floor[c]));
  if (bad) return new Response('need date, reps [{name, tpv, hra}], no_rep {tpv, hra} and floor {tpv, hra}', { status: 400 });

  // An HRA only counts against its client's TPV, so a rep can't have more
  // HRAs than TPVs; a push that says otherwise was copied wrong.
  if (body.source === 'onyx') {
    const over = reps.find((r) => r.hra > r.tpv);
    if (over) return new Response(`${over.name} has ${over.hra} HRA but ${over.tpv} TPV`, { status: 400 });
  }

  // The floor row must reconcile with the rows above it, or the board would
  // show a total nobody can add up to.
  for (const c of COLS) {
    const sum = reps.reduce((n, r) => n + r[c], 0) + nobody[c];
    if (sum !== floor[c]) return new Response(`floor ${c} is ${floor[c]} but the rows add to ${sum}`, { status: 400 });
  }

  const rec = {
    generated_at: new Date().toISOString(),
    date,
    source: body.source === 'onyx' ? 'onyx' : 'sheet',
    reps: reps.map((r) => ({ name: String(r.name).trim(), ...Object.fromEntries(COLS.map((c) => [c, r[c]])) })),
    no_rep: { tpv: nobody.tpv, hra: nobody.hra },
    floor: Object.fromEntries(COLS.map((c) => [c, floor[c]])),
  };
  await env.DB.prepare(
    'INSERT INTO kv (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at'
  ).bind('tpv_board', JSON.stringify(rec), rec.generated_at).run();
  // The push now holds everything delivered before it; past 40 days a
  // delivery can't matter to any month on the board.
  try {
    await env.DB.prepare('DELETE FROM tpv_events WHERE first_at < ?')
      .bind(new Date(Date.now() - 40 * 86400000).toISOString()).run();
  } catch (e) { /* no table yet */ }
  return new Response(JSON.stringify({ ok: true, reps: rec.reps.length, floor_tpv: rec.floor.tpv }), {
    headers: { 'content-type': 'application/json' },
  });
}

function sellingDays(date) {
  const [y, m, d] = date.split('-').map(Number);
  let n = 0;
  for (let i = 1; i <= d; i++) {
    const wd = new Date(Date.UTC(y, m - 1, i)).getUTCDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}

function fill(rec) {
  const cell = (n) => (n === 0 ? '<td class="n0">0</td>' : `<td>${n}</td>`);
  let rows;
  if (!rec) {
    rows = '        <tr class="uncredited"><td>Waiting for the first update</td><td></td><td></td></tr>';
  } else {
    const ranked = [...rec.reps].sort((a, b) => b.tpv - a.tpv || a.name.localeCompare(b.name));
    rows = [
      ...ranked.map((r) => `        <tr><td>${esc(r.name)}</td>${COLS.map((c) => cell(r[c])).join('')}</tr>`),
      `        <tr class="uncredited"><td>No TPV agent set</td><td>${rec.no_rep.tpv}</td><td>&mdash;</td></tr>`,
      `        <tr class="total"><td>Floor</td>${COLS.map((c) => `<td>${rec.floor[c]}</td>`).join('')}</tr>`,
    ].join('\n');
  }
  let html = TPV_BOARD.replace(/(      <tbody>\n)[\s\S]*?(\n      <\/tbody>)/, (_, a, b) => a + rows + b);
  if (rec && rec.reps.length > 8) html = html.replace('<table>', '<table class="dense">');
  if (!rec) return html;
  const [y, m, d] = rec.date.split('-').map(Number);
  const month = new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  const f = rec.floor;
  const hra = f.tpv ? Math.round((100 * f.hra) / f.tpv) : 0;
  const perDay = (f.tpv / sellingDays(rec.date)).toFixed(1);
  return html
    .replace(/<div class="win">[\s\S]*?<\/div>/, `<div class="win">${month} 1&ndash;${d} &middot; Benefit Reps</div>`)
    .replace(/(<div class="fig">)\d+(<\/div>)/, `$1${f.tpv}$2`)
    .replace(/(<div class="sub">)[A-Za-z]+ to date(<\/div>)/, `$1${month} to date$2`)
    .replace(/(<span class="k">HRA attached<\/span><span class="v">)\d+%/, `$1${hra}%`)
    .replace(/(<span class="k">Verifications \/ day<\/span><span class="v">)[\d.]+/, `$1${perDay}`);
}

export async function tpvBoard(env) {
  const row = await env.DB.prepare('SELECT v FROM kv WHERE k = ?').bind('tpv_board').first();
  let rec = null;
  try { rec = row ? JSON.parse(row.v) : null; } catch (e) { rec = null; }
  rec = await withLive(env, rec);
  return new Response(fill(rec), { headers: { 'content-type': 'text/html;charset=utf-8', 'cache-control': 'no-store' } });
}
