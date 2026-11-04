#!/usr/bin/env node
// Parallel frame renderer for a seek(t) composition.
//   render:  node render.mjs --url http://127.0.0.1:8765/comp.html --out video.mp4 [--workers 4] [--fps 60] [--dpr 2] [--crf 15] [--from 0 --to 12]
//   mux:     node render.mjs --mux video.mp4 --audio mix.wav --out final.mp4
// Writes cues.json (window.CUES + DUR) next to --out on every render.
import { spawn, spawnSync, execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

async function loadPlaywright() {
  try { return await import("playwright"); } catch {}
  const { execSync } = await import("child_process");
  const root = execSync("npm root -g").toString().trim();
  return await import(root + "/playwright/index.mjs");
}
const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes("--" + k);

function ffmpegBin() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  if (spawnSync("ffmpeg", ["-version"]).status === 0) return "ffmpeg";
  return execFileSync("python3", ["-c", "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"]).toString().trim();
}
const FF = ffmpegBin();
const run = (args) => { const r = spawnSync(FF, args, { stdio: "inherit" }); if (r.status !== 0) throw new Error("ffmpeg failed: " + args.join(" ")); };

// ---------- mux mode ----------
if (has("mux")) {
  run(["-v", "error", "-y", "-i", arg("mux"), "-i", arg("audio"), "-map", "0:v", "-map", "1:a", "-c:v", "copy",
    "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-shortest", "-movflags", "+faststart", arg("out")]);
  console.log("muxed ->", arg("out"));
  process.exit(0);
}

const URL_ = arg("url"), OUT = path.resolve(arg("out", "video.mp4"));
const FPS = Number(arg("fps", 60)), DPR = Number(arg("dpr", 2)), CRF = String(arg("crf", 15));
const SPKI = arg("spki", process.env.SPKI || "");
if (!URL_) { console.error("--url required"); process.exit(1); }

async function openComp() {
  const { chromium } = await loadPlaywright();
  const args = SPKI ? ["--ignore-certificate-errors-spki-list=" + SPKI] : [];
  const b = await chromium.launch({ args });
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
  return { b, p };
}

// ---------- worker mode: render frames [f0, f1] into one segment ----------
if (has("worker")) {
  const f0 = Number(arg("f0")), f1 = Number(arg("f1")), seg = arg("seg");
  const { b, p } = await openComp();
  const ff = spawn(FF, ["-v", "error", "-y", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
    "-c:v", "libx264", "-preset", "slow", "-crf", CRF, "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "5.2",
    "-x264-params", `keyint=${FPS}:min-keyint=${FPS}:scenecut=0`, "-threads", "2", "-r", String(FPS), seg], { stdio: ["pipe", "inherit", "inherit"] });
  const t0 = Date.now();
  for (let f = f0; f <= f1; f++) {
    await p.evaluate((t) => window.seek(t), f / FPS);
    const buf = await p.screenshot({ type: "png" });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
    if ((f - f0) % 120 === 0) console.log(`  [${path.basename(seg)}] frame ${f}/${f1}  ${((Date.now() - t0) / 1000 / (f - f0 + 1)).toFixed(2)} s/frame`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
  await b.close();
  process.exit(0);
}

// ---------- main: probe, split, spawn workers, concat ----------
const { b, p } = await openComp();
const DUR = await p.evaluate(() => window.DUR);
const CUES = await p.evaluate(() => window.CUES || []);
await b.close();
fs.writeFileSync(path.join(path.dirname(OUT), "cues.json"), JSON.stringify({ dur: DUR, cues: CUES }, null, 1));

const from = Number(arg("from", 0)), to = Math.min(Number(arg("to", DUR)), DUR);
const F0 = Math.round(from * FPS), F1 = Math.round(to * FPS) - 1;
const W = Math.max(1, Math.min(Number(arg("workers", 4)), F1 - F0 + 1));
const per = Math.ceil((F1 - F0 + 1) / W);
const tmp = fs.mkdtempSync(path.join(path.dirname(OUT), ".segs-"));
const self = fileURLToPath(import.meta.url);
console.log(`rendering ${F1 - F0 + 1} frames (${from}-${to}s of ${DUR}s) @ ${FPS}fps, ${1920 * DPR}x${1080 * DPR}, ${W} workers`);
const t0 = Date.now();
const segs = [];
await Promise.all(Array.from({ length: W }, (_, i) => {
  const a = F0 + i * per, z = Math.min(F1, a + per - 1);
  if (a > z) return null;
  const seg = path.join(tmp, `seg-${String(i).padStart(2, "0")}.mp4`); segs[i] = seg;
  const pass = ["--url", URL_, "--fps", FPS, "--dpr", DPR, "--crf", CRF, ...(SPKI ? ["--spki", SPKI] : [])].map(String);
  const c = spawn(process.execPath, [self, "--worker", "--f0", String(a), "--f1", String(z), "--seg", seg, ...pass], { stdio: "inherit" });
  return new Promise((res, rej) => c.on("close", (code) => (code === 0 ? res() : rej(new Error("worker " + i + " exit " + code)))));
}));
const list = path.join(tmp, "list.txt");
fs.writeFileSync(list, segs.filter(Boolean).map((s) => `file '${s}'`).join("\n"));
run(["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", OUT]);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`done -> ${OUT} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
