#!/usr/bin/env python3
# Study the sound design of a reference film: /usr/bin/python3 sfx-study.py ref.mp4
# Splits bed (repeats every bar) from effects and lists each effect: time, length,
# brightness, tonal/noise and pitch movement. Pair it with ffmpeg showspectrumpic
# + a frame strip of the same seconds to see WHAT each sound marks.
# REPET-style split: the music repeats every bar, the SFX don't. Median of the
# spectrogram at the same bar position in neighbouring bars = the bed; the
# positive residual = sound effects. Then list and characterise each event.
import sys, subprocess, numpy as np
f = sys.argv[1]; SR = 22050
x = np.frombuffer(subprocess.run(["ffmpeg","-v","error","-i",f,"-ac","1","-ar",str(SR),"-f","f32le","-"],capture_output=True).stdout, np.float32)
n, hop = 2048, 256
win = np.hanning(n)
fr = np.lib.stride_tricks.sliding_window_view(x, n)[::hop] * win
S = np.abs(np.fft.rfft(fr, axis=1)).T          # freq x time
freqs = np.fft.rfftfreq(n, 1/SR); fps = SR/hop
# repeating period from the beat spectrum (autocorr of the spectrogram over time)
P = (S**2).mean(0); P = P - P.mean()
ac = np.correlate(P, P, "full")[len(P)-1:]
lo, hi = int(1.2*fps), int(6.0*fps)
per = lo + int(np.argmax(ac[lo:hi]))
# bed = median over k neighbouring periods
K = 4; T = S.shape[1]; bed = np.empty_like(S)
for t in range(T):
    idx = [t + k*per for k in range(-K, K+1) if 0 <= t + k*per < T]
    bed[:, t] = np.median(S[:, idx], axis=1)
R = np.maximum(S - bed, 0)
# event detection on residual energy
e = (R**2).sum(0); eb = (bed**2).sum(0) + 1e-9
rel = 10*np.log10((e+1e-9)/eb)
sm = np.convolve(rel, np.ones(5)/5, "same")
ev = []; i = 0
thr = 3.0
while i < T:
    if sm[i] > thr:
        j = i
        while j < T and sm[j] > thr - 4: j += 1
        if (j - i)/fps > 0.03:
            seg = R[:, i:j]; spec = seg.sum(1)
            cen = (spec*freqs).sum()/(spec.sum()+1e-9)
            # tonal vs noisy: spectral flatness (low = tonal)
            gm = np.exp(np.mean(np.log(spec[5:]+1e-9))); am = spec[5:].mean()+1e-9
            flat = gm/am
            pk = freqs[5:][np.argmax(spec[5:])]
            # pitch movement: centroid at start vs end
            def c(a): s=a.sum(1); return (s*freqs).sum()/(s.sum()+1e-9)
            q = max(1,(j-i)//3)
            c0, c1 = c(R[:, i:i+q]), c(R[:, j-q:j])
            lvl = 10*np.log10(seg.sum()**2/((bed[:, i:j].sum()**2)+1e-9))
            ev.append((i/fps, (j-i)/fps, cen, pk, flat, c0, c1, sm[i:j].max()))
        i = j
    i += 1
print(f"{f.split('/')[-1][:12]}  repeat period {per/fps:.3f}s  events {len(ev)}")
for t0,d,cen,pk,flat,c0,c1,mx in ev:
    kind = "tonal" if flat < 0.12 else ("mixed" if flat < 0.3 else "noise")
    mv = "rise" if c1 > c0*1.25 else ("fall" if c1 < c0/1.25 else "flat")
    print(f"{t0:6.2f}s  {d*1000:5.0f}ms  centroid {cen:5.0f}Hz  peak {pk:5.0f}Hz  {kind:5s} {mv:4s}  +{mx:4.1f}dB")
