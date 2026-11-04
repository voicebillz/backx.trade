#!/usr/bin/env node
// QA stills: node preview.mjs --url http://127.0.0.1:8765/comp.html --times 0,2,4.5 --out qa [--dpr 0.5] [--cols 4]
// Writes qa/f-<t>.png per time and qa/contact.png (labelled grid) to read in one look.
import fs from "fs";
import path from "path";

async function loadPlaywright() {
  try { return await import("playwright"); } catch {}
  const { execSync } = await import("child_process");
  const root = execSync("npm root -g").toString().trim();
  return await import(root + "/playwright/index.mjs");
}
const { chromium } = await loadPlaywright();
const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const URL_ = arg("url"), OUT = arg("out", "qa"), DPR = Number(arg("dpr", 0.5)), COLS = Number(arg("cols", 4));
const SPKI = arg("spki", process.env.SPKI || "");
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: SPKI ? ["--ignore-certificate-errors-spki-list=" + SPKI] : [] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: DPR });
p.on("pageerror", (e) => console.log("pageerror:", String(e).slice(0, 300)));
p.on("console", (m) => { if (m.type() === "error") console.log("console:", m.text().slice(0, 300)); });
await p.goto(URL_);
// a syntax error never sets BOOT_ERR, so fail fast on the first page error during boot
  let early = null, iv; p.once("pageerror", (e) => (early = e));
  await Promise.race([p.waitForFunction(() => window.READY || window.BOOT_ERR, null, { timeout: 90000 }),
    new Promise((_, rej) => { iv = setInterval(() => { if (early) rej(new Error("page error during boot: " + early)); }, 200); })]).finally(() => clearInterval(iv));
const err = await p.evaluate(() => window.BOOT_ERR);
if (err) { console.error("BOOT_ERR", err); process.exit(1); }
const dur = await p.evaluate(() => window.DUR);
let times = (arg("times", "") || "").split(",").filter(Boolean).map(Number);
if (!times.length) times = Array.from({ length: 12 }, (_, i) => +(dur * i / 12).toFixed(2));
const shots = [];
for (const t of times) {
  await p.evaluate((t) => window.seek(t), t);
  const f = path.join(OUT, `f-${t.toFixed(2)}.png`);
  await p.screenshot({ path: f });
  shots.push({ t, data: fs.readFileSync(f).toString("base64") });
}
// contact sheet
const cw = 480, ch = 270;
const html = `<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(${COLS},${cw}px);gap:6px;padding:6px;font:600 14px system-ui;color:#fff">` +
  shots.map((s) => `<div style="position:relative"><img src="data:image/png;base64,${s.data}" style="width:${cw}px;height:${ch}px;display:block"><span style="position:absolute;left:6px;top:4px;background:#000a;padding:2px 6px;border-radius:4px">${s.t.toFixed(2)}s</span></div>`).join("") + "</body>";
const rows = Math.ceil(shots.length / COLS);
await p.setViewportSize({ width: COLS * (cw + 6) + 6, height: rows * (ch + 6) + 6 });
await p.setContent(html);
await p.screenshot({ path: path.join(OUT, "contact.png"), fullPage: true });
await b.close();
console.log(`${shots.length} stills + contact.png -> ${OUT}`);
