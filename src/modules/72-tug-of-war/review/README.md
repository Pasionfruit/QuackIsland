# Browser evidence

`browser-results.json` records the three-process multiplayer and offline checks,
measured renderer statistics, compact layout and console/runtime errors.
`keyboard-results.json` records native CDP keyboard input, text-field isolation
and the 390px layout. Screenshots are under `screenshots/`.

Run both `.mjs` checks from the repo root with the existing Vite at port 5199 and
relay at 8791. They use temporary Chrome profiles and debugging ports 9560–9563,
then close their own browser processes. No game-state fields are mutated to force
a result: all wins use keyboard inputs, stand-ins, or the public leave-lobby API.
The scripts inspect the React round read-only to assert network results.

Visual review: solo and team interfaces, moving centre flag, both winner overlays,
800×600 and 390×700 layouts. The key display, readable control instructions and
3D scene remain visible. Human keyboard feel and balance remain review items.

Repository checks: typecheck and both builds pass; 2,837 tests pass; boundaries,
frozen hashes and existing contracts pass. The module gate cannot run until its
pipeline entry is authorized and registered. See `../MODULE.md` for the handoff.
