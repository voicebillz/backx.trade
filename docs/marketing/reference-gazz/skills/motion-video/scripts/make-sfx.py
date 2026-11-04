#!/usr/bin/env python3
"""The "smooth" motion-graphics SFX family (2026-10-22), designed to match a
reference RWA/fintech launch film the owner picked: short TONAL sounds tucked
just above the music, never noisy whooshes.

Measured on the reference (music stripped with a REPET/nn_filter split):
  reveal blip  ~80 ms, soft 55 ms swell-in, sine ~450 -> 650 Hz (+0.45 oct),
               faint click at the peak; sits ~+6..+10 dB over the bed
  tap          ~130 ms, bright click (centroid ~4 kHz) + tonal body
               ~620 / 1240 Hz; ~+2..+4 dB over the bed
  swish        ~170 ms thin pitch sweep ~2.6 kHz -> 520 Hz (curved), ~0 dB
  tick         ~60 ms steady ~730 Hz ping, quiet

These are sound-DESIGNED (sine bodies + filtered transients + a tiny room),
like the reference itself. Organic sounds (air whooshes, chimes, impacts,
typing) still come from Mixkit via fetch-audio.py.

  python3 make-sfx.py --out audio      # writes blip-1..3, tap-1..2, swish-down,
                                       # swish-up, tick-1..2, ... and the standard
                                       # UI palette ui-* as 48 kHz stereo WAV
"""
import argparse, os, wave
import numpy as np

SR = 48000
rng = np.random.default_rng(7)  # deterministic: same files every run


def t_axis(sec):
    return np.arange(int(sec * SR)) / SR


def chirp(f0, f1, sec, curve=1.0):
    """Sine whose frequency glides f0 -> f1 (exponential, `curve` bends it)."""
    t = t_axis(sec); p = (t / sec) ** curve
    f = f0 * (f1 / f0) ** p
    return np.sin(2 * np.pi * np.cumsum(f) / SR), f


def env_swell(n, attack, release):
    """Raised-cosine swell in, then a quick cosine release (no clicks)."""
    a = int(attack * SR); r = int(release * SR); s = max(0, n - a - r)
    up = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, a))
    dn = 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, r))
    return np.concatenate([up, np.ones(s), dn])[:n]


def env_hit(n, attack, tau):
    t = np.arange(n) / SR
    e = np.exp(-np.maximum(0, t - attack) / tau)
    e[: int(attack * SR)] = np.linspace(0, 1, int(attack * SR))
    return e


def bandnoise(sec, lo, hi):
    x = rng.standard_normal(int(sec * SR))
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    X[(f < lo) | (f > hi)] = 0
    return np.fft.irfft(X, len(x))


def room(x, wet=0.08):
    """A few early reflections + a short diffuse tail: glues the sound, no wash."""
    y = x.copy()
    for ms, g in [(7, 0.35), (13, 0.25), (19, 0.18), (29, 0.12), (41, 0.08)]:
        d = int(ms * SR / 1000); y[d:] += g * wet * 4 * x[:-d]
    tail = bandnoise(0.12, 300, 9000) * np.exp(-np.arange(int(0.12 * SR)) / SR / 0.035)
    y = np.convolve(y, np.concatenate([[1.0], tail * wet * 0.02]))[: len(x) + int(0.12 * SR)]
    return y


def stereo(x, width_ms=0.25):
    """Near-mono with a hair of width (sub-ms Haas) so it sits in the mix."""
    d = int(width_ms * SR / 1000)
    L = np.concatenate([x, np.zeros(d)]); R = np.concatenate([np.zeros(d), x])
    return np.stack([L, R], 1)


def norm(x, peak=0.7):
    return x / (np.abs(x).max() + 1e-12) * peak


def blip(f0, f1):
    body, f = chirp(f0, f1, 0.095, curve=1.0)
    h2 = np.sin(2 * np.pi * np.cumsum(2 * f) / SR) * 10 ** (-22 / 20)
    x = (body + h2) * env_swell(len(body), 0.058, 0.03)
    click = bandnoise(0.004, 2000, 9000) * np.hanning(int(0.004 * SR)) * 0.035
    k = int(0.056 * SR); x[k:k + len(click)] += click
    return stereo(room(x, 0.07))


