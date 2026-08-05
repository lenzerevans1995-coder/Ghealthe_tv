// Board HTML renderers. One shared shell + design system (ported verbatim from
// the hand-built floor boards) and a template per board type. Every page
// includes a small poller that re-fetches its own URL and swaps the body when
// the content changes — no full reload, no white flash on the TVs.

const FONTS = `
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">`;

const BASE_CSS = `
:root{
  --ink:#04223A; --ink2:#08304F; --line:#12496F;
  --blue:#015A9C; --green:#0B9444; --gold:#F6B301;
  --paper:#F2F7FB; --mute:#7FA6C4;
  --display:"Barlow Condensed","Oswald","Arial Narrow",sans-serif;
  --body:"Inter",-apple-system,"Segoe UI",Roboto,sans-serif;
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{background:var(--ink);color:var(--paper);font-family:var(--body);overflow:hidden;-webkit-font-smoothing:antialiased}
.board{height:100vh;display:grid;grid-template-rows:auto 1fr auto;padding:2.2vh 2.4vw;gap:1.8vh}
.bar{display:flex;align-items:baseline;justify-content:space-between;border-bottom:2px solid var(--line);padding-bottom:1.2vh}
.brand{font-family:var(--display);font-weight:700;text-transform:uppercase;letter-spacing:.14em;font-size:clamp(14px,2.1vh,30px);color:var(--mute)}
.brand b{color:var(--paper);font-weight:800}
.today{font-family:var(--display);font-weight:800;text-transform:uppercase;letter-spacing:.05em;font-size:clamp(16px,2.6vh,38px);color:var(--gold)}
.eyebrow{font-family:var(--display);font-weight:700;text-transform:uppercase;letter-spacing:.2em;font-size:clamp(11px,1.7vh,22px);color:var(--mute);margin-bottom:.8vh}
.asof{position:fixed;right:1.2vw;bottom:.8vh;font-family:var(--display);font-weight:600;letter-spacing:.08em;
  text-transform:uppercase;font-size:clamp(9px,1.3vh,16px);color:var(--mute);opacity:.7}
.asof.stale{color:var(--gold);opacity:1}
`;

const DAILY_CSS = `
.mid{display:grid;grid-template-columns:1fr 26vw;gap:1.6vw;min-height:0}
.panel{background:var(--ink2);border:1px solid var(--line);padding:1.6vh 1.4vw;min-height:0}
.stats{display:grid;grid-template-columns:repeat(5,1fr);gap:1vw;align-items:end}
.stat .n{font-family:var(--display);font-weight:800;line-height:.82;font-size:clamp(38px,11vh,150px)}
.stat .l{font-family:var(--display);font-weight:600;text-transform:uppercase;letter-spacing:.12em;font-size:clamp(11px,1.9vh,26px);color:var(--mute);margin-top:.6vh}
.core .n{color:var(--paper)} .sthhc .n{color:var(--gold)} .hi .n{color:var(--paper)}
.anc .n{color:var(--mute)} .tot .n{color:var(--green)}
.subline{display:flex;gap:2.2vw;margin-top:1.6vh;padding-top:1.4vh;border-top:1px solid var(--line);flex-wrap:wrap}
.subline div{font-size:clamp(11px,1.8vh,24px);color:var(--mute)}
.subline b{color:var(--paper);font-weight:600}
.leaders{margin-top:1.6vh}
.lrow{display:flex;align-items:baseline;gap:.9vw;padding:.75vh 0;border-bottom:1px solid var(--line)}
.lrow:last-child{border-bottom:none}
.lrow .pos{font-family:var(--display);font-weight:800;color:var(--gold);font-size:clamp(14px,2.4vh,32px);width:2.2ch}
.lrow .who{font-weight:600;font-size:clamp(13px,2.2vh,30px);flex:1}
.lrow .what{font-family:var(--display);font-weight:700;color:var(--mute);font-size:clamp(12px,2vh,26px);text-transform:uppercase;letter-spacing:.06em}
.lrow .what b{color:var(--paper)}
.days{background:linear-gradient(180deg,var(--blue) 0%, #013D6C 100%);border:1px solid #1E6FA8;
  display:flex;flex-direction:column;justify-content:center;align-items:center;padding:2vh 1vw;text-align:center}
.days .n{font-family:var(--display);font-weight:800;line-height:.8;font-size:clamp(70px,26vh,300px);color:#fff}
.days .l{font-family:var(--display);font-weight:700;text-transform:uppercase;letter-spacing:.16em;font-size:clamp(13px,2.4vh,32px);margin-top:1.2vh}
.days .sub{margin-top:1.4vh;padding-top:1.2vh;border-top:1px solid rgba(255,255,255,.28);font-size:clamp(11px,1.7vh,22px);color:#BFDCF2;line-height:1.5}
.push{background:var(--green);color:#03260F;display:grid;grid-template-columns:1fr auto;gap:2vw;align-items:center;padding:2.2vh 2vw}
.push h1{font-family:var(--display);font-weight:800;text-transform:uppercase;line-height:.9;letter-spacing:-.01em;font-size:clamp(30px,8.4vh,116px);color:#fff}
.push .kicker{font-family:var(--display);font-weight:700;text-transform:uppercase;letter-spacing:.22em;font-size:clamp(11px,1.8vh,24px);color:#C9F0D6;margin-bottom:.7vh}
.push .rules{margin-top:1.3vh;display:grid;grid-template-columns:1fr 1fr;gap:1.1vh 2.2vw;font-size:clamp(11px,1.75vh,23px);line-height:1.45;color:#052E12}
.push .rules p{max-width:46ch}
.push .rules b{color:#fff;font-weight:700}
.slots{display:flex;gap:1.1vw}
.slot{width:clamp(80px,13vh,190px);height:clamp(80px,13vh,190px);border:.5vh dashed var(--gold);border-radius:.9vh;
  display:flex;flex-direction:column;justify-content:center;align-items:center;background:rgba(255,255,255,.07)}
.slot .num{font-family:var(--display);font-weight:800;color:var(--gold);font-size:clamp(38px,9vh,120px);line-height:.8}
.slot .tag{font-family:var(--display);font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#EAFBF0;font-size:clamp(9px,1.4vh,18px);margin-top:.7vh}
.slot.pulse{animation:breathe 2.6s ease-in-out infinite}
.slot.pulse:nth-child(2){animation-delay:1.3s}
@keyframes breathe{0%,100%{border-color:var(--gold);background:rgba(255,255,255,.07)}50%{border-color:#FFD96B;background:rgba(255,255,255,.16)}}
@media (prefers-reduced-motion: reduce){.slot.pulse{animation:none}}
`;

