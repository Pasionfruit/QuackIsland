# Application-wide duck review

The actual home page, two separate lobby browsers, native movement, remote
expressions and a registered minigame are checked by:

`node src/modules/02-player/review/app-duck-check.mjs`

Results: `app-duck-results.json`. Screenshots: `home-duck.png`, `lobby-ducks.png`,
`lobby-ducks-guest.png`, `zombie-tag-ducks.png` and `podium-ducks.png`.
The podium is an explicit four-place art fixture sent through the public finish
API, not a simulated gameplay victory. Scene diagnostics inspect mounted models
read-only through the renderer's root registry.

`node src/modules/02-player/review/standalone-duck-check.mjs` checks the separate
Trust Me Bro, Duck Szn and ME in Team previews, with results in
`standalone-duck-results.json`. Tug-of-war's detailed art/budget check remains
`node src/modules/72-tug-of-war/review/duck-check.mjs`.

These scripts reuse Vite at 5199 and the relay at 8791, create temporary browser
profiles, and close their own browsers. Ports 9565–9567 must be free. Existing
servers are left running. Review scripts depend on the repo's local CDP helper.

The shared neutral duck uses 1,400 triangles and three meshes. Cached geometry
and materials are reused for the same colour; expression geometry is shared
across colours. All expressions stay below 3,000 triangles. Tug-of-war's eight
player art fixture fits 100 draws / 15,000 triangles. No textures were added.

Frozen modules are untouched. Human visual approval remains pending. Changes
cover player avatars and podium figures; animals with gameplay-specific species,
vehicles, terrain and decorative shapes keep their existing identities.
