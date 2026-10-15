// TPV completions floor board.
//
//   GET  /board/tpv     the board: template.html with the latest counts filled in
//   POST /ingest/tpv    counts from the TPV Routine (bearer secret, same as /ingest)
//
// The Routine reads TPV Tracker.xlsx from SharePoint, counts it with
// tpv/build_tpv_board.py, and posts only per-rep counts: first names and
// numbers, never the client rows the sheet holds. The page is the user's
// template, untouched apart from the numbers, the header window and the rail,
// and a 10-minute self-reload so a TV picks up each build.

import TPV_BOARD from './boards/tpv_board.html';

const COLS = ['tpv', 'hra', 'mail', 'video', 'ihwv'];
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
  if (bad) return new Response('need date, reps [{name, tpv, hra, mail, video, ihwv}], no_rep {tpv, hra} and floor', { status: 400 });

  // The floor row must reconcile with the rows above it, or the board would
  // show a total nobody can add up to.
  for (const c of COLS) {
    const sum = reps.reduce((n, r) => n + r[c], 0) + (c === 'tpv' || c === 'hra' ? nobody[c] : 0);
    if (sum !== floor[c]) return new Response(`floor ${c} is ${floor[c]} but the rows add to ${sum}`, { status: 400 });
  }

  const rec = {
    generated_at: new Date().toISOString(),
    date,
    tabs: Array.isArray(body.tabs) ? body.tabs.map(String).slice(0, 6) : [],
    rows_read: count(body.rows_read) ? body.rows_read : null,
    reps: reps.map((r) => ({ name: String(r.name).trim(), ...Object.fromEntries(COLS.map((c) => [c, r[c]])) })),
    no_rep: { tpv: nobody.tpv, hra: nobody.hra },
    floor: Object.fromEntries(COLS.map((c) => [c, floor[c]])),
  };
  await env.DB.prepare(
    'INSERT INTO kv (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at'
  ).bind('tpv_board', JSON.stringify(rec), rec.generated_at).run();
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
    rows = '        <tr class="uncredited"><td>Waiting for the first update</td><td></td><td></td><td></td><td></td><td></td></tr>';
  } else {
    const ranked = [...rec.reps].sort((a, b) => b.tpv - a.tpv || a.name.localeCompare(b.name));
    rows = [
      ...ranked.map((r) => `        <tr><td>${esc(r.name)}</td>${COLS.map((c) => cell(r[c])).join('')}</tr>`),
      `        <tr class="uncredited"><td>No name on the row</td><td>${rec.no_rep.tpv}</td><td>${rec.no_rep.hra}</td><td>&mdash;</td><td>&mdash;</td><td>&mdash;</td></tr>`,
      `        <tr class="total"><td>Floor</td>${COLS.map((c) => `<td>${rec.floor[c]}</td>`).join('')}</tr>`,
    ].join('\n');
  }
  let html = TPV_BOARD.replace(/(      <tbody>\n)[\s\S]*?(\n      <\/tbody>)/, (_, a, b) => a + rows + b);
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
  return new Response(fill(rec), { headers: { 'content-type': 'text/html;charset=utf-8', 'cache-control': 'no-store' } });
}