const LEADER_CSS = `
.mid{display:grid;grid-template-columns:1fr 25vw;gap:1.6vw;min-height:0}
.rank{display:flex;flex-direction:column;justify-content:space-between;min-height:0}
.title{font-family:var(--display);font-weight:800;text-transform:uppercase;line-height:.9;font-size:clamp(24px,5.4vh,74px);color:#fff;margin:.4vh 0 1.4vh}
.rows{display:flex;flex-direction:column;gap:.9vh;flex:1;justify-content:center}
.row{position:relative;display:grid;grid-template-columns:5ch 1fr auto auto;align-items:center;
  gap:1.4vw;padding:1.5vh 1.4vw;background:var(--ink2);border-left:.55vh solid var(--line);overflow:hidden}
.row .fill{position:absolute;inset:0 auto 0 0;background:rgba(1,90,156,.55);z-index:0}
.row > *{position:relative;z-index:1}
.row.top{border-left-color:var(--gold)}
.row.top .fill{background:rgba(246,179,1,.13)}
.pos{font-family:var(--display);font-weight:800;color:var(--mute);font-size:clamp(22px,5vh,68px);line-height:.8}
.row.top .pos{color:var(--gold)}
.who{font-weight:600;font-size:clamp(15px,3.1vh,42px);white-space:nowrap}
.metric{text-align:right;min-width:8.5ch}
.metric .v{font-family:var(--display);font-weight:800;line-height:.85;font-size:clamp(22px,4.9vh,66px)}
.metric .k{font-family:var(--display);font-weight:600;text-transform:uppercase;letter-spacing:.12em;font-size:clamp(9px,1.4vh,18px);color:var(--mute);margin-top:.35vh}
.cnt .v{color:#fff} .prem .v{color:#5FD08A} .row.top .cnt .v{color:var(--gold)}
.foot{font-size:clamp(10px,1.5vh,19px);color:var(--mute);margin-top:1.2vh}
.side{background:linear-gradient(180deg,var(--blue) 0%, #013D6C 100%);border:1px solid #1E6FA8;
  padding:2.4vh 1.4vw;display:flex;flex-direction:column;justify-content:center;gap:2.4vh;text-align:center}
.side .eyebrow{color:#BFDCF2;margin-bottom:1.4vh}
.side .n{font-family:var(--display);font-weight:800;line-height:.8;color:#fff;font-size:clamp(40px,11vh,150px)}
.side .l{font-family:var(--display);font-weight:700;text-transform:uppercase;letter-spacing:.14em;font-size:clamp(11px,1.9vh,25px);color:#BFDCF2;margin-top:.9vh}
.side .div{height:1px;background:rgba(255,255,255,.28)}
.push{background:var(--green);color:#03260F;display:flex;align-items:center;justify-content:space-between;gap:2vw;padding:2vh 2vw}
.push h1{font-family:var(--display);font-weight:800;text-transform:uppercase;line-height:.9;font-size:clamp(24px,6.2vh,84px);color:#fff}
.push p{margin-top:1vh;font-size:clamp(11px,1.8vh,24px);line-height:1.4;color:#052E12;max-width:52ch}
.push p b{color:#fff;font-weight:700}
.slots{display:flex;gap:1vw;flex:none}
.slot{width:clamp(64px,10vh,140px);height:clamp(64px,10vh,140px);border:.45vh dashed var(--gold);border-radius:.8vh;
  display:flex;flex-direction:column;justify-content:center;align-items:center;background:rgba(255,255,255,.08)}
.slot .num{font-family:var(--display);font-weight:800;color:var(--gold);font-size:clamp(30px,7vh,92px);line-height:.8}
.slot .tag{font-family:var(--display);font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#EAFBF0;font-size:clamp(8px,1.2vh,16px);margin-top:.5vh}
`;

