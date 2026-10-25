# 76-minigame-art

Procedural art direction and reusable detailed props for all minigames. The
user requested a visual depth and character pass across the minigames. This
module owns the asset construction; each game owns its scene placements and
imports only the public contract. No frozen module is changed.

The art pass covers 45 Three/R3F minigame scenes (including the standalone
69–72 games and Aura Debt). `41-one-piece` keeps its native SVG pipeline and
receives its own layered duck-and-island illustration. Catalogue registration
of standalone games is unchanged. `review/integration.json` lists every 3D
scene, its clear play envelope, and its upgraded box declarations.

## Art direction

Each game has a distinct recipe and palette in `ART_DIRECTIONS`. Examples:

| Setting | Assets and character |
| --- | --- |
| Zombie Tag | Cypress silhouettes, carved graves, mushrooms, iron lanterns |
| Messy Maze | Overgrown ruins, clipped hedges, antique clock |
| Probable Stop | Alpine pines, expedition supplies, brass telescope |
| Cooking games | Oven with burners and controls, produce cart, pots, cabinetry |
| Lady Luck | Clover conservatory fountain and garden furniture |
| Musical Mayhem | Speaker cones, glowing club sign, stage lights, palms |
| Binary BS | Toothed gears, pipe flanges, control panels, clockwork |
| Office and market | Drawer handles, books, potted plants, stocked carts |
| Shanty Matrix | Anchor, strapped barrels, braced crates, telescope |
| Fishing and feeding | Reeds, picnic benches, liferings, waterside equipment |
| Breaking the Ice | Faceted ice, snowman, marker buoy, research lantern |
| Big Backs | Bound hay bales, field-edge trees, weathered farm supplies |
| Aura Debt | Skateboard trucks/wheels, neon sign, arcade console |

There are 45 reusable prop types, all built in code from low-poly primitives.
Small features include plank bracing, rivets, handles, clock ticks, book layers,
cabinet vents, coconut clusters, reed seed heads and feather-like palm fronds.
Each scene has four compact tableaux; long courses also have side tableaux
along their length. Stones, moss and leaf fragments seat props on small raised
bases. The new geometry shares three vertex-coloured batches: matte, metal
and glow. It adds no textures, model loading, lights or shadow-casting draws.
World-seeded RNG from `00-core` makes the scatter reproducible.

Existing box-based assets use a small bevel to catch lighting along their
edges. The same centre and outer dimensions are retained. Game materials,
colours, collision and animations remain owned by each game. The pass changes
148 geometry declarations across scene/model files; instanced boxes also
inherit the new geometry. Other native assets retain their silhouettes.

## Public contract

| Export | Purpose |
| --- | --- |
| `ART_DIRECTIONS` | Game-specific names, palettes, prop recipes, authored default envelopes |
| `MinigameArt` | Memoized R3F scene dressing; accepts a game ID and layout |
| `createMinigameArt(game, layout?)` | The same assets as a plain Three Group |
| `ArtLayout` | Optional `halfWidth`, `halfDepth`, `center`, `scale`, `followCameraHeight` |
| `BeveledBox` | R3F geometry attachment accepting the existing box's `args` |
| `createBeveledBox(width?, height?, depth?)` | Standalone bevel geometry with original outer dimensions |
| `disposeArt(group)` | Dispose the batch geometries and materials on unmount |

The clear envelope is a rectangle in world X/Z relative to `center`. Every
decorative vertex remains outside it. Scenes supply dimensions from their own
arena/course constants wherever those are available. The nearest edge is left
empty to protect the camera's view. Decorative meshes ignore raycasts, so
clicking/aiming still reaches gameplay objects. No colliders or input handlers
are installed. The tower's scenery follows camera height using cosmetic render
callbacks without taking over the render loop or changing its camera.

`BeveledBox` preserves default dimensions and handles collapsed/mirrored boxes
with the original BoxGeometry. It memoizes by dimensions and disposes geometry
on unmount. Native materials, raycasting and mesh transforms remain in place.

## Validation and review

Tests cover reproducibility, finite geometry, play-area clearance, at most three
additional draw calls, per-theme 30,000-triangle limits, per-prop 3,000-triangle
limits, disposal, non-intercepting picking, layout overrides and bevel bounds.
The integration review checks all 45 scene attachments and declared public
dependencies. Existing gameplay tests exercise the unchanged game rules.

Start Vite and open `/src/modules/76-minigame-art/review/gallery.html`. Select
each game, orbit the tableaux and inspect their silhouettes, prop detail,
materials and contact with the ground. The gallery intentionally uses a compact
common stage to compare assets; it is not a substitute for reviewing their
placement in the actual games.

Then open each actual game and check the smallest supported window, first-person
aiming where applicable, eight-player visibility, edge obstacles, falling panels,
hidden hazards and the dark scenes. In One Piece, inspect all six SVG pieces at
preview size and in all player colours. Existing screenshots and runtime
measurements in other modules describe their earlier artwork.

Human visual approval is pending. A browser was not available to verify the
visual result in this session. No human PASS or catalogue registration is claimed.

Machine validation: `npm run gate -- 76-minigame-art` exits 0 with all 3,025
tests across 285 files, typecheck, production build, boundaries, frozen files,
frozen contracts and bundle checks. The checked bundle is 739.9 kB gzipped,
within the 900 kB limit. The standalone art gallery also builds with Vite, and
`node src/modules/76-minigame-art/review/audit.mjs` confirms coverage of every
3D minigame and its declared art dependency. This is a project-wide validation
run through module 76; no individual game has been human-approved by this pass.