def tap(scale=1.0):
    n = int(0.14 * SR)
    b1 = np.sin(2 * np.pi * 620 * scale * t_axis(0.14)) * env_hit(n, 0.002, 0.035)
    b2 = np.sin(2 * np.pi * 1240 * scale * t_axis(0.14)) * env_hit(n, 0.002, 0.022) * 0.55
    cl = np.zeros(n); c = bandnoise(0.006, 1500, 12000) * np.exp(-np.arange(int(0.006 * SR)) / SR / 0.0012)
    cl[: len(c)] = c * 2.2
    return stereo(room(b1 * 0.8 + b2 + cl, 0.06))


def swish(f0, f1):
    body, f = chirp(f0, f1, 0.17, curve=0.6)
    upper = np.sin(2 * np.pi * np.cumsum(1.5 * f) / SR) * 10 ** (-18 / 20)
    air = bandnoise(0.17, 1200, 7000) * 0.05
    x = (body + upper + air) * env_swell(len(body), 0.018, 0.09)
    return stereo(room(x, 0.09), width_ms=0.4)


def tick(f):
    n = int(0.07 * SR)
    x = np.sin(2 * np.pi * f * t_axis(0.07)) * env_hit(n, 0.003, 0.018)
    x += np.sin(2 * np.pi * 3 * f * t_axis(0.07)) * env_hit(n, 0.002, 0.008) * 0.25
    return stereo(room(x, 0.05))


def chord_win():
    """Soft win: major-9 swell (C4 E4 G4 D5, slightly detuned) + sub thump, low-passed
    at ~2.6 kHz. Replaces bright chimes on big wins (owner 2026-11-01)."""
    t = t_axis(1.1)
    env = np.clip(t / 0.045, 0, 1) ** 2 * np.exp(-t / 0.38)
    x = np.zeros_like(t)
    for f, a in zip([261.63, 329.63, 392.0, 587.33], [1, 0.8, 0.7, 0.35]):
        for det in (-0.6, 0.6):
            x += a * 0.5 * np.sin(2 * np.pi * (f + det) * t + 0.3 * np.sin(2 * np.pi * 5 * t))
    x = x * env + 0.9 * np.sin(2 * np.pi * 62 * t) * np.exp(-t / 0.12) * np.clip(t / 0.008, 0, 1)
    k = np.exp(-2 * np.pi * 2600 / SR); y = np.zeros_like(x)
    for i in range(1, len(x)): y[i] = (1 - k) * x[i] + k * y[i - 1]
    return stereo(y, 4.0)


def bloop(f0, fpk, f1, sec=0.15):
    """Short tonal arc (rises then falls), the Pump.fun icon/coin pop. Kept under
    2 kHz so it never reads as a bright ping."""
    t = t_axis(sec); u = t / sec
    f = np.where(u < 0.45, f0 + (fpk - f0) * (u / 0.45) ** 0.6, fpk + (f1 - fpk) * ((u - 0.45) / 0.55))
    ph = 2 * np.pi * np.cumsum(f) / SR
    env = np.clip(t / 0.012, 0, 1) * np.exp(-np.maximum(0, t - 0.04) / 0.045)
    return stereo(room(np.sin(ph) * env + 0.18 * np.sin(2 * ph) * env, 0.06))


def sting_logo():
    """End-card logo sting, WARM and LOW (owner 2026-11-01: the plucked arpeggio
    read as a bell, «very bad» — never bells, plucks or chimes on the logo).
    A sub boom (58 -> 41 Hz) + a slow warm pad (C3-G4, the 260-400 Hz octave so phones
    hear it) low-passed at 1.4 kHz,
    2.4 s tail. Starts exactly on the hit; pair it with @stop on the music and,
    optionally, a short `swell-in` 0.45 s before."""
    t = t_axis(2.6); x = np.zeros_like(t)
    f_sub = 41 + 17 * np.exp(-t / 0.18)
    x += 0.55 * np.sin(2 * np.pi * np.cumsum(f_sub) / SR) * np.clip(t / 0.006, 0, 1) * np.exp(-t / 0.5)
    pad_env = np.clip(t / 0.09, 0, 1) ** 1.5 * np.exp(-t / 0.95)
    for f, a in zip([130.81, 164.81, 196.0, 261.63, 329.63, 392.0], [0.8, 0.7, 0.65, 0.6, 0.38, 0.3]):  # phones need the 260-400 Hz octave
        for det in (-0.4, 0.4):
            x += a * 0.5 * np.sin(2 * np.pi * (f + det) * t) * pad_env
    k = np.exp(-2 * np.pi * 1400 / SR); y = np.zeros_like(x)
    for i in range(1, len(x)): y[i] = (1 - k) * x[i] + k * y[i - 1]
    return stereo(room(y, 0.1), 4.0)


