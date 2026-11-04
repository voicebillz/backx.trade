# gazz.fun marketing: what we learned (Nov 2026)

These are the rules and lessons from the recent posts, articles, images and
videos. The source of truth is the skills in `skills/` and CLAUDE.md in the
repo. This file is the short version.

## 1. Hooks: what makes people stop scrolling
- Write FIVE hooks (numbers, contrarian/sentiment, curiosity, story, direct
  value) and ship the best one. Line 1 has to work completely on its own.
- Numbers stop the scroll: "$0.25 in. $309.94 out. 1,239x." beats any adjective.
- Contrarian framing travels: "Nobody at a casino lies to you about the odds.
  They're printed in the rules." The reader expects the opposite.
- Mood hooks: tie the post to what the market feels right now ("Bitcoin is
  under $80K. Fear & Greed sits at 36."), then turn to something that went well.
- Use the structure HOOK, then INFO, then TAKEAWAY. Short lines, one idea per
  line, blank line after the hook.
- Never open with "We are excited", "Big news" or "GM". If the first word is
  "We", rewrite it.

## 2. Hard rules for X (never break)
- English. No emoji, no hashtags, no em dashes or "--".
- No link in the post. The link goes in the FIRST REPLY or in the image.
- No price promises, no "guaranteed", nothing that reads as financial advice.
- Never claim a partnership, listing or approval before it is confirmed.
  Say "in talks with" or "reached out to".
- Never post the same template twice with small changes. Every post gets its
  own hook. Around 15 posts a day triggered X's spam filter on ~10% of posts,
  so post fewer, stronger posts.
- Reply to early comments yourself in the first hour. Each reply pushes the
  post back into feeds.

## 3. Truth check before every post (learned the hard way)
- Pull live numbers and write down where each came from at the bottom of
  post.md ("Facts behind the post").
- Degen Rotator (Nov 4): the brief was "when the market is down, AI funds
  give a higher return". The data said the memecoin market was UP (median
  +11.9%, 17 of 18 up). So the post says the fund rotated well and bounced
  after a rough month. It does NOT claim it rose while the market fell.
  Check the claim against the data before you write it.
- Always add a risk line for risky products ("High risk. Memecoins drop fast.").
- 18+ on anything gambling-related.

## 4. Long-form X Articles
- Example: "How casinos scam you: the full recipe" (~2,900 words, 20 sources).
  One red thread from start to end, each section one ingredient (house edge,
  loss aversion, mental accounting, behavioural finance), solutions at the end,
  sources listed last.
- For a strong article, do not mention our own product. Being useful builds trust.
- Be careful with claims: we did NOT put real casino logos next to "SCAM"
  (defamation risk). Use generic art instead.
- Workflow: `x-article-paste.html`. Open it, copy all of it, and paste it into
  the X Article editor. Headings, bold, lists and sources come across.
- Share it with a separate quote post (the hook + 3 short lines), no link.

## 5. Images
- 4K minimum: a 16:9 post image is 4096x2304, an X Article cover (5:2) is
  ~6336x2536, a 3:1 banner is 4500x1500, a PFP is 2000x2000.
- Build it in HTML/CSS and render it with Playwright at deviceScaleFactor 4.
  Always check a 1:1 crop for sharpness.
- Canvas trap: deviceScaleFactor does NOT make a canvas sharper. Set the
  canvas width/height to full resolution and use ctx.scale().
- Design for compression: flat colours, hard edges, big type, little glow or blur.
- Max ~12 words in the image. Put gazz.fun in the image, since the post has no link.
- Faces and photos: generate them with OpenArt, then put the text on top in HTML.
- Use real game art or real product screenshots where you can (the Gold Rush
  Sheriff win image did this).

## 6. Video
- Always deliver MP4: h264, `-preset slow -crf 14-16 -pix_fmt yuv420p`, 60 fps,
  4K master plus a 1080p copy for X. GIF only when asked: palettegen +
  sierra2_4a, never bayer, 15 MB limit on X.
- Promo style (owner): 1-5 words per phrase with a blur-in, one colour family
  (lime), real faces and objects in depth, focus-pull transitions, music only.
- Sound: the music carries it. Max one effect per 1.5 s, a lowpass on the music
  at each transition, the music stops on the beat, and a warm deep logo sting.
  NEVER bells, chimes, plucks or arpeggios. Use the plain ui-* palette.
- Voice-over only when asked (recipes/trading-promo, ElevenLabs, music ducked
  under the voice).
- Every frame is code: `seek(t)` in one HTML file, Playwright frames, ffmpeg.
  Things change shape instead of fading. No hard cuts. Something happens on
  every beat. Check stills before the full render.
- Remove anything that says "Demo" or looks unfinished before delivery (the
  profiles video went to v3 for this).

## 7. Indexing, listings and SEO
- DexScreener on Robinhood Chain indexes ONLY Uniswap (v3/v4), not
  PancakeSwap. A DexScreener request for automatic images and descriptions
  therefore only covers GazzPad's Uniswap v4 launches.
- The GeckoTerminal endpoint (`/api/gecko/token-info/...` + `/api/logo/<addr>`)
  is confirmed working and is LOCKED. Never change paths, keys or the format.
- SEO / AI search: keep llms.txt, OG cards and the sitemap factual and in sync
  when a product fact changes (seo skill).

## 8. Campaign folder shape
`docs/marketing/<campaign>/{post.md, source.html, asset-4k.jpg}`. Put the
five hooks, the thread, the first reply and the truth check in post.md, then
note what worked 24-48 h after posting.

## What is in this zip
- `text/`: the posts, threads and articles (the casino article,
  x-article-paste.html, Degen Rotator, StockSlot biggest win, v4 hooks).
- `images/`: 4K post images and article covers, plus the HTML sources.
- `videos/`: final MP4s (profiles v3, funds, market/trading, battles v4) in
  4K and 1080p.
- `skills/`: ct-post (viral playbook), marketing-image, motion-video (with
  recipes) and seo, plus the marketing README (recipe index).
