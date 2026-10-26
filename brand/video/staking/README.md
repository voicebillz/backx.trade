# Staking teaser (5 s, owner 2026-10-26)

X post text: **Staking protocol initiating**. 1080×1080, 60 fps, no music: soft tap sounds only.
Story: "Staking protocol / initiating" (full text from frame 1, it is the thumbnail) → stake card rises → $GAZZ counts to
250,000 → three real Gazz Tanks (#12, #1, #58, art read on-chain from tokenURI) ticked by a tap → Points 550,000
(100,000 per Tank) → tap "Stake" → "Staked · locked 90 days" + USDC rewards streaming → end card. Yellow progress bar
runs across the top for the whole 5 s.

Render: `node render.cjs frames` (Playwright, `seek(t)` per frame, writes `frames/` and `cues.json`), then
`python3 mix.py .` (taps from `audio/tap-soft.wav` = Mixkit sfx 1124 "Plastic bubble click" and `audio/tap-deep.wav` =
sfx 1120 "Modern click box check", both low-passed and trimmed; audio files not committed, see ../AUDIO-LICENSES.txt),
then encode: `ffmpeg -framerate 60 -i frames/f%04d.png -i mix.wav -c:v libx264 -preset slow -tune animation -b:v 10M
-pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart` and raise the taps with `volume=6dB,alimiter=limit=0.84`
(−22.6 LUFS, peak −1.3 dBFS: sparse taps cannot reach −16 LUFS without clipping).
Output: `brand/marketing/backx-staking-5s.mp4`.
