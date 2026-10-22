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

For the duck model update, run `node
src/modules/72-tug-of-war/review/duck-check.mjs` (debugging port 9564).
`duck-results.json` records current geometry and scene budgets: 1,400 triangles
per duck; five-player game 38 draws / 9,362 triangles; eight-player art fixture
50 draws / 13,616 triangles. No browser errors were recorded. It exercises a
native keypress after replacing the models, then renders the exact generated
geometry in close-up and a separate static eight-player scene. This fixture
does not establish eight-player networking. Screenshots prefixed `ducks-` show
the current art; earlier screenshots retain the original behavioral evidence.

Visual review: solo and team interfaces, moving centre flag, both winner overlays,
800×600 and 390×700 layouts. The key display, readable control instructions and
3D scene remain visible. Human keyboard feel and balance remain review items.

Repository checks: typecheck and both builds pass; 2,841 tests pass; boundaries,
frozen hashes and existing contracts pass. The module gate cannot run until its
pipeline entry is authorized and registered. See `../MODULE.md` for the handoff.
