import { createRequire } from "module"; import { execSync } from "child_process"; import fs from "fs";
const require = createRequire(import.meta.url);
let pw; try { pw = require("playwright"); } catch { pw = require(execSync("npm root -g").toString().trim() + "/playwright"); }
const spki = fs.readFileSync("spki.txt", "utf8").trim();
const b = await pw.chromium.launch({ args: ["--ignore-certificate-errors-spki-list=" + spki] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 3 });
await ctx.addInitScript(() => { try { localStorage.setItem("gazz-theme", "dark"); } catch {} });
const HIDE = ".bx-strip,.appnav,.gzdk-edge,.site-ann{display:none!important}";
const p = await ctx.newPage();
const go = async (u, wait = 6000) => { await p.goto("https://gazz.fun" + u, { waitUntil: "networkidle", timeout: 90000 }).catch(() => {}); await p.addStyleTag({ content: HIDE }); await p.waitForTimeout(wait); };
const snap = async (sel, name, pad = 0) => {
  const e = await p.$(sel);
  if (!e) { console.log("MISSING", sel); return; }
  const r = await e.boundingBox();
  await p.screenshot({ path: `img/${name}.png`, clip: { x: r.x - pad, y: r.y - pad, width: r.width + 2 * pad, height: r.height + 2 * pad } });
  console.log(name, Math.round((r.width + 2 * pad) * 3), Math.round((r.height + 2 * pad) * 3));
};
await go("/market/funds", 7000);
const box = await p.evaluate(() => {
  const rows = [...document.querySelectorAll(".fm-lrow")];
  const r0 = rows[0].getBoundingClientRect(), r1 = rows[Math.min(7, rows.length - 1)].getBoundingClientRect();
  return { x: r0.left - 8, y: r0.top - 54, w: r0.width + 16, h: r1.bottom - r0.top + 62, n: rows.length };
});
console.log("rows", box.n);
await p.screenshot({ path: "img/fm-list.png", clip: { x: box.x, y: box.y, width: box.w, height: box.h } });
console.log("fm-list", Math.round(box.w * 3), Math.round(box.h * 3));
await go("/fund/f/AEEV", 7000);
const t = await p.$("text=7D"); if (t) { await t.click(); await p.waitForTimeout(2500); }
await snap(".fdv-head", "fd-head", 6);
await snap(".fdv-gwrap", "fd-chart", 8);
await snap(".fdv-side", "fd-buy", 6);
await snap(".fdv-hold", "fd-hold", 8);
await go("/fund/raffle", 7000);
await snap(".frf-fee-grid", "rf-split", 14);
await snap(".frf-fee-big", "rf-fee", 14);
await snap(".frf-open-chips", "rf-chips", 10);
await b.close();