// Re-fetches the page and swaps the body only when the markup changed.
const POLLER = `
<script>
(function(){
  var EVERY = 15000;
  function tick(){
    fetch(location.href, {cache:'no-store'}).then(function(r){
      if(!r.ok) return;
      return r.text();
    }).then(function(html){
      if(!html) return;
      var m = html.match(/<body[^>]*>([\\s\\S]*)<\\/body>/i);
      if(m && m[1].trim() !== document.body.innerHTML.trim()){
        document.body.innerHTML = m[1];
      }
    }).catch(function(){}).finally(function(){ setTimeout(tick, EVERY); });
  }
  setTimeout(tick, EVERY);
})();
</script>`;

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function shell(title, css, body, { asOf, stale } = {}) {
  const asOfHtml = asOf
    ? `<div class="asof${stale ? ' stale' : ''}">${stale ? '⚠ data may be stale · ' : ''}as of ${esc(asOf)}</div>`
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
${FONTS}
<style>${BASE_CSS}${css}</style>
</head>
<body>
${body}
${asOfHtml}
${POLLER}
</body>
</html>`;
}

function pushBand(focus) {
  const rules = (focus.rules || []).map((r) => `<p>${r}</p>`).join('\n');
  const slots = (focus.slots || [])
    .map((s) => `<div class="slot pulse"><div class="num">${esc(s)}</div><div class="tag">STHHC</div></div>`)
    .join('\n');
  return `
  <div class="push">
    <div>
      <div class="kicker">${esc(focus.kicker)}</div>
      <h1>${esc(focus.headline)}</h1>
      ${rules ? `<div class="rules">${rules}</div>` : ''}
    </div>
    ${slots ? `<div class="slots">${slots}</div>` : ''}
  </div>`;
}

function statsRow(d) {
  return `
  <div class="stats">
    <div class="stat core"><div class="n">${d.core}</div><div class="l">Core</div></div>
    <div class="stat sthhc"><div class="n">${d.sthhc}</div><div class="l">STHHC</div></div>
    <div class="stat hi"><div class="n">${d.hi}</div><div class="l">HI</div></div>
    <div class="stat anc"><div class="n">${d.ancillary}</div><div class="l">Ancillary</div></div>
    <div class="stat tot"><div class="n">${d.total}</div><div class="l">Total Policies</div></div>
  </div>`;
}

function daysRail(month) {
  return `
  <div class="days">
    <div class="n">${month.selling_days_left}</div>
    <div class="l">Selling days left</div>
    <div class="sub">${month.sub}</div>
  </div>`;
}

function leaderRows(rows) {
  return rows
    .map(
      (l) => `<div class="lrow"><div class="pos">${esc(l.pos)}</div><div class="who">${l.who}</div><div class="what">${l.what}</div></div>`
    )
    .join('\n');
}

// ---------- boards ----------

export function renderDaily(snap, meta) {
  const y = snap.yesterday;
  const subline = (y.subline || []).map((s) => `<div>${s}</div>`).join('\n');
  const body = `
<div class="board">
  <div class="bar">
    <div class="brand"><b>Get Health-e</b> &nbsp;·&nbsp; Medicare Inbound Floor</div>
    <div class="today">${esc(snap.today.label)}</div>
  </div>
  <div class="mid">
    <div class="panel">
      <div class="eyebrow">${esc(y.label)}</div>
      ${statsRow(y)}
      <div class="subline">${subline}</div>
      <div class="leaders">
        <div class="eyebrow">Yesterday's board</div>
        ${leaderRows(y.board || [])}
      </div>
    </div>
    ${daysRail(snap.month)}
  </div>
  ${pushBand(snap.focus)}
</div>`;
  return shell('Medicare Inbound — Floor Board', DAILY_CSS, body, meta);
}

export function renderLive(snap, meta) {
  const t = snap.today;
  const conv = t.conversion == null ? '—' : `${t.conversion}%`;
  const leaders =
    (t.leaders || []).length > 0
      ? `<div class="leaders"><div class="eyebrow">Today's board</div>${leaderRows(t.leaders)}</div>`
      : `<div class="leaders"><div class="eyebrow">Today's board</div>
         <div class="lrow"><div class="who" style="color:var(--mute)">First policy of the day takes the top spot.</div></div></div>`;
  const body = `
<div class="board">
  <div class="bar">
    <div class="brand"><b>Get Health-e</b> &nbsp;·&nbsp; Medicare Inbound Floor</div>
    <div class="today">${esc(t.label)} · LIVE</div>
  </div>
  <div class="mid">
    <div class="panel">
      <div class="eyebrow">Today so far</div>
      ${statsRow(t)}
      <div class="subline">
        <div><b>${t.calls}</b> inbound calls</div>
        <div><b>${conv}</b> core conversion</div>
      </div>
      ${leaders}
    </div>
    ${daysRail(snap.month)}
  </div>
  ${pushBand(snap.focus)}
</div>`;
  return shell('Medicare Inbound — Live Board', DAILY_CSS, body, meta);
}

