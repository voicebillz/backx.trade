# backx.trade: start her

Pakke for å starte Hedge & Issuer på backx.trade i en ny Claude Code-samtale.

| Fil | Innhold |
|---|---|
| `HEDGE-ISSUER-SPEC.md` | Hvordan produktet fungerer: roller, pengeflyt, likvidering, gebyrer, maks multiplikator, simuleringstall, kobling til gazz.fun, kontrakter, åpne beslutninger |
| `DESIGN-KIT.md` | Standardene fra gazz.fun som gjelder + ny trading-identitet (palett, typografi, layout, komponenter, tokens) |
| `SECURITY-AUTH.md` | Login- og sesjonssikkerhet: hva som tas med fra gazz.fun, hva backx skal gjøre bedre, sjekkliste før lansering |
| `sim/` | Simuleringsskriptene fra 2026-10-15 (`python3 fetch.py` henter prisdata, `sim2.py` er hovedsimuleringen) |

## Slik starter du
1. Opprett et nytt repo på GitHub (for eksempel `voicebillz/backx`), og start en
   ny Claude Code-samtale med det repoet **og** `voicebillz/gazz.fun` lagt til.
2. Lim inn denne meldingen som første melding:

```
Vi starter backx.trade, Hedge & Issuer-produktet. Les først
docs/backx/README.md, HEDGE-ISSUER-SPEC.md, DESIGN-KIT.md og SECURITY-AUTH.md
i gazz.fun-repoet. backx har KUN social login (Privy) og innskudd direkte til
brukerens egen wallet, ingen Relay eller bank i mellom.
1) Kopier .claude/skills fra gazz.fun inn i dette repoet.
2) Lag CLAUDE.md for backx med reglene i DESIGN-KIT del A og sikkerhetsreglene
   (aldri .env/nøkler i git, owner-nøkler aldri i server/skript, Safe
   0xfa408F75490C0412d4a5F45FA7553Aff03249BE4 eier kontraktene, on-chain kun
   read-only uten at jeg ber om noe annet).
3) Gå gjennom «Åpne beslutninger» i spesifikasjonen med meg før kontraktene skrives.
4) Bygg web-skallet for backx.trade med design-kitet (trading-terminal, ikke
   gazz.fun-stil): topbar, markedsliste, graf, ordrebillett, bunnpanel, mørk/lys.
Jeg er ikke utvikler, forklar kort på norsk.
```
