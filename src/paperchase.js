// The Paper Chase — September STHHC/HI contest standings, on its own screen.
//
// Ported from the desk artifact, which reads Onyx through claude.ai's
// connector. A TV player has no Claude session and the agents this gets shared
// with have no Onyx access, so the query lives in the Worker: the standings sit
// in D1 and this page polls /board/paperchase/feed.js. The contest constants
// (teams, summer numbers, prize gates) stay here — they are display config,
// fixed for the month.
//
// The new-sale takeover is the artifact's, unchanged in behaviour: each poll is
// compared with the last, and an agent whose STHHC or HI app count rose gets a
// full-screen card. Corrections never celebrate, the first poll and any poll
// after a long gap re-baseline silently, and an app zeroed by the same-call
// rule shows in amber with nothing in gold.

export const PAPER_CHASE_BOARD = String.raw`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Paper Chase Live Standings</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Barlow+Condensed:wght@600;700;800&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  :root{
    --field:#072A21; --field2:#0E4433; --edge:#04201A;
    --panel:rgba(255,255,255,.035); --panelLine:rgba(63,214,138,.20);
    --mint:#3FD68A; --gold:#F5C942; --paper:#FFFFFF; --mute:#9FC4B3;
    --warn:#F08A3C; --bad:#E4574B;
    --band:#F5C942; --bandInk:#0A0A0A;
    --display:"Archivo Black","Arial Black",system-ui,sans-serif;
    --cond:"Barlow Condensed","Oswald","Arial Narrow",sans-serif;
    --body:"Inter",system-ui,-apple-system,Segoe UI,sans-serif;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:100%;height:100%;overflow:hidden}
  body{background:var(--edge);color:var(--paper);font-family:var(--body)}

  /* The layout is sized in vh: type, padding and gaps all key off viewport
     height, which only holds together at the ratio it was drawn for. A TV
     reporting a different aspect (or a player with chrome, or overscan) moves
     the containers without moving the text with them, and words push out of
     their boxes. So the board is drawn once at a fixed 1920x1080 and the whole
     stage is scaled to whatever the screen actually is: one transform, every
     proportion preserved, nothing to overflow. Same approach the other
     1920x1080 boards in this app use. */
  #stage{
    position:fixed;top:50%;left:50%;width:1920px;height:1080px;
    transform:translate(-50%,-50%);transform-origin:center center;overflow:hidden;
  }
  #vhfix{width:100%;height:100%}
  .board{
    position:relative;height:1080px;width:1920px;display:flex;flex-direction:column;overflow:hidden;
    background:radial-gradient(2304px 756px at 50% -194.4px, var(--field2) 0%, var(--field) 42%, var(--edge) 100%);
  }
  .money{position:absolute;inset:0;overflow:hidden;pointer-events:none;opacity:.5}
  .money span{position:absolute;font-family:var(--display);color:rgba(255,255,255,.028);line-height:1;user-select:none}

  .hdr{
    position:relative;z-index:2;display:flex;justify-content:space-between;align-items:center;
    padding:clamp(10px,20.52px,26px) clamp(18px,49.92px,52px);
    border-bottom:1px solid rgba(63,214,138,.18);
    font-family:var(--cond);font-weight:700;letter-spacing:.20em;
    font-size:clamp(11px,15.66px,20px);text-transform:uppercase;
  }
  .hdr .l{color:var(--mint)}
  .hdr .r{color:var(--gold);display:flex;align-items:center;gap:.9em}
  .dot{width:.62em;height:.62em;border-radius:50%;background:var(--mute);display:inline-block;flex:none}
  .dot.live{background:var(--mint)}
  .dot.stale{background:var(--warn)}
  .dot.down{background:var(--bad)}
  @media (prefers-reduced-motion: no-preference){
    .dot.live{animation:pulse 2.6s ease-in-out infinite}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
  }

  .main{
    position:relative;z-index:2;flex:1;display:grid;
    grid-template-columns:1.42fr 1fr;gap:clamp(14px,32.64px,34px);
    padding:clamp(14px,25.92px,34px) clamp(18px,49.92px,52px);min-height:0;
  }
  .eyebrow{
    font-family:var(--cond);font-weight:700;letter-spacing:.22em;text-transform:uppercase;
    color:var(--mint);font-size:clamp(10px,14.58px,18px);margin-bottom:clamp(6px,9.72px,12px);
  }
  .left{display:flex;flex-direction:column;min-height:0}
  .rows{display:flex;flex-direction:column;gap:clamp(7px,10.8px,14px);min-height:0}
  .row{
    position:relative;display:grid;grid-template-columns:auto 1fr auto;align-items:center;
    gap:clamp(10px,23.04px,22px);background:var(--panel);border:1px solid var(--panelLine);
    border-radius:clamp(4px,5.4px,8px);padding:clamp(7px,13.5px,17px) clamp(12px,26.88px,26px);overflow:hidden;
  }
  .row .fill{position:absolute;inset:0 auto 0 0;background:rgba(63,214,138,.10);border-right:1px solid rgba(63,214,138,.28)}
  .row > *{position:relative}
  .rank{font-family:var(--display);color:var(--gold);font-size:clamp(17px,31.32px,39px);line-height:1;min-width:1.1em}
  .who{min-width:0}
  .meta{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .nm{font-family:var(--display);color:var(--paper);line-height:1.02;font-size:clamp(16px,30.78px,39px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .meta{font-family:var(--body);color:var(--mute);font-weight:600;font-size:clamp(9.5px,14.04px,17px);margin-top:.22em}
  .meta b{color:var(--mint);font-weight:700}
  .meta .over{color:var(--gold);font-weight:700}
  .pts{text-align:right;white-space:nowrap}
  .pts .n{font-family:var(--display);color:var(--gold);font-size:clamp(21px,39.96px,50px);line-height:1;font-variant-numeric:tabular-nums}
  .pts .u{font-family:var(--cond);font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--mute);font-size:clamp(9px,11.88px,14px)}

  .races{margin-top:clamp(11px,19.98px,26px)}
  .racegrid{display:grid;grid-template-columns:repeat(4,1fr);gap:clamp(7px,16.32px,15px)}
  .race{background:var(--panel);border:1px solid var(--panelLine);border-radius:clamp(4px,5.4px,8px);padding:clamp(8px,13.5px,18px) clamp(9px,19.2px,18px)}
  .race .t{font-family:var(--cond);font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--mint);font-size:clamp(8.5px,11.88px,14px)}
  .race .v{font-family:var(--display);color:var(--paper);line-height:1.05;font-size:clamp(12px,20.52px,25px);margin-top:.3em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .race .v.pending{color:var(--mute)}
  .race .s{font-family:var(--body);font-weight:600;color:var(--mute);font-size:clamp(8.5px,12.42px,15px);margin-top:.26em}

  .stats{margin-top:clamp(11px,19.98px,26px);display:grid;grid-template-columns:repeat(4,1fr);gap:clamp(8px,19.2px,18px)}
  .stat{border-left:2px solid rgba(63,214,138,.35);padding-left:clamp(8px,15.36px,16px)}
  .stat .n{font-family:var(--display);color:var(--gold);font-size:clamp(17px,31.32px,39px);line-height:1;font-variant-numeric:tabular-nums}
  .stat .l{font-family:var(--cond);font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:var(--mute);font-size:clamp(8.5px,11.88px,14px);margin-top:.35em}

  .blank{
    margin-top:auto;border:1px dashed rgba(245,201,66,.35);border-radius:clamp(4px,5.4px,8px);
    padding:clamp(9px,16.2px,20px) clamp(12px,26.88px,26px);display:flex;align-items:baseline;gap:.55em;flex-wrap:wrap;
  }
  .blank .big{font-family:var(--display);color:var(--gold);font-size:clamp(20px,37.8px,48px);line-height:1}
  .blank .txt{font-family:var(--body);font-weight:600;color:var(--paper);font-size:clamp(10.5px,16.2px,20px)}

  .rail{display:flex;flex-direction:column;gap:clamp(9px,14.58px,20px);min-height:0}
  .card{background:var(--panel);border:1px solid var(--panelLine);border-radius:clamp(4px,5.4px,8px);padding:clamp(10px,16.2px,20px) clamp(12px,24.96px,24px);display:flex;flex-direction:column;min-height:0}
  .card.grow{flex:1}
  .card .lbl{font-family:var(--cond);font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--mint);font-size:clamp(9px,12.96px,15px);margin-bottom:clamp(5px,8.64px,10px)}
  .card.grow #teams{flex:1;display:flex;flex-direction:column;justify-content:space-between;min-height:0}
  .teamrow{display:grid;grid-template-columns:1fr auto;align-items:center;padding:4px 0;font-family:var(--cond);font-weight:700;text-transform:uppercase;letter-spacing:.055em;font-size:26px;color:var(--mute)}
  .teamrow.on{color:var(--paper)}
  .teamrow.on .v{color:var(--gold);font-weight:800}
  .teamrow .v{font-family:var(--display);font-size:24px;color:rgba(159,196,179,.55);font-variant-numeric:tabular-nums}

  .meter{margin-top:clamp(5px,7.56px,10px)}
  .meter .track{height:clamp(6px,9.18px,12px);background:rgba(255,255,255,.07);border:1px solid rgba(63,214,138,.22);border-radius:99px;overflow:hidden}
  .meter .bar{height:100%;background:var(--mint)}
  .meter .bar.gold{background:var(--gold)}
  .figs{display:flex;align-items:baseline;gap:.4em;flex-wrap:wrap}
  .figs .big{font-family:var(--display);color:var(--gold);font-size:clamp(20px,36.72px,46px);line-height:1;font-variant-numeric:tabular-nums}
  .figs .of{font-family:var(--cond);font-weight:700;color:var(--mute);font-size:clamp(10.5px,15.66px,19px);letter-spacing:.08em;text-transform:uppercase}
  .note{font-family:var(--body);color:var(--mute);font-size:clamp(9px,13.5px,16px);line-height:1.35;margin-top:clamp(5px,8.1px,10px)}
  .note b{color:var(--paper);font-weight:700}

  .band{position:relative;z-index:2;background:var(--band);color:var(--bandInk);display:flex;justify-content:space-between;align-items:center;gap:clamp(14px,38.4px,40px);padding:clamp(10px,19.98px,26px) clamp(18px,49.92px,52px)}
  .band .ask{font-family:var(--display);text-transform:uppercase;line-height:1.02;font-size:clamp(15px,30.24px,39px)}
  .band .sub{font-family:var(--body);font-weight:700;text-align:right;line-height:1.25;font-size:clamp(9.5px,14.04px,17px);max-width:28ch}

  /* status overlay for no-data states */
  .veil{
    position:absolute;inset:0;z-index:5;display:none;flex-direction:column;align-items:center;justify-content:center;
    text-align:center;padding:0 153.6px;background:rgba(4,32,26,.93);
  }
  .veil.show{display:flex}
  .veil h2{font-family:var(--display);font-size:clamp(20px,47.52px,58px);line-height:1.06;text-wrap:balance;color:var(--paper)}
  .veil p{font-family:var(--body);font-weight:600;color:var(--mute);font-size:clamp(11px,18.9px,23px);margin-top:1em;max-width:52ch;line-height:1.45}
  .veil .tag{font-family:var(--cond);font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:var(--mint);font-size:clamp(10px,14.58px,18px);margin-bottom:1em}

  /* ---------- new-sale takeover ---------- */
  .cel{
    position:absolute;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;
    text-align:center;padding:0 115.2px;overflow:hidden;
    background:radial-gradient(1728px 972px at 50% 42%, #10523C 0%, #072A21 46%, #03150F 100%);
    opacity:0;visibility:hidden;transition:opacity .34s ease, visibility 0s linear .34s;
  }
  .cel.show{opacity:1;visibility:visible;transition:opacity .26s ease}
  .celburst{
    position:absolute;left:50%;top:46%;width:1620px;height:1620px;transform:translate(-50%,-50%);
    background:conic-gradient(from 0deg,
      rgba(245,201,66,.13) 0deg, rgba(245,201,66,0) 12deg,
      rgba(245,201,66,.13) 24deg, rgba(245,201,66,0) 36deg,
      rgba(245,201,66,.13) 48deg, rgba(245,201,66,0) 60deg,
      rgba(245,201,66,.13) 72deg, rgba(245,201,66,0) 84deg,
      rgba(245,201,66,.13) 96deg, rgba(245,201,66,0) 108deg,
      rgba(245,201,66,.13) 120deg, rgba(245,201,66,0) 132deg,
      rgba(245,201,66,.13) 144deg, rgba(245,201,66,0) 156deg,
      rgba(245,201,66,.13) 168deg, rgba(245,201,66,0) 180deg,
      rgba(245,201,66,.13) 192deg, rgba(245,201,66,0) 204deg,
      rgba(245,201,66,.13) 216deg, rgba(245,201,66,0) 228deg,
      rgba(245,201,66,.13) 240deg, rgba(245,201,66,0) 252deg,
      rgba(245,201,66,.13) 264deg, rgba(245,201,66,0) 276deg,
      rgba(245,201,66,.13) 288deg, rgba(245,201,66,0) 300deg,
      rgba(245,201,66,.13) 312deg, rgba(245,201,66,0) 324deg,
      rgba(245,201,66,.13) 336deg, rgba(245,201,66,0) 348deg);
    -webkit-mask-image:radial-gradient(closest-side, #000 30%, transparent 78%);
    mask-image:radial-gradient(closest-side, #000 30%, transparent 78%);
    opacity:.85;
  }
  .celinner{position:relative;z-index:2;max-width:1689.6px}
  .celkind{
    font-family:var(--cond);font-weight:800;letter-spacing:.30em;text-transform:uppercase;
    color:var(--mint);font-size:clamp(13px,27px,34px);
  }
  .celname{
    font-family:var(--display);color:var(--paper);text-transform:uppercase;line-height:.98;
    font-size:clamp(34px,124.2px,152px);margin-top:clamp(6px,12.96px,18px);white-space:nowrap;
    text-shadow:0 0 clamp(20px,43.2px,54px) rgba(63,214,138,.28);
  }
  .celteam{
    font-family:var(--display);color:var(--gold);text-transform:uppercase;letter-spacing:.06em;
    font-size:clamp(20px,58.32px,72px);line-height:1.05;margin-top:clamp(6px,15.12px,20px);
  }
  .celfigs{
    display:flex;align-items:center;justify-content:center;gap:clamp(20px,86.4px,86px);
    margin-top:clamp(14px,34.56px,44px);
  }
  .celfig{display:flex;flex-direction:column;align-items:center}
  .celfig .v{
    font-family:var(--display);color:var(--gold);line-height:1;font-variant-numeric:tabular-nums;
    font-size:clamp(26px,77.76px,96px);
  }
  .celfig .v.zero{color:var(--warn)}
  .celfig .l{
    font-family:var(--cond);font-weight:700;letter-spacing:.24em;text-transform:uppercase;
    color:var(--mute);font-size:clamp(10px,17.28px,22px);margin-top:.5em;
  }
  .celrule{width:1px;align-self:stretch;background:rgba(63,214,138,.32)}
  .celfoot{
    font-family:var(--body);font-weight:700;color:var(--paper);
    font-size:clamp(11px,22.14px,28px);margin-top:clamp(12px,28.08px,36px);line-height:1.35;
  }
  .celfoot.warn{color:var(--warn)}
  @media (prefers-reduced-motion: no-preference){
    .cel.show .celinner{animation:celpop .52s cubic-bezier(.16,1.06,.3,1) both}
    .cel.show .celname{animation:celrise .55s cubic-bezier(.16,1.06,.3,1) .04s both}
    .cel.show .celburst{animation:celspin 26s linear infinite, celin .6s ease both}
    @keyframes celpop{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:none}}
    @keyframes celrise{from{opacity:0;transform:translateY(.16em)}to{opacity:1;transform:none}}
    @keyframes celspin{to{transform:translate(-50%,-50%) rotate(360deg)}}
    @keyframes celin{from{opacity:0}to{opacity:.85}}
  }
</style>

<body>
<div id="stage">
<div class="board">
  <div class="money" id="money"></div>

  <div class="hdr">
    <div class="l">The Paper Chase &nbsp;•&nbsp; Live Standings</div>
    <div class="r"><span class="dot" id="dot"></span><span id="stamp">Connecting to Onyx</span><span id="daycount"></span></div>
  </div>

  <div class="main">
    <div class="left">
      <div class="eyebrow">On the board</div>
      <div class="rows" id="rows"></div>

      <div class="races">
        <div class="eyebrow">Individual races &nbsp;·&nbsp; $900</div>
        <div class="racegrid" id="races"></div>
      </div>

      <div class="stats" id="stats"></div>

      <div class="blank">
        <span class="big" id="blankN">—</span>
        <span class="txt" id="blankT">seats still blank.</span>
      </div>
    </div>

    <div class="rail">
      <div class="card grow">
        <div class="lbl">Team points</div>
        <div id="teams"></div>
      </div>

      <div class="card">
        <div class="lbl">First to a grand &nbsp;·&nbsp; $200</div>
        <div class="figs"><span class="big" id="grandN">—</span><span class="of" id="grandL">of $1,000 STHHC premium</span></div>
        <div class="meter"><div class="track"><div class="bar gold" id="grandBar" style="width:0%"></div></div></div>
        <div class="note">STHHC premium that scored. An app zeroed by the same-call rule counts nothing here either. Paid <b>the day you cross</b>.</div>
      </div>

      <div class="card">
        <div class="lbl">Floor unlock &nbsp;·&nbsp; lunch on the house</div>
        <div class="figs"><span class="big" id="unlockN">—</span><span class="of">of 200 STHHC apps</span></div>
        <div class="meter"><div class="track"><div class="bar" id="unlockBar" style="width:0%"></div></div></div>
        <div class="note" id="unlockNote">Average premium has to clear $62. All of us or none of us.</div>
      </div>

      <div class="card">
        <div class="lbl">Weekly draw &nbsp;·&nbsp; Fridays at 4:00</div>
        <div class="figs"><span class="big" id="ticketN">—</span><span class="of">tickets in the drum</span></div>
        <div class="note" id="ticketNote">One ticket per 50 points this week. Resets Monday.</div>
      </div>
    </div>
  </div>

  <div class="band">
    <div class="ask" id="ask">Write the paper. Chase the money.</div>
    <div class="sub">STHHC never rides the same call as an MA enrollment. Attach it and it scores zero.</div>
  </div>

  <div class="veil" id="veil">
    <div class="tag" id="veilTag">Onyx</div>
    <h2 id="veilH">Connecting to Onyx…</h2>
    <p id="veilP">Standings appear as soon as the first pull comes back.</p>
  </div>
</div>

<div class="cel" id="cel" aria-hidden="true">
  <div class="celburst"></div>
  <div class="celinner">
    <div class="celkind" id="celKind">New STHHC</div>
    <div class="celname" id="celName">—</div>
    <div class="celteam" id="celTeam">—</div>
    <div class="celfigs">
      <div class="celfig"><span class="v" id="celPrem">—</span><span class="l">premium</span></div>
      <div class="celrule"></div>
      <div class="celfig"><span class="v" id="celPts">—</span><span class="l" id="celPtsL">points</span></div>
    </div>
    <div class="celfoot" id="celFoot">&nbsp;</div>
  </div>
</div>

</div><!-- /stage -->

<script>
/* ---------- contest constants: fixed for September, from the posted boards ---------- */
var TEAMS = [
  ["Honey Badgers", ["Manar Ettayem","Nicole Bell-Royster","Armando Martinez","John Gregory","Mariyeisi Umpierre"]],
  ["Barracudas",    ["Tianna Thompson","Basem Moussa","Hunter Cole","Brandon Lugo","Quinn Slaydon"]],
  ["Vipers",        ["Savanna Holloway","Marilyn Johnson","Timothy Jackson","Andre Cintron","David Calhoun"]],
  ["Piranhas",      ["ChenY'ere Franklin","Shani Fareed","Deon McClendon","Chelsea Hammers","Trinaka Edmond"]],
  ["Scorpions",     ["Juana Bustos-Roblero","Sumesh Chakkalakkal","Yancy Harrier","Adam Menendez","Sophia Asencio"]],
  ["Hornets",       ["Raymond Mccrea","George Corbin","Gwendolyn Ingram","Cortney Sanders","Andre Banfield"]],
  ["Mambas",        ["Jesenia Morell","Damien Goode","Alexi Lebrun","Victor Cruz","Marcos Manzueta"]],
  ["Cobras",        ["Nifda Colon","Rosalva Diaz","Luis Lopez","Avah Burns","Sumit Lal"]],
  ["Wolverines",    ["Sherly Riley","Irelys Padierna","Shirley Davis","Kameron Smith","Jalen McClendon"]]
];
var SUMMER = {
  "Savanna Holloway":1006,"Tianna Thompson":962,"Sherly Riley":836,"ChenY'ere Franklin":823,
  "Manar Ettayem":686,"Raymond Mccrea":649,"Juana Bustos-Roblero":638,"Jesenia Morell":613,
  "Sumesh Chakkalakkal":554,"Damien Goode":553,"Alexi Lebrun":492,"George Corbin":489,
  "Rosalva Diaz":456,"Shani Fareed":380,"Nifda Colon":363,"John Gregory":357,
  "Deon McClendon":356,"Irelys Padierna":344,"Marilyn Johnson":331,"Timothy Jackson":298,
  "Nicole Bell-Royster":281,"Avah Burns":270,"Andre Banfield":256,"Gwendolyn Ingram":245,
  "Cortney Sanders":234,"Sumit Lal":209,"Hunter Cole":189
};
var FLOOR_NUMBER = 180;
var SEATS = 45, UNLOCK_APPS = 200, UNLOCK_AVG = 62, GRAND = 1000;

/* celebration tuning */
var CEL_MS = 8000;        // time on screen per sale
var CEL_GAP = 550;        // breath between queued celebrations
var CEL_MAX_QUEUE = 4;    // never hold the board hostage
var RESYNC_MS = 20 * 60 * 1000; // a gap this long re-baselines silently

var TEAM_OF = {}, SEAT_LIST = [];
TEAMS.forEach(function(t){ t[1].forEach(function(n){ TEAM_OF[key(n)] = t[0]; SEAT_LIST.push(n); }); });
function key(n){ return String(n||"").trim().toLowerCase().replace(/\s+/g," "); }
function summerOf(n){ var v = SUMMER[n]; return (typeof v === "number" && v > FLOOR_NUMBER) ? v : FLOOR_NUMBER; }

/* ---------- helpers ---------- */
function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); }
function money(n){ return "$" + Number(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}); }
function money0(n){ return "$" + Math.round(Number(n)).toLocaleString("en-US"); }
function toObjects(payload){
  if(!payload || !payload.columns || !payload.rows) return null;
  var cols = payload.columns.map(function(c){ return c && c.name ? c.name : String(c); });
  return payload.rows.map(function(r){
    var o = {}; cols.forEach(function(c,i){ o[c] = r[i]; }); return o;
  });
}

/* ---------- render ---------- */
var lastAgg = null;

function setStatus(kind, text){
  var dot = document.getElementById("dot");
  dot.className = "dot" + (kind ? " " + kind : "");
  document.getElementById("stamp").textContent = text;
}
function showVeil(tag, head, para){
  document.getElementById("veilTag").textContent = tag;
  document.getElementById("veilH").textContent = head;
  document.getElementById("veilP").textContent = para;
  document.getElementById("veil").classList.add("show");
}
function hideVeil(){ document.getElementById("veil").classList.remove("show"); }

function dayLine(){
  var now = new Date();
  var d = Number(new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",day:"numeric"}).format(now));
  var m = Number(new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",month:"numeric"}).format(now));
  if(m !== 9) return "";
  return "  •  Day " + d + " of 30";
}

function render(rows){
  lastAgg = rows;
  hideVeil();

  var byAgent = {};
  rows.forEach(function(r){ byAgent[key(r.agent)] = r; });

  // scorers, rostered only, ranked
  var scorers = rows.filter(function(r){ return Number(r.points) > 0; })
                    .sort(function(a,b){ return Number(b.points) - Number(a.points); });
  var top = scorers.slice(0, 7);
  var maxPts = top.length ? Number(top[0].points) : 1;

  document.getElementById("rows").innerHTML = top.length ? top.map(function(r,i){
    var nm = r.agent, team = TEAM_OF[key(nm)] || "Not on a team";
    var sn = summerOf(nm), pts = Number(r.points);
    var over = pts > sn;
    var bits = [];
    if(Number(r.sthhc_apps) > 0) bits.push(Number(r.sthhc_apps) + " STHHC");
    if(Number(r.hi_apps) > 0) bits.push(Number(r.hi_apps) + " HI");
    var prog = over
      ? '<span class="over">over their ' + sn + '</span>'
      : pts + " / " + sn + " toward their number";
    return '<div class="row">' +
      '<div class="fill" style="width:' + (Math.max(6, pts / maxPts * 100)).toFixed(1) + '%"></div>' +
      '<div class="rank">' + (i+1) + '</div>' +
      '<div class="who"><div class="nm">' + esc(nm) + '</div>' +
      '<div class="meta">' + esc(bits.join(" · ")) + ' · <b>' + esc(team) + '</b> · ' + prog + '</div></div>' +
      '<div class="pts"><div class="n">' + pts + '</div><div class="u">points</div></div>' +
      '</div>';
  }).join("") : '<div class="row"><div class="rank">—</div><div class="who"><div class="nm">Nobody yet</div><div class="meta">First app of the day puts a name here.</div></div><div class="pts"><div class="n">0</div><div class="u">points</div></div></div>';

  // individual races
  function best(list, valFn, gate, gateN){
    var pool = list.filter(function(r){ return gate(r) >= gateN; });
    if(!pool.length) return null;
    pool.sort(function(a,b){ return valFn(b) - valFn(a); });
    var topV = valFn(pool[0]);
    var tied = pool.filter(function(r){ return valFn(r) === topV; });
    return {names: tied.map(function(r){ return r.agent; }), value: topV, n: tied.length};
  }
  function nameLabel(w){
    if(!w) return null;
    if(w.n === 1) return w.names[0];
    if(w.n === 2) return w.names[0].split(" ")[w.names[0].split(" ").length-1] + " & " + w.names[1].split(" ")[w.names[1].split(" ").length-1];
    return w.n + " tied";
  }
  var rTop  = best(rows, function(r){ return Number(r.points); }, function(){ return 1; }, 1);
  var rApps = best(rows, function(r){ return Number(r.sthhc_apps_q); }, function(r){ return Number(r.sthhc_apps_q); }, 1);
  var rSth  = best(rows, function(r){ return Number(r.sthhc_prem)/Number(r.sthhc_apps); }, function(r){ return Number(r.sthhc_apps); }, 5);
  var rHi   = best(rows, function(r){ return Number(r.hi_prem)/Number(r.hi_apps); }, function(r){ return Number(r.hi_apps); }, 8);

  function raceCard(title, w, valTxt, gateTxt){
    return '<div class="race"><div class="t">' + title + '</div>' +
      (w ? '<div class="v">' + esc(nameLabel(w)) + '</div><div class="s">' + esc(valTxt(w)) + '</div>'
         : '<div class="v pending">Open</div><div class="s">' + esc(gateTxt) + '</div>') +
      '</div>';
  }
  document.getElementById("races").innerHTML =
    raceCard("Top scorer &nbsp;·&nbsp; $250", rTop, function(w){ return w.value + " points"; }, "First app takes it") +
    raceCard("Most STHHC apps &nbsp;·&nbsp; $150", rApps, function(w){ return w.value + " app" + (w.value===1?"":"s") + " at $50+"; }, "Counts apps at $50/mo and up") +
    raceCard("Best STHHC premium &nbsp;·&nbsp; $150", rSth, function(w){ return money(w.value) + " average"; }, "Needs 5 apps to qualify") +
    raceCard("Best HI premium &nbsp;·&nbsp; $150", rHi, function(w){ return money(w.value) + " average"; }, "Needs 8 apps to qualify");

  // floor stats
  var totSthhc = 0, totHi = 0, totSthhcPrem = 0, totHiPrem = 0, totPts = 0;
  rows.forEach(function(r){
    totSthhc += Number(r.sthhc_apps); totHi += Number(r.hi_apps);
    totSthhcPrem += Number(r.sthhc_prem); totHiPrem += Number(r.hi_prem);
    totPts += Number(r.points);
  });
  document.getElementById("stats").innerHTML =
    '<div class="stat"><div class="n">' + totSthhc + '</div><div class="l">STHHC apps</div></div>' +
    '<div class="stat"><div class="n">' + totHi + '</div><div class="l">HI apps</div></div>' +
    '<div class="stat"><div class="n">' + money0(totSthhcPrem + totHiPrem) + '</div><div class="l">Premium written</div></div>' +
    '<div class="stat"><div class="n">' + totPts + '</div><div class="l">Floor points</div></div>';

  // blank seats
  var onBoard = scorers.filter(function(r){ return TEAM_OF[key(r.agent)]; }).length;
  var blank = Math.max(0, SEATS - onBoard);
  document.getElementById("blankN").textContent = blank;
  document.getElementById("blankT").textContent = blank === SEATS
    ? "seats still blank. Nobody has written a thing yet."
    : "of 45 seats still blank. That lasts exactly as long as you let it.";

  // teams
  var teamStats = TEAMS.map(function(t){
    var pts = 0, prem = 0;
    t[1].forEach(function(n){
      var r = byAgent[key(n)];
      // Grand race counts scoring premium only — an app zeroed by the
      // same-call rule earns the team nothing here either.
      if(r){ pts += Number(r.points); prem += Number(r.sthhc_prem_scored) || 0; }
    });
    return {name: t[0], points: pts, sthhcPrem: prem};
  }).sort(function(a,b){ return b.points - a.points; });

  document.getElementById("teams").innerHTML = teamStats.map(function(t){
    return '<div class="teamrow' + (t.points > 0 ? " on" : "") + '"><span>' + esc(t.name) + '</span><span class="v">' + t.points + '</span></div>';
  }).join("");

  // first to a grand
  var lead = teamStats.slice().sort(function(a,b){ return b.sthhcPrem - a.sthhcPrem; })[0];
  document.getElementById("grandN").textContent = money0(lead ? lead.sthhcPrem : 0);
  document.getElementById("grandL").textContent = (lead && lead.sthhcPrem > 0)
    ? "of $1,000 — " + lead.name + " lead" : "of $1,000 STHHC premium";
  document.getElementById("grandBar").style.width = Math.min(100, (lead ? lead.sthhcPrem : 0) / GRAND * 100).toFixed(1) + "%";

  // floor unlock
  document.getElementById("unlockN").textContent = totSthhc;
  document.getElementById("unlockBar").style.width = Math.min(100, totSthhc / UNLOCK_APPS * 100).toFixed(1) + "%";
  var avg = totSthhc ? totSthhcPrem / totSthhc : 0;
  document.getElementById("unlockNote").innerHTML = totSthhc
    ? "Average premium <b>" + money(avg) + "</b> against a $" + UNLOCK_AVG + " bar. All of us or none of us."
    : "Average premium has to clear $" + UNLOCK_AVG + ". All of us or none of us.";

  // weekly draw
  var tickets = 0, ticketLeaders = [];
  rows.forEach(function(r){
    var t = Math.floor(Number(r.points_week) / 50);
    if(t > 0){ tickets += t; ticketLeaders.push({n: r.agent, t: t}); }
  });
  ticketLeaders.sort(function(a,b){ return b.t - a.t; });
  document.getElementById("ticketN").textContent = tickets;
  document.getElementById("ticketNote").innerHTML = ticketLeaders.length
    ? "One per 50 points this week. <b>" + esc(ticketLeaders.slice(0,3).map(function(x){ return x.n.split(" ")[0] + " " + x.t; }).join(" · ")) + "</b>. Resets Monday."
    : "One ticket per 50 points this week. Resets Monday.";

  // the ask
  document.getElementById("ask").textContent = blank === SEATS
    ? "Nobody on the board yet. Somebody go first."
    : (totSthhc === 0
        ? "HI is on the board. STHHC is where the grand is."
        : blank + " seats still blank. Everything is still on the table.");

  document.getElementById("daycount").textContent = dayLine();
}

/* ---------- new-sale takeover ---------- */
var prevBy = null, lastPullAt = 0, celQueue = [], celBusy = false;

function snapshot(byAgent){
  var out = {};
  Object.keys(byAgent).forEach(function(k){
    var r = byAgent[k];
    out[k] = {
      agent: r.agent,
      sthhc_apps: Number(r.sthhc_apps) || 0, sthhc_prem: Number(r.sthhc_prem) || 0, sthhc_pts: Number(r.sthhc_pts) || 0,
      hi_apps: Number(r.hi_apps) || 0, hi_prem: Number(r.hi_prem) || 0, hi_pts: Number(r.hi_pts) || 0
    };
  });
  return out;
}

// Compare this pull with the last one and queue a takeover per new app.
// Silent on the first pull, and after a long gap (a screen waking up should
// not replay an hour of sales as if they just happened).
function detectNewSales(rows){
  var now = Date.now();
  var byAgent = {};
  rows.forEach(function(r){ byAgent[key(r.agent)] = r; });

  var quiet = (prevBy === null) || (now - lastPullAt > RESYNC_MS);
  lastPullAt = now;
  if(quiet){ prevBy = snapshot(byAgent); return; }

  var found = [];
  Object.keys(byAgent).forEach(function(k){
    var cur = byAgent[k];
    var old = prevBy[k] || {sthhc_apps:0,sthhc_prem:0,sthhc_pts:0,hi_apps:0,hi_prem:0,hi_pts:0};
    [["STHHC","sthhc"],["HI","hi"]].forEach(function(p){
      var dn = (Number(cur[p[1]+"_apps"]) || 0) - old[p[1]+"_apps"];
      if(dn <= 0) return;                       // corrections never celebrate
      found.push({
        kind: p[0],
        n: dn,
        agent: cur.agent,
        team: TEAM_OF[key(cur.agent)] || "Not on a team",
        prem: (Number(cur[p[1]+"_prem"]) || 0) - old[p[1]+"_prem"],
        pts:  (Number(cur[p[1]+"_pts"])  || 0) - old[p[1]+"_pts"]
      });
    });
  });

  prevBy = snapshot(byAgent);
  if(!found.length) return;

  found.sort(function(a,b){ return b.pts - a.pts; });   // biggest first
  found.slice(0, CEL_MAX_QUEUE).forEach(function(ev){ celQueue.push(ev); });
  runCel();
}

// Keep long names on one line — Bustos-Roblero and Chakkalakkal are wide in Archivo Black.
function fitName(el, text){
  el.style.fontSize = "";
  el.textContent = text;
  // The inner block is shrink-to-fit, so measure against the screen, not the parent.
  var room = 1920 * 0.86;   // the stage is fixed, so the screen is irrelevant here
  var size = parseFloat(window.getComputedStyle(el).fontSize) || 100;
  for(var i = 0; i < 40 && el.scrollWidth > room && size > 26; i++){
    size *= 0.94;
    el.style.fontSize = size.toFixed(1) + "px";
  }
}

function paintCel(ev){
  var many = ev.n > 1;
  document.getElementById("celKind").textContent = many
    ? ev.n + " new " + ev.kind + " sales"
    : "New " + ev.kind + " sale";
  fitName(document.getElementById("celName"), ev.agent);
  document.getElementById("celTeam").textContent = ev.team;
  // A zeroed app credits nothing anywhere, so nothing on its card reads as gold.
  var premEl = document.getElementById("celPrem");
  premEl.textContent = ev.prem > 0 ? money(ev.prem) : "—";
  premEl.className = "v" + (ev.pts > 0 ? "" : " zero");

  var ptsEl = document.getElementById("celPts");
  ptsEl.textContent = ev.pts > 0 ? "+" + ev.pts : "0";
  ptsEl.className = "v" + (ev.pts > 0 ? "" : " zero");
  document.getElementById("celPtsL").textContent = many ? "points total" : "points";

  var foot = document.getElementById("celFoot");
  if(ev.pts <= 0 && ev.kind === "STHHC"){
    foot.className = "celfoot warn";
    foot.textContent = "Same call as an MA enrollment — no points, no grand credit.";
  } else if(ev.team === "Not on a team"){
    foot.className = "celfoot";
    foot.textContent = "On the board, off the roster.";
  } else {
    foot.className = "celfoot";
    foot.textContent = ev.team + (many ? " pick up " : " pick up ") + ev.pts + " point" + (ev.pts === 1 ? "" : "s") + ".";
  }
}

function runCel(){
  if(celBusy) return;
  var ev = celQueue.shift();
  if(!ev) return;
  celBusy = true;
  paintCel(ev);
  var el = document.getElementById("cel");
  el.classList.add("show");
  setTimeout(function(){
    el.classList.remove("show");
    celBusy = false;
    setTimeout(runCel, CEL_GAP);
  }, CEL_MS);
}

// Press T on a keyboard to preview the takeover on the wall.
document.addEventListener("keydown", function(e){
  if(e.key !== "t" && e.key !== "T") return;
  celQueue.push({kind:"STHHC", n:1, agent:"Test Agent", team:"Cobras", prem:66.96, pts:67});
  runCel();
});

/* ---------- data ---------- */
/* The standings come from the Worker's own feed, refreshed server-side by the
   Onyx webhook (seconds after a policy is keyed) and recomputed hourly. This
   page reads no CRM of its own: it runs on a TV with no Claude session, and is
   shared with agents who have no Onyx access.

   Polling is faster here than on the desk artifact — this reads one small D1
   row, not an Onyx query, so a celebration lands within a poll of the webhook
   rather than within a two-minute Onyx cycle. */
var FEED = "/board/paperchase/feed.js";
var QS = window.location.search;      /* carries the board key through */
var POLL_MS = 20000;
var STALE_MIN = 30;                   /* amber once a refresh is clearly missed */
var lastGen = null;

function stampOf(d){
  return new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",hour:"numeric",minute:"2-digit"}).format(d);
}

function markFreshness(){
  if(!lastGen) return;
  var m = Math.floor((Date.now() - lastGen.getTime()) / 60000);
  if(m >= STALE_MIN) setStatus("stale", "As of " + stampOf(lastGen) + " \u00b7 not refreshing");
  else setStatus("live", "As of " + stampOf(lastGen));
}

function applyFeed(d){
  if(!d || !Array.isArray(d.rows)){
    setStatus("stale", "Unexpected reply");
    if(!lastAgg) showVeil("The Paper Chase", "The standings came back in a shape this board does not recognise.",
      "Nothing is wrong with the contest \u2014 this screen just could not read it.");
    return;
  }
  lastGen = d.generated_at ? new Date(d.generated_at) : new Date();
  render(d.rows);
  detectNewSales(d.rows);
  markFreshness();
}

function loadFeed(){
  var old = document.getElementById("feedScript");
  if(old) old.remove();
  var el = document.createElement("script");
  el.id = "feedScript";
  el.src = FEED + QS + (QS ? "&" : "?") + "v=" + Date.now();
  el.onload = function(){ applyFeed(window.PAPER_CHASE); };
  el.onerror = function(){
    setStatus("down", "No feed");
    prevBy = null;   // whatever comes back next is a fresh baseline, not news
    if(!lastAgg) showVeil("The Paper Chase", "This screen cannot reach the standings feed.",
      "The board keeps retrying on its own. If it stays like this, the boards app needs a look.");
  };
  document.body.appendChild(el);
}

(function boot(){
  document.getElementById("daycount").textContent = dayLine();
  setStatus("", "Loading standings");
  showVeil("The Paper Chase", "Loading the standings\u2026", "The board fills in as soon as the first pull comes back.");
  loadFeed();
  setInterval(loadFeed, POLL_MS);
  setInterval(markFreshness, 30000);
})();

/* ambient dollars */
(function(){
  var host = document.getElementById("money"); if(!host) return;
  var seed = 7, rand = function(){ seed = (seed*1103515245+12345)&0x7fffffff; return seed/0x7fffffff; };
  for(var i=0;i<26;i++){
    var s = document.createElement("span");
    s.textContent = "$";
    s.style.left = (rand()*100).toFixed(2) + "%";
    s.style.top = (rand()*100).toFixed(2) + "%";
    s.style.fontSize = ((6 + rand()*13) * 10.8).toFixed(1) + "px";
    s.style.transform = "rotate(" + ((rand()*24)-12).toFixed(1) + "deg)";
    host.appendChild(s);
  }
})();

/* ---------- fit the stage to the screen ---------- */
/* One transform for the whole board, so type and containers scale together.
   ?overscan=5 trims the edges on a TV that crops them; ?debug=1 prints the
   measured viewport and the scale being applied. */
(function(){
  var stage = document.getElementById("stage");
  var qs = new URLSearchParams(location.search);
  var overscan = Math.min(15, Math.max(0, parseFloat(qs.get("overscan")) || 0));
  var debug = qs.get("debug") === "1";
  var dbg = null;
  if(debug){
    dbg = document.createElement("div");
    dbg.style.cssText = "position:fixed;left:6px;bottom:6px;z-index:99;font:12px/1.3 monospace;color:#3FD68A;background:rgba(0,0,0,.6);padding:4px 6px;border-radius:3px";
    document.body.appendChild(dbg);
  }
  var lw = 0, lh = 0;
  function fit(force){
    var vv = window.visualViewport;
    var w = (vv && vv.width)  || document.documentElement.clientWidth  || window.innerWidth;
    var h = (vv && vv.height) || document.documentElement.clientHeight || window.innerHeight;
    if(!w || !h) return;
    if(!force && w === lw && h === lh) return;
    lw = w; lh = h;
    var s = Math.min(w / 1920, h / 1080) * (1 - overscan / 100);
    stage.style.transform = "translate(-50%,-50%) scale(" + s + ")";
    if(dbg) dbg.textContent = w + " x " + h + "  scale " + s.toFixed(4);
  }
  ["resize","orientationchange","load","pageshow"].forEach(function(e){
    window.addEventListener(e, function(){ fit(true); }); });
  if(window.visualViewport) window.visualViewport.addEventListener("resize", function(){ fit(true); });
  if(window.ResizeObserver) new ResizeObserver(function(){ fit(); }).observe(document.documentElement);
  document.addEventListener("DOMContentLoaded", function(){ fit(true); });
  [0,100,300,600,1000,2000,4000].forEach(function(t){ setTimeout(function(){ fit(true); }, t); });
  setInterval(fit, 2000);
  fit(true);
})();
</script>

</body>
</html>`;
