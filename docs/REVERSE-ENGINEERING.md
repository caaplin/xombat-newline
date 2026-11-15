# Reverse-engineering Burnline

Notes on how the original at <https://crazybots.io/burnline/> was taken apart, what was reused, and
what was rebuilt from scratch for this single-mode version.

Everything below comes from reading the shipped client bundle. No server was touched, and the
original's collector/analytics scripts were discarded on sight.

---

## 1. What ships to the browser

```
/burnline/
  index.html                     ~6 kB, contains the boot screen and the whole DOM skeleton
  assets/index-<hash>.js         ~2.3 MB unminified-ish ES module (the entire game)
  assets/index-<hash>.css        ~100 kB
  assets/ibm-plex-mono-*.woff2   IBM Plex Mono 400/600, split per unicode-range
  assets/vt323-*.woff2           VT323 (the stencil face used for all headings)
  music/*.mp3                    17 tracks, 2–5 MB each
  art/key-art.jpg                menu art
  og.jpg, favicon.svg            social card, icon
  /static/collect.js, /metrika.js  first-party + Yandex analytics
```

There is no framework: it is one hand-written module. The bundle is IIFE-wrapped with a modulepreload
polyfill at the top, then ~56 000 lines of pretty-printed code. Everything interesting lives in
three regions:

| region | contents |
|---|---|
| the top ~1 000 lines | seeds/RNG, the word list, the card deck, zone rosters, hazards |
| ~1 100–37 100 | the content pack: 629 code snippets in 49 languages, 200+ prose passages |
| ~37 100–56 000 | the `Engine` simulation class, then the renderer, audio, UI, boards |

The `Engine` class (internally `ct`) is a clean, DOM-free simulation: `tick(dt)`, `input(ch, t)`,
`drain()` for events, `snapshot()` for the renderer. That design is the reason this rebuild can exist
at all — the rules could be lifted wholesale into a headless test harness.

## 2. The bits worth keeping

### Determinism

```js
function oe(s)  { let h = 2166136261; for (c of s) { h ^= c; h = imul(h, 16777619) } return h>>>0 }   // FNV-1a
function se(n)  { t = n>>>0; return () => { t = (t + 1831565813)>>>0;                    // mulberry-ish
                  e = imul(e^(e>>>15), e|1); e ^= e + imul(e^(e>>>7), e|61); return ((e^(e>>>14))>>>0)/2**32 } }
```

One stream per run, seeded from a string. Every ranked mode's seed is a formatted string
(`burnline-daily-2026-11-15`, `burnline-weekly-2026-W46-en`, `burnline-bossrush-v1-en`). That is what
makes "same code, same run" true — and it is reused verbatim here (`js/core/rng.js`).

### Line dealing

`le` (code source) and `ue` (prose source) both work the same way: pick a snippet, hard-wrap its
lines to the viewport width at the last space, then emit as many lines as fit, remembering where you
stopped. Snippets are weighted by how badly you type their characters (`score = 1 + w²`, `w` from the
key-scar model), so the game leans into your weak keys. The rebuild reproduces this in
`js/core/text.js`, trimmed to the Python corpus.

Line width is a function of depth, and it also sets the font size:

```js
widths = [16,20,25,30,36,42,48,55,63,72]      // floors 1..10
width(floor) = min(140, 72 + 7*(floor-10))     // after that
fontSize = min(60*scale, availWidth/(cols*advance), innerHeight*0.056*scale)
```

### Difficulty numbers actually used

```js
traceSpeed(floor, wave) = (width(floor)/12) * (1 + 0.05*(wave-1)) * (lethal ? 0.9 : 1) / chaser.speed
fireMulForCode          = 0.62            // code is wide, so the trace is slower
fireMulFloor            = 0.7             // mods can never slow it below this
damageScale(floor)      = [0.25,0.35,0.45,0.55,0.65,0.75,0.85][floor-1] || 1
combo(streak)           = min(5, 1 + 0.5*floor(streak/10))
hitPoints(streak, mul)  = 10 * combo(streak) * mul
brute miss              = 4 * 1.5   |  splitling miss = 4 * 1.5
sniper                  = aims 3.2 s, then 4 damage
bomber                  = fuse 1.6 s, 10 damage
berserker               = 8 damage every 1.2 s
shield / juggernaut     = 1 / 2 armour
summoner                = arms one grunt every 4 s
boss cycle              = 3.6 s (×1, ×0.8, ×0.6 by phase), damage 4 + min(floor-1,4) + 2*(phase-1)
boss health             = every non-space char; phases at 2/3 and 1/3 remaining
boss kill bonus         = 30 * total * combo
line clear bonus        = lead * 5 * scoreMul   (+5 HP if flawless)
word heal               = +1 HP per clean word
final score             = round(raw * accuracy^4 * rhythm), rhythm from keystroke-interval CV
wpm                     = hits / 5 / minutes
```

