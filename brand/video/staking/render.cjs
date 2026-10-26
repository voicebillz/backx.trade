// node render.cjs preview | frames  — renders comp.html with seek(t), deterministic per frame.
const { chromium } = require('playwright');
const fs = require('fs');
const mode = process.argv[2] || 'preview', FPS = 60, DUR = 5;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1080, height: 1080 }, deviceScaleFactor: 1 });
  await p.goto('file://' + __dirname + '/comp.html', { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  if (mode === 'preview') {
    for (const t of [0.05, 0.4, 1.0, 1.5, 2.3, 3.2, 3.9, 4.8]) {
      await p.evaluate((t) => seek(t), t);
      await p.screenshot({ path: `${__dirname}/prev-${t}.png` });
    }
  } else {
    fs.mkdirSync(__dirname + '/frames', { recursive: true });
    for (let i = 0; i < FPS * DUR; i++) {
      await p.evaluate((t) => seek(t), i / FPS);
      await p.screenshot({ path: `${__dirname}/frames/f${String(i).padStart(4, '0')}.png` });
    }
    fs.writeFileSync(__dirname + '/cues.json', JSON.stringify({ dur: DUR, cues: await p.evaluate(() => window.CUES) }, null, 1));
  }
  await b.close();
})();
