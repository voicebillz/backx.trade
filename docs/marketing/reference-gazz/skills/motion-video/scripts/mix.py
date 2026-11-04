#!/usr/bin/env python3
"""Music bed + timed SFX from cues.json -> loudness-normalised WAV.

python3 mix.py --cues cues.json --music audio/music-120-corporate.wav --music-start 13.471 \
               --sfx-dir audio --out mix.wav [--dur 30] [--music-gain 0.55] [--lufs -14]

cues.json is what render.mjs writes: {"dur": .., "cues": [{"t": sec, "f": "pop-soft", "g": 0.6}, ...]}.
Each SFX is level-matched against the music under it (loudest 150 ms window vs the bed), so a
cue's g is a relative accent, not a raw volume. Then a limiter and two-pass loudnorm.

VOICE-OVER (2026-11-01): cues whose f starts with "vo" ({"t": 0.25, "f": "vo-1"}) are voice
lines, not SFX: no level matching (g = plain gain, default 1), summed on a voice bus that
DUCKS the music by --duck-db while it speaks (sidechain), then mixed on top."""
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
ap.add_argument("--duck-db", type=float, default=11.0, help="music ducking under the voice-over (dB)")
ap.add_argument("--voice-gain", type=float, default=1.0)
a = ap.parse_args()
FF = ffmpeg(); SR = 48000
raw = json.load(open(a.cues))
cues = raw["cues"] if isinstance(raw, dict) else raw
DUR = a.dur or (raw.get("dur") if isinstance(raw, dict) else 0)
assert DUR, "--dur required when cues.json has no dur"

# ---- music automation (Pump.fun study 2026-11-01): cues whose f starts with "@"
# shape the BED instead of adding a sound.
#   {"f":"@lowpass","t":9.0,"to":600,"d":0.35,"hold":0.25,"back":0.4}
#       = audio focus pull: the bed muffles into a visual transition, opens on the next scene
#   {"f":"@stop","t":24.18,"d":0.05}  = the music cuts on a downbeat (logo sting rings alone)
auto = [c for c in cues if c["f"].startswith("@")]
voice = [c for c in cues if c["f"].startswith("vo")]
cues = [c for c in cues if not c["f"].startswith("@") and not c["f"].startswith("vo")]
if auto:
    pcm = subprocess.run([FF, "-v", "error", "-i", a.music, "-af", f"atrim=start={a.music_start}:duration={DUR},asetpts=PTS-STARTPTS",
                          "-ar", str(SR), "-ac", "2", "-f", "f32le", "-"], capture_output=True, check=True).stdout
    mus = np.frombuffer(pcm, dtype=np.float32).reshape(-1, 2).copy()
    for c in auto:
        if c["f"] == "@lowpass":
            t0, d, hold, back, lo = c["t"], c.get("d", 0.35), c.get("hold", 0.2), c.get("back", 0.4), c.get("to", 700)
            i0, i1 = int(t0 * SR), min(len(mus), int((t0 + d + hold + back) * SR))
            tt = np.arange(i1 - i0) / SR
            u = np.where(tt < d, tt / d, np.where(tt < d + hold, 1, 1 - (tt - d - hold) / back)).clip(0, 1)
            fc = np.exp(np.log(18000) + (np.log(lo) - np.log(18000)) * u)   # exponential sweep
            y = mus[i0:i1].copy(); z = np.zeros((2, 2))
            B = 32
            for b in range(0, len(y), B):          # RBJ biquad, coefficients per 32-sample block
                w0 = 2 * np.pi * fc[b] / SR; al = np.sin(w0) / (2 * 0.707); cw = np.cos(w0)
                b0, b1, b2 = (1 - cw) / 2, 1 - cw, (1 - cw) / 2; a0, a1, a2 = 1 + al, -2 * cw, 1 - al
                b0, b1, b2, a1, a2 = b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0
                for ch in range(2):
                    s1, s2 = z[ch]
                    blk = y[b:b + B, ch]
                    for k in range(len(blk)):
                        xn = blk[k]; yn = b0 * xn + s1; s1 = b1 * xn - a1 * yn + s2; s2 = b2 * xn - a2 * yn; blk[k] = yn
                    z[ch] = (s1, s2)
            mus[i0:i1] = y
        elif c["f"] == "@stop":
            i0 = int(c["t"] * SR); n = max(1, int(c.get("d", 0.05) * SR))
            ramp = np.linspace(1, 0, n)[:, None]
            seg = mus[i0:i0 + n]; mus[i0:i0 + len(seg)] = seg * ramp[:len(seg)]; mus[i0 + n:] = 0
    tmp = a.out + ".bed.wav"
    import wave
    with wave.open(tmp, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(mus, -1, 1) * 32767).astype("<i2").tobytes())
    a.music, a.music_start = tmp, 0.0