Every one of those is reproduced in `js/core/engine.js` and `js/core/enemies.js`.

### The ten zones and their hazards

The zone is `floor → ZONES[(floor-1) % 10]`, with a `+` loop multiplier every ten floors. Each zone
has a *hazard* that behaves differently, which is what stops the game feeling like one long treadmill:

| zone | hazard | mode |
|---|---|---|
| Neon Slums | ICE sentinel | 20 damage, knockback 6 |
| Server Farm | drone swarm | chew: 7 dps while it is within 1.5 chars |
| Sewer Grid | sludge flood | 15 damage, knockback 5 |
| Arcology | security press | 30 damage, knockback 8 |
| Foundry | collapsing bridge | **lethal** |
| Glitch Desert | sandworm | 35 damage, knockback 10 |
| Frozen Cache | avalanche | 15 damage + 1 s input freeze |
| Overgrown Net | creeping vines | 10 damage + 3 keys rooted |
| Orbital Relay | black hole | **lethal**, slow |
| Kernel Core | purge | **lethal** |

Enemy rosters per zone are also lifted (e.g. Foundry is `sniper: 1, brute: 0.65, bruteMax: 3`, Frozen
Cache is shield-heavy, Overgrown Net and Kernel Core set `elite: true` which makes every 4+ letter
identifier a brute candidate).

### Content

The code corpus is 629 snippets; 34 are Python, about 21 700 characters. The rebuild ships exactly
those 34, extracted with `tools/extract-data.cjs` rather than retyped, so the text is authentic down
to the tabs and the `__init__` spacing. The 620-word English list comes from the same place and is
used for the fallback word chains.

## 3. What was deliberately dropped, and why

The original has nine modes (arcade, endless run, ranked, weekly, daily, pace, blitz, boss rush,
practice), accounts, nicknames, replay upload, leaderboards, achievements, ghosts, translations
(EN/RU), nine language packs, three input packs, touch keyboards, and an attract/bot demo.

The brief was one mode: **paste a code, play**. So:

| dropped | replaced with |
|---|---|
| 9 modes, arcade stage select | one endless descent, "combat till end" |
| accounts, boards, replays, ghosts, achievements | `localStorage` best score + run count |
| server-side seeds and rank periods | client-side run codes (`XMB-XXXX-XXXX` → FNV seed) |
| 49 language packs | the Python pack only |
| touch key rows, language switch, packs | a hidden `<input>` that raises the mobile keyboard |
| attract/bot demo, telemetry | nothing |
| the 17-track soundtrack | a WebAudio SFX kit + two loops from the original site |

Kept, because they *are* the game: the trace, the no-backspace rule, the enemy roster and its
timings, hostile hazard modes, scars and mined keys, adaptive line choice, boss lines with the three
input-twisting bosses, the card deck, and the `accuracy⁴ × rhythm` scoring.

## 4. What was built new

- **`js/core/engine.js`** — a rewrite of the simulation, not a port. Same numbers, same flow, but
  organised around a snapshot the renderer can read, with no event-bus/UI coupling. It also drops the
  original's mode flags (`paceZones`, `bossRush`, `classicPace`, custom `lineLimit`) that only existed
  to serve the other modes.
- **`js/ui/world.js`** — the original's canvas background is a full pixel-art engine (skylines,
  parallax trucks, brew vats, terrain, weather). This is a much smaller software renderer: gradient
  sky, dithered sun, two deterministic skyline layers, ground grid, rain, and the trace wall that
  creeps in from the left as the fire closes on you.
- **`js/ui/audio.js`** — WebAudio synthesis instead of 17 MP3s, plus two of the original's loops as
  optional music. Sound is on by default and can be muted from the HUD.
- **`css/game.css`** — rewritten against the original's visual language (same CSS custom properties:
  `--phosphor #a8ffcb`, `--ember #39ff88`, `--scar #ff2e88`, `--ember-hot`, `--ink-dim`, `--ash`,
  VT323 for headings, IBM Plex Mono for everything else) and the same character classes
  (`c-todo`, `c-hit`, `c-scar`, `c-wounded`, `c-ash`, `c-fog`, `c-mine`, `c-cur`, `c-k-*`).