export function renderLeadersSthhc(snap, meta) {
  const L = snap.leaders_sthhc;
  const max = Math.max(...L.rows.map((r) => r.count), 1);
  const rows = L.rows
    .map((r, i) => {
      const pct = Math.round((r.count / max) * 100);
      return `
      <div class="row${i === 0 ? ' top' : ''}">
        <div class="fill" style="width:${pct}%"></div>
        <div class="pos">${esc(r.pos)}</div>
        <div class="who">${esc(r.who)}</div>
        <div class="metric cnt"><div class="v">${r.count}</div><div class="k">STHHC</div></div>
        <div class="metric prem"><div class="v">${esc(r.avg)}</div><div class="k">Avg premium</div></div>
      </div>`;
    })
    .join('\n');
  const side = L.floor
    .map(
      (f, i) =>
        `${i > 0 ? '<div class="div"></div>' : ''}<div>${f.eyebrow ? `<div class="eyebrow">${esc(f.eyebrow)}</div>` : ''}<div class="n">${esc(f.n)}</div><div class="l">${esc(f.l)}</div></div>`
    )
    .join('\n');
  const body = `
<div class="board">
  <div class="bar">
    <div class="brand"><b>Get Health-e</b> &nbsp;·&nbsp; Medicare Inbound Floor</div>
    <div class="today">${esc(L.month_label)}</div>
  </div>
  <div class="mid">
    <div class="rank">
      <div>
        <div class="eyebrow">${esc(L.eyebrow)}</div>
        <div class="title">${esc(L.title)}</div>
      </div>
      <div class="rows">${rows}</div>
      <div class="foot">${esc(L.foot)}</div>
    </div>
    <div class="side">${side}</div>
  </div>
  <div class="push">
    <div>
      <h1>${esc(L.push.headline)}</h1>
      <p>${L.push.body}</p>
    </div>
    <div class="slots">
      <div class="slot"><div class="num">1</div><div class="tag">STHHC</div></div>
      <div class="slot"><div class="num">2</div><div class="tag">STHHC</div></div>
    </div>
  </div>
</div>`;
  return shell('STHHC Leaders', LEADER_CSS, body, meta);
}

