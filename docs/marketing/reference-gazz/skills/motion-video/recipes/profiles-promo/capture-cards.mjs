// Real StockSlot lobby cards for game art (light theme, DPR 3): clones each [data-game] card into a fixed box
// (the lobby carousel moves, so a clip of the original never settles) and element-screenshots it to shots/card-<id>.png.
// usage: put the proxy SPKI pin in spki.txt, mkdir shots, node capture-cards.mjs /stockslot
import { createRequire } from "module"; import { execSync } from "child_process"; import fs from "fs";
const require = createRequire(import.meta.url);
let pw; try { pw = require("playwright"); } catch { pw = require(execSync("npm root -g").toString().trim() + "/playwright"); }
const spki = fs.readFileSync("spki.txt", "utf8").trim();
const b = await pw.chromium.launch({ args: ["--ignore-certificate-errors-spki-list=" + spki] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 3 });
await ctx.addInitScript(() => { try { localStorage.setItem("gazz-theme", "light"); } catch {} });
const HIDE = ".bx-strip,.appnav,.gzdk-edge,.site-ann{display:none!important}";
const p = await ctx.newPage();
const url = process.argv[2] || "/stockslot";
await p.goto("https://gazz.fun" + url, { waitUntil: "networkidle", timeout: 90000 }).catch((e) => console.log(e.message));
await p.addStyleTag({ content: HIDE }); await p.waitForTimeout(6000);
await p.screenshot({ path: "shots/page.png", timeout: 20000 }).catch(()=>{});
if (url === "/stockslot") {
  const ids = await p.$$eval("[data-game]", (cs) => [...new Set(cs.map((c) => c.getAttribute("data-game")))]);
  console.log(ids.length);
  for (const id of ids.slice(0, 40)) {
    const ok = await p.evaluate((id) => {
      document.getElementById("__cl")?.remove();
      const src = [...document.querySelectorAll(`[data-game="${id}"]`)].find((e) => e.getBoundingClientRect().width > 100);
      if (!src) return false;
      const r = src.getBoundingClientRect();
      const box = document.createElement("div"); box.id = "__cl";
      box.style.cssText = `position:fixed;left:20px;top:20px;z-index:99999;width:${r.width}px;height:${r.height}px;background:transparent`;
      const cl = src.cloneNode(true); cl.style.width = r.width + "px"; cl.style.height = r.height + "px"; cl.style.margin = "0"; cl.style.transform = "none"; cl.style.opacity = "1";
      box.appendChild(cl); document.body.appendChild(box); return true;
    }, id);
    if (!ok) { console.log("skip", id); continue; }
    await p.waitForTimeout(500);
    const el = await p.$("#__cl");
    await el.screenshot({ path: `shots/card-${id}.png`, timeout: 15000, animations: "disabled" }).catch((e) => console.log(id, e.message.split("\n")[0]));
  }
  console.log(ids.join(" "));
}
const links = await p.$$eval("a", (a) => a.map((x) => x.getAttribute("href")).filter((h) => h && /0x[0-9a-fA-F]{40}/.test(h)).slice(0, 10));
console.log("links", links);
await b.close();