def swell_in():
    """0.45 s reverse-style swell into a hit: filtered noise rising, cut at the end."""
    t = t_axis(0.45); n = np.random.default_rng(7).standard_normal(len(t))
    env = (t / 0.45) ** 2.2
    k = np.exp(-2 * np.pi * 900 / SR); y = np.zeros_like(n)
    for i in range(1, len(n)): y[i] = (1 - k) * n[i] + k * y[i - 1]
    return stereo(y * env, 0.6)


# ---- STANDARD UI PALETTE (owner 2026-11-01: "smooth sounds like normal clicking
# bubble sounds like most use, nothing too fancy"). One synth per item of the
# owner's 20-point list; see SKILL.md "Standard UI sound palette" for when to use
# each. All short, warm and band-limited: nothing above ~6 kHz rings, no bells.
def lp(x, fc):
    """One-pole low-pass (warmth / muffling)."""
    k = np.exp(-2 * np.pi * fc / SR); y = np.zeros_like(x); acc = 0.0
    for i in range(len(x)): acc = (1 - k) * x[i] + k * acc; y[i] = acc
    return y


def glass_tap(f=1180):
    """1. Soft glass / ceramic tap: muted wooden-ceramic blip (button press)."""
    t = t_axis(0.12); n = len(t)
    x = np.sin(2 * np.pi * f * t) * env_hit(n, 0.001, 0.022)
    x += 0.45 * np.sin(2 * np.pi * f * 2.76 * t) * env_hit(n, 0.001, 0.009)  # ceramic partial
    x += 0.25 * np.sin(2 * np.pi * f * 0.5 * t) * env_hit(n, 0.001, 0.03)
    return stereo(room(lp(x, 5000), 0.05))


def cap_pop(f0=520, f1=900):
    """2. Subtle capacitive pop: very short rounded upward pop (iOS touch)."""
    body, f = chirp(f0, f1, 0.05, curve=0.5)
    x = body * env_swell(len(body), 0.004, 0.035)
    return stereo(room(x, 0.04))


def key_tick(scale=1.0):
    """3. Mechanical key tick: dampened scissor-switch click (typing / character reveals)."""
    n = int(0.05 * SR)
    c = bandnoise(0.05, 1800 * scale, 7000) * env_hit(n, 0.0005, 0.0035)
    b = np.sin(2 * np.pi * 2300 * scale * t_axis(0.05)) * env_hit(n, 0.0005, 0.004) * 0.3
    return stereo(room(c + b, 0.03))


def toggle():
    """4. Toggle switch glide: tiny two-stage click-clack (off -> on)."""
    a = key_tick(0.85)[:, 0]; b = key_tick(1.15)[:, 0]
    k = int(0.055 * SR); x = np.zeros(k + max(len(a), len(b)))
    x[: len(a)] += a * 0.7; x[k:k + len(b)] += b
    return stereo(x)


def drawer_bubble():
    """5. Drop-down / drawer open: soft high bubble / air release as a menu expands."""
    body, f = chirp(700, 1700, 0.11, curve=0.7)
    x = body * env_swell(len(body), 0.01, 0.07)
    air = bandnoise(0.11, 2500, 6000) * env_swell(len(body), 0.005, 0.08) * 0.08
    return stereo(room(x * 0.8 + air, 0.06))


def select_thud():
    """6. Selection thud: weighted low blip with sub (heavy card / widget snaps in)."""
    t = t_axis(0.22); n = len(t)
    f = 95 + 60 * np.exp(-t / 0.03)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_hit(n, 0.002, 0.07)
    x += 0.35 * np.sin(2 * np.pi * 420 * t) * env_hit(n, 0.001, 0.02)
    return stereo(room(lp(x, 2500), 0.05))


