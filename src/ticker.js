// Live sales ticker — the header bar that runs across the top of every board.
//
// A continuously scrolling rail of the most recent STHHC / Core / HI writes
// with the agent's name. When a write the page hasn't seen before appears, the
// rail is taken over by a full-width NEW SALE card, then returns to scrolling.
//
// Data comes from the snapshot's `ticker` array (pushed by the refresh Routine
// alongside every other number) — never invented here. No feed, no rail: the
// bar falls back to today's tally alone rather than showing stale names.
//
// Shape of snap.ticker (newest first):
//   [{ agent, bucket: 'STHHC'|'CORE'|'HI', plan, carrier, premium, at }]
//   at = 'YYYY-MM-DD HH:MM' in Eastern time.

export const TICKER_CONFIG = {
  maxItems: 40,          // rail length
  refreshSeconds: 45,    // how often the bar re-reads /api/stats
  secondsPerItem: 4.5,   // lower = faster scroll
  qualifyingPremium: 50, // Ticket Run threshold
  alertSeconds: 7,       // how long each NEW SALE card holds
  freshMinutes: 12,      // newer than this stays tinted in the rail
};

// Height of the bar. Boards subtract exactly this from their own height, so
// nothing on the TVs is cropped — change it here and every page follows.
const TICK_H = 'clamp(62px, 8.8vh, 112px)';

