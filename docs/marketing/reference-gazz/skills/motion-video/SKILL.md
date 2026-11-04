---
name: motion-video
description: Make Apple-style SaaS explainer and motion-graphics launch videos entirely in code (one HTML composition with seek(t), Playwright frame capture, ffmpeg), with real music and sound effects, rendered at 4K. Use whenever the owner asks for a launch video, explainer, product teaser, motion graphics, "Apple-style video", feature reveal, app promo, animated announcement or a video for X / the site, even if they don't say "motion graphics". Also use to revise an existing video from director notes. DEFAULT STYLE for every promo/hype/viral video is the owner-mandated Pump.fun-style recipe (recipes/viral-promo + the "Viral promo recipe" section): 1-5 word blur-in phrases, one lime hue family, real faces and objects in depth, focus-pull transitions, music only (voice-over only when the owner asks — recipes/trading-promo), plain ui-* UI sounds, soft chord-win on wins.
---

# Motion video studio (SaaS explainers and launch videos)

> **VIKTIG (eier 2026-11-01): every promo, hype or product video follows the
> "Viral promo recipe" below and starts from `recipes/viral-promo/comp.html`.**
> Too much text on screen is the #1 failure: count the words on every QA still.
> The narrated recipe is only for videos the owner explicitly wants narrated.

Built from the "How I make $10K launch videos for $0 with Opus 5.5" course
(twoclipping) plus everything learned shipping the gazz.fun App Mode video.
Every frame is code: one HTML file draws any moment via `seek(t)`, Playwright
screenshots each frame, ffmpeg encodes. No After Effects, no editor, no MCP.

Read the whole file before starting. The rules in "What makes it look
expensive" are the difference between a $15k video and a PowerPoint.

## Kit (in this skill directory)

| File | What it does |
|---|---|
| `template/comp.html` | Composition skeleton: 1920x1080 stage, easing + spring helpers, camera, kinetic text lines, SFX cue list, `window.seek(t)`, `READY`/`BOOT_ERR` handshake. Copy it, then build scenes. |
| `scripts/render.mjs` | Parallel frame renderer → segments → concatenated MP4, optional audio mux. 4K by default (1920x1080 at DPR 2 = 3840x2160), 60 fps, h264 CRF 15. |
| `scripts/mix.py` | Music + timed SFX from the composition's `CUES`, two-pass loudnorm to -14 LUFS / -1.5 dBTP. |
| `scripts/preview.mjs` | QA stills at chosen times + a contact sheet, at low DPR for speed. |
| `scripts/fetch-audio.py` + `audio-sources.json` | Downloads the curated Mixkit music beds (with BPM + first beat) and SFX palette as 48 kHz WAVs and writes `LICENSES.txt`. Never commit the audio itself. |
| `recipes/viral-promo/` | **Default for hype/product promos** (StockSlot Battles v2, 2026-11-01, built from the Pump.fun study): `comp.html` with blur-in phrases, focus-pull scene changes, light/dark grounds in one hue family, perspective grid tunnel, halftone dissolve, faces + objects orbiting in depth, a dark product card on the light ground, iris wipe from a UI element. Music only. |
| `recipes/narrated-feature/` | **The owner-approved recipe** (GazzPad v4 video, 2026-10-30, «was very good»): `comp.html` (7 scenes, one morphing dark plate, voiceover-timed), `vo-timing.sh` (pause detection → sentence times), `mix-vo.sh` (VO + ducked bed → -14 LUFS). START HERE for any narrated product/feature video. |
| `recipes/funds-promo/` | Viral-promo look on REAL site captures, music only (Investment Funds video, 2026-11-03): `crops.mjs` (element-precise crops of the live site by CSS selector at DPR 3: fund list, fund header/chart/holdings/buy panel, raffle split + chips), `comp.html` (real fund logos in depth for the hook, a tap + ring on a real UI line, an animated fee-split bar with labels + the live page as proof, a `TRUTH` block naming where every on-screen number was verified). Music "Close Up" 105 BPM from bar 5 (11.481 s), one scene per 2 bars. |
| `recipes/profiles-promo/` | **Light, voiced X post** (Public Profiles video, 2026-11-03): `comp.html` rebuilds the real profile in crisp HTML from the light-theme tokens (header + Follow tap, Predict P&L card that really flips to StockSlot P&L, four stat tiles snapping into one strip, real lobby-card win tiles with a camera lean, thesis cards + reader overlay), opens on the hook pattern in "Short-form hook rules", ElevenLabs voice cut into `vo-1..8`, illustrative numbers (optional "Demo profile" pill behind `SHOW_DEMO_BADGE` / `?demo=1`, OFF by default). 16:9 4K only. |

Work in the scratchpad (`<scratchpad>/<video-name>/`), never in the repo.
Deliverables go to the user with SendUserFile.

## Workflow

0. **Narrated feature/launch video? Use `recipes/narrated-feature`** (see
   "Recipe: narrated Apple-style feature video" below) and adapt its scenes;
   don't start from the bare template.
1. **Steal the idea (brief).** Start from something that exists: a Dribbble
   UI animation, an Apple keynote moment, another product's promo. No
   reference? Write 3 concepts for the product and pick one. Default to a
   **2D white, minimal, premium** look. Claude drifts to dark 3D by default
   and it reads cheap; only go dark when the brand or brief asks for it.
2. **Script on a beat grid.** Pick the music first (tempo decides the grid:
   120 BPM = beat 0.5 s, bar 2.0 s). Write a timeline table: second → what
   is on screen → which sound. Something happens on every beat. Keep it
   short: 20-45 s for a launch/explainer, one idea per scene.
3. **Assets (all free, real).** Music: a NEW track that fits this video's
   mood every time (see "Music sourcing"); never reuse the last video's bed.
   SFX: mixkit.co/free-sound-effects. Footage/photos: pexels.com. Fonts:
   fonts.google.com (self-host the woff2 next to the comp). Product UI:
   real screenshots/clips captured from the live site with Playwright
   (see Capturing the live product). Always real sound effects; synthesized
   ones sound cheap. Record every source + license in `LICENSES.txt`.
