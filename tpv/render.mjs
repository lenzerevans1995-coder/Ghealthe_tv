import { chromium } from 'playwright';
// Renders a built TPV board to a 1920x1080 JPEG (quality 95) with the real fonts.
// node tpv/render.mjs <board.html> <out.jpg> tpv/fonts   (run tpv/fetch_fonts.sh first)
// Prints whether Barlow Condensed and Inter loaded and any text that overflowed;
// a render in a fallback face must not ship.
import fs from 'fs';
const [html, jpg, fontDir] = process.argv.slice(2);
const map = Object.fromEntries(fs.readFileSync(fontDir + '/map.txt', 'utf8').trim().split('\n').map(l => l.split(' ')));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--headless=new'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
const missed = [];
await p.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: fs.readFileSync(fontDir + '/fonts.css') }));
await p.route('https://fonts.gstatic.com/**', r => {
  const f = map[r.request().url()];
  if (!f) { missed.push(r.request().url()); return r.abort(); }
  return r.fulfill({ contentType: 'font/woff2', body: fs.readFileSync(f) });
});
await p.goto('file://' + html, { waitUntil: 'networkidle' });
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(2500);
const info = await p.evaluate(() => ({
  barlow: document.fonts.check('800 40px "Barlow Condensed"'), inter: document.fonts.check('400 20px "Inter"'),
  loaded: [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family + ' ' + f.weight),
  scrollH: document.documentElement.scrollHeight, scrollW: document.documentElement.scrollWidth,
  overflow: [...document.querySelectorAll('td,th,.fig,.v,.big,.small,h1,.win')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent),
}));
await p.screenshot({ path: jpg, type: 'jpeg', quality: 95 });
console.log(JSON.stringify({ ...info, missed }));
await b.close();