const MTD_CSS = DAILY_CSS + `
.stat .p{font-size:clamp(10px,1.5vh,20px);color:var(--mute);margin-top:.5vh}
.stat .p b{color:var(--gold);font-weight:700}
.push{background:var(--gold);color:#4A3400}
.push .kicker{color:#7A5600}
.push h1{color:#2E2000;font-size:clamp(26px,7vh,98px)}
.push .rules{color:#4A3400}
.push .rules b{color:#2E2000}
.pacebox{display:flex;gap:1vw;flex:none}
.pill{border:.45vh solid #7A5600;border-radius:.8vh;padding:1.4vh 1.5vw;text-align:center;background:rgba(255,255,255,.22)}
.pill .v{font-family:var(--display);font-weight:800;font-size:clamp(28px,7vh,96px);line-height:.82;color:#2E2000}
.pill .k{font-family:var(--display);font-weight:700;letter-spacing:.14em;text-transform:uppercase;font-size:clamp(9px,1.4vh,18px);color:#5C4100;margin-top:.6vh}
`;

export function renderMtd(snap, meta) {
  const m = snap.mtd;
  if (!m) {
    return shell('MTD Board', DAILY_CSS, `
<div class="board"><div class="bar">
  <div class="brand"><b>Get Health-e</b> &nbsp;·&nbsp; Month to Date</div></div>
  <div class="mid"><div class="panel"><div class="eyebrow">Waiting for the first MTD snapshot…</div></div></div>
</div>`, meta);
  }
  const pace = m.pace || {};
  const paceLine = (v) => (v == null ? '' : `<div class="p">pace <b>${v}</b></div>`);
  const split = (m.split || []).map((s) => `<div>${s}</div>`).join('\n');
  const push = m.push || {};
  const pills = (push.pills || [])
    .map((p) => `<div class="pill"><div class="v">${esc(p.v)}</div><div class="k">${esc(p.k)}</div></div>`)
    .join('\n');
  const rules = (push.rules || []).map((r) => `<p>${r}</p>`).join('\n');
  const body = `
<div class="board">
  <div class="bar">
    <div class="brand"><b>Get Health-e</b> &nbsp;·&nbsp; Month to Date</div>
    <div class="today">${esc(m.through_label)}</div>
  </div>
  <div class="mid">
    <div class="panel">
      <div class="eyebrow">${esc(m.eyebrow)}</div>
      <div class="stats">
        <div class="stat core"><div class="n">${m.core}</div><div class="l">Core</div>${paceLine(pace.core)}</div>
        <div class="stat sthhc"><div class="n">${m.sthhc}</div><div class="l">STHHC</div>${paceLine(pace.sthhc)}</div>
        <div class="stat hi"><div class="n">${m.hi}</div><div class="l">HI</div>${paceLine(pace.hi)}</div>
        <div class="stat anc"><div class="n">${m.ancillary}</div><div class="l">Ancillary</div></div>
        <div class="stat tot"><div class="n">${m.total}</div><div class="l">Total Policies</div></div>
      </div>
      <div class="subline">${split}</div>
      <div class="leaders">
        <div class="eyebrow">MTD leaders</div>
        ${leaderRows(m.leaders || [])}
      </div>
    </div>
    ${daysRail(snap.month)}
  </div>
  <div class="push">
    <div>
      <div class="kicker">${esc(push.kicker || '')}</div>
      <h1>${esc(push.headline || '')}</h1>
      ${rules ? `<div class="rules">${rules}</div>` : ''}
    </div>
    ${pills ? `<div class="pacebox">${pills}</div>` : ''}
  </div>
</div>`;
  return shell('Month to Date — Floor Board', MTD_CSS, body, meta);
}

// Cycles through board pages with a crossfade so PosterBooking needs one URL.
export function renderRotation(boards, dwellSeconds, key) {
  const urls = boards.map((b) => `/board/${b}${key ? `?key=${encodeURIComponent(key)}` : ''}`);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Floor Boards</title>
<style>
  *{margin:0;padding:0}
  html,body{height:100%;background:#04223A;overflow:hidden}
  iframe{position:absolute;inset:0;width:100%;height:100%;border:0;opacity:0;transition:opacity .8s ease}
  iframe.show{opacity:1}
</style>
</head>
<body>
<iframe id="a"></iframe>
<iframe id="b"></iframe>
<script>
  var urls = ${JSON.stringify(urls)};
  var dwell = ${Math.max(8, dwellSeconds)} * 1000;
  var frames = [document.getElementById('a'), document.getElementById('b')];
  var idx = 0, front = 0;
  frames[0].src = urls[0];
  frames[0].onload = function(){ frames[0].classList.add('show'); frames[0].onload = null; };
  setInterval(function(){
    idx = (idx + 1) % urls.length;
    var back = 1 - front;
    var f = frames[back];
    f.onload = function(){
      f.classList.add('show');
      frames[front].classList.remove('show');
      front = back;
      f.onload = null;
    };
    f.src = urls[idx];
  }, dwell);
</script>
</body>
</html>`;
}