- **run codes** — the original had no shareable seed string outside the ranked boards. Here any text
  becomes a code, normalised to `A–Z0–9-` and hashed.
- **pasted sources and language packs** — see 5b. Not in the original at all.
- **the asset gallery** — a browser for the 96 images pulled from the site, since the game itself only
  needs three of them.

## 4b. The image assets

The game draws almost everything at runtime: characters are procedurally generated
`hero:<id>:<pose>:ice` sprites on canvas, the city is drawn per pixel, the UI icons are inline SVG.
Only two images ship with `/burnline/` itself:

| asset | what it is |
|---|---|
| `art/key-art.jpg` | 1536x1024 key art — the runner, the wire, the wolf |
| `og.jpg` | 1200x630 social card |
| `favicon.svg` | the icon |

The rest of the imagery lives on the wider site, so all of it was pulled down and bundled:

| folder | contents |
|---|---|
| `assets/img/icons/*.png` | 16 pixel glyphs at 64px + 5 illustration atlases at 1200–1536px |
| `assets/img/hexarun/`, `pxlbots/`, `chatty/` | product photography and UI shots |
| `assets/img/partners/`, `thumbs/`, `logo.svg`, `mode-*.jpg` | brand and venue |
| `assets/media/events/` | event covers and photos |

96 images, ~13 MB, served locally. The key art is used on the gate screen; the whole set is browsable
in the built-in gallery (**the art** button), which is the honest way to "integrate" assets that the
game itself has no use for.

Sprites were *not* ripped from the atlases: the original generates its characters from code, and the
atlases are marketing illustrations in a different art style. The procedural look was kept instead.

## 5. Two judgement calls

**Bosses.** The original cycles five input modifiers (amnesia, metronome, mirror, one-hand, shift),
but `onehand` and `shift` need the word list or the prose pack — in code mode the snippet corpus
always wins, so those two never actually fire. The rebuild keeps amnesia, metronome and mirror.
`mirror` is implemented by reversing each word on the line, which is what the original's
`ee()`/`te()` pair does before you start typing it.

**Difficulty curve.** The original scales damage by floor with the `HURT` table above; at floor 1 a
catch only costs 25% of the raw number, which makes the first floor forgiving and floor 7+ brutal.
That was kept, and bot runs against the headless engine confirm the shape: a flawless typist at 70 ms
a key gets into the 40s before a lethal hazard finally catches them, while a 2–5% error rate typically
ends somewhere in floors 2–10 — often to Foundry's lethal bridge or a glass-cannon mistake.

## 5b. Playing on pasted code

The original has no such feature — it deals from its own corpus. Adding it needed three pieces:

1. **`source.js`** — cleans the text (CRLF → LF, tabs → 4 spaces, control bytes stripped), drops runs
   of blank lines to one, wraps every line to the viewport width, and deals them back in order,
   looping at the end. It also keeps a 6-character FNV fingerprint so a run code can identify a source
   without containing it.
2. **`langs.js`** — 17 detector rules in priority order (Python's `def …:` beats Ruby's `def`, `#include
   <iostream>` beats plain C) plus per-language keyword sets so brutes are language-appropriate. A
   pasted document also allows length-based brutes, because prose has no keywords.
3. **`setup.js`** — the single place that turns `{seed, text, lang}` into engine options, so the UI
   never has to know whether a run is corpus, pack, or paste.

The corpus itself got a second life out of this: the extraction now also emits **48 language packs**
(370 snippets, ~6k characters each) so "no code? play C" works with the original's own C snippets.

Privacy note: a pasted program is never hashed into the seed and never put in a share code — only its
fingerprint is. Two different pastes with the same code still produce the same enemies and card order,
because those come from the seed.

## 6. Reproducing the extraction

```bash
# 1. fetch and pretty-print the original bundle
curl -sL https://crazybots.io/burnline/assets/index-DQN3M9aF.js -o index.js
npx prettier --parser babel index.js > pretty.js

# 2. pull the Python snippets and word list out of it
node tools/extract-data.cjs pretty.js     # writes js/data/{snippets,words}.js

# 3. check the rules still hold
node tools/sim-test.cjs
```

The bundle hash will change whenever the original is redeployed; the extraction script only relies on
the shape of the two literals (`var He = \`...\`.split(/\s+/)` and `Ge = [ { tag, lines }, ... ]`).
