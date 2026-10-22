# BackX intro video

`comp.html` is the whole video as a function of time (`seek(t)`), built with the gazz.fun video recipe:
120 BPM grid (beat 0.5 s), one chain token flipping on every beat, the token lands as the backx mark on the
music's drop (6.0 s), motto flip on the downbeat (12.0 s). Sound cues live in the code next to each motion
(`window.CUES`, written to `cues.json`).

Render (4K, 60 fps) and mix: serve this folder, `render.mjs --url …/comp.html --out video-4k-noaudio.mp4`,
then `mix.py --cues cues.json --music audio/music-120-corporate.wav --music-start 23.471 --sfx-dir audio`
(−14 LUFS, true peak −1.5 dBTP), then `render.mjs --mux`. Audio is Mixkit (free licence, see
`AUDIO-LICENSES.txt`); the audio files themselves are not committed. Chain logos: Uniswap interface repo.
Outputs: `brand/marketing/backx-intro-4k.mp4`, `backx-intro-1080p.mp4`.