def air_whoosh(sec=0.22, lo=1500, hi=8000):
    """7. Airy micro-whoosh: fast clean air swish (< 15 frames) for text / icons."""
    x = bandnoise(sec, lo, hi)
    t = t_axis(sec); env = np.sin(np.pi * (t / sec) ** 0.7) ** 2
    return stereo(x * env * 0.6, 0.5)


def lp_whoosh():
    """8. Low-pass filtered whoosh: soft muffled movement for big panels."""
    x = bandnoise(0.45, 120, 2200)
    t = t_axis(0.45); env = np.sin(np.pi * (t / 0.45) ** 0.8) ** 2
    return stereo(lp(x * env, 900) * 2.5, 0.6)


def mag_snap():
    """9. Magnetic snap / lock: precise digital click as an element locks to centre."""
    n = int(0.09 * SR)
    c = bandnoise(0.09, 2500, 9000) * env_hit(n, 0.0003, 0.002)
    b = np.sin(2 * np.pi * 1650 * t_axis(0.09)) * env_hit(n, 0.0005, 0.012) * 0.5
    b += np.sin(2 * np.pi * 330 * t_axis(0.09)) * env_hit(n, 0.0005, 0.02) * 0.4
    return stereo(room(c + b, 0.05))


def glass_slide():
    """10. Glass slide: subtle smooth friction glide, no squeak."""
    sec = 0.35; x = bandnoise(sec, 900, 4500); t = t_axis(sec)
    env = np.sin(np.pi * t / sec) ** 1.5 * (0.8 + 0.2 * np.sin(2 * np.pi * 9 * t))
    return stereo(lp(x * env, 3500) * 0.7, 0.4)


def bounce_settle():
    """11. Elastic bounce settlement: micro-spring as a scale-up overshoots and settles."""
    t = t_axis(0.3); n = len(t)
    f = 640 * (1 + 0.08 * np.exp(-t / 0.06) * np.sin(2 * np.pi * 14 * t))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_hit(n, 0.003, 0.08)
    return stereo(room(x * 0.8, 0.06))


def ding(f=1046.5):
    """12. Harmonic chime (iOS-style 'ding'): pure sine/marimba note, clean tail.
    Task completion ONLY, at most once per film, never on a logo (owner: no bells)."""
    t = t_axis(1.0); n = len(t)
    x = np.sin(2 * np.pi * f * t) * env_hit(n, 0.003, 0.32)
    x += 0.3 * np.sin(2 * np.pi * f * 2 * t) * env_hit(n, 0.002, 0.12)
    x += 0.12 * np.sin(2 * np.pi * f * 4 * t) * env_hit(n, 0.001, 0.04)  # marimba bar partial
    return stereo(room(lp(x, 4000), 0.06), 0.8)


def dismiss():
    """13. Reverse chime (dismiss): short descending two notes (close / cancel)."""
    out = np.zeros(int(0.42 * SR))
    for k, f in enumerate([880.0, 659.25]):
        t = t_axis(0.3); x = np.sin(2 * np.pi * f * t) * env_hit(len(t), 0.003, 0.09)
        i = int(k * 0.09 * SR); out[i:i + len(x)] += x[: len(out) - i] * (0.9 - 0.2 * k)
    return stereo(room(lp(out, 3500), 0.05))


def pay_success():
    """14. Transaction success: bright, pleasant double tone (process completed)."""
    out = np.zeros(int(0.7 * SR))
    for k, (f1, f2) in enumerate([(783.99, 987.77), (1046.5, 1318.5)]):
        t = t_axis(0.55)
        x = (np.sin(2 * np.pi * f1 * t) + 0.7 * np.sin(2 * np.pi * f2 * t)) * env_hit(len(t), 0.004, 0.16)
        i = int(k * 0.12 * SR); out[i:i + len(x)] += x[: len(out) - i]
    return stereo(room(lp(out, 4500), 0.06), 0.6)


def sub_thud():
    """15. Haptic thud: low weight pulse you feel more than hear (heavy entrances)."""
    t = t_axis(0.35); f = 48 + 30 * np.exp(-t / 0.04)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_hit(len(t), 0.003, 0.09)
    x += 0.2 * np.sin(2 * np.pi * 2 * np.cumsum(f) / SR) * env_hit(len(t), 0.003, 0.05)  # phones hear the octave
    return stereo(x)


