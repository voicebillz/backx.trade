#!/usr/bin/env python3
"""Music bed + timed SFX from cues.json -> loudness-normalised WAV.

python3 mix.py --cues cues.json --music audio/music-120-corporate.wav --music-start 13.471 \
               --sfx-dir audio --out mix.wav [--dur 30] [--music-gain 0.55] [--lufs -14]

cues.json is what render.mjs writes: {"dur": .., "cues": [{"t": sec, "f": "pop-soft", "g": 0.6}, ...]}.
Each SFX is level-matched against the music under it (loudest 150 ms window vs the bed), so a
cue's g is a relative accent, not a raw volume. Then a limiter and two-pass loudnorm."""
import argparse, json, re, shutil, subprocess
import numpy as np

def ffmpeg():
    p = shutil.which("ffmpeg")
    if p: return p
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()

ap = argparse.ArgumentParser()
ap.add_argument("--cues", required=True); ap.add_argument("--music", required=True)
ap.add_argument("--music-start", type=float, default=0.0); ap.add_argument("--dur", type=float, default=0)
ap.add_argument("--sfx-dir", default="audio"); ap.add_argument("--out", default="mix.wav")
ap.add_argument("--music-gain", type=float, default=0.55); ap.add_argument("--lufs", type=float, default=-14)
ap.add_argument("--fade-out", type=float, default=2.0)
ap.add_argument("--no-music", action="store_true")
ap.add_argument("--ref-db", type=float, default=-26.0)
a = ap.parse_args()
FF = ffmpeg(); SR = 48000
raw = json.load(open(a.cues))
cues = raw["cues"] if isinstance(raw, dict) else raw
DUR = a.dur or (raw.get("dur") if isinstance(raw, dict) else 0)
assert DUR, "--dur required when cues.json has no dur"
# Target level of each SFX family over the music (dB, loudest-window RMS vs bed RMS)
TARGET = {"click": 3, "pop": 2, "notify": 2, "success": 2, "typing": -3, "whoosh": -6, "riser": -9, "impact": 4}
def target(f):
    for k, v in TARGET.items():
        if f.startswith(k): return v
    return 0

def dec(path, extra=""):
    out = subprocess.run([FF, "-v", "error", "-i", path, "-af", f"aformat=channel_layouts=mono{extra}", "-ar", str(SR), "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(out, dtype=np.float32)

music = (np.full(int(DUR * SR), 10 ** (a.ref_db / 20), dtype=np.float32) if a.no_music else dec(a.music, f",atrim=start={a.music_start}:duration={DUR},asetpts=PTS-STARTPTS") * a.music_gain)
rms = lambda x: float(np.sqrt(np.mean(x ** 2))) + 1e-9
db = lambda v: 20 * np.log10(v)
win = int(0.15 * SR); cache = {}; plan = []
for c in cues:
    f = c["f"]
    if f not in cache:
        x = dec(f"{a.sfx_dir}/{f}.wav")
        if f.startswith("typing"): x = x[: int(1.35 * SR)]
        e = np.convolve(x ** 2, np.ones(win) / win, mode="valid"); k = int(np.argmax(e))
        cache[f] = (float(np.sqrt(e[k])) + 1e-9, k / SR)
    s_rms, off = cache[f]
    i0 = int((c["t"] + off) * SR)
    m_rms = rms(music[i0:i0 + win]) if i0 + win < len(music) else rms(music[-win:])
    # g = accent relative to the family target (1.0 = target, 0.5 = -6 dB)
    g = 10 ** ((target(f) + db(max(c.get("g", 1), 1e-3)) - db(s_rms / m_rms)) / 20)
    plan.append({**c, "gain": round(min(g, 4.0), 3)})

inputs = ["-f", "lavfi", "-t", str(DUR), "-i", f"anullsrc=r={SR}:cl=stereo"] if a.no_music else ["-i", a.music]
fo = max(0.0, DUR - a.fade_out)
filt = ([f"[0:a]aformat=sample_rates={SR}:channel_layouts=stereo[m]"] if a.no_music else
        [f"[0:a]atrim=start={a.music_start}:duration={DUR},asetpts=PTS-STARTPTS,aformat=sample_rates={SR}:channel_layouts=stereo,"
         f"afade=t=in:st=0:d=0.1,afade=t=out:st={fo}:d={a.fade_out},volume={a.music_gain}[m]"])
labels = ["[m]"]
for i, c in enumerate(plan):
    inputs += ["-i", f"{a.sfx_dir}/{c['f']}.wav"]; k = i + 1; ms = int(round(c["t"] * 1000))
    ch = f"[{k}:a]aformat=sample_rates={SR}:channel_layouts=stereo"
    if c["f"].startswith("typing"): ch += ",atrim=0:1.35,afade=t=out:st=1.1:d=0.25"
    ch += f",volume={c['gain']},adelay={ms}|{ms}[s{k}]"; filt.append(ch); labels.append(f"[s{k}]")
filt.append("".join(labels) + f"amix=inputs={len(labels)}:normalize=0,atrim=0:{DUR},alimiter=limit=0.7:attack=2:release=60:level=false[mix]")
fc = ";".join(filt)
def go(extra, out): return subprocess.run([FF, "-v", "info", "-y", *inputs, "-filter_complex", fc + extra, "-map", "[o]", *out], capture_output=True, text=True)
r = go(f";[mix]loudnorm=I={a.lufs}:TP=-1.5:LRA=11:print_format=json[o]", ["-f", "null", "-"])
js = json.loads(re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", r.stderr, re.S).group(0))
ln = (f"loudnorm=I={a.lufs}:TP=-1.5:LRA=11:measured_I={js['input_i']}:measured_TP={js['input_tp']}:measured_LRA={js['input_lra']}"
      f":measured_thresh={js['input_thresh']}:offset={js['target_offset']}:linear=true")
r = go(f";[mix]{ln},aresample={SR}[o]", ["-c:a", "pcm_s16le", a.out])
if r.returncode: print(r.stderr[-2000:]); raise SystemExit(1)
print(f"mixed {len(plan)} cues, measured {js['input_i']} LUFS -> {a.lufs} LUFS -> {a.out}")
