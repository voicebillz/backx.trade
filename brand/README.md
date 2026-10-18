# backx.trade brand

Racing yellow `#FFD100` on black `#0A0A0A`. The mark is a vector redraw of the original check/bird logo.

| File | Size | Use |
|---|---|---|
| `x-profile-4000x4000.png` | 4000×4000 | X profile picture (black, yellow mark, safe for the circle crop) |
| `x-banner-4500x1500.png` | 4500×1500 | X header banner (3× X's 1500×500) |
| `backx-mark-yellow-4k.png` | 3840×3840 | Mark only, transparent |
| `backx-mark-black-4k.png` / `backx-mark-white-4k.png` | 3840×3840 | Single-colour mark, transparent |
| `backx-logo-black-text-4k.png` | 3840×1280 | Mark + wordmark for light backgrounds, transparent |
| `backx-logo-white-text-4k.png` | 3840×1280 | Mark + wordmark for dark backgrounds, transparent |
| `backx-mark-*.svg` | vector | Source for any size |

Regenerate: `src/brand.html` holds every variant; `node src/render.js <variant> <w> <h> <out.png> [1=transparent]`
(needs `playwright-core` and Chromium). Variants: `mark-yellow|black|white`, `logo-onlight`, `logo-ondark`, `pfp`, `banner`.
