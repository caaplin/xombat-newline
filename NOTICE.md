# Notice

## Original game

**Burnline** — <https://crazybots.io/burnline/> — is the original work this project studies.
Its design, rules, zone and enemy names, card names and descriptions, Python snippet corpus,
word list, soundtrack, artwork and fonts are the property of their authors (CrazyBots).

This repository is a non-commercial fan reimplementation built for study: the JavaScript in
`js/` is newly written, but the game design and the extracted content in `js/data/` come from
the original client bundle. If you are the rights holder and want something changed or removed,
open an issue and it will be handled.

The original site's analytics scripts (`/static/collect.js`, `/metrika.js`) were deliberately
not copied, and this build sends no data anywhere.

## Fonts

- **IBM Plex Mono** — © IBM, SIL Open Font License 1.1.
- **VT323** — © Peter Hull, SIL Open Font License 1.1.

Both are redistributed under the OFL; the licence permits bundling with this project.

## Music

`assets/music/neon-loop.mp3` and `assets/music/boss-battle.mp3` are the original site's tracks,
included so the rebuild sounds like the real thing. Replace them if you redistribute this
commercially.

All other audio is synthesised at runtime with WebAudio (`js/ui/audio.js`) and is original to
this project.
