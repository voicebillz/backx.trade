---
name: marketing-image
description: Make marketing images for gazz.fun — X post images, banners, X headers, PFPs, OG/link-preview cards, infographics, stat cards, Discord/announcement art, AI-generated photos (OpenArt). Use whenever the owner asks for an image, banner, poster, card, thumbnail, infographic or "lag et bilde". Holds the 4K quality rules, sizes per platform, the render pipeline and the brand palette. (Video → motion-video skill; the post text → ct-post skill.)
---

# Marketing images for gazz.fun

The quality rules in CLAUDE.md «VISUELLE ASSETS» are law; this skill is the
how-to. Every image must land its point at feed size (~500 px wide) in about
a second, and survive the platform's re-encode.

## Sizes (always render the 4K source, export platform sizes from it)
| Use | Aspect | Source size | Notes |
|---|---|---|---|
| X post image | 16:9 | 4096×2304 | readable at 500 px; text inside the safe centre |
| X header | 3:1 | 4500×1500 | STATIC only; avatar covers bottom-left — keep it clear |
| Banner (OpenSea etc.) | 3:1 | 4500×1500 | OpenSea also takes MP4 |
| PFP / logo | 1:1 | 2000×2000 | circle-safe (crop test) |
| OG / link preview | 1.91:1 | 1200×630 (render 2400×1260) | goes in `web/public/og/`, bump `OG_VER` (seo skill) |
| Discord embed / announcement | 16:9 | 3840×2160 | dark ground |
| Phone story / vertical | 9:16 | 2160×3840 | |

## Pipeline
1. **Design as HTML/CSS** (one file per image) and render with Playwright:
   CSS-px canvas (e.g. 1024×576) at `deviceScaleFactor: 4` → 4096×2304.
   Real fonts loaded (`document.fonts.ready`), images decoded before shooting.
2. **Canvas trap (CLAUDE.md #2):** a `<canvas>` must get full-resolution
   `width/height` attributes + `ctx.scale()`. DPR alone only upscales it.
3. **Real product UI** = element screenshots of the live site at DPR 3
   (motion-video skill → "Capturing the live product": TLS pin, banner hidden,
   `VITE_PRIVY_APP_ID` from the public bundle for local builds, never committed).
4. **Photoreal people/objects** = OpenArt (MCP), AI-generated faces only —
   never real people's photos, never celebrities, never other brands' logos as
   if they endorse us. Note the model + prompt in the work folder.
5. **Verify:** a 1:1 crop of the final file (text edges crisp, no blur), and
   a scaled-down 500 px preview (still readable?). Fix, then deliver.
6. **Deliver** with SendUserFile: PNG master + the platform exports; MP4
   alongside any GIF (h264, crf 14-16, yuv420p); GIF only with
   `palettegen` + `paletteuse=dither=sierra2_4a`, X GIF ≤ 15 MB.

## Look
- Brand palette (web/src/styles/global.css): ground `#0a0812` / pure black
  for the clean v7 cards, ink `#f4f6fb`, lime `#b8f43a` (brand / up), purple
  `#8b5cf6`, teal `#38e8d0`. Fund classes: Standard / High-Yield in their
  class colours, **Fixed Income = blue `#3b82f6`**.
- Type (site, 2026-11): Geist (UI/body + display), Instrument Serif (page
  titles), JetBrains Mono (numbers/addresses), Anton (game posters). Older
  X art used Space Grotesk + Inter — fine for continuity within a campaign.
- One message, max ~12 words, big type; supporting facts as short chips.
- Design for compression: flat colour, hard edges, clear outlines. Glow,
  blur and gradients sparingly and never behind text.
- `gazz.fun` lives IN the image (the post body carries no link).
- Infographics: one idea per graphic (a fee flow, a split, a before/after),
  real numbers only, source line small at the bottom.
- Promo look family follows the viral recipe (motion-video skill): lime hue
  family, depth objects, real faces — keep stills and videos of one campaign
  in the same family.

## Never
Fabricated stats, screenshots of fake balances/wins presented as real,
unconfirmed partner logos, price promises, emoji or hashtags in the art,
anything that imitates another platform's UI as ours.
