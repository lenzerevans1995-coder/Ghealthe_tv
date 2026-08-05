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
};