4. **Build the composition** from `template/comp.html`. One file, pure
   function of `t`. Every scene is computed from `t`, nothing uses timers,
   CSS animations or `requestAnimationFrame` (they don't seek).
5. **QA stills before rendering** with `scripts/preview.mjs` at the key
   moments (every scene start/mid/end). Read the contact sheet yourself and
   fix layout, overlaps, clipping, contrast and copy before any full render.
6. **Render** with `scripts/render.mjs` (parallel workers; a 30 s 4K/60
   video is ~1800 frames). Then mix audio with `scripts/mix.py` and mux.
7. **Check your own work** (rule 7): pull 1:1 crops of the final MP4 at a
   few timestamps with ffmpeg and look at them; confirm duration, fps,
   resolution, audio loudness and that the last frame isn't cut.
8. **Deliver and take director notes.** The owner gives notes like a
   director ("too slow", "that fade looks cheap, make it change shape",
   "make the zoom hit on the drop"). Usually 2-3 rounds.

## What makes it look expensive (non-negotiable)

1. **Nothing fades in. Things change shape.** A button grows into the next
   page; a card morphs into a chart; a dot stretches into a bar. Animate
   size, radius, clip and position between states instead of opacity.
2. **No cuts.** Every scene comes out of the last one (a shared element
   carries over, the camera travels, or a shape morphs).
3. **Something happens on every beat** of the music. Land key moments on
   bars, small accents on beats, and the biggest reveal on the drop.
4. **Things bounce a tiny bit when they land**, like real objects. Use the
   damped `spring()` (zeta about 0.72, about 4% overshoot). Never bounce
   UI that merely appears; bounce what lands or is thrown.
5. **The camera does one move at a time.** Zoom, OR pan, OR settle. Never
   all at once. Ease-in-out for camera, strong ease-out for enters.
6. **Every click and whoosh has a real sound**, timed to the frame the
   visual happens (add a cue in the same place in code that drives the
   motion so they can't drift).
7. **It checks its own work** before anyone watches (QA stills + final
   crops).

Craft details that compound: kinetic type revealed line by line from a clip
(text rises out of a mask), tabular numbers that count up, real cursor/tap
indicators on clicks, soft physical shadows on white, one accent colour per
scene, generous negative space, nothing smaller than 24 px at 1080p.

## Copy rules

Short, confident, product-true. One idea per line, max ~8 words on screen at
once. For gazz.fun also follow the `ct-post` voice rules: no emoji, no
hashtags, no em dashes or `--`, never claim a partnership/listing/approval
that isn't confirmed, no price promises or financial advice. Only show
numbers that are real (pull them live) or clearly illustrative. Never
reveal anything the product deliberately keeps hidden (e.g. the Agentic
Reserve never shows a burn plan before it executes).

## Real stock media — photos + footage from several free sources (owner 2026-10-16)

The owner wants videos (and images) to mix REAL free imagery from different
places — money, chips, cards, people at a table — with the product UI. Use
`scripts/fetch-stock.py`; it logs every file's source, author and licence to
`<out>/LICENSES.txt` (keep that file with the deliverable).

```bash
python3 <skill>/scripts/fetch-stock.py mixkit-search poker            # list clip slugs
python3 <skill>/scripts/fetch-stock.py mixkit-get --out media <slug> <slug>
python3 <skill>/scripts/fetch-stock.py openverse "dollar bills" --n 20  # list CC0/PD stills
python3 <skill>/scripts/fetch-stock.py openverse "dollar bills" --pick <id>,<id> --out media
```

- **Sources that work from this sandbox:** Mixkit video (free licence, no
  credit), Openverse → Flickr (PDM/CC0), rawpixel (CC0), StockSnap (CC0),
  WordPress Photos (CC0). Default to `cc0,pdm` so no on-screen credit is
  needed. Pexels/Pixabay pages are bot-walled (403) and Wikimedia rate-limits
  this IP (429) — skip them.
- **Resolution honesty:** Mixkit is ≤1080p, Openverse stills ~1024 px. In a
  4K (DPR 2) comp show a clip at ≤960 CSS px and a still at ≤ its own width/2
  CSS px — framed (rounded window, polaroid), never stretched. Full-bleed
  footage only as a background with `blur(20px+) brightness(≤0.35)`.
- **Footage in a seek(t) comp:** extract frames once
  (`ffmpeg -i clip.mp4 -vf "fps=30,scale=1920:-2" -q:v 3 fr/c1/%04d.jpg`) and
  swap `img.src` per frame; make `seek()` async and `await img.decode()` —
  `render.mjs` awaits the promise, so every frame is complete. (Playwright's
  Chromium has no H.264, so `<video>` is not an option.)
- **Product UI:** capture with a local harness at `deviceScaleFactor: 3`,
  transparent page background (`omitBackground`), and let entrance
  animations finish before the shot (pausing them mid-fade gave transparent
  cards).
- **Images (posters, banners) follow the same rules:** real stills as framed
  elements, licences logged, CLAUDE.md asset rules for the final size.

## Composition architecture (`template/comp.html`)

- Stage is 1920x1080 CSS px; rendered at DPR 2 → 3840x2160 output. Design
  in 1080p units; the DPR gives true 4K detail. Never upscale a smaller
  render (CLAUDE.md asset rule: real high-resolution source, verify with a
  1:1 crop).
- Helpers: `clamp`, `lerp`, `prog(t, t0, d)`, cubic-bezier `bez()` with the
  presets `EO` (enter), `EIO` (camera/on-screen move), `DR` (drawer), `EI`
  (exit), and `spring(p, zeta)` / `sp(t, t0, d, zeta)`.
- `cue(t, sfxName, gain)` registers sound effects next to the motion that
  needs them; `window.CUES` + `window.DUR` are exported for the mixer.
- `build()` creates DOM nodes once; `seek(t)` only sets styles from `t`.
  It must be a pure function: seeking to 12.3 s twice gives identical frames.
- Boot handshake: set `window.READY = true` after fonts/images decode; on
  failure set `window.BOOT_ERR`. The renderer waits for either.
- Load fonts with `document.fonts.load(...)` and images with
  `img.decode()` before READY, or the first frames render with fallbacks.
- Loops (for site embeds/GIFs) must be mathematically periodic: the last
  frame continues perfectly into the first.

## Rendering

```bash
cp -r <skill>/template/* <work>/ && cd <work>   # comp.html + fonts/
python3 <skill>/scripts/fetch-audio.py --out audio   # music + SFX + LICENSES.txt
python3 -m http.server 8765 &   # serve over http (file:// breaks fonts/decode)
node <skill>/scripts/preview.mjs --url http://127.0.0.1:8765/comp.html --times 0,2,4.5,8 --out qa
node <skill>/scripts/render.mjs  --url http://127.0.0.1:8765/comp.html --out video-4k-noaudio.mp4 --workers 4
python3 <skill>/scripts/mix.py   --cues cues.json --music audio/music-120-corporate.wav --music-start 13.471 --sfx-dir audio --out mix.wav
node <skill>/scripts/render.mjs  --mux video-4k-noaudio.mp4 --audio mix.wav --out video-4k.mp4
```

`render.mjs` writes `cues.json` (from `window.CUES`) on the first run.
ffmpeg comes from `imageio_ffmpeg` if `ffmpeg` isn't on PATH; Playwright's
Chromium is preinstalled (`PLAYWRIGHT_BROWSERS_PATH`, never `playwright
install`). The scripts fall back to the global `npm root -g` install of
`playwright` when it isn't resolvable locally. `--music-start` = the
track's `first_beat_s` (from `audio-sources.json`) plus whole bars, so t=0
of the video sits on a downbeat. In `CUES`, `g` is an accent relative to
that sound family's target level over the music (1 = normal, 0.5 = -6 dB).

### Output formats (CLAUDE.md asset rules)

- **MP4 always**: h264, `-preset slow -crf 14-16 -pix_fmt yuv420p`, 60 fps
  (or 30 for social if size matters), AAC 192k+ audio. Recommend MP4 over
  GIF everywhere video is supported (X posts, OpenSea banners).
- **1080p companion** for X when the 4K file is large:
  `ffmpeg -i video-4k.mp4 -vf scale=1920:-2:flags=lanczos -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -c:a copy video-1080p.mp4`.
- **GIF only on request**: `palettegen` + `paletteuse=dither=sierra2_4a`
  (never bayer). X GIF limit 15 MB; above that ship MP4. X header images
  are static only.

## Audio

- Music sets the grid. Trim with `--music-start` so the drop lands on your
  hero moment; fade in 0.1 s, fade out the last ~2 s.
- SFX palette that works for UI explainers: soft pop (elements landing),
  fast/soft whoosh (camera moves, morphs), two alternating UI clicks (taps,
  so repeated clicks don't sound robotic), success chime, notification pop,
  short riser into the drop, soft impact on the final logo/title.
- Gains: clicks ~0.8, pops 0.2-0.7, whooshes 0.2-0.45, impact ~0.85, music
  bed ~0.6 before normalization. Stagger repeated pops slightly in gain.
- The mixer does two-pass `loudnorm` to I=-14, TP=-1.5 (social standard).

### The "smooth" SFX family (owner 2026-10-22, DEFAULT for UI/motion graphics)

Measured on a reference fintech launch film the owner picked (music stripped
with a REPET/nn_filter split, events read from the spectrogram): the motion
graphics carry SHORT TONAL sounds tucked just above the bed, not noisy air
whooshes. `scripts/make-sfx.py --out audio` writes the matching bank
(48 kHz stereo, deterministic):

| cue | sound | use it for | level in mix.py |
|---|---|---|---|
| `blip-1/2/3` | 85 ms sine, soft 45-60 ms swell-in, ~+0.45 oct up-glide, faint click | every text / logo / card / pill reveal; ALTERNATE 1-2-3 | +7 dB over bed |
| `tap-1/2` | ~100 ms bright click + 620/1240 Hz body | taps, button presses, cursor clicks; alternate | +3 dB |
| `swish-down` / `swish-up` | 170 ms thin pitch sweep 2.6 kHz <-> 520 Hz + faint air | scene slides, morphs, camera moves (down = out, up = in) | 0 dB |
| `tick-1/2` | 60 ms ~730/860 Hz ping | counters, small notifications, list items | +2 dB |
| `chord-win` | 1.1 s soft major-9 swell + 62 Hz thump, low-passed 2.6 kHz | big wins, jackpots, the winner moment (NEVER a bright chime/bell) | +3 dB |
| `bloop-1/2` | 150 ms tonal arc up then down, 1.2-1.9 kHz | icon / coin / object pops (Pump.fun style) | +4 dB |
| `sting-logo` | WARM, LOW: sub boom 58→41 Hz + slow pad C3-G4, low-passed 1.4 kHz, 2.4 s tail | the end-card logo, after `@stop` cuts the music (cue g ~2.2) | +4 dB |
| `swell-in` | 0.45 s filtered-noise swell that stops on the hit | 0.45 s before the logo hit | -4 dB |
| `@lowpass` / `@stop` | bed automation in mix.py (not a sound) | audio focus pull on transitions / music cut before the logo sting | — |

- A blip peaks ~55 ms after it starts: place the cue ~40 ms BEFORE the
  visual so the peak lands one frame after the picture.
- Keep Mixkit for the organic layer only: success chime, typing, the riser
  into the drop and the soft impact on the final logo. No `whoosh-*` air
  sweeps in UI scenes any more.
- These are sound-designed on purpose (the reference is too); the "real SFX,
  never synthesized" rule still applies to anything organic.

### Standard UI sound palette (owner 2026-11-01 — "normal clicking/bubble sounds, nothing fancy")

The owner's list of what "normal motion-graphics sounds" are. `make-sfx.py`
synthesizes every item as `ui-*` (short, warm, band-limited, no bells);
`mix.py` knows each one's level over the bed. Use MOSTLY taps / pops /
whooshes / snaps; at most ONE ding or success tone per film; never a bell or
chime on the logo; max one effect per ~1.5 s; end on silence.

| # | sound | when to use | cue (`make-sfx.py`) |
|---|---|---|---|
| 1 | Soft glass / ceramic tap | button presses, menu selections, a tap indicator | `ui-tap-1/2` |
| 2 | Subtle capacitive pop | small elements appearing, chips, iOS-style touch feedback | `ui-pop-1/2` |
| 3 | Mechanical key tick | typing, character-by-character reveals, a highlight stepping | `ui-key-1/2` |
| 4 | Toggle switch glide | a switch / direction flip (off → on, swap arrows) | `ui-toggle` |
| 5 | Drop-down / drawer open | a menu or sheet expanding | `ui-drawer` |
| 6 | Selection thud (low-end blip) | heavy cards / widgets snapping into place | `ui-thud` |
| 7 | Airy micro-whoosh (< 15 frames) | moving text or icons | `ui-whoosh-1/2` |
| 8 | Low-pass filtered whoosh | big UI panels sliding across the screen | `ui-whoosh-low` |
| 9 | Magnetic snap / lock | an element locking to the grid / centre | `ui-snap` |
| 10 | Glass slide / friction glide | a card gliding over the surface | `ui-slide` |
| 11 | Elastic bounce settlement | a scale-up that overshoots and settles | `ui-bounce` |
| 12 | Harmonic chime ("ding") | task completion — max once, never on the logo | `ui-ding` |
| 13 | Reverse chime (dismiss) | a window closing, an action cancelled | `ui-dismiss` |
| 14 | Transaction success tone | a completed process / the hero number landing (max once) | `ui-success` |
| 15 | Haptic sub thud | heavy entrances, the logo landing (felt, not heard) | `ui-sub` |
| 16 | Liquid ripple / fluid bloom | shapes morphing, blobs | `ui-ripple` |
| 17 | Digital grain puff | fine typography or particles fading in | `ui-grain` |
| 18 | Harmonic pad swell (sus2) | quietly under a product reveal / logo lockup | `ui-pad` |
| 19 | Mechanical iris focus | zooming into a UI detail or screen | `ui-iris` |
| 20 | The final silence | not a sound: the last 1.5-2 s stay clean (music stopped / faded, no SFX) | `@stop` with `d` ≈ 0.8 |

Levels (dB over the bed, in `mix.py` TARGET): taps/pops +3, thud +3, sub +4,
snap +2, drawer/ripple/bounce/success +1, toggle/ding/dismiss 0, key -2,
iris/pad -2, whoosh -4, low whoosh -5, slide -6, grain -8.

### Voice-over inside mix.py (2026-11-01)

Owner-requested voice films: cut the ElevenLabs take into one WAV per line
(`vo-1.wav` …, silencedetect at -38 dB finds the breaks), place them as cues
`cue(t, "vo-1")` in the comp, and `mix.py` treats every `vo*` cue as voice:
no level matching, summed on a voice bus that sidechain-ducks the music by
`--duck-db` (default 11 dB) while it speaks. Put the visual for each spoken
noun on the word (measure word times inside a line from the same silence
list). The narrated recipe's `mix-vo.sh` path (one take over a finished bed)
still works too.

## Capturing the live product (gazz.fun)

- Use Playwright against `https://gazz.fun` (or a local `vite` build) and
  screenshot ELEMENT clips at DPR 2-3 (`element.screenshot()`), not whole
  pages. Use phone viewport 390x844 for app UI.
- Sandbox TLS: Chromium rejects the egress proxy's certificate
  (`ERR_CERT_AUTHORITY_INVALID`). Launch with
  `--ignore-certificate-errors-spki-list=<pin>` where the pin is the
  SPKI SHA-256 (base64) of the proxy CA in `/root/.ccr/ca-bundle.crt`.
- Local `vite` builds need `VITE_PRIVY_APP_ID` in the process env (the
  public app id from the production bundle) or the app stops at "Sign-in is
  being configured". Never write it to the repo.
- Hide the announcement banner (`.site-ann{display:none!important}`) and
  seed `localStorage` (theme, timeframe, dock tab) in an init script.
- Mock only what must be illustrative (route the API call and fulfill it
  with clearly realistic data); keep everything else live.
- Rebuild key UI elements (buttons, pills, nav) as crisp HTML in the comp
  using the probed real styles (colors, radii, fonts) when they need to
  morph; use screenshots for dense content (charts, lists).

## Director-notes loop

Treat notes as visual intent, not code instructions. Re-render only the
affected time range with `--from/--to` when iterating, check stills, then a
full render. Keep every delivered version (`-v1`, `-v2`) until the owner
picks one.

## Motion Lab additions (owner PDF "Opus 5.5 Motion Lab", flxrnc, Sep 2026)

Numbers instead of adjectives. Adjectives get the model's default look; every
number in the brief is a decision taken back.

- **Brief template:** SUBJECT (one idea per shot) / TIME (seconds and frames) /
  PALETTE (hex, one accent) / TYPE (face, px, tracking) / SHOTS (frame range,
  one hero move, the handoff) / EASING (a bezier, not a word) / HOLDS / BANS /
  LOOP / QA.
- **Curves:** enter `cubic-bezier(0.16,1,0.3,1)`, on-screen move
  `(0.76,0,0.24,1)`, exit `(0.7,0,0.84,0)` made 40-50% shorter than the enter,
  pop `(0.34,1.56,0.64,1)`. Linear only for rotation, progress bars and loop
  phase. Camera gets the softest curve (ease-in-out-quart).
- **Springs by damping ratio:** 1.0 UI and text (no bounce), 0.7-0.85 premium
  product motion, 0.5 playful. Position and size may bounce; opacity and
  colour never do.
- **Durations / stagger:** UI feedback 100-200 ms, UI moves 200-500 ms, hero
  reveals 600-900 ms. Letters 1 frame (20-40 ms), words 60-120 ms, list items
  40-80 ms; the next element starts when the previous is 30-50% done.
- **Hierarchy:** one hero move per shot. Secondary moves travel 50-70% as far
  and start 100-200 ms later; ambient motion stays under 5% of the hero's.
- **Holds:** text stays on screen at least 0.3 s per word + 0.5 s, never moves
  while it is read, and a slow 2% push keeps the hold alive.
- **Beat grid:** compute every beat as `n * 60 / BPM` from time (adding rounded
  frame counts drifts). Cut on the beat, change layout on the bar.
- **Ban list to start from:** decorative purple/blue gradients, glow and lens
  flares, floating particles, everything fading in at once, fade-and-slide-up
  on every element, centred-everything, text moving while read. After each
  first render, name the defaults that crept in and ban them too.
- **Sound:** each hit lands 1 frame AFTER its picture (light before sound).
  -14 LUFS, true peak -1 to -1.5 dBTP. Measure the bed: if >50% of its energy
  sits under 60 Hz it plays as nothing on phones (high-pass ~30 Hz + low-shelf
  -4 to -9 dB at 80 Hz). SFX only 0.5-1.6 dB over the bed are inaudible.
- **Accessibility:** 4.5:1 text contrast on every frame; never more than 3
  flashes per second (one flash-to-white per reveal is fine).
- **Loops:** render frames 0..N-1 (never N), whole-number cycles, noise
  sampled on a circle; frame 0 should be a finished composition.
- **Review tools:** support `comp.html?t=2.5` (seek on boot) to freeze any
  frame; 12-frame contact sheets; onion skin (even spacing = robotic) and
  speed graphs (sharp corners = dead starts) for easing problems. Write notes
  with frame numbers and translate feelings: "make it pop" = scale
  1.0-1.08-1.0 over 6 frames peaking on the beat; "premium" = ease-out-quint,
  springs at 0.8, no overshoot on text; "it drags" = cut each hold by one
  beat; "busy" = one hero, everything else 150 ms later at 60% travel.
- **Phone exaggeration:** push key poses 10-30% further than feels right.
- **Optional motion blur** for fast 3D: average subframes across half a frame
  in linear light (180-degree shutter).
- **GIF timing trap:** delays are stored in 1/100 s; at 24 fps alternate
  5 x 40 ms + 1 x 50 ms to stay on the grid.

### Learned on the StockSlot launch video (2026-10-11)

- **Hide with `display`, not `visibility`:** a child that sets
  `visibility: visible` shows through a hidden parent. A `show()` helper must
  also remember the element's own inline display (flex) instead of clearing it.
- **One picture, many tracks:** render the master once on a fixed grid
  (e.g. 100 BPM, every cut on an even beat = 1.2 s). Per track: fit tempo and
  phase locally over the excerpt (global estimates drift by up to 1/3 beat;
  triplet hats fool onset combs, so confirm the downbeat on the real
  transient), `atempo` onto the grid (stay within about +-15%; use a 3:2
  relation for fast tracks, e.g. 160 -> 150 BPM against 100), pick the offset
  so a real section change lands on the hero hit, then verify by measurement
  (onset strength on master beats vs off-beats, energy rise at the drop).
- **9:16 from the same comp:** `?v=1` swaps W/H and a layout table. The kit's
  `render.mjs`/`preview.mjs` hard-code a 1920x1080 viewport; for a vertical
  cut use copies with `--w 1080 --h 1920`.
- **Port real product components as SVG** (e.g. the VIP `TierBadge`) instead of
  screenshotting them: crisp at 4K and animatable. Prefer ticker tiles in brand
  colours over third-party company logos in promo footage.


## Viral promo recipe — learned from Pump.fun launch films (owner 2026-11-01)

The owner's verdict on our Battles v1: «too text-wise, too much info on the
clips». Three Pump.fun films (Layer chain, Hyperliquid perps, Creators
program, 5-45 s, 1080p60, music only, no voice) are the reference for every
hype/product promo from now on. What they do, measured frame by frame:

**Copy: a word, not a paragraph.**
- ONE phrase per beat, 1-5 words ("Pick your market", "Go long or short",
  "From memes", "No bridging required"). Never a caption + a title + a UI
  label on screen at once. If the UI already says it, the copy says nothing.
- Medium weight (500-600), sentence case, ~56-84 px at 1080p, centred.
  Heavy 800 caps only for ONE hero moment per film.
- A single keyword can carry the accent colour ("trading **volume** sets
  your **rank**"); everything else stays ink.
- Numbers are the hero: one giant number (40X, $100,000) at 360-520 px,
  regular weight, with a small sub line underneath ("Up to 40x leverage on
  Bitcoin") that types in word by word.

**Text motion: focus, not masks.**
- Words arrive word by word with a BLUR-IN: blur 14 px → 0, opacity 0 → 1,
  drift 18-30 px from the right (or scale 1.06 → 1), ~0.35 s each, stagger
  90-140 ms. They leave the same way (blur out, 0.25 s). Our clip-rise is
  retired for promo films.
- The next phrase often grows out of the previous one in place (the line
  keeps its centre, words are added after it) instead of a scene change.

**Colour: one hue family, two grounds.**
- Every frame is built from ONE brand hue in 5 steps (deep, dark, mid,
  mint, pale) plus white and ink. Pump: #0c2821 / #233f38 / #3e7055 /
  #7ad094 / #afefc2 + #fffeff + #0e1816. A second hue appears only on a
  single keyword or a logo.
- Two grounds alternate by idea: LIGHT (white with a soft brand-tint
  gradient rising from the bottom 35 %) and DARK (deep brand tone with a
  radial light in the centre, never flat black). Flat full-screen brand
  colour floods are banned — they read as a flash.
- gazz.fun family to use: deep #0f1407, dark #1b2610, mid #4f7a1c, lime
  #b8f43a, pale #ecfccb, white #fbfdf7, ink #0b0f06; accent #8b5cf6 (one
  word at most), teal #38e8d0 only inside the brand gradient.

**Depth, objects and texture.**
- Real objects float in 3D depth around the copy: coins/logos as thick
  3D discs, product art, avatars. Near ones larger and blurred (depth of
  field 6-14 px), far ones small and sharp; they orbit or drift slowly and
  pass IN FRONT of hero numbers (the coin covers the "0" of 40X).
- Backgrounds carry quiet texture: perspective grid tunnel (1 px lines at
  25-35 % alpha), bundles of thin wave lines, halftone dot matrix that
  dissolves in/out, soft blobs. Never decorative particles or glow.
- Product UI appears as real dark cards (radius 24-28, big soft shadow,
  slight perspective tilt 4-8°) on the light ground, with a cursor that
  taps and numbers that count. One card per idea.
- Faces/avatars: real photos in circles (never letter discs). For people
  shown as players or customers, use AI-generated portraits (OpenArt) so no
  real person's likeness is used without consent. One Nano Banana 2 render
  at 4K of a 4x2 grid of studio headshots (plain light-grey ground) gives
  eight usable faces for 20 credits: crop squares, 640 px each.
  (thispersondoesnotexist.com no longer serves images to scripts.)

**Transitions: focus pulls and shapes, no cuts.**
- Whole-frame focus pull (blur 0 → 20 px while scaling 1 → 1.04, next
  scene comes in sharp), iris circle wipes, a halftone dissolve, a zoom
  through the centre of a tunnel, a circle that grows from an icon.
  Three hard cuts in 45 s, max.

**Pacing.**
- One idea per 1.5-3 s; 5-6 ideas in 30 s. A hero moment every ~8 s.
- End: logo alone, then ONE handle/url line. Nothing else.

**Sound — measured, not guessed (2026-11-01).** The three films were split into
bed + effects (REPET: the bed repeats every bar, the median over neighbouring
bars is the bed, the residual is the effects: `scripts/sfx-study.py`)
and read on spectrograms next to the frames:
- **The music does almost all the work.** Bright, clean electronic, ~124 BPM,
  with a sidechain-pumped pad (the bed "breathes" on every beat) and steady
  drums at RMS about -7 dB. Cuts and reveals land on the kick, so most motion
  needs NO sound of its own. Our v2 had 57 cues in 28 s; their films carry
  about 1 real effect every 2-3 s. **Budget: at most 1 effect per 1.5 s,
  ~15-20 in a 30 s film.**
- **An effect only marks:** a hero reveal, a real UI action (tap/click), a win,
  a scene transition, the logo. Never every word, face or list item.
- **Audio focus pull:** when the picture focus-pulls, the music is low-passed
  (highs gone, about -14 dB above 3 kHz) for ~0.5 s and opens on the next scene.
  Use `{"f":"@lowpass","t":..,"to":600-700,"d":0.3,"hold":0.15-0.2,"back":0.35-0.4}`
  in CUES (mix.py automation).
- **Icon/coin pops = short tonal arcs** (~150 ms, up then down, under 2 kHz):
  `bloop-1/2`. UI taps = soft clicks (`tap-1/2`).
- **Wins = `chord-win`** (soft major-9 swell + sub). Never a bright chime/bell
  (owner: «weird high-pitch sound»).
- **Ending: the music STOPS on a downbeat** (`{"f":"@stop","t":..,"d":0.06}`),
  a `swell-in` sucks into the hit and a WARM, LOW `sting-logo` (sub boom + soft
  pad) rings under the logo. **NEVER a bell, chime, pluck or arpeggio on the
  logo or a win** (owner 2026-11-01: «the ending sound of bell, very bad»).
  Keep 75 %+ of the sting's energy at 100-1000 Hz so phones still hear it.
- Music only, no voice, unless the owner asks.

**Start from `recipes/viral-promo/comp.html`** (helpers: `phrase()/phraseAt()` blur-in
words, `focus()` scene focus pull, `depth()` for objects at z 0..1). It expects
`fonts/`, `img/faces/`, `img/box/`, `img/slot/`, `img/items/` next to it.

**Checklist before rendering a promo:** count the words on every QA still
(≤ 6 visible, one hero number allowed); one hue family per frame; no flat
full-screen colour flood; every face is a photo; every object has depth;
count the sound cues (≤ 1 per 1.5 s); every focus pull has an `@lowpass`;
the film ends on `@stop` + `sting-logo`.

## Music sourcing (owner 2026-10-30: «new music from Pixabay etc, fitting, always»)

Every video gets its OWN bed picked for its mood (calm narration, hype drop,
playful), never the same track as the previous video. Log the pick in the
video's `LICENSES.txt` and in "Tracks used" below.

1. **Pixabay Music is first choice** (Pixabay Content License: free for
   commercial use, no attribution). Its site is bot-walled (403 / bot check)
   and its API has no music: NEVER try to get around the bot check. Instead
   give the owner 2-3 concrete search terms (e.g. "calm corporate
   technology", "minimal piano ambient") and ask them to drop the mp3 they
   like into the chat; then measure BPM/first beat yourself.
2. **No wait possible / owner away: pick from the full catalogues that do
   download here**, matching the mood:
   - Mixkit (free license, no attribution): tag pages
     `https://mixkit.co/free-stock-music/tag/<mood>/` (follow redirects) list
     tracks as `https://assets.mixkit.co/music/<id>/<id>.mp3`. Not just the 3
     beds in `audio-sources.json`.
   - ccMixter API (CC BY: credit the artist in the post/first reply):
     `https://ccmixter.org/api/query?f=json&tags=instrumental,<mood>&sort=rank&limit=20`.
   - Free Music Archive / Incompetech (CC BY, credit required) as a fallback.
3. Check the excerpt's energy over the video window (`astats`/`ebur128`), set
   `--music-start` so a section change lands on the hero moment, and keep it
   under the voiceover (mix-vo.sh ducks it).

Tracks used: GazzPad v4 (2026-10-30) = Mixkit "Your Breath" (music-120-corporate) from 0 s.
StockSlot Battles (2026-11-01) = Mixkit "Waka Floka Type" by Arulo (id 364, trap, 130 BPM,
atempo'd to 129.01; quiet intro, hard drop at 14.87 s in the stretched file, set on the
"WINNER TAKES ALL" hit with --music-start 7.415).
Public Profiles (2026-11-03) = Mixkit "Happy Times" by A. M. (id 158, pop, 120 BPM, first
beat 0.017 s, full energy from 0 s; Pixabay answered 403 bot check, not circumvented).

Finding music that downloads here (2026-11-01): Mixkit tag pages
(`/free-stock-music/tag/trap/`, `hip-hop`, `epic`) answer 429 for a while after a burst;
wait and retry, never spoof headers. Map an id to its real title through the page's
JSON-LD (`"@type":"MusicRecording"` with `byArtist` + `url`), not the card order (the
card titles are offset). ccMixter content URLs are hotlink-blocked (403) from here.
Measure BPM on the loud section with a comb over onsets, then find the drop as the
first 5 ms window that jumps 20+ dB.

## Short-form hook rules (owner 2026-11-03, research for the Public Profiles video)

The first 1-3 seconds decide whether an X/TikTok viewer stays. Copy a proven
hook FORMAT, never someone's content. On X the video autoplays MUTED, so the
hook must work as on-screen text alone; the voice repeats it.

1. **Motion on frame 1.** Never open on a still or a fade from white: frame 0
   already has something mid-flight (cards thrown in, a swipe, a zoom).
2. **The big caption is on screen in the first 0.5 s** (frame 0 ideally),
   1-5 words, huge, high contrast. It is the hook line itself, not a logo.
3. **Payoff and specificity first.** Show the result (the win, the number,
   the finished thing) before explaining anything; concrete nouns beat
   category words.
4. **One emotion, one idea.** A command, a POV or a question, not all three.
5. **Open a loop** the next 2-3 s close ("Stop doing X" -> here is the better
   way). Close it fast; the payoff scene starts on a beat ~0.3 s before its line.
6. **Pattern interrupt every 3-4 s**: a cut, a flip, a snap, a camera lean,
   a tap. Never more than ~4 s of the same picture.
7. **Clean audio from 0 s**: the voice starts in the first 0.2 s, the music
   is already at full energy (no slow intro), one soft hit on frame 1.
8. **Cut ~0.3 s before the natural pause** of each line, never after it.

Proven formats to copy (pick ONE):
- **Command / call-out**: "Stop screenshotting your wins." (direct address +
  a habit the viewer recognises; a strike through the habit on screen).
- **POV**: "POV: your whole degen history on one page."
- **Question**: "Where do you flex your wins?"
- **Payoff number first**: a real result on frame 1, then "here is how"
  (only with a real, verifiable number; never a price/earnings promise).
- **Contrast / bold claim**: "Everyone shows the win. Nobody shows the P&L."

Write 5 options, pick one, say why (relatable + scroll-stopping + works muted
+ no unverifiable claim). After the hook the video is a normal X post: 16:9,
normal pacing, one idea per scene.

## Recipe: narrated Apple-style feature video (GazzPad v4, owner «very good»)

Files: `recipes/narrated-feature/` (copy `comp.html` next to `fonts/` and an
`img/` folder with the product assets). 43 s, 4K/60, 7 scenes.

**Order of work (voice first, picture to the voice):**
1. Fetch real facts live (pairings, counts, limits) before writing a word;
   every number on screen is real (203 basket assets → "200+").
2. Write the VO script: one idea per sentence, calm, the owner's own phrases
   kept. Generate with ElevenLabs `creative_generate_speech` (model eleven_v4,
   voice "Belle B – Premium Ad Narrator" `SQQyvkXssth4s6HD2OuR`, prompt starts
   `[calm, unhurried]`, blank lines between sentences = natural pauses).
   Two takes come back; pick one.
3. `vo-timing.sh take.mp3` → pause list; map sentences (and single listed
   words like "Holders. Creator. …") to times. Start VO at t = 1.0 s.
4. Every scene's in/out times come from those numbers (`MODE_T` etc. in the
   comp), so each visual lands on the word that names it.

**Look (copy it):**
- Light Apple base (`#fff → #eeeef2` radial) + ONE faint static indigo/teal
  haze; dark scenes on `#0c0d12`. Alternate light ↔ dark per idea.
- Geist 700 display, tight tracking (-0.045em), grey `#6e6e73` subs, words
  rise out of a clip with 70-90 ms stagger. ≤ 6 words per line.
- **One morphing dark plate carries every transition** (no cuts): pill →
  circle → full-screen cover (circle 2300 px) → shrinks into the next
  scene's hero element (ETH coin, creator-fee pill, basket card, vesting
  widget, end-card logo). Content enters on springs (ζ 0.7-0.75), exits
  with ease-in 40 % faster.
- Product art: real logos (`web/public/stocklogos` 256 px, split-mode art
  384 px on `#13161e` cards so the art background disappears), real brand
  marks. Status chips use the product's semantic colours.
- Per-scene devices that worked: chips that land one by one + a ring that
  glides to the "chosen" one; an SVG line diagram drawing (stroke-dasharray);
  a ring of logo circles thrown out from a centre coin with labels; cards
  landing on their spoken word with a stacked bar filling to "100%"; a logo
  wall scrolling inside a masked box while picks fly (arc + shrink) into a
  basket list; avatars receiving mini-logos; Apple-widget counters (years
  1→5 with segment fill, ring to 10 %).
- End card: mark + wordmark + one sub line with an inline chain logo
  (measure the text width in build(), not when hidden) + url.

**Audio:** bed = `mix.py` (music from 0 + SFX cues placed next to their
motion, gains 0.2-0.7), then `mix-vo.sh bed.wav take.mp3 1.0 43 final.wav`.
Result: VO ~10 dB over the bed, -14 LUFS, -1.5 dBTP.

**Gotchas met:**
- `mix.py` needs numpy: run it with `/usr/bin/python3` (the default
  `python3` may be a different build without numpy).
- `offsetWidth` of an element inside a `display:none` line is 0. Measure in
  `build()` before anything is hidden.
- A specific override (`.menu .switch { background }`) silently beats the
  generic `.switch.on`; re-declare the on state at the same specificity.
- One wrong frame range? Re-render only that tail with `--from/--to`, then
  splice: `trim=end_frame=N` on the master + concat the new segment, one
  re-encode (CRF 15) with the final audio. A 4K/43 s full render takes
  ~12 min on 4 workers; a 5 s tail ~2 min.
- Deliver the 1080p (X) and the 4K master together.

## Recipe: trading promo — real site + voice + UI palette (owner 2026-11-01)

Files: `recipes/trading-promo/comp.html` (copy it next to `fonts/`, an `img/`
folder of site crops and `audio/` with the ui-* bank, `vo-1..8.wav` and the
music). 27.6 s, 4K/60. The owner asked for the new Market (memecoins + funds)
"from the real website, high quality, hookable", with a voice.

- **Capture:** Playwright, viewport 1440x900, `deviceScaleFactor: 3`, dark
  theme via `localStorage["gazz-theme"]="dark"`, hide `.bx-strip, .appnav,
  .gzdk-edge` (announcement strip, bottom nav, social tab). Full-viewport
  screenshots, then ffmpeg `crop` in 3x pixels into element assets (chart,
  trade panel, rewards box, fund chart + buy panel, class menu, swap card,
  Market header). Splice list rows with `vstack` to skip dead rows. Pick
  pages whose live data reads well (GAZZ candles, a fund on its 24H tab).
- **Look:** viral recipe on a dark lime-glow ground with the perspective
  floor; crops float as `.shot` cards (22 px radius, faint lime hairline,
  deep shadow), enter on springs with a small 3D tilt; the list softens
  (blur 5 px) when the next card takes focus. One pale-lime scene for the
  hero number, white end card. Max ~1.5x CSS upscale on a 3x crop = 1:1 at 4K.
- **Voice:** hook line in the first 2 s, one short line per scene, 0.5-0.6 s
  of air between lines; scenes cut ~0.3 s before their line.
- **Claims:** "up to 90% of every trading fee back to holders" counts holder
  airdrops + jackpots/creator seats + $GAZZ buyback & burn (Docs fee map:
  funds 30+30+20+10, GazzPad 20+20+20+20, GAZZ 70+15). Say it with a small
  fine-print line on screen; never claim more than the Docs fee map.

## Recipe: profiles promo — light ground, voice, rebuilt UI (owner 2026-11-03)

Files: `recipes/profiles-promo/comp.html` (copy next to `fonts/`, `img/` with
`pfp.jpg`, `logo.png`, `gusd-coin-black.png`, `card-<game>.png` and `audio/`
with the ui-* bank, `vo-1..8.wav` and the music). 28 s, 16:9 4K/60, X feed post.

- **Hook (0-2.5 s):** "Stop screenshotting your wins." Three phone
  screenshots of real lobby cards are mid-throw on frame 1, "Stop" is on
  screen at frame 0, a hard ink strike crosses "screenshotting" at 0.9 s,
  then the screenshots are swept down and the profile rises (closes the loop).
- **Rebuild, don't screenshot, the UI** when it must move: light tokens from
  `global.css [data-theme="light"]` (bg #f7f7f8, ink #0f1115, muted #5b5f68,
  success #15803d, info #0369a1, warning #b45309), cards white with a 1.5 px
  hairline and a soft shadow, Geist. Lime #b8f43a only as a FILL (ring,
  highlighter behind "fun!"); lime TEXT uses #4d7c0f for contrast on white.
- **Real lobby cards** for game art: clone each `[data-game]` element of
  gazz.fun/stockslot into a fixed box and element-screenshot it at DPR 3
  (the carousel moves, so a clip of the original never settles).
- **Scenes:** header with a Follow tap (followers +1); P&L card flips with
  the site's own 0.68 s ease and sheen on "Flip it"; four stat tiles float
  apart, then snap into ONE strip on "in one place"; win tiles glide in and
  the camera leans 1.32x into the biggest (others blur); thesis cards, a tap,
  the reader sheet opens over a scrim; white end card with the slogan.
- **Charts = the site's CURRENT chart, 1:1 (owner notes 2026-11-03):** port
  `web/src/components/FlatChart.tsx` (kind "area") + `.fc*` in
  `redesign-core.css`, dark theme, on a DARK card even on the light page:
  lime `#b8f43a` monotone-cubic line 2.75 px, a 0.1 -> 0 tint under a halftone
  dot grid (4 px cell, r 0.95, fill-opacity 0.55) masked 1 -> 0.08 top to
  bottom, dashed vertical guides at first/middle/last, end dot r 4 with a
  2 px panel-coloured ring + halo r 8 at 0.18 + the 2.2 s pulse (1 -> 3.4x).
  Scale every length by the card's size factor (K = 2 here). Down = the
  site's danger colour. Never a flat dark-green area fill (old style).
- **Phones are black devices:** solid black bezel with a thin metallic rim
  (`inset 0 0 0 2px #34373e` + a top highlight + a dark hairline), never a
  white frame.
- **Numbers:** the owner removed the "Demo profile" pill from the final film
  (2026-11-03); it stays in the comp behind `SHOW_DEMO_BADGE` (default off,
  `?demo=1` turns it on). All
  numbers are illustrative and plausible (wins <= max win x $100 bet).
- **Voice:** one ElevenLabs take cut into one wav per line on its pauses;
  scenes cut on beats ~0.3 s before each line; the music stops on the beat
  under the slogan's last word and `sting-logo` rings alone into a silent tail.