const TICKER_CSS = `
<style id="ghe-ticker-css">
:root{ --ghe-tick:${TICK_H}; }

/* Every fluid board is a full-viewport box laid out in vh units. Rather than
   crop it — the bottom row of a leaderboard is the row people look for — keep
   it at its natural 100vh and scale the whole thing into the space the bar
   leaves. --ghe-k is set by the script below; 1 until then, so a board with
   no JS still lands somewhere sane. The 1920x1080 boards scale themselves
   instead, via the ticker-aware measure() in static_boards.js. */
body{ padding-top:var(--ghe-tick); }
body > .board{
  width:calc(100vw / var(--ghe-k,1)) !important;
  height:100vh !important;
  transform:scale(var(--ghe-k,1));
  transform-origin:top left;
}

#ghe-ticker{
  position:fixed; top:0; left:0; right:0; height:var(--ghe-tick); z-index:9000;
  display:flex; align-items:stretch; overflow:hidden;
  background:linear-gradient(180deg,#08304F,#062741);
  border-bottom:2px solid #12496F;
  font-family:"Inter",-apple-system,"Segoe UI",Roboto,sans-serif;
  --tk-cond:"Barlow Condensed","Oswald","Arial Narrow",sans-serif;
  --tk-paper:#F2F7FB; --tk-mute:#7FA6C4; --tk-line:#12496F;
}

/* ---- left cap: today's live tally ---- */
#ghe-ticker .tk-cap{
  flex:0 0 auto; z-index:3;
  display:flex; flex-direction:column; justify-content:center; gap:.7vh;
  padding:0 1.5vw 0 1.2vw;
  border-right:1px solid var(--tk-line); background:rgba(1,90,156,.20);
}
#ghe-ticker .tk-caphead{
  display:flex; align-items:center; gap:.45vw;
  font-family:var(--tk-cond); font-weight:700; text-transform:uppercase;
  letter-spacing:.18em; font-size:clamp(9px,1.25vh,16px); color:var(--tk-mute);
}
#ghe-ticker .tk-dot{
  width:.7vh; height:.7vh; min-width:6px; min-height:6px; border-radius:50%;
  background:#0B9444; animation:ghe-pulse 2.4s infinite;
}
@keyframes ghe-pulse{
  0%{box-shadow:0 0 0 0 rgba(62,224,138,.55)}
  70%{box-shadow:0 0 0 .9vh rgba(62,224,138,0)}
  100%{box-shadow:0 0 0 0 rgba(62,224,138,0)}
}
#ghe-ticker .tk-tally{ display:flex; gap:1.5vw; }
#ghe-ticker .tk-t{ display:flex; align-items:baseline; gap:.45vw; }
#ghe-ticker .tk-t b{
  font-family:var(--tk-cond); font-weight:800; line-height:.85;
  font-size:clamp(22px,4.4vh,54px); color:var(--tk-ink);
}
#ghe-ticker .tk-t span{
  font-family:var(--tk-cond); font-weight:600; text-transform:uppercase;
  letter-spacing:.12em; font-size:clamp(9px,1.35vh,18px);
  color:var(--tk-paper); opacity:.8;
}
#ghe-ticker .tk-t em{ font-style:normal; color:var(--tk-mute); }

/* ---- the rail ---- */
#ghe-ticker .tk-rail{ position:relative; flex:1 1 auto; overflow:hidden; }
#ghe-ticker .tk-marquee{
  display:flex; width:max-content; height:100%;
  animation-name:ghe-scroll; animation-timing-function:linear;
  animation-iteration-count:infinite;
}
@keyframes ghe-scroll{ from{transform:translate3d(0,0,0)} to{transform:translate3d(-50%,0,0)} }
#ghe-ticker .tk-track{ display:flex; align-items:center; }

/* Centred, not baseline-aligned: the agent name is twice the size of the
   labels beside it, and sharing a baseline left them sitting low. */
#ghe-ticker .tk-entry{
  display:flex; align-items:center; gap:.75vw;
  padding:0 1.5vw; height:100%;
  border-right:1px solid var(--tk-line); white-space:nowrap;
}
#ghe-ticker .tk-chip{
  font-family:var(--tk-cond); font-weight:700; letter-spacing:.14em;
  font-size:clamp(9px,1.35vh,18px); padding:.35vh .5vw; border-radius:.3vh;
  color:var(--tk-ink); background:var(--tk-glow);
  border:1px solid var(--tk-edge);
}
#ghe-ticker .tk-agent{
  font-family:var(--tk-cond); font-weight:700; line-height:1;
  font-size:clamp(19px,3.5vh,44px); color:var(--tk-paper);
}
#ghe-ticker .tk-plan{
  font-size:clamp(10px,1.4vh,18px); color:var(--tk-mute);
  max-width:20ch; overflow:hidden; text-overflow:ellipsis;
}
#ghe-ticker .tk-prem{
  font-family:var(--tk-cond); font-weight:700;
  font-size:clamp(14px,2.5vh,32px); color:var(--tk-ink);
}
#ghe-ticker .tk-prem.under{ color:#9E7C86; text-decoration:line-through; }
#ghe-ticker .tk-prem em{
  display:inline-block; margin-left:.35vw; font-family:"Inter",sans-serif;
  font-style:normal; font-weight:600; letter-spacing:.1em; text-transform:uppercase;
  font-size:clamp(8px,1.1vh,14px); color:#B0808A; text-decoration:none;
}
#ghe-ticker .tk-time{
  font-size:clamp(9px,1.3vh,16px); color:var(--tk-mute);
  font-variant-numeric:tabular-nums;
}
#ghe-ticker .tk-entry.under .tk-agent{ color:#A8C0D4; }
#ghe-ticker .tk-entry.fresh{ background:linear-gradient(180deg,var(--tk-glow),transparent 72%); }
#ghe-ticker .tk-entry.fresh .tk-agent{ color:#FFFFFF; }

#ghe-ticker .tk-fade{ position:absolute; top:0; bottom:0; width:3vw; pointer-events:none; z-index:2; }
#ghe-ticker .tk-fade.l{ left:0; background:linear-gradient(90deg,#072B47,transparent); }
#ghe-ticker .tk-fade.r{ right:0; background:linear-gradient(270deg,#072B47,transparent); }

#ghe-ticker .tk-empty{
  display:flex; align-items:center; padding:0 1.6vw;
  font-family:var(--tk-cond); font-weight:600; text-transform:uppercase;
  letter-spacing:.16em; font-size:clamp(10px,1.6vh,20px); color:var(--tk-mute);
}

/* ---- NEW SALE takeover ---- */
#ghe-ticker .tk-alert{
  position:absolute; inset:0; z-index:5;
  display:flex; align-items:center; overflow:hidden;
  background:
    radial-gradient(120% 180% at 10% 50%, var(--tk-glow), transparent 62%),
    linear-gradient(90deg,#0A3A5F 0%, #062741 72%);
  border-left:.5vh solid var(--tk-ink);
  animation:ghe-alert-in .42s cubic-bezier(.16,1,.3,1);
}
@keyframes ghe-alert-in{
  from{ transform:translate3d(0,-100%,0); opacity:0 }
  to{ transform:translate3d(0,0,0); opacity:1 }
}
#ghe-ticker .tk-sheen{
  position:absolute; top:0; bottom:0; width:38%;
  background:linear-gradient(100deg,transparent,rgba(255,255,255,.10),transparent);
  transform:translateX(-140%);
  animation:ghe-sheen 1.5s cubic-bezier(.4,0,.2,1) .28s 2;
}
@keyframes ghe-sheen{ to{ transform:translateX(360%) } }
#ghe-ticker .tk-abody{
  position:relative; display:flex; align-items:center; gap:1.6vw;
  padding:0 1.8vw; width:100%;
}
#ghe-ticker .tk-badge{ display:flex; flex-direction:column; gap:.3vh; flex:0 0 auto; }
#ghe-ticker .tk-eyebrow{
  font-family:var(--tk-cond); font-weight:800; text-transform:uppercase;
  letter-spacing:.1em; line-height:1; font-size:clamp(15px,2.8vh,36px);
  color:var(--tk-ink); animation:ghe-throb 1.05s ease-in-out 3;
}
@keyframes ghe-throb{ 0%,100%{opacity:1} 50%{opacity:.42} }
#ghe-ticker .tk-product{
  font-family:var(--tk-cond); font-weight:600; text-transform:uppercase;
  letter-spacing:.16em; font-size:clamp(9px,1.3vh,17px); color:var(--tk-mute);
}
#ghe-ticker .tk-aname{
  font-family:var(--tk-cond); font-weight:800; line-height:.9;
  font-size:clamp(26px,5.4vh,68px); color:#FFFFFF;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
#ghe-ticker .tk-ameta{
  display:flex; flex-direction:column; gap:.3vh; min-width:0; flex:1 1 auto;
  font-size:clamp(10px,1.4vh,18px); color:var(--tk-mute);
}
#ghe-ticker .tk-ameta span{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
#ghe-ticker .tk-aprem{
  font-family:var(--tk-cond); font-weight:700;
  font-size:clamp(15px,2.7vh,34px); color:var(--tk-ink) !important;
}
#ghe-ticker .tk-flag{
  flex:0 0 auto; font-family:var(--tk-cond); font-weight:700;
  letter-spacing:.14em; text-transform:uppercase; font-size:clamp(9px,1.35vh,18px);
  color:#04223A; background:var(--tk-ink); padding:.5vh .8vw; border-radius:.3vh;
}
#ghe-ticker .tk-flag.muted{ color:#C7D9E6; background:rgba(255,255,255,.09); }
#ghe-ticker .tk-alert.under{ border-left-color:#6E8AA1; }
#ghe-ticker .tk-alert.under .tk-aname{ color:#C4D6E3; }
#ghe-ticker .tk-alert.under .tk-eyebrow{ color:#A8C0D4; animation:none; }
/* A write under the bar is reported, not celebrated: nothing on the card
   carries the product's colour. */
#ghe-ticker .tk-alert.under .tk-aprem{ color:#9E7C86 !important; }
#ghe-ticker .tk-alert.under .tk-timer{ background:#6E8AA1; }
#ghe-ticker .tk-timer{
  position:absolute; left:0; bottom:0; height:.3vh; width:100%;
  background:var(--tk-ink); transform-origin:left center;
  animation-name:ghe-timer; animation-timing-function:linear;
}
@keyframes ghe-timer{ from{transform:scaleX(1)} to{transform:scaleX(0)} }
#ghe-ticker .tk-queue{
  position:absolute; right:.6vw; top:.5vh; z-index:6;
  font-family:var(--tk-cond); font-weight:600; letter-spacing:.12em;
  text-transform:uppercase; font-size:clamp(8px,1.2vh,15px);
  color:var(--tk-mute); background:rgba(0,0,0,.35);
  padding:.2vh .5vw; border-radius:.3vh;
}

@media (prefers-reduced-motion: reduce){
  #ghe-ticker .tk-marquee{ animation:none }
  #ghe-ticker .tk-dot{ animation:none }
  #ghe-ticker .tk-alert{ animation:none }
  #ghe-ticker .tk-sheen{ display:none }
  #ghe-ticker .tk-eyebrow{ animation:none }
}
</style>`;

