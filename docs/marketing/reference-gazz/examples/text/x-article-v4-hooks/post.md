# X Article: Uniswap v4 Hooks Can Do Anything. That's the Problem. (2026-11-01)

Article text: `article.md` (paste as an X Article; cover = `hero-v4-hooks-4k.jpg`,
or `hero-v4-hooks-clean-4k.jpg` if X shows the title on top of the cover).
Hero art: OpenArt, Nano Banana Pro, 21:9 4K, prompt in `hero-source.html` header note below.

## Five hooks considered (ct-post playbook)
1. Contrarian: "Most Uniswap v4 hooks are built backwards."
2. Curiosity: "The most dangerous code in a new coin is the part nobody reads: the hook."
3. Numbers: "One contract. Four swap types. Seven ways to get it wrong."
4. Story: "Before we wrote our hook, we read the ones already live."
5. Direct value: "7 things to check before you buy a coin with a v4 hook."
Chosen as the title: "Uniswap v4 Hooks Can Do Anything. That's the Problem."
(1 is used to share the article.)

## Share post (quote / share the article with this)

    Most Uniswap v4 hooks are built backwards.

    Fees taken in the coin you just bought.
    LP "locked" in someone else's locker.
    Owners who can change the rules later.
    Taxes that quietly make selling impossible.

    We wrote down all seven mistakes. And how we built around every one.

First reply: `gazz.fun`

## Truth check (2026-11-01)
- Uniswap v4 stack live and the default venue for new GazzPad launches (/api/gazzpad: launchVenue "uni").
- LP NFT → 0x…dEaD, no removal path, factory-only pool init, LP fee 0, hook fee cap 5% (2% + 0–2%), fork-tested 4 swap types: docs/gazzpad/GAZZPAD.md.
- Fee split 20/20/20/40 (treasury half buyback & burn): CLAUDE.md GAZZPAD.
- NOT audited externally: stated as "what we're building next". No partner, audit or listing claimed.

## OpenArt prompt (hero art)
Cinematic ultra-wide: giant polished chrome fishing hook with etched circuit traces,
cracked barb pouring glowing acid-lime (#b8f43a) liquid and coins into a black pool
with crisp ripples; pure black ground, hard white rim light, empty left third for a
headline; no text/logos.
