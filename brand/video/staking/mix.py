# Taps only, no music: place each cue, then loudness-normalise (-16 LUFS, true peak -1.5 dBTP) like the intro video.
import json, subprocess, numpy as np, sys
D = sys.argv[1]; SR = 48000
cues = json.load(open(f'{D}/cues.json'))
dur = cues['dur']; out = np.zeros(int(dur * SR) + SR // 2, dtype=np.float32)
def load(f):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', f'{D}/audio/{f}.wav', '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, dtype=np.float32); return x / (np.abs(x).max() + 1e-9)
cache = {}
for c in cues['cues']:
    x = cache.setdefault(c['f'], load(c['f']))
    i = int(c['t'] * SR); out[i:i + len(x)] += x[: len(out) - i] * c['g']
out = out[: int(dur * SR)]
open(f'{D}/raw.f32', 'wb').write(out.astype(np.float32).tobytes())
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', f'{D}/raw.f32',
  '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000', '-ac', '2', f'{D}/mix.wav'], check=True)
print('mix ok')
