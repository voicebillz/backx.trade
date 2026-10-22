# BackX intro video

`comp.html` is the whole video as a function of time (`seek(t)`), built with the gazz.fun video recipe:
120 BPM grid (beat 0.5 s): six chain tokens flip one per beat (Robinhood, BNB Chain, Base, Ethereum, Arbitrum,
Polygon), the last one lands in an all-chains grid (23 real logos + "+", "20+ chains. More coming."), the grid
collapses into the backx wordmark (8.0 s), motto flip at 13.5 s. Sound cues live in the code next to each motion
(`window.CUES`, written to `cues.json`).

Render (4K, 60 fps) and mix: serve this folder, `render.mjs --url …/comp.html --out video-4k-noaudio.mp4`,
then `python3 mix-sfx.py --no-music --lufs -16 --cues cues.json --music none --sfx-dir audio --out mix.wav`
(motion sounds only, no music: owner 2026-10-22; limiter, loudnorm, true peak −1.5 dBTP), then `render.mjs --mux`.
The 120 BPM grid is kept for timing. Audio is Mixkit (free licence, see
`AUDIO-LICENSES.txt`); the audio files themselves are not committed. Chain logos are the real ones: Base from base/brand-kit (in-product logo, SVG), Optimism from
ethereum-optimism.github.io (optimism.svg), the rest from Uniswap's interface repo. Always use real logos.
Outputs: `brand/marketing/backx-intro-4k.mp4`, `backx-intro-1080p.mp4`. Quality (owner 2026-10-22): render at `--crf 8`
with `-tune animation -x264-params aq-mode=3`, then deliver 4K at ~20 Mbit/s target and 1080p at ~10 Mbit/s
(`-preset slow`, AAC 192k, `+faststart`). The old 1.4 Mbit/s 4K looked soft in motion.
