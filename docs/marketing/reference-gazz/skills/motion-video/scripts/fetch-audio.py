#!/usr/bin/env python3
"""Download the curated Mixkit music + SFX into <out>/<name>.wav (48 kHz stereo)
and write <out>/LICENSES.txt. Usage: python3 fetch-audio.py --out audio [--only a,b]"""
import argparse, json, os, shutil, subprocess, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))

def ffmpeg():
    p = shutil.which("ffmpeg")
    if p: return p
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()

ap = argparse.ArgumentParser()
ap.add_argument("--out", default="audio")
ap.add_argument("--only", default="", help="comma list of names (default: all)")
a = ap.parse_args()
src = json.load(open(os.path.join(HERE, "audio-sources.json")))
os.makedirs(a.out, exist_ok=True)
only = {x for x in a.only.split(",") if x}
FF = ffmpeg()
lines = ["Audio from Mixkit (https://mixkit.co). Music: Mixkit Stock Music Free License.",
         "SFX: Mixkit Sound Effects Free License. Attribution not required; recorded for the record.", ""]
for kind in ("music", "sfx"):
    for name, m in src[kind].items():
        if only and name not in only: continue
        mp3 = os.path.join(a.out, name + ".mp3"); wav = os.path.join(a.out, name + ".wav")
        if not os.path.exists(wav):
            req = urllib.request.Request(m["url"], headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=60) as r, open(mp3, "wb") as f: f.write(r.read())
            subprocess.run([FF, "-v", "error", "-y", "-i", mp3, "-ar", "48000", "-ac", "2", wav], check=True)
        extra = f" ({m['bpm']} BPM, first beat {m['first_beat_s']} s)" if kind == "music" else ""
        lines.append(f"{name}.wav - \"{m['title']}\"{' by ' + m['artist'] if 'artist' in m else ''}{extra} - {m['page']} - {m['url']}")
        print("ok", name)
open(os.path.join(a.out, "LICENSES.txt"), "w").write("\n".join(lines) + "\n")