# Target level of each SFX family over the music (dB, loudest-window RMS vs bed RMS)
TARGET = {"click": 3, "pop": 2, "notify": 2, "success": 2, "typing": -3, "whoosh": -6, "riser": -9, "impact": 4,
          # "smooth" family (make-sfx.py), levels measured on the reference film
          "blip": 7, "tap": 3, "swish": 0, "tick": 2,
          # soft win chord (major-9 swell + sub thump) replaces bright chimes on big wins
          "chord": 3, "bloop": 4, "sting": 4, "swell": -4,
          # standard UI palette (make-sfx.py ui-*, owner 2026-11-01) — specific names first
          "ui-whoosh-low": -5, "ui-whoosh": -4, "ui-tap": 3, "ui-pop": 3, "ui-key": -2, "ui-toggle": 0,
          "ui-drawer": 1, "ui-thud": 3, "ui-snap": 2, "ui-slide": -6, "ui-bounce": 1, "ui-ding": 0,
          "ui-dismiss": 0, "ui-success": 1, "ui-sub": 4, "ui-ripple": 1, "ui-grain": -8, "ui-pad": -2, "ui-iris": -2}
def target(f):
    for k, v in TARGET.items():
        if f.startswith(k): return v
    return 0

def dec(path, extra=""):
    out = subprocess.run([FF, "-v", "error", "-i", path, "-af", f"aformat=channel_layouts=mono{extra}", "-ar", str(SR), "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(out, dtype=np.float32)

music = dec(a.music, f",atrim=start={a.music_start}:duration={DUR},asetpts=PTS-STARTPTS") * a.music_gain
rms = lambda x: float(np.sqrt(np.mean(x ** 2))) + 1e-9
_blk = music[: len(music) // 4800 * 4800].reshape(-1, 4800)
BED_RMS = float(np.median(np.sqrt((_blk ** 2).mean(1)))) + 1e-9
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
    # where the bed is silent (after an @stop) measure against the typical bed level
    m_rms = max(m_rms, 0.5 * BED_RMS)
    # g = accent relative to the family target (1.0 = target, 0.5 = -6 dB)
    g = 10 ** ((target(f) + db(max(c.get("g", 1), 1e-3)) - db(s_rms / m_rms)) / 20)
    plan.append({**c, "gain": round(min(g, 4.0), 3)})

inputs = ["-i", a.music]
fo = max(0.0, DUR - a.fade_out)
filt = [f"[0:a]atrim=start={a.music_start}:duration={DUR},asetpts=PTS-STARTPTS,aformat=sample_rates={SR}:channel_layouts=stereo,"
        f"afade=t=in:st=0:d=0.1,afade=t=out:st={fo}:d={a.fade_out},volume={a.music_gain}[m]"]
labels = ["[m]"]
for i, c in enumerate(plan):
    inputs += ["-i", f"{a.sfx_dir}/{c['f']}.wav"]; k = i + 1; ms = int(round(c["t"] * 1000))
    ch = f"[{k}:a]aformat=sample_rates={SR}:channel_layouts=stereo"
    if c["f"].startswith("typing"): ch += ",atrim=0:1.35,afade=t=out:st=1.1:d=0.25"
    ch += f",volume={c['gain']},adelay={ms}|{ms}[s{k}]"; filt.append(ch); labels.append(f"[s{k}]")
if voice:
    # voice bus: every line at its time, then split — one copy keys the music ducker
    vl = []
    for j, c in enumerate(voice):
        inputs += ["-i", f"{a.sfx_dir}/{c['f']}.wav"]; k = len(plan) + 1 + j; ms = int(round(c["t"] * 1000))
        filt.append(f"[{k}:a]aformat=sample_rates={SR}:channel_layouts=stereo,volume={c.get('g', 1) * a.voice_gain},adelay={ms}|{ms}[v{j}]")
        vl.append(f"[v{j}]")
    filt.append("".join(vl) + f"amix=inputs={len(vl)}:normalize=0,apad=whole_dur={DUR},asplit=2[vbus][vkey]")
    ratio = 10 ** (a.duck_db / 20)
    filt[0] = filt[0].replace("[m]", "[m0]")
    filt.append(f"[m0][vkey]sidechaincompress=threshold=0.015:ratio={ratio:.2f}:attack=25:release=420:makeup=1[m]")
    labels.append("[vbus]")
filt.append("".join(labels) + f"amix=inputs={len(labels)}:normalize=0,atrim=0:{DUR},alimiter=limit=0.7:attack=2:release=60:level=false[mix]")
fc = ";".join(filt)
def go(extra, out): return subprocess.run([FF, "-v", "info", "-y", *inputs, "-filter_complex", fc + extra, "-map", "[o]", *out], capture_output=True, text=True)
r = go(f";[mix]loudnorm=I={a.lufs}:TP=-1.5:LRA=11:print_format=json[o]", ["-f", "null", "-"])
js = json.loads(re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", r.stderr, re.S).group(0))
ln = (f"loudnorm=I={a.lufs}:TP=-1.5:LRA=11:measured_I={js['input_i']}:measured_TP={js['input_tp']}:measured_LRA={js['input_lra']}"
      f":measured_thresh={js['input_thresh']}:offset={js['target_offset']}:linear=true")
r = go(f";[mix]{ln},aresample={SR}[o]", ["-c:a", "pcm_s16le", a.out])
if r.returncode: print(r.stderr[-2000:]); raise SystemExit(1)
print(f"mixed {len(plan)} cues + {len(voice)} voice lines, measured {js['input_i']} LUFS -> {a.lufs} LUFS -> {a.out}")
