# BackX intro video

`comp.html` is the whole video as a function of time (`seek(t)`), built with the gazz.fun video recipe:
120 BPM grid (beat 0.5 s), one chain token flipping on every beat, the token lands as the backx mark on the
music's drop (6.0 s), motto flip on the downbeat (12.0 s). Sound cues live in the code next to each motion
(`window.CUES`, written to `cues.json`).

Render (4K, 60 fps) and mix: serve this folder, `render.mjs --url …/comp.html --out video-4k-noaudio.mp4`,
then `python3 mix-sfx.py --no-music --cues cues.json --music none --sfx-dir audio --out mix.wav`
(motion sounds only, no music: owner 2026-10-22; limiter, loudnorm, true peak −1.5 dBTP), then `render.mjs --mux`.
The 120 BPM grid is kept for timing. Audio is Mixkit (free licence, see
`AUDIO-LICENSES.txt`); the audio files themselves are not committed. Chain logos: Uniswap interface repo.
Outputs: `brand/marketing/backx-intro-4k.mp4`, `backx-intro-1080p.mp4`.
