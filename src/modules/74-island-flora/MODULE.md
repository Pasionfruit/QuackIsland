# 74-island-flora

The lobby island now has 72 curved palm trees, 420 small grass patches and 120
fallen coconuts. Three additional coconuts hang below each palm crown. Palms
form groves near the lobby and extend farther around the island; most grass
and fallen coconuts cluster near those trees.

## Public contract

`IslandFlora` is the scene component. `islandFloraField()` builds its placements
from the terrain contract and existing solid-rock clearances. `scatterFlora`
accepts a ground sampler, radius, optional protected discs and population
counts, plus a world seed. `plantingMatrix` aligns each placement to its
surface normal. The exported placement and field types describe that data.

The field uses the core seeded RNG with a namespace salt. Rejection sampling
keeps plants above maximum tide plus 0.5 metres, on gentle slopes, outside
rocks and outside the central nine-metre spawn clearance. Palms have at least
ten metres between trunk origins. Sampling attempts are bounded so empty,
steep or submerged ground cannot hang initialization.

## Geometry and rendering

All shapes are procedural. Palms have bent segmented trunks, contrasting
growth rings, nine arched green fronds, a crown and three coconuts. Grass
patches use crossed groups of tapered blades in three greens. Ground coconuts
are faceted brown shells with three dark eyes. There are no model files,
textures, downloads or added packages.

One instanced mesh per kind supplies three colour-pass draw calls. Palms and
coconuts cast shadows; grass receives shadows without adding its own shadow
pass. All three kinds share one vertex-colour material, with slight instance
shade variation. Matrices and instance bounds are initialized once. Each
geometry is below 3,000 triangles and the complete field is below the module's
100,000-triangle allocation. Actual renderer calls and frame time still need
human measurement.

The component hides vegetation during a party game or an open minigame, keeping
it with the lobby scenery. It is registered through one appended scene line.
The props are decorative: trunks and coconuts have no collision or interaction.
Terrain and existing rocks are read through their public contracts.

## Validation

Seven module tests cover deterministic layouts, full populations on the actual
island, spawn and rock clearance, palm spacing, rejection of submerged/steep
ground, finite vertex data, geometry budgets and surface-aligned transforms.
The full module gate runs the repository checks before handoff.

Browser visual review and renderer performance measurements are pending. No
new screenshots or human PASS are claimed.

## How to review

1. Open the running app and walk around the lobby island. Groves and grass
   should appear beyond the open spawn area, with coconuts below the palms.
2. Inspect trees from several sides. Check the curved trunks, rings, spread
   canopy and fruit under the crown. Inspect fallen coconuts and grass nearby.
3. Walk toward the beach and around existing boulders. Check that the plants
   sit on the ground, avoid rocks and stay above the high-water line.
4. Reload or join the same island from another browser. The layout should match.
5. Start a party game or minigame, then return to the lobby. Check that the
   vegetation hides and returns with the lobby scenery.
6. Use the performance HUD to inspect draw calls, triangles and frame time.
   Review visual density and the decorative walk-through trunks before PASS.
