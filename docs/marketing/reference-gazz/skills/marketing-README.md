# gazz.fun marketing — the recipe book

One index for every marketing recipe in the repo. The recipes themselves live
where Claude Code loads them (skills) or next to their assets; this page only
says WHAT to use WHEN. Owner-set rules in CLAUDE.md always win.

## Which recipe for which job

| Job | Recipe (source of truth) | Notes |
|---|---|---|
| **X post / thread / announcement** | `.claude/skills/ct-post/SKILL.md` | Hard rules (no emoji / hashtags / em dashes / links in body, nothing unconfirmed), reach hygiene, and the **viral-on-X playbook** (2026-11-01, @yeezycooks guide): five hooks, share psychology, formats, numbers, engagement types, content system, distribution, pre-publish checklist. |
| **Image** (post image, banner, X header, PFP, OG card, infographic) | `.claude/skills/marketing-image/SKILL.md` | 4K source sizes per platform, HTML → Playwright pipeline, canvas trap, OpenArt for faces, palette, verify + deliver. Quality law: CLAUDE.md «VISUELLE ASSETS». |
| **Promo / hype / viral video** (default) | `.claude/skills/motion-video/SKILL.md` → `recipes/viral-promo/` | Pump.fun-style: 1–5 word blur-in phrases, lime family, real faces + depth, music only, sparse SFX, warm logo sting, never bells. |
| **Product video with voice-over** (only when asked) | `motion-video` → `recipes/trading-promo/` (real-site captures + ElevenLabs VO) and `recipes/narrated-feature/` (owner-approved GazzPad v4 film) | Music ducked under the voice; plain `ui-*` sounds. |
| **UI sounds** | `motion-video` SKILL.md → standard `ui-*` palette (20 sounds, `scripts/make-sfx.py`) | Plain taps/pops/whooshes, max one per 1.5 s, silent tail. |
| **Apple-style explainer method** (background) | `docs/apple-style-videos.md`, `docs/LAUNCH-VIDEO-PLAN.md` | The original course notes the motion-video skill was built from. |
| **Animate a character / mascot** | `.claude/skills/character-animation-skill/` | Image → looping SVG/WebP/GIF. (KlingAI + animation-principles skills are third-party references.) |
| **SEO + AI SEO (GEO)** | `.claude/skills/seo/SKILL.md` | seo.ts ↔ prerender-seo.mjs in sync, OG cards + `OG_VER`, sitemap, robots (AI crawlers welcome), **llms.txt kept factual**, answer-first Docs copy. |
| **Listings / aggregators** | `docs/listings/` (CoinGecko, CMC, DeBank, DefiLlama), `docs/LISTINGS-PLAN.md`, `docs/LAUNCHPAD-LISTINGS.md`, `docs/SCREENER-REVIEW.md` | GeckoTerminal endpoint is LOCKED (CLAUDE.md). |
| **X ads** | `docs/marketing/x-ads-keywords.txt`, `x-ads-targeting.csv` | |
| **Discord** | `docs/marketing/discord/` (announcements, banner/icon sources) | |
| **Brand assets** | `docs/brand/` (logos, X header, banners, PFP) | Reuse before re-making. |

## Campaign folders (examples to learn from)
`docs/marketing/x-focus`, `x-nowallet`, `x-ecosystem`, `x-nft-launch`,
`x-nft-predict`, `milestones`, `predict` — each holds the post text
(`post.md`), the HTML source and the rendered asset. New campaigns follow the
same shape: `docs/marketing/<campaign>/{post.md, source.html, asset}`. Never
commit downloaded music/SFX or API keys.

## One launch, every channel (checklist)
1. Facts first: pull live numbers; nothing unconfirmed.
2. X post (ct-post: five hooks → best one, HOOK → INFO → TAKEAWAY, link in the
   first reply) + image (marketing-image) or MP4 (motion-video).
3. SEO: route + OG card + llms.txt + Docs section (seo skill).
4. Discord announcement (same facts, same visual).
5. 24–48 h later: review impressions, engagement rate, bookmarks, follows;
   note what worked in the campaign's `post.md`.