def ripple():
    """16. Liquid ripple / fluid bloom: soft droplet for shape morphs."""
    sec = 0.32; t = t_axis(sec)
    f = 380 + 900 * np.exp(-t / 0.025) + 60 * np.sin(2 * np.pi * 18 * t) * np.exp(-t / 0.1)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_hit(len(t), 0.002, 0.07)
    return stereo(room(lp(x, 3000), 0.08), 0.5)


def grain_puff():
    """17. Digital grain / static dust puff: high white-noise shimmer for fine type."""
    sec = 0.4; x = bandnoise(sec, 5000, 14000); t = t_axis(sec)
    grains = (rng.random(len(t)) < 0.02).astype(float)
    env = np.sin(np.pi * (t / sec) ** 0.6) ** 2
    return stereo((x * 0.25 + grains * 0.6 * bandnoise(sec, 6000, 14000)) * env * 0.5, 0.7)


def pad_swell():
    """18. Harmonic pad swell: warm single sus2 swell under a reveal / logo lockup."""
    t = t_axis(2.2); env = np.clip(t / 0.7, 0, 1) ** 2 * np.exp(-np.maximum(0, t - 0.7) / 0.6)
    x = np.zeros_like(t)
    for f, a in [(146.83, 1), (164.81, 0.7), (220.0, 0.8), (293.66, 0.5)]:  # D3 E3 A3 D4 = Dsus2
        for det in (-0.5, 0.5): x += a * 0.5 * np.sin(2 * np.pi * (f + det) * t)
    return stereo(room(lp(x * env, 1600), 0.1), 3.0)


def iris():
    """19. Mechanical iris focus: tight aperture click-whir when zooming into a detail."""
    sec = 0.28; t = t_axis(sec); n = len(t)
    whir = bandnoise(sec, 1500, 5000) * (0.6 + 0.4 * np.sin(2 * np.pi * 110 * t)) * env_swell(n, 0.02, 0.1) * 0.35
    out = whir.copy()
    c = key_tick(1.3)[:, 0]; k = int(0.21 * SR); out[k:k + len(c)] += c[: n - k] * 0.9
    return stereo(room(out, 0.04))

# 20. The final silence: not a sound. End every film with a clean tail (no SFX,
#     the music stopped or faded) so the last frame carries the weight.


def write(path, x):
    x = norm(x)
    pcm = (np.clip(x, -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--out", default="audio"); a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    bank = {
        # alternate blip-1/2/3 on consecutive reveals so repeats never sound robotic
        "blip-1": blip(420, 700), "blip-2": blip(485, 805), "blip-3": blip(365, 610),
        "tap-1": tap(1.0), "tap-2": tap(1.06),
        "swish-down": swish(2600, 520), "swish-up": swish(520, 2100),
        "tick-1": tick(730), "tick-2": tick(860),
        "chord-win": chord_win(),
        "bloop-1": bloop(1350, 1900, 1500), "bloop-2": bloop(1200, 1700, 1350),
        "sting-logo": sting_logo(), "swell-in": swell_in(),
        # standard UI palette (owner 2026-11-01) — SKILL.md "Standard UI sound palette"
        "ui-tap-1": glass_tap(1180), "ui-tap-2": glass_tap(1290), "ui-pop-1": cap_pop(520, 900), "ui-pop-2": cap_pop(600, 1020),
        "ui-key-1": key_tick(1.0), "ui-key-2": key_tick(1.12), "ui-toggle": toggle(), "ui-drawer": drawer_bubble(),
        "ui-thud": select_thud(), "ui-whoosh-1": air_whoosh(), "ui-whoosh-2": air_whoosh(0.2, 1800, 9000),
        "ui-whoosh-low": lp_whoosh(), "ui-snap": mag_snap(), "ui-slide": glass_slide(), "ui-bounce": bounce_settle(),
        "ui-ding": ding(), "ui-dismiss": dismiss(), "ui-success": pay_success(), "ui-sub": sub_thud(),
        "ui-ripple": ripple(), "ui-grain": grain_puff(), "ui-pad": pad_swell(), "ui-iris": iris(),
    }
    for k, v in bank.items():
        write(os.path.join(a.out, f"{k}.wav"), v)
    print("wrote", ", ".join(bank), "->", a.out)