// Markup is intentionally empty on arrival: the script fills it from
// /api/stats. A board that loads without a feed shows the tally and a quiet
// line, never a name the data doesn't support.
const TICKER_HTML = `
<div id="ghe-ticker" aria-label="Live sales ticker">
  <div class="tk-cap">
    <div class="tk-caphead"><span class="tk-dot"></span><span>Live &middot; today</span></div>
    <div class="tk-tally" id="tk-tally"></div>
  </div>
  <div class="tk-rail" id="tk-rail">
    <div class="tk-empty">Waiting for the live feed&hellip;</div>
    <div class="tk-fade l"></div><div class="tk-fade r"></div>
  </div>
</div>`;

const TICKER_JS = `
<script id="ghe-ticker-js">
(function(){
  if (window.__gheTicker) return;
  window.__gheTicker = true;

  var CFG = ${JSON.stringify(TICKER_CONFIG)};
  var PRODUCT = {
    STHHC:{ label:'STHHC', full:'Short-Term Home Health', ink:'#F6B301', glow:'rgba(246,179,1,.15)', edge:'rgba(246,179,1,.45)' },
    CORE: { label:'CORE',  full:'Core Enrollment',        ink:'#2E8FD6', glow:'rgba(46,143,214,.15)', edge:'rgba(46,143,214,.45)' },
    HI:   { label:'HI',    full:'Hospital Indemnity',     ink:'#3EE08A', glow:'rgba(62,224,138,.14)', edge:'rgba(62,224,138,.42)' }
  };

  var bar = document.getElementById('ghe-ticker');
  var rail = document.getElementById('tk-rail');
  var tally = document.getElementById('tk-tally');
  if (!bar || !rail || !tally) return;

  // How much of the screen is left for the board underneath, as a ratio.
  function scale(){
    var h = document.documentElement.clientHeight || window.innerHeight;
    var k = h ? (h - bar.offsetHeight) / h : 1;
    document.documentElement.style.setProperty('--ghe-k', k > 0 ? k : 1);
  }
  scale();
  window.addEventListener('resize', scale);
  setInterval(scale, 2000);

  var known = null;      // null until the first pull, so a cold load never alerts
  var queue = [];
  var showing = false;
  var rows = [];

  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];
    });
  }
  function money(n){
    if (n == null || isNaN(n)) return '';
    return '$' + Number(n).toFixed(2).replace(/\\.00$/, '');
  }
  function keyOf(r){ return [r.agent, r.bucket, r.at, r.premium == null ? '' : r.premium].join('|'); }
  function under(r){ return r.bucket === 'STHHC' && Number(r.premium || 0) < CFG.qualifyingPremium; }
  function parseAt(s){
    var m = /(\\d{4})-(\\d{2})-(\\d{2})[ T](\\d{2}):(\\d{2})/.exec(s || '');
    return m ? Date.parse(m[1]+'-'+m[2]+'-'+m[3]+'T'+m[4]+':'+m[5]+':00-04:00') : NaN;
  }
  function clock(s){
    var m = /(\\d{4})-(\\d{2})-(\\d{2})[ T](\\d{2}):(\\d{2})/.exec(s || '');
    if (!m) return '';
    var h = parseInt(m[4],10), sfx = h >= 12 ? 'p' : 'a';
    h = h % 12 || 12;
    return h + ':' + m[5] + sfx;
  }
  function fresh(r){
    var t = parseAt(r.at);
    return !isNaN(t) && (Date.now() - t) / 60000 <= CFG.freshMinutes;
  }
  function vars(p){ return '--tk-ink:'+p.ink+';--tk-glow:'+p.glow+';--tk-edge:'+p.edge+';'; }

  function entry(r){
    var p = PRODUCT[r.bucket] || PRODUCT.CORE;
    var u = under(r);
    var prem = '';
    if (r.premium != null && r.bucket !== 'CORE') {
      prem = '<span class="tk-prem' + (u ? ' under' : '') + '">' + money(r.premium) +
             (u ? '<em>under $50</em>' : '') + '</span>';
    }
    return '<div class="tk-entry' + (u ? ' under' : '') + (fresh(r) ? ' fresh' : '') + '" style="' + vars(p) + '">' +
      '<span class="tk-chip">' + p.label + '</span>' +
      '<span class="tk-agent">' + esc(r.agent) + '</span>' +
      '<span class="tk-plan">' + esc(r.plan || r.carrier || '') + '</span>' +
      prem +
      '<span class="tk-time">' + clock(r.at) + '</span>' +
    '</div>';
  }

  function drawRail(){
    if (!rows.length) {
      rail.innerHTML = '<div class="tk-empty">Waiting for the live feed&hellip;</div>' +
                       '<div class="tk-fade l"></div><div class="tk-fade r"></div>';
      return;
    }
    var track = '<div class="tk-track">' + rows.map(entry).join('') + '</div>';
    var secs = Math.max(30, rows.length * CFG.secondsPerItem);
    rail.innerHTML =
      '<div class="tk-marquee" id="tk-marquee" style="animation-duration:' + secs + 's">' +
        track + track +
      '</div>' +
      '<div class="tk-fade l"></div><div class="tk-fade r"></div>';
  }

  function drawTally(t){
    tally.innerHTML =
      '<div class="tk-t" style="--tk-ink:' + PRODUCT.STHHC.ink + '"><b>' + t.sthhcQual + '</b>' +
        '<span>STHHC <em>of ' + t.sthhc + '</em></span></div>' +
      '<div class="tk-t" style="--tk-ink:' + PRODUCT.CORE.ink + '"><b>' + t.core + '</b><span>Core</span></div>' +
      '<div class="tk-t" style="--tk-ink:' + PRODUCT.HI.ink + '"><b>' + t.hi + '</b><span>HI</span></div>';
  }

  function pump(){
    if (showing || !queue.length) return;
    var r = queue.shift();
    showing = true;
    var p = PRODUCT[r.bucket] || PRODUCT.CORE;
    var u = under(r);
    var marquee = document.getElementById('tk-marquee');
    if (marquee) marquee.style.animationPlayState = 'paused';

    var card = document.createElement('div');
    card.className = 'tk-alert' + (u ? ' under' : '');
    card.setAttribute('style', vars(p));
    card.setAttribute('role', 'status');
    card.innerHTML =
      '<div class="tk-sheen"></div>' +
      '<div class="tk-abody">' +
        '<div class="tk-badge">' +
          '<span class="tk-eyebrow">' + (u ? 'STHHC written' : 'New sale') + '</span>' +
          '<span class="tk-product">' + p.full + '</span>' +
        '</div>' +
        '<div class="tk-aname">' + esc(r.agent) + '</div>' +
        '<div class="tk-ameta">' +
          '<span>' + esc(r.plan || r.carrier || '') + '</span>' +
          (r.premium != null && r.bucket !== 'CORE'
            ? '<span class="tk-aprem">' + money(r.premium) + '/mo</span>' : '') +
        '</div>' +
        (r.bucket === 'STHHC' && !u ? '<div class="tk-flag">Ticket Run &middot; qualified</div>' : '') +
        (u ? '<div class="tk-flag muted">Under $50 &middot; does not count</div>' : '') +
      '</div>' +
      '<div class="tk-timer" style="animation-duration:' + CFG.alertSeconds + 's"></div>';
    rail.appendChild(card);

    if (queue.length) {
      var q = document.createElement('div');
      q.className = 'tk-queue';
      q.textContent = '+' + queue.length + ' more';
      card.appendChild(q);
    }

    setTimeout(function(){
      card.remove();
      showing = false;
      var mq = document.getElementById('tk-marquee');
      if (mq) mq.style.animationPlayState = 'running';
      pump();
    }, CFG.alertSeconds * 1000);
  }

  function qualifiedToday(snap){
    var c = snap.contest, day = snap.board_date;
    if (!c || !Array.isArray(c.rows) || !day) return null;
    var n = 0;
    for (var i = 0; i < c.rows.length; i++) {
      if (c.rows[i][1] === day) n += Number(c.rows[i][2] || 0);
    }
    return n;
  }

  function apply(snap){
    var t = snap.today || {};
    var q = qualifiedToday(snap);
    drawTally({
      sthhc: t.sthhc == null ? 0 : t.sthhc,
      sthhcQual: q == null ? (t.sthhc == null ? 0 : t.sthhc) : q,
      core: t.core == null ? 0 : t.core,
      hi: t.hi == null ? 0 : t.hi
    });

    var feed = Array.isArray(snap.ticker) ? snap.ticker.slice(0, CFG.maxItems) : [];
    var incoming = [];
    if (known === null) {
      known = {};
      feed.forEach(function(r){ known[keyOf(r)] = 1; });
    } else {
      feed.forEach(function(r){
        var k = keyOf(r);
        if (!known[k]) { known[k] = 1; incoming.push(r); }
      });
    }

    var same = feed.length === rows.length &&
               feed.every(function(r, i){ return keyOf(r) === keyOf(rows[i]); });
    rows = feed;
    if (!same) drawRail();

    if (incoming.length) {
      incoming.sort(function(a, b){ return parseAt(a.at) - parseAt(b.at); });
      queue = queue.concat(incoming);
      pump();
    }
  }

  function pull(){
    fetch('/api/stats' + location.search, { cache:'no-store' })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(d){ if (d) apply(d); })
      .catch(function(){});
  }

  pull();
  setInterval(pull, CFG.refreshSeconds * 1000);
})();
</script>`;

// Puts the bar on a finished board page: styles last in <head> so they win,
// markup first in <body> so it reads as a header, script last so it runs
// against markup that already exists.
export function withTicker(page) {
  // Every insertion goes through a replacer function: a plain string
  // replacement would read `$&`, `$\'` and friends in the ticker's own source
  // as substitution patterns and quietly rewrite it.
  let out = page;
  out = out.includes('</head>')
    ? out.replace('</head>', () => `${TICKER_CSS}\n</head>`)
    : TICKER_CSS + out;
  out = out.replace(/<body([^>]*)>/i, (m) => `${m}\n${TICKER_HTML}`);
  out = out.includes('</body>')
    ? out.replace('</body>', () => `${TICKER_JS}\n</body>`)
    : out + TICKER_JS;
  return out;
}
