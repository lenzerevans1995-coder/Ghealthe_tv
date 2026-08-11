// The contest flyer, served by the Worker from /assets/*. The page appends
// its own query string so the board key rides along on the image request.
// Empty = the contest rail shows only the countdown.
const CONTEST_FLYER = '/assets/contest-flyer.jpg';

// Static boards: hand-built full-page HTML served verbatim. These pages carry
// their own fonts, fit-to-screen logic, and (for early-out) query-param inputs
// (?sthhc=&core=&hi=&goal=&asof=), so they bypass the snapshot entirely.

export const STATIC_BOARDS = {
  'month-open': `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>August — New Month, 21 Selling Days</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Archivo+Black&family=Barlow+Condensed:wght@500;600;700&display=swap" rel="stylesheet">
<style>
  :root{
    --gold:#F6B301; --green:#0B9444; --blue:#015A9C; --blue-lit:#2E8FD6;
    --ink:#EAF2F9; --dim:#8FAFC8;
    --display:'Anton','Arial Narrow',Impact,sans-serif;
    --num:'Archivo Black','Arial Black',sans-serif;
    --util:'Barlow Condensed','Arial Narrow',sans-serif;
  }
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:100%;height:100%;background:#04101B;overflow:hidden}
  body{position:relative}

  #stage{
    position:fixed;top:50%;left:50%;width:1920px;height:1080px;
    transform-origin:center center;
    background:
      radial-gradient(1150px 720px at 22% 40%, rgba(1,90,156,.38), transparent 63%),
      radial-gradient(950px 620px at 86% 76%, rgba(11,148,68,.20), transparent 62%),
      linear-gradient(#071B2C,#04101B);
    color:var(--ink);font-family:var(--util);
    display:flex;flex-direction:column;overflow:hidden;
  }
  #stage::before{
    content:"";position:absolute;inset:0;pointer-events:none;
    background-image:
      linear-gradient(rgba(143,175,200,.05) 1px,transparent 1px),
      linear-gradient(90deg,rgba(143,175,200,.05) 1px,transparent 1px);
    background-size:60px 60px;
  }

  /* rail */
  .rail{
    position:relative;z-index:2;height:86px;flex:none;
    display:flex;align-items:center;gap:26px;padding:0 62px;
    border-bottom:3px solid rgba(246,179,1,.5);
    background:linear-gradient(90deg,rgba(1,90,156,.5),rgba(1,90,156,0) 72%);
  }
  .mark{font-family:var(--display);font-size:30px;letter-spacing:.06em;text-transform:uppercase}
  .mark b{color:var(--gold);font-weight:400}
  .rail .div{width:2px;height:36px;background:rgba(143,175,200,.35)}
  .rail .where{font-size:24px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:var(--dim)}
  .rail .now{margin-left:auto;display:flex;align-items:center;gap:20px}
  .now .date{font-family:var(--display);font-size:30px;letter-spacing:.05em;text-transform:uppercase}
  .now .tag{
    font-family:var(--num);font-size:25px;letter-spacing:.09em;text-transform:uppercase;
    color:#061726;background:var(--gold);padding:9px 18px 8px;
  }

  main{position:relative;z-index:2;flex:1;display:grid;grid-template-columns:880px 1fr;gap:58px;padding:38px 62px 0}

  .eyebrow{
    display:inline-flex;align-items:center;gap:16px;
    font-size:26px;font-weight:700;letter-spacing:.3em;text-transform:uppercase;color:var(--gold);
  }
  .eyebrow::before{content:"";width:52px;height:5px;background:var(--gold)}

  h1{font-family:var(--display);font-size:150px;line-height:.83;text-transform:uppercase;margin-top:20px}
  h1 .lit{display:block;color:var(--gold);text-shadow:0 0 46px rgba(246,179,1,.48)}

  .days{
    margin-top:34px;display:flex;align-items:center;gap:28px;
    background:linear-gradient(90deg,rgba(14,42,68,.9),rgba(14,42,68,.3));
    border-left:9px solid var(--gold);padding:20px 30px;
  }
  .days .n{font-family:var(--num);font-size:132px;line-height:.82;color:var(--gold);font-variant-numeric:tabular-nums}
  .days .t .k{font-family:var(--display);font-size:56px;line-height:.95;text-transform:uppercase}
  .days .t p{margin-top:8px;font-size:27px;font-weight:600;color:var(--dim);letter-spacing:.03em}
  .days .t p b{color:var(--ink);font-weight:700}

  .fast{
    margin-top:30px;padding-left:24px;border-left:6px solid var(--green);
    font-size:33px;font-weight:600;line-height:1.28;color:var(--dim);max-width:800px;
  }
  .fast b{color:var(--ink);font-weight:700}

  /* right */
  .board{display:flex;flex-direction:column;gap:20px;padding-top:4px}
  .bhead{display:flex;align-items:baseline;justify-content:space-between;
         border-bottom:3px solid rgba(143,175,200,.3);padding-bottom:13px}
  .bhead .t{font-family:var(--display);font-size:44px;text-transform:uppercase;letter-spacing:.03em}
  .bhead .s{font-size:23px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--dim)}

  .row{
    display:grid;grid-template-columns:1fr 190px;align-items:center;
    background:linear-gradient(90deg,rgba(14,42,68,.9),rgba(14,42,68,.4));
    border-left:9px solid var(--blue);padding:20px 26px;
  }
  .row.star{border-left-color:var(--gold);background:linear-gradient(90deg,rgba(246,179,1,.15),rgba(14,42,68,.4))}
  .row.core{border-left-color:var(--green)}
  .row .nm{font-family:var(--display);font-size:52px;text-transform:uppercase;line-height:1;letter-spacing:.02em}
  .row .sub{margin-top:9px;font-size:25px;font-weight:600;line-height:1.24;color:var(--dim)}
  .row .sub b{color:var(--ink);font-weight:700}
  .row .jul{text-align:right}
  .jul .v{font-family:var(--num);font-size:62px;line-height:.9;color:var(--ink);font-variant-numeric:tabular-nums}
  .row.star .jul .v{color:var(--gold)}
  .jul .u{display:block;margin-top:6px;font-size:20px;font-weight:700;letter-spacing:.13em;text-transform:uppercase;color:var(--dim)}

  .closer{
    position:relative;z-index:2;flex:none;margin-top:30px;height:108px;
    display:flex;align-items:center;gap:32px;padding:0 62px;
    border-top:3px solid rgba(246,179,1,.5);
    background:linear-gradient(90deg,rgba(1,90,156,.42),rgba(11,148,68,.3));
  }
  .chip{font-family:var(--display);font-size:44px;text-transform:uppercase;letter-spacing:.02em;white-space:nowrap}
  .chip.g{color:var(--gold)}
  .dot{width:13px;height:13px;background:var(--green);transform:rotate(45deg);flex:none}
  .ask{margin-left:auto;text-align:right;font-size:26px;font-weight:600;line-height:1.25;
       text-transform:uppercase;letter-spacing:.05em;color:var(--ink);white-space:nowrap}
  .ask b{display:block;color:var(--gold);font-weight:700}

  #debug{display:none;position:fixed;left:10px;bottom:8px;z-index:99;
    font:600 15px/1.2 monospace;color:#F6B301;background:rgba(0,0,0,.72);padding:6px 10px}
</style>
</head>
<body>
<div id="stage">

  <div class="rail">
    <div class="mark">Get <b>Health-e</b></div>
    <div class="div"></div>
    <div class="where">Medicare Inbound Floor</div>
    <div class="now">
      <div class="date" id="date">Monday, August 3</div>
      <div class="tag">Day 1</div>
    </div>
  </div>

  <main>
    <section>
      <div class="eyebrow">New month · Clean slate</div>
      <h1>August<br><span class="lit">Starts Now</span></h1>

      <div class="days">
        <div class="n">21</div>
        <div class="t">
          <div class="k">Selling Days</div>
          <p>One <b>fewer</b> than July. Same expectations, less runway.</p>
        </div>
      </div>

      <p class="fast">Fast starts win months. <b>The floor that comes out of the gate today isn't the one scrambling on the 31st.</b></p>
    </section>

    <section class="board">
      <div class="bhead">
        <div class="t">Where We're Focused</div>
        <div class="s">July finish</div>
      </div>

      <div class="row star">
        <div>
          <div class="nm">★ STHHC</div>
          <div class="sub">Lead with it on every eligible call.<br><b>Never</b> same-call with a MAPD/MA enrollment.</div>
        </div>
        <div class="jul"><span class="v">162</span><span class="u">July</span></div>
      </div>

      <div class="row core">
        <div>
          <div class="nm">Core</div>
          <div class="sub">The foundation. Everything builds on top of it.</div>
        </div>
        <div class="jul"><span class="v">916</span><span class="u">July</span></div>
      </div>

      <div class="row">
        <div>
          <div class="nm">HI</div>
          <div class="sub">Compliant same-call. Finishing a Core without offering it leaves it on the table.</div>
        </div>
        <div class="jul"><span class="v">194</span><span class="u">July</span></div>
      </div>
    </section>
  </main>

  <div class="closer">
    <span class="chip g">Lead with STHHC</span><span class="dot"></span>
    <span class="chip">Stack the Core</span><span class="dot"></span>
    <span class="chip">Close with HI</span>
    <div class="ask">21 days to build a big one.<b>Starting today.</b></div>
  </div>

</div>
<div id="debug"></div>

<script>
(function(){
  var stage = document.getElementById('stage'), dbg = document.getElementById('debug');
  var qs = new URLSearchParams(location.search);
  var overscan = Math.min(15, Math.max(0, parseFloat(qs.get('overscan')) || 0));
  var debug = qs.get('debug') === '1';
  if (debug) dbg.style.display = 'block';

  function measure(){
    var vv = window.visualViewport;
    return [(vv && vv.width)  || document.documentElement.clientWidth  || window.innerWidth,
            (vv && vv.height) || document.documentElement.clientHeight || window.innerHeight];
  }
  var lw = 0, lh = 0;
  function fit(force){
    var m = measure(), w = m[0], h = m[1];
    if (!w || !h) return;
    if (!force && w === lw && h === lh) return;
    lw = w; lh = h;
    var s = Math.min(w / 1920, h / 1080) * (1 - overscan / 100);
    stage.style.transform = 'translate(-50%,-50%) scale(' + s + ')';
    if (debug) dbg.textContent = w + ' x ' + h + '  scale ' + s.toFixed(4);
  }
  ['resize','orientationchange','load','pageshow'].forEach(function(e){
    window.addEventListener(e, function(){ fit(true); }); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', function(){ fit(true); });
  if (window.ResizeObserver) new ResizeObserver(function(){ fit(); }).observe(document.documentElement);
  document.addEventListener('DOMContentLoaded', function(){ fit(true); });
  [0,100,300,600,1000,2000,4000].forEach(function(t){ setTimeout(function(){ fit(true); }, t); });
  setInterval(fit, 2000);
  fit(true);

  // live date + day-of-month counter, so the board stays correct all month
  var DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var MONS = ['January','February','March','April','May','June','July',
              'August','September','October','November','December'];
  function tick(){
    var n = new Date();
    document.getElementById('date').textContent =
      DAYS[n.getDay()] + ', ' + MONS[n.getMonth()] + ' ' + n.getDate();
  }
  tick(); setInterval(tick, 60000);
})();
</script>
</body>
</html>
`,
  'early-out': `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Early-Out Counter — Points To Go</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Archivo+Black&family=Barlow+Condensed:wght@500;600;700&display=swap" rel="stylesheet">
<style>
  :root{
    --gold:#F6B301; --green:#0B9444; --blue:#015A9C; --blue-lit:#2E8FD6;
    --ink:#EAF2F9; --dim:#8FAFC8;
    --display:'Anton','Arial Narrow',Impact,sans-serif;
    --num:'Archivo Black','Arial Black',sans-serif;
    --util:'Barlow Condensed','Arial Narrow',sans-serif;
  }
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:100%;height:100%;background:#04101B;overflow:hidden}
  body{position:relative}

  #stage{
    position:fixed;top:50%;left:50%;width:1920px;height:1080px;
    transform-origin:center center;
    background:
      radial-gradient(1100px 750px at 26% 46%, rgba(246,179,1,.15), transparent 62%),
      radial-gradient(1000px 620px at 84% 30%, rgba(1,90,156,.36), transparent 64%),
      linear-gradient(#071B2C,#04101B);
    color:var(--ink);font-family:var(--util);
    display:flex;flex-direction:column;overflow:hidden;
  }
  #stage::before{
    content:"";position:absolute;inset:0;pointer-events:none;
    background-image:
      linear-gradient(rgba(143,175,200,.05) 1px,transparent 1px),
      linear-gradient(90deg,rgba(143,175,200,.05) 1px,transparent 1px);
    background-size:60px 60px;
  }
  #stage.done{
    background:
      radial-gradient(1200px 800px at 50% 46%, rgba(11,148,68,.42), transparent 64%),
      linear-gradient(#062318,#04121B);
  }

  /* top rail */
  .rail{
    position:relative;z-index:2;height:88px;flex:none;
    display:flex;align-items:center;gap:26px;padding:0 62px;
    border-bottom:3px solid rgba(246,179,1,.5);
    background:linear-gradient(90deg,rgba(1,90,156,.5),rgba(1,90,156,0) 72%);
  }
  .mark{font-family:var(--display);font-size:31px;letter-spacing:.06em;text-transform:uppercase}
  .mark b{color:var(--gold);font-weight:400}
  .rail .div{width:2px;height:38px;background:rgba(143,175,200,.35)}
  .rail .where{font-size:25px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:var(--dim)}
  .rail .now{margin-left:auto;display:flex;align-items:center;gap:22px}
  .now .date{font-family:var(--display);font-size:31px;letter-spacing:.05em;text-transform:uppercase}
  .now .clock{font-family:var(--num);font-size:32px;color:var(--gold);font-variant-numeric:tabular-nums;min-width:180px;text-align:right}

  /* main */
  main{position:relative;z-index:2;flex:1;display:grid;grid-template-columns:900px 1fr;gap:56px;padding:34px 62px 0}

  .eyebrow{
    display:inline-flex;align-items:center;gap:16px;
    font-size:26px;font-weight:700;letter-spacing:.3em;text-transform:uppercase;color:var(--gold);
  }
  .eyebrow::before{content:"";width:52px;height:5px;background:var(--gold)}
  .eyebrow .pip{
    width:15px;height:15px;border-radius:50%;background:var(--green);
    box-shadow:0 0 0 0 rgba(11,148,68,.85);animation:ping 2s ease-out infinite;
  }
  @keyframes ping{
    0%{box-shadow:0 0 0 0 rgba(11,148,68,.8)}
    70%{box-shadow:0 0 0 22px rgba(11,148,68,0)}
    100%{box-shadow:0 0 0 0 rgba(11,148,68,0)}
  }

  .togo{margin-top:6px;line-height:.78}
  .togo .n{
    font-family:var(--num);font-size:388px;color:var(--gold);
    font-variant-numeric:tabular-nums;letter-spacing:-.02em;
    text-shadow:0 0 90px rgba(246,179,1,.5);display:block;
  }
  .togo .lbl{
    display:block;margin-top:14px;
    font-family:var(--display);font-size:82px;letter-spacing:.02em;text-transform:uppercase;
  }
  .subline{
    margin-top:26px;font-size:34px;font-weight:600;color:var(--dim);
    text-transform:uppercase;letter-spacing:.06em;
  }
  .subline b{color:var(--ink);font-weight:700}

  /* right: board */
  .board{display:flex;flex-direction:column;gap:20px;padding-top:6px}
  .bhead{
    display:flex;align-items:baseline;justify-content:space-between;
    border-bottom:3px solid rgba(143,175,200,.3);padding-bottom:13px;
  }
  .bhead .t{font-family:var(--display);font-size:44px;text-transform:uppercase;letter-spacing:.03em}
  .bhead .s{font-size:24px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--dim)}

  .score{
    display:flex;align-items:baseline;gap:18px;
    background:linear-gradient(90deg,rgba(11,148,68,.26),rgba(6,23,38,.15));
    border:3px solid rgba(246,179,1,.6);padding:16px 30px;
  }
  .score .v{font-family:var(--num);font-size:118px;line-height:.86;color:var(--gold);font-variant-numeric:tabular-nums}
  .score .of{font-family:var(--num);font-size:52px;color:var(--dim)}
  .score .cap{margin-left:auto;text-align:right;font-size:26px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--ink)}

  .line{
    display:grid;grid-template-columns:1fr 120px 132px;align-items:center;
    background:linear-gradient(90deg,rgba(14,42,68,.9),rgba(14,42,68,.4));
    border-left:9px solid var(--blue);padding:15px 24px 15px 24px;
  }
  .line.star{border-left-color:var(--gold);background:linear-gradient(90deg,rgba(246,179,1,.15),rgba(14,42,68,.4))}
  .line.core{border-left-color:var(--green)}
  .line .nm{font-family:var(--display);font-size:44px;text-transform:uppercase;letter-spacing:.02em;line-height:1}
  .line .cnt{font-family:var(--num);font-size:46px;text-align:center;font-variant-numeric:tabular-nums}
  .line .sub{margin-top:5px;font-size:21px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--dim)}
  .line .pt{font-family:var(--num);font-size:46px;text-align:right;color:var(--gold);font-variant-numeric:tabular-nums}
  .line .hd{font-size:20px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);text-align:center}

  /* progress */
  .prog{position:relative;z-index:2;padding:0 62px;margin-top:22px}
  .track{height:44px;background:rgba(14,42,68,.85);border:2px solid rgba(143,175,200,.28);position:relative;overflow:hidden}
  .fill{height:100%;width:0;background:linear-gradient(90deg,var(--green),var(--gold));transition:width 1.1s cubic-bezier(.2,.7,.2,1)}
  .ticks{position:absolute;inset:0;display:flex;pointer-events:none}
  .ticks i{flex:1;border-right:2px solid rgba(4,16,27,.55)}
  .ticks i:last-child{border-right:0}
  .plabel{display:flex;justify-content:space-between;margin-top:9px;font-size:24px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--dim)}
  .plabel b{color:var(--gold)}

  /* bottom rail */
  .closer{
    position:relative;z-index:2;flex:none;margin-top:22px;height:106px;
    display:flex;align-items:center;gap:30px;padding:0 62px;
    border-top:3px solid rgba(246,179,1,.5);
    background:linear-gradient(90deg,rgba(1,90,156,.42),rgba(11,148,68,.3));
  }
  .closer .k{font-family:var(--display);font-size:40px;text-transform:uppercase;letter-spacing:.03em;color:var(--gold);white-space:nowrap}
  .ways{display:flex;align-items:center;gap:26px}
  .way{font-family:var(--display);font-size:40px;text-transform:uppercase;letter-spacing:.02em}
  .way em{font-style:normal;color:var(--gold)}
  .sep{width:12px;height:12px;background:var(--green);transform:rotate(45deg);flex:none}
  .asof{margin-left:auto;text-align:right;font-size:22px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);white-space:nowrap}
  .asof b{display:block;color:var(--ink);font-size:26px;font-weight:700}

  /* done state */
  .doneview{display:none;flex:1;flex-direction:column;align-items:center;justify-content:center;text-align:center;position:relative;z-index:2}
  #stage.done main,#stage.done .prog,#stage.done .closer{display:none}
  #stage.done .doneview{display:flex}
  .doneview .big{font-family:var(--num);font-size:300px;line-height:.82;color:var(--gold);text-shadow:0 0 110px rgba(246,179,1,.6)}
  .doneview .h{font-family:var(--display);font-size:126px;text-transform:uppercase;margin-top:10px;letter-spacing:.01em}
  .doneview .p{font-size:44px;font-weight:600;color:var(--ink);margin-top:16px;letter-spacing:.05em;text-transform:uppercase}

  #debug{
    display:none;position:fixed;left:10px;bottom:8px;z-index:99;
    font:600 15px/1.2 monospace;color:#F6B301;background:rgba(0,0,0,.72);padding:6px 10px;
  }
  @media (prefers-reduced-motion:reduce){
    .eyebrow .pip{animation:none}
    .fill{transition:none}
  }
</style>
</head>
<body>
<div id="stage">

  <div class="rail">
    <div class="mark">Get <b>Health-e</b></div>
    <div class="div"></div>
    <div class="where">Medicare Inbound Floor</div>
    <div class="now">
      <div class="date" id="date">Friday, July 31</div>
      <div class="clock" id="clock">—</div>
    </div>
  </div>

  <main>
    <section>
      <div class="eyebrow"><span class="pip"></span> Early-Out Challenge</div>
      <div class="togo">
        <span class="n" id="togo">69</span>
        <span class="lbl">Points To Go</span>
      </div>
      <p class="subline">Floor goal <b id="goalTxt">100</b> — then the month is closed.</p>
    </section>

    <section class="board">
      <div class="bhead">
        <div class="t">On The Board</div>
        <div class="s">Today only</div>
      </div>

      <div class="score">
        <span class="v" id="have">31</span>
        <span class="of">/ <span id="goalTxt2">100</span></span>
        <span class="cap">Points scored</span>
      </div>

      <div class="line star">
        <div><div class="nm">★ STHHC</div><div class="sub">$40+ premium · 5 pts</div></div>
        <div class="cnt" id="cS">3</div>
        <div class="pt" id="pS">15</div>
      </div>
      <div class="line core">
        <div><div class="nm">Core</div><div class="sub">Every plan · 2 pts</div></div>
        <div class="cnt" id="cC">6</div>
        <div class="pt" id="pC">12</div>
      </div>
      <div class="line">
        <div><div class="nm">HI</div><div class="sub">$25+ premium · 2 pts</div></div>
        <div class="cnt" id="cH">2</div>
        <div class="pt" id="pH">4</div>
      </div>
      <div class="line" style="border-left-color:transparent;background:none;padding-top:2px;padding-bottom:0">
        <div></div><div class="hd">Sold</div><div class="hd" style="text-align:right">Points</div>
      </div>
    </section>
  </main>

  <div class="prog">
    <div class="track">
      <div class="fill" id="fill"></div>
      <div class="ticks"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
    </div>
    <div class="plabel"><span>0</span><span id="pctTxt">31% there</span><span><b id="goalTxt3">100</b></span></div>
  </div>

  <div class="closer">
    <div class="k">Close it with</div>
    <div class="ways">
      <span class="way"><em id="nS">14</em> STHHC</span><span class="sep"></span>
      <span class="way"><em id="nC">35</em> Core</span><span class="sep"></span>
      <span class="way"><em id="nH">35</em> HI</span><span class="sep"></span>
      <span class="way">or any mix</span>
    </div>
    <div class="asof">Numbers as of<b id="asof">—</b></div>
  </div>

  <div class="doneview">
    <div class="big" id="doneNum">100</div>
    <div class="h">We're done.</div>
    <div class="p">Clock out · Month closed · Go home</div>
  </div>

</div>
<div id="debug"></div>

<script>
(function(){
  var qs = new URLSearchParams(location.search);
  var num = function(k, d){ var v = parseFloat(qs.get(k)); return isNaN(v) ? d : Math.max(0, v); };

  // ── the only numbers you edit ──────────────────────────────────────────────
  // ?sthhc=3&core=6&hi=2&asof=3:10PM       (sthhc/hi = QUALIFYING sales only)
  var sthhc = num('sthhc', 4);     // STHHC at $40+ premium  → 5 pts each
  var core  = num('core',  27);     // Core, every plan       → 2 pts each
  var hi    = num('hi',    9);     // HI at $25+ premium     → 2 pts each
  var goal  = num('goal',  100);
  var asof  = qs.get('asof') || '';

  var pS = sthhc * 5, pC = core * 2, pH = hi * 2;
  var have = pS + pC + pH;
  var togo = Math.max(0, goal - have);
  var pct  = goal > 0 ? Math.min(100, have / goal * 100) : 0;

  var set = function(id, v){ var e = document.getElementById(id); if (e) e.textContent = v; };
  set('togo', togo); set('have', have);
  set('cS', sthhc); set('cC', core); set('cH', hi);
  set('pS', pS);    set('pC', pC);   set('pH', pH);
  set('goalTxt', goal); set('goalTxt2', goal); set('goalTxt3', goal);
  set('pctTxt', Math.round(pct) + '% there');
  set('nS', Math.ceil(togo / 5)); set('nC', Math.ceil(togo / 2)); set('nH', Math.ceil(togo / 2));
  set('doneNum', have);
  set('asof', asof || 'Manual update');

  var stage = document.getElementById('stage');
  if (have >= goal) stage.classList.add('done');
  setTimeout(function(){ document.getElementById('fill').style.width = pct + '%'; }, 350);

  // ── fit to any screen (same hardened logic as the flyer) ───────────────────
  var dbg = document.getElementById('debug');
  var overscan = Math.min(15, Math.max(0, parseFloat(qs.get('overscan')) || 0));
  var debug = qs.get('debug') === '1';
  if (debug) dbg.style.display = 'block';

  function measure(){
    var vv = window.visualViewport;
    return [(vv && vv.width)  || document.documentElement.clientWidth  || window.innerWidth,
            (vv && vv.height) || document.documentElement.clientHeight || window.innerHeight];
  }
  var lw = 0, lh = 0;
  function fit(force){
    var m = measure(), w = m[0], h = m[1];
    if (!w || !h) return;
    if (!force && w === lw && h === lh) return;
    lw = w; lh = h;
    var s = Math.min(w / 1920, h / 1080) * (1 - overscan / 100);
    stage.style.transform = 'translate(-50%,-50%) scale(' + s + ')';
    if (debug) dbg.textContent = w + ' x ' + h + '  scale ' + s.toFixed(4) +
                                 '  pts ' + have + '/' + goal;
  }
  ['resize','orientationchange','load','pageshow'].forEach(function(e){
    window.addEventListener(e, function(){ fit(true); }); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', function(){ fit(true); });
  if (window.ResizeObserver) new ResizeObserver(function(){ fit(); }).observe(document.documentElement);
  document.addEventListener('DOMContentLoaded', function(){ fit(true); });
  [0,100,300,600,1000,2000,4000].forEach(function(t){ setTimeout(function(){ fit(true); }, t); });
  setInterval(fit, 2000);
  fit(true);

  // clock
  var dEl = document.getElementById('date'), cEl = document.getElementById('clock');
  var DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var MONS = ['January','February','March','April','May','June','July',
              'August','September','October','November','December'];
  function tick(){
    var n = new Date();
    dEl.textContent = DAYS[n.getDay()] + ', ' + MONS[n.getMonth()] + ' ' + n.getDate();
    var h = n.getHours(), m = n.getMinutes(), s = n.getSeconds(), ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (h === 0) h = 12;
    cEl.textContent = h + ':' + (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s) + ' ' + ap;
  }
  tick(); setInterval(tick, 1000);
})();
</script>
</body>
</html>
`,
  'contest/sthhc': `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>STHHC Ticket Run — Bucs vs Chiefs</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  :root{
    --ink:#04223A; --ink2:#08304F; --line:#12496F;
    --blue:#015A9C; --green:#0B9444; --gold:#F6B301;
    --paper:#F2F7FB; --mute:#7FA6C4;
    --cond:"Barlow Condensed","Oswald","Arial Narrow",sans-serif;
    --prose:"Inter",system-ui,-apple-system,"Segoe UI",sans-serif;
  }
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{height:100vh;width:100vw;overflow:hidden;background:var(--ink);color:var(--paper)}
  .board{position:relative;height:100vh;width:100vw;display:flex;flex-direction:column;isolation:isolate}

  /* ── imagery layers ─────────────────────────────────── */
  .field{position:absolute;inset:0;z-index:0;pointer-events:none;
    background-image:repeating-linear-gradient(90deg,
      rgba(127,166,196,.075) 0 .18vw, transparent .18vw 8.33vw)}
  .field::after{content:"";position:absolute;inset:0;
    background-image:repeating-linear-gradient(90deg,
      rgba(127,166,196,.15) 0 .3vw, transparent .3vw 25vw)}
  .lights{position:absolute;inset:0;z-index:0;pointer-events:none;
    background:
      radial-gradient(60vw 42vh at 14% -12%, rgba(1,90,156,.55), transparent 70%),
      radial-gradient(52vw 38vh at 86% -10%, rgba(246,179,1,.13), transparent 70%),
      radial-gradient(80vw 50vh at 50% 118%, rgba(1,90,156,.26), transparent 72%)}
  .vignette{position:absolute;inset:0;z-index:0;pointer-events:none;
    background:radial-gradient(120vw 120vh at 50% 45%, transparent 42%, rgba(2,17,30,.62) 100%)}
  header, .row, .ask{position:relative;z-index:2}

  /* ── header ─────────────────────────────────────────── */
  header{flex:0 0 auto;
    background:linear-gradient(180deg,rgba(8,48,79,.96),rgba(8,48,79,.80));
    border-bottom:0.35vh solid var(--line);
    padding:1.9vh 3.0vw 1.6vh;display:flex;align-items:center;justify-content:space-between;gap:2vw}
  .hleft{display:flex;align-items:center;gap:1.5vw;min-width:0}
  .ball{flex:0 0 auto;width:7.0vh;height:7.0vh;filter:drop-shadow(0 .5vh 1vh rgba(0,0,0,.45))}
  .eyebrow{font-family:var(--cond);font-weight:700;letter-spacing:.30em;
    font-size:clamp(12px,1.7vh,26px);color:var(--mute);text-transform:uppercase;margin-bottom:.4vh}
  h1{font-family:var(--cond);font-weight:800;line-height:.92;text-transform:uppercase;
    font-size:clamp(34px,6.2vh,90px);letter-spacing:.005em}
  .game{text-align:right;flex:0 0 auto}
  .game .vs{font-family:var(--cond);font-weight:800;text-transform:uppercase;
    font-size:clamp(20px,3.4vh,48px);line-height:1}
  .game .when{font-family:var(--cond);font-weight:700;letter-spacing:.16em;
    font-size:clamp(12px,1.9vh,28px);color:var(--gold);text-transform:uppercase;margin-top:.5vh}

  /* ── body ───────────────────────────────────────────── */
  .row{flex:1 1 auto;display:flex;min-height:0}
  .main{flex:1 1 auto;position:relative;min-width:0}
  .rail{flex:0 0 25.5vw;position:relative;overflow:hidden;
    background:linear-gradient(165deg,#0A6BB4 0%, var(--blue) 48%, #013F6E 100%);
    border-left:0.35vh solid var(--line)}
  .rail .stadium{position:absolute;left:0;right:0;bottom:0;filter:drop-shadow(0 0 1.2vh rgba(246,179,1,.18));width:100%;height:23vh;opacity:.55;z-index:0}

  /* two scenes, crossfaded together: prizes+countdown, then standings+flyer */
  .face{position:absolute;inset:0;z-index:1;opacity:0;transition:opacity .7s ease}
  .face.show{opacity:1}
  .mainface{padding:3.0vh 2.4vw 3.0vh 3.0vw;display:flex;flex-direction:column;
    justify-content:center;gap:4.4vh}
  .railface{display:flex;flex-direction:column;align-items:center;justify-content:center;
    padding:2vh 1.4vw;text-align:center}
  .railface.promo{padding:0;overflow:hidden}
  .railface.promo .haze{position:absolute;inset:-6%;background-size:cover;background-position:center;
    filter:blur(2.2vh) saturate(1.15) brightness(.62);z-index:0}
  .railface.promo img{position:relative;z-index:1;width:100%;height:100%;object-fit:contain;display:block}

  .sectlabel{font-family:var(--cond);font-weight:700;letter-spacing:.26em;text-transform:uppercase;
    font-size:clamp(11px,1.75vh,24px);color:var(--mute);margin-bottom:1.3vh}

  /* prize tickets */
  .prizes{display:flex;gap:1.9vw}
  .ticket{position:relative;flex:1 1 0;border-radius:.9vh;padding:3.8vh 1.6vw 4.0vh 3.6vw;
    background:linear-gradient(135deg,rgba(8,48,79,.94),rgba(4,34,58,.94));
    border:0.3vh solid var(--line);
    display:flex;flex-direction:column;justify-content:center}
  .ticket.first{border-color:var(--gold);
    background:linear-gradient(135deg,rgba(246,179,1,.20),rgba(8,48,79,.92) 58%);
    box-shadow:0 0 0 .15vh rgba(246,179,1,.22), 0 1.2vh 3vh rgba(0,0,0,.35)}
  .ticket::before{content:"";position:absolute;left:2.2vw;top:1.8vh;bottom:1.8vh;
    border-left:.28vh dashed rgba(127,166,196,.55)}
  .ticket.first::before{border-left-color:rgba(246,179,1,.60)}
  .notch{position:absolute;left:2.2vw;width:2.2vh;height:2.2vh;border-radius:50%;
    background:#04223A;transform:translateX(-50%);border:.28vh solid var(--line)}
  .notch.t{top:-1.1vh}
  .notch.b{bottom:-1.1vh}
  .ticket.first .notch{border-color:rgba(246,179,1,.55)}

  .place{font-family:var(--cond);font-weight:800;text-transform:uppercase;letter-spacing:.12em;
    font-size:clamp(15px,2.5vh,36px);color:var(--mute);margin-bottom:.9vh}
  .ticket.first .place{color:var(--gold)}
  .ptitle{font-family:var(--cond);font-weight:800;text-transform:uppercase;line-height:1.0;
    font-size:clamp(26px,5.0vh,72px)}
  .psub{font-family:var(--prose);font-weight:600;font-size:clamp(11px,1.85vh,25px);
    color:var(--mute);margin-top:1.0vh;line-height:1.25}

  /* qualify rules */
  .rules{display:grid;grid-template-columns:repeat(2,1fr);gap:2.9vh 1.6vw}
  .rule{display:flex;align-items:flex-start;gap:.85vw}
  .num{flex:0 0 auto;font-family:var(--cond);font-weight:800;
    font-size:clamp(17px,2.8vh,40px);color:var(--gold);line-height:1.05;min-width:1.5vw}
  .rtext{font-family:var(--prose);font-weight:600;line-height:1.28;
    font-size:clamp(12px,2.25vh,30px);color:var(--paper)}
  .rtext em{font-style:normal;color:var(--mute);font-weight:400}

  /* live standings */
  /* live tracker (scene B) */
  .tracker{gap:1.6vh;justify-content:flex-start;padding-top:2.4vh;overflow:hidden}
  .trstrip{display:flex;gap:1.1vw}
  .trstat{flex:1 1 0;background:rgba(8,48,79,.9);border:.14vh solid var(--line);border-radius:.5vh;
    padding:1.3vh 1vw}
  .trn{font-family:var(--cond);font-weight:800;line-height:1;font-size:clamp(20px,4.4vh,58px)}
  .trl{font-family:var(--cond);font-weight:700;letter-spacing:.12em;text-transform:uppercase;
    font-size:clamp(9px,1.4vh,19px);color:var(--mute);margin-top:.5vh}
  .trsec{font-family:var(--cond);font-weight:700;letter-spacing:.16em;text-transform:uppercase;
    font-size:clamp(10px,1.6vh,21px);color:var(--mute);display:flex;align-items:center;gap:.8vw}
  .trsec::after{content:"";flex:1;height:1px;background:var(--line)}
  table.tr{width:100%;border-collapse:collapse}
  table.tr th{font-family:var(--cond);font-weight:700;letter-spacing:.12em;text-transform:uppercase;
    font-size:clamp(9px,1.35vh,18px);color:var(--mute);text-align:right;padding:0 .6vw .6vh}
  table.tr th.l,table.tr td.l{text-align:left}
  table.tr td{padding:.75vh .6vw;border-top:1px solid var(--line);
    font-size:clamp(11px,1.9vh,25px);font-variant-numeric:tabular-nums}
  .trname{font-family:var(--cond);font-weight:700;font-size:clamp(13px,2.5vh,33px)}
  .trrank{font-family:var(--cond);font-weight:800;font-size:clamp(14px,2.6vh,35px);color:var(--mute);width:5ch}
  tr.trgold td{background:var(--gold);color:#04223A;border-top-color:var(--gold)}
  tr.trgold .trrank{color:#04223A}
  .trpips{display:inline-flex;gap:.25vw;vertical-align:middle}
  .trpip{width:.55vw;height:1.9vh;border-radius:.2vh;background:var(--green)}
  .trpip.ghost{background:transparent;border:1px dashed var(--line)}
  tr.trgold .trpip{background:#0E5C3A}
  tr.trgold .trpip.ghost{border-color:rgba(4,34,58,.45)}
  .trplace{background:rgba(8,48,79,.9);border-left:.35vh solid var(--gold);border-radius:.4vh;
    padding:1vh 1.1vw;font-size:clamp(10px,1.7vh,23px);line-height:1.35}
  .trplace b{color:var(--gold);font-weight:700}
  table.trgrid th{text-align:center}
  table.trgrid td{text-align:center}
  table.trgrid td.l,table.trgrid th.l{text-align:left}
  .trzero{color:#3d5a80}
  table.trgrid tfoot td{border-top:.25vh solid var(--line);font-weight:700;color:var(--gold)}
  .trempty{font-family:var(--cond);font-weight:700;text-transform:uppercase;letter-spacing:.12em;
    font-size:clamp(12px,2.1vh,28px);color:var(--mute);padding:2.5vh 0}
  .trfoot{margin-top:auto;display:flex;justify-content:space-between;gap:1.5vw;
    font-size:clamp(9px,1.4vh,18px);color:var(--mute);line-height:1.4}
  .standhead{display:flex;align-items:baseline;justify-content:space-between;gap:2vw}
  .standhead .tally{font-family:var(--cond);font-weight:700;text-transform:uppercase;
    letter-spacing:.12em;font-size:clamp(11px,1.9vh,26px);color:var(--mute)}
  .standhead .tally b{color:var(--gold)}
  .stand{display:flex;flex-direction:column;gap:1.05vh;margin-top:.4vh}
  .srow{position:relative;display:grid;grid-template-columns:4.2ch 1fr auto;align-items:center;
    gap:1.2vw;padding:1.35vh 1.3vw;background:rgba(8,48,79,.88);
    border-left:.5vh solid var(--line);overflow:hidden}
  .srow .fill{position:absolute;inset:0 auto 0 0;background:rgba(1,90,156,.5);z-index:0}
  .srow > *{position:relative;z-index:1}
  .srow.p1{border-left-color:var(--gold)}
  .srow.p1 .fill{background:rgba(246,179,1,.15)}
  .srow.p2{border-left-color:#BFDCF2}
  .spos{font-family:var(--cond);font-weight:800;color:var(--mute);line-height:.85;
    font-size:clamp(20px,4.2vh,58px)}
  .srow.p1 .spos{color:var(--gold)}
  .srow.p2 .spos{color:#BFDCF2}
  .swho{font-family:var(--prose);font-weight:600;font-size:clamp(14px,2.7vh,36px);white-space:nowrap;
    overflow:hidden;text-overflow:ellipsis}
  .sn{font-family:var(--cond);font-weight:800;font-size:clamp(20px,4.2vh,58px);line-height:.85;
    color:#fff}
  .sn span{font-family:var(--cond);font-weight:700;font-size:clamp(10px,1.6vh,21px);
    letter-spacing:.12em;text-transform:uppercase;color:var(--mute);margin-left:.6vw}
  .standempty{font-family:var(--cond);font-weight:700;text-transform:uppercase;letter-spacing:.14em;
    font-size:clamp(13px,2.3vh,30px);color:var(--mute);padding:3vh 0}

  /* rail */
  .raillabel{font-family:var(--cond);font-weight:700;letter-spacing:.24em;text-transform:uppercase;
    font-size:clamp(12px,2.0vh,28px);color:rgba(242,247,251,.85)}
  .bignum{font-family:var(--cond);font-weight:800;line-height:.80;
    font-size:clamp(110px,33vh,400px);margin:1.4vh 0 .6vh;
    text-shadow:0 1.2vh 3vh rgba(0,0,0,.40);animation:breathe 2.6s ease-in-out infinite}
  .railfoot{font-family:var(--cond);font-weight:700;text-transform:uppercase;letter-spacing:.12em;
    font-size:clamp(13px,2.3vh,32px);color:rgba(242,247,251,.95);line-height:1.18}
  .railrule{width:60%;height:.3vh;background:rgba(242,247,251,.34);margin:1.6vh 0}
  @keyframes breathe{0%,100%{opacity:1}50%{opacity:.86}}
  @media (prefers-reduced-motion: reduce){.bignum{animation:none}}

  /* ── ask band ───────────────────────────────────────── */
  .ask{flex:0 0 auto;background:linear-gradient(90deg,#0B9444 0%,#0E7F3F 100%);
    padding:2.3vh 3.0vw;display:flex;align-items:center;justify-content:space-between;gap:2vw;
    box-shadow:0 -1vh 3vh rgba(0,0,0,.30)}
  .askleft{display:flex;align-items:center;gap:1.3vw;min-width:0}
  .whistle{flex:0 0 auto;width:5.2vh;height:5.2vh}
  .askmain{font-family:var(--cond);font-weight:800;text-transform:uppercase;line-height:1.0;
    font-size:clamp(24px,4.6vh,66px);letter-spacing:.01em}
  .asksub{font-family:var(--prose);font-weight:700;text-align:right;line-height:1.25;
    font-size:clamp(11px,1.95vh,26px);color:rgba(255,255,255,.95);flex:0 0 auto}
</style>
</head>
<body>
<div class="board">

  <div class="field"></div>
  <div class="lights"></div>
  <div class="vignette"></div>

  <header>
    <div class="hleft">
      <svg class="ball" viewBox="0 0 100 100" aria-hidden="true">
        <g transform="rotate(-25 50 50)">
          <ellipse cx="50" cy="50" rx="41" ry="24" fill="#8B4A20"/>
          <ellipse cx="50" cy="50" rx="41" ry="24" fill="none" stroke="#F2F7FB" stroke-width="3"/>
          <path d="M15 50h11M74 50h11" stroke="#F2F7FB" stroke-width="3.4" stroke-linecap="round"/>
          <path d="M37 50h26" stroke="#F2F7FB" stroke-width="3.4" stroke-linecap="round"/>
          <path d="M43 44v12M50 44v12M57 44v12" stroke="#F2F7FB" stroke-width="3.2" stroke-linecap="round"/>
        </g>
      </svg>
      <div>
        <div class="eyebrow">Get Health-e · Medicare Inbound</div>
        <h1>STHHC Ticket Run</h1>
      </div>
    </div>
    <div class="game">
      <div class="vs">Bucs vs Chiefs</div>
      <div class="when">Saturday · August 22</div>
    </div>
  </header>

  <div class="row">
    <div class="main">

      <div class="face mainface show">
        <div>
          <div class="sectlabel">What you're playing for</div>
          <div class="prizes">
            <div class="ticket first">
              <div class="notch t"></div><div class="notch b"></div>
              <div class="place">1st Place</div>
              <div class="ptitle">2 Club Seats<br>+ Parking</div>
              <div class="psub">Most qualified STHHC sales</div>
            </div>
            <div class="ticket">
              <div class="notch t"></div><div class="notch b"></div>
              <div class="place">2nd Place</div>
              <div class="ptitle">2 Club Seats</div>
              <div class="psub">Runner-up &mdash; parking not included</div>
            </div>
          </div>
        </div>

        <div>
          <div class="sectlabel">What makes it count</div>
          <div class="rules">
            <div class="rule"><div class="num">1</div><div class="rtext">Premium $50 or more <em>— no exceptions</em></div></div>
            <div class="rule"><div class="num">2</div><div class="rtext">All three eligibility gates on the recording</div></div>
            <div class="rule"><div class="num">3</div><div class="rtext">Never same-call with an MA enrollment</div></div>
            <div class="rule"><div class="num">4</div><div class="rtext">Clean app — banking, draft date, no pends</div></div>
            <div class="rule"><div class="num">5</div><div class="rtext">Premium stated in full before any offset</div></div>
            <div class="rule"><div class="num">6</div><div class="rtext">Still active at close <em>— cancels don't count</em></div></div>
          </div>
        </div>
      </div>

      <div class="face mainface tracker">
        <div class="trstrip">
          <div class="trstat"><div class="trn" id="t-qual">&mdash;</div><div class="trl">Qualified on the board</div></div>
          <div class="trstat"><div class="trn" id="t-agents">&mdash;</div><div class="trl">Agents on the board</div></div>
          <div class="trstat"><div class="trn" id="t-avg">&mdash;</div><div class="trl">Avg qualified premium</div></div>
          <div class="trstat"><div class="trn" id="t-lead">&mdash;</div><div class="trl">Leader&rsquo;s count</div></div>
        </div>

        <div class="trsec">Standings &mdash; qualified sales only</div>
        <div id="t-standwrap"><div class="trempty">Nothing on the board yet. The first qualified STHHC &mdash; $50/mo or better &mdash; takes the lead.</div></div>

        <div class="trplace" id="t-place"></div>

        <div class="trsec">Qualified by day</div>
        <div id="t-gridwrap"></div>

        <div class="trfoot">
          <span>Provisional &mdash; premium rule only. The five compliance gates are graded by call audit Fri Aug 21.</span>
          <span id="t-asof"></span>
        </div>
      </div>

    </div>

    <div class="rail">
      <svg class="stadium" viewBox="0 0 400 150" preserveAspectRatio="none" aria-hidden="true">
        <g fill="#011E36">
          <rect x="58" y="34" width="6" height="70"/>
          <rect x="336" y="34" width="6" height="70"/>
          <rect x="44" y="18" width="34" height="18" rx="3"/>
          <rect x="322" y="18" width="34" height="18" rx="3"/>
          <path d="M0 150 V96 Q46 70 110 64 L110 46 H126 V63 Q162 60 200 60 Q238 60 274 63 V46 H290 V64 Q354 70 400 96 V150 Z"/>
        </g>
        <g fill="#F6B301" opacity=".75">
          <rect x="47" y="21" width="28" height="12" rx="2"/>
          <rect x="325" y="21" width="28" height="12" rx="2"/>
        </g>
      </svg>
      <div class="face railface show">
        <div class="raillabel">Selling Days Left</div>
        <div class="bignum" id="left">8</div>
        <div class="railrule"></div>
        <div class="railfoot"><span id="window">Tue Aug 11 &rarr; Thu Aug 20</span><br>Closes End of Shift</div>
      </div>
      <div class="face railface promo"><div class="haze" id="haze"></div><img id="flyer" alt="STHHC contest — Bucs vs Chiefs"></div>
    </div>
  </div>

  <div class="ask">
    <div class="askleft">
      <svg class="whistle" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="34" fill="none" stroke="#FFFFFF" stroke-width="7" opacity=".93"/>
        <path d="M33 51l12 13 23-27" fill="none" stroke="#FFFFFF" stroke-width="8.5"
              stroke-linecap="round" stroke-linejoin="round" opacity=".93"/>
      </svg>
      <div class="askmain">Qualify it or it doesn't count.</div>
    </div>
    <div class="asksub">Minimum 3 qualified sales to place.<br>Every winner's calls get pulled and graded.</div>
  </div>

</div>
<script>
(function(){
  // Selling days left in the contest window: weekdays from today through the
  // close date, inclusive — today counts as remaining, same as the month rail.
  // Dates are Hawaii time (UTC-10, no DST), the floor's day boundary.
  var CLOSE = '2026-08-20', CLOSE_LABEL = 'Thu Aug 20';
  var DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var MONS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function hstToday(){
    var n = new Date(Date.now() - 10 * 3600 * 1000);
    return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
  }
  function tick(){
    var d = hstToday(), end = new Date(CLOSE + 'T00:00:00Z'), n = 0;
    for (var c = new Date(d); c <= end; c.setUTCDate(c.getUTCDate() + 1)) {
      var wd = c.getUTCDay();
      if (wd >= 1 && wd <= 5) n++;
    }
    document.getElementById('left').textContent = n;
    document.getElementById('window').innerHTML =
      DAYS[d.getUTCDay()] + ' ' + MONS[d.getUTCMonth()] + ' ' + d.getUTCDate() +
      ' &rarr; ' + CLOSE_LABEL;
  }
  tick(); setInterval(tick, 60000);

  // Contest flyer, served by the Worker. The board key rides along on the
  // image request via this page's own query string.
  var FLYER = ${JSON.stringify(CONTEST_FLYER)};
  if (FLYER) {
    var src = FLYER + location.search;
    document.getElementById('flyer').src = src;
    document.getElementById('haze').style.backgroundImage = 'url("' + src + '")';
  }

  // Live tracker. Rows arrive as [agent, sale_date, qualified, premium_sum] —
  // the shape the contest query returns — and the standings are built here.
  // No refresh button: the snapshot pushes every ~10 min and this re-reads it.
  var PREMIUM_FLOOR = 50, MIN_TO_PLACE = 3, MAX_ROWS = 8;
  var SELLING_DAYS = [
    {iso:'2026-08-11', label:'Tue', day:'8/11'},
    {iso:'2026-08-12', label:'Wed', day:'8/12'},
    {iso:'2026-08-13', label:'Thu', day:'8/13'},
    {iso:'2026-08-14', label:'Fri', day:'8/14'},
    {iso:'2026-08-17', label:'Mon', day:'8/17'},
    {iso:'2026-08-18', label:'Tue', day:'8/18'},
    {iso:'2026-08-19', label:'Wed', day:'8/19'},
    {iso:'2026-08-20', label:'Thu', day:'8/20'}
  ];
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function money(n){ return n.toLocaleString('en-US',{style:'currency',currency:'USD'}); }

  // Rank on qualified, then average premium, then who got there first.
  function buildStandings(rows){
    var byAgent = {};
    rows.forEach(function(r){
      var agent = r[0], date = r[1], n = Number(r[2]) || 0, sum = Number(r[3]) || 0;
      if (!byAgent[agent]) byAgent[agent] = {agent:agent, qualified:0, premium:0, days:{}};
      var a = byAgent[agent];
      a.qualified += n; a.premium += sum;
      a.days[date] = (a.days[date] || 0) + n;
    });
    var list = Object.keys(byAgent).map(function(k){
      var a = byAgent[k];
      a.avg = a.qualified ? a.premium / a.qualified : 0;
      a.firstDay = Object.keys(a.days).sort()[0] || '';
      return a;
    });
    list.sort(function(x, y){
      return y.qualified - x.qualified || y.avg - x.avg ||
             x.firstDay.localeCompare(y.firstDay) || x.agent.localeCompare(y.agent);
    });
    var lastKey = null, lastRank = 0;
    list.forEach(function(a, i){
      var key = a.qualified + '|' + a.avg.toFixed(2);
      if (key === lastKey) { a.rank = lastRank; }
      else { a.rank = i + 1; lastRank = a.rank; lastKey = key; }
    });
    list.forEach(function(a){
      a.tied = list.filter(function(b){ return b.rank === a.rank; }).length > 1;
    });
    return list;
  }

  function render(c, generatedAt){
    var all = buildStandings((c && c.rows) || []);
    var shown = all.slice(0, MAX_ROWS);
    var floorQualified = all.reduce(function(s,a){ return s + a.qualified; }, 0);
    var floorPremium = all.reduce(function(s,a){ return s + a.premium; }, 0);
    var floorAvg = floorQualified ? floorPremium / floorQualified : 0;
    var placing = all.filter(function(a){ return a.qualified >= MIN_TO_PLACE; });
    var leader = all.length ? all[0].qualified : 0;

    document.getElementById('t-qual').textContent = floorQualified;
    document.getElementById('t-agents').textContent = all.length;
    document.getElementById('t-avg').textContent = floorAvg ? money(floorAvg) : '\u2014';
    document.getElementById('t-lead').textContent = leader;

    var wrap = document.getElementById('t-standwrap');
    if (!shown.length) {
      wrap.innerHTML = '<div class="trempty">Nothing on the board yet. The first qualified STHHC ' +
        '&mdash; ' + money(PREMIUM_FLOOR) + '/mo or better &mdash; takes the lead.</div>';
    } else {
      wrap.innerHTML = '<table class="tr"><thead><tr>' +
        '<th class="l">Rank</th><th class="l">Agent</th>' +
        '<th class="l">Progress to ' + MIN_TO_PLACE + '</th>' +
        '<th>Qualified</th><th>Avg premium</th><th>Total premium</th>' +
        '</tr></thead><tbody>' +
        shown.map(function(a){
          var pipTotal = Math.max(MIN_TO_PLACE, a.qualified), pips = '';
          for (var i = 0; i < pipTotal; i++) {
            pips += '<span class="trpip' + (i < a.qualified ? '' : ' ghost') + '"></span>';
          }
          return '<tr' + (a.rank === 1 && !a.tied ? ' class="trgold"' : '') + '>' +
            '<td class="l trrank">' + (a.tied ? 'T' + a.rank : a.rank) + '</td>' +
            '<td class="l trname">' + esc(a.agent) + '</td>' +
            '<td class="l"><span class="trpips">' + pips + '</span></td>' +
            '<td>' + a.qualified + '</td>' +
            '<td>' + money(a.avg) + '</td>' +
            '<td>' + money(a.premium) + '</td></tr>';
        }).join('') +
        '</tbody></table>';
    }

    document.getElementById('t-place').innerHTML = placing.length
      ? '<b>' + placing.length + (placing.length === 1 ? ' agent has' : ' agents have') +
        ' cleared the place line</b> (' + MIN_TO_PLACE + '+ qualified). Ties break on highest ' +
        'average premium, then who got there first.'
      : '<b>Nobody has cleared the place line yet.</b> It takes <b>' + MIN_TO_PLACE +
        ' qualified</b> to win anything &mdash; the leader is at ' + leader +
        '. Ties break on highest average premium, then who got there first.';

    var dayTotals = SELLING_DAYS.map(function(d){
      return all.reduce(function(s,a){ return s + (a.days[d.iso] || 0); }, 0);
    });
    document.getElementById('t-gridwrap').innerHTML =
      '<table class="tr trgrid"><thead><tr><th class="l">Agent</th>' +
      SELLING_DAYS.map(function(d){ return '<th>' + d.label + '<br>' + d.day + '</th>'; }).join('') +
      '<th>Total</th></tr></thead><tbody>' +
      shown.map(function(a){
        return '<tr><td class="l trname">' + esc(a.agent) + '</td>' +
          SELLING_DAYS.map(function(d){
            var n = a.days[d.iso];
            return '<td' + (n ? '' : ' class="trzero"') + '>' + (n || '\u00b7') + '</td>';
          }).join('') +
          '<td>' + a.qualified + '</td></tr>';
      }).join('') +
      '</tbody><tfoot><tr><td class="l">FLOOR</td>' +
      dayTotals.map(function(n){ return '<td>' + (n || '\u00b7') + '</td>'; }).join('') +
      '<td>' + floorQualified + '</td></tr></tfoot></table>';

    if (generatedAt) {
      var t = new Date(generatedAt);
      document.getElementById('t-asof').textContent = 'As of ' + t.toLocaleString('en-US', {
        weekday:'short', month:'short', day:'numeric', hour:'numeric', minute:'2-digit',
        timeZone:'America/New_York'
      }) + ' ET';
    }
  }

  function standings(){
    fetch('/api/stats' + location.search, {cache:'no-store'})
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(d){ if (d) render(d.contest, d.generated_at); })
      .catch(function(){});
  }
  standings(); setInterval(standings, 60000);

  // Rotate both halves together: prizes + countdown, then standings + flyer.
  var DWELL = 12000, i = 0;
  setInterval(function(){
    var next = 1 - i;
    document.querySelectorAll('.main .face')[i].classList.remove('show');
    document.querySelectorAll('.rail .face')[i].classList.remove('show');
    document.querySelectorAll('.main .face')[next].classList.add('show');
    document.querySelectorAll('.rail .face')[next].classList.add('show');
    i = next;
  }, DWELL);
})();
</script>
</body>
</html>
`,
};
