---
name: backx-marketing
description: Rules for BackX marketing: X posts, threads, announcements, hook images, banners, OG cards and promo videos. Use EVERY time the owner asks for a post, tweet, image, banner, video, "lag et bilde", "skriv en post" or anything that goes on X / Telegram / Discord for BackX. Holds the hook playbook, X hard rules, truth check, 4K image pipeline, OpenArt use and the video + sound recipe, adapted to the BackX brand.
---

# BackX marketing (learned 2026-11-04, from the gazz.fun campaign lessons)

Full original kit (gazz.fun brand, same owner): `docs/marketing/reference-gazz/` (LEARNINGS.md, skills/ct-post,
skills/marketing-image, skills/motion-video with recipes and scripts, skills/seo, example posts). Read the matching
original skill for the long version. **Where it disagrees with this file or CLAUDE.md, BackX wins** (brand, colours,
no glows, "Leverage"/"Long", no yield promises).

## 1. Hooks (the first line decides everything)
- Write FIVE hooks (number, contrarian, curiosity, story, direct value), ship the best, keep all five in `post.md`.
- Line 1 must work alone. Numbers stop the scroll. Contrarian framing travels. Tie to the current market mood.
- Shape: HOOK, blank line, INFO (short lines, one idea each), TAKEAWAY.
- Never open with "We are excited", "Big news", "GM". If the first word is "We", rewrite it.
- House thread: post 1 = result/hook + image; post 2 = "How it works:" (max 4 lines); post 3 = bigger picture;
  first reply = the link only (`backx.trade/...`).

## 2. X hard rules (never break)
- English. No emoji, no hashtags, no em dashes or "--".
- No link in the post body: link in the FIRST REPLY or inside the image.
- No price promises, "guaranteed", returns, yield promises, or anything that reads as financial advice. Never "zero risk".
- Never claim a partnership, listing, audit or approval before it is confirmed: "in talks with", "reached out to".
- Never post the same template twice with small changes; fewer, stronger posts (spam filter).
- Reply to early comments in the first hour.
- Risk line on risky products ("Leverage can lose your whole margin.").
- BackX words: "Leverage" (not multiplication), "Long" (not Hedge), "validator" = whoever settles positions
  (never use it for voters), "BackX Proposal / BXP-n" + "signal Yes/No" for community questions (not "vote").

## 3. Truth check before every post
- Pull live numbers right before writing; write where each came from under "Facts behind the post" in `post.md`.
- Check the claim against the data; soften what the data does not back. Say what period a number covers.
- BackX today: contracts NOT audited, NOT deployed; app admins-only; speed figures are modelled sim results.

## 4. Images
- 4K minimum: 16:9 post 4096×2304, X Article cover (5:2) ~6336×2536, 3:1 banner 4500×1500, PFP 2000×2000,
  OG 1200×630 (render 2400×1260) in `web/public/`.
- Build in HTML/CSS, render with Playwright at deviceScaleFactor 4 (CSS canvas 1024×576 → 4096×2304).
  Canvas trap: set canvas width/height to full resolution + ctx.scale(); DPR alone does not sharpen it.
- Check a 1:1 crop for sharpness and a 500 px preview for readability before delivering.
- Design for compression: flat colour, hard edges, big type. Max ~12 words. `backx.trade` lives IN the image.
- BackX look: black ground #070707, racing yellow #FFD100 (brand, the one accent word), ink #F4F6FB, up green
  #22C38E, pink/violet only for a "No" side. Flat backgrounds: no radial glows, spotlights or coloured light
  behind content (owner 2026-10-22), no drop shadows behind logos. A hard rim light ON a subject is fine.
- Photoreal people/objects: OpenArt (Nano Banana Pro, 16:9 4K ≈ 80 credits per image), AI-generated faces only,
  never real people, celebrities or other brands' logos. Prompt: "pure flat black background, no glow", leave an
  empty third for the headline, "no text, no logos". Check credits (`openart_account_get`, `openart_model_cost`)
  first. Put the text on top in HTML, never let the model write text. Note model + prompt in `post.md`.
- Real product UI = element screenshots of the live site/app at DPR 3.
- Never: fabricated stats, fake balances/wins, unconfirmed partner logos, another platform's UI as ours.

## 5. Video
- MP4 h264 `-preset slow -crf 14-16 -pix_fmt yuv420p`, 60 fps, 4K master + 1080p copy for X. GIF only when asked
  (palettegen + sierra2_4a, ≤ 15 MB).
- Every frame is code: one HTML comp with `seek(t)`, Playwright frames, ffmpeg (motion-video skill template).
- Hook in the first 0.5 s: motion on frame 1, a huge 1-5 word caption (X autoplays MUTED), payoff first,
  one idea, a pattern interrupt every 3-4 s.
- Promo style: 1-5 words per beat with a blur-in (14 px → 0, 0.35 s, stagger 90-140 ms), one hue family (BackX:
  yellow on black), objects in depth, focus-pull transitions, max 3 hard cuts, end on logo + one url line.
  BackX override: dark grounds stay FLAT (no radial centre light).
- Sound: music carries it; max one effect per 1.5 s; low-pass the music on each focus pull; the music stops on a
  downbeat; warm low logo sting. NEVER bells, chimes, plucks or arpeggios. Voice-over only when asked
  (ElevenLabs, music ducked). Every video gets its own track (Mixkit / Pixabay via the owner), logged in LICENSES.txt.
- Remove anything that says "Demo" or looks unfinished before delivery.

## 6. Campaign folder
`docs/marketing/<yyyy-mm-dd>-<campaign>/` with `post.md` (five hooks, the post/thread, first reply, truth check,
OpenArt prompt), `source.html`, the 4K export. 24-48 h after posting, add what worked.

## 7. SEO / link previews
Keep `web/src/lib/seoPages.ts`, `llms.txt`, OG images and `sitemap.xml` factual and in sync when a product fact changes.
