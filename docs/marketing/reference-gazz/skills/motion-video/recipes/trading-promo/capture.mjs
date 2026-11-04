import { createRequire } from "module"; import { execSync } from "child_process"; import fs from "fs";
const require = createRequire(import.meta.url);
let pw; try { pw = require("playwright"); } catch { pw = require(execSync("npm root -g").toString().trim() + "/playwright"); }
const spki = fs.readFileSync("spki.txt", "utf8").trim();
const b = await pw.chromium.launch({ args: ["--ignore-certificate-errors-spki-list=" + spki] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 3 });
await ctx.addInitScript(() => { try { localStorage.setItem("gazz-theme", "dark"); } catch {} });
const HIDE = ".bx-strip,.appnav,.gzdk-edge,.site-ann{display:none!important}";
const p = await ctx.newPage();
const go = async (u, wait = 4000) => {
  await p.goto("https://gazz.fun" + u, { waitUntil: "networkidle", timeout: 90000 }).catch((e) => console.log("goto", u, e.message));
  await p.addStyleTag({ content: HIDE });
  await p.waitForTimeout(wait);
};
await go("/coin/0x08a5D78A4bC7754e8aFF87b4509e007baeb685f3", 7000);
await p.screenshot({ path: "shots/gazz-view.png" });
await go("/market/memes", 5000);
for (const name of ["YWON"]) {
  const rows = await p.$$(".gp-lrow");
  for (const r of rows) { if ((await r.innerText()).includes(name)) { await r.click(); break; } }
  await p.waitForTimeout(7000); await p.addStyleTag({ content: HIDE });
  console.log(name, p.url());
  await p.screenshot({ path: `shots/coin-${name}.png` });
}
await go("/fund/f/MMMC", 6000);
const t = await p.$("text=24H"); if (t) { await t.click(); await p.waitForTimeout(2500); }
await p.screenshot({ path: "shots/fund-mmmc.png" });
await go("/fund/f/BEBT", 6000);
const t2 = await p.$("text=24H"); if (t2) { await t2.click(); await p.waitForTimeout(2500); }
await p.screenshot({ path: "shots/fund-bebt.png" });
await b.close();
