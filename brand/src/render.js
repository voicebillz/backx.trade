// Renders brand.html variants to PNG with headless Chromium.
// Usage: node render.js <variant> <width> <height> <out.png> [transparent=1]
const { chromium } = require('playwright-core');
const path = require('path');
const [,, variant, w, h, out, transparent] = process.argv;
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
    args: ['--headless=new'],
  });
  const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.join(__dirname, 'brand.html') + '#' + variant);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: out, omitBackground: transparent === '1' });
  await browser.close();
})();
