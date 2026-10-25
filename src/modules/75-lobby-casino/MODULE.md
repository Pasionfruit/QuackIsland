# 75-lobby-casino

A central casino lounge adds the five requested lobby props: blackjack,
roulette, a five-reel slot machine, baccarat and craps. The user chose lobby
props for now. These fixtures are decorative, with no betting or game logic.

## Layout and contract

`LobbyCasino` is registered through one appended scene line. `getCasinoStations`
uses the public terrain and solid-rock contracts to place the fixtures in a
ring about seven metres from the lobby origin, facing inward. Bounded layout
search can move individual stations slightly to avoid rocks and steep ground.
The middle stays clear for spawning, with walking lanes between fixtures.
`layoutCasino`, `stationMatrix`, station types and names are public exports.

The component hides during party games and an open minigame, matching the
lobby scenery. No terrain, vegetation, player, currency or game catalogue
files are changed by this module. Tables and stools are decorative walk-through
props; they do not add collision or furniture seating interactions.

## Procedural fixtures

- Blackjack: curved teal felt table, wooden rail, card shoe, printed rules and
  bet markings, face-up cards, chip stacks and three stools.
- Roulette: wooden counter, brass wheel with 37 coloured pockets, spindle and
  ball, printed number grid, chip stacks and two stools.
- Slots: one tall cabinet with five visible reel columns and three symbol rows,
  an Island Club marquee, brass trim, buttons, lever, coin opening and stool.
- Baccarat: felt table with Player/Banker/Tie printing, face-up cards, card
  shoe, chip stacks and three stools.
- Craps: padded raised rails, Pass Line/Come/Field and number markings, two
  dice, chip banks and a dealer stick.

Wood, dark teal, warm brass and woven mats match the island's oasis palette.
Every shape is procedural. One 1024-by-1024 canvas atlas supplies table
printing, playing-card faces and slot symbols. It is generated locally with
the seeded RNG for the static reel display; there are no downloads, external
models, AI-generated images or new packages.

## Budgets and validation

Five coloured fixture meshes share one material. One additional mesh and
shared atlas draw all printed surfaces. The fixtures cast shadows; the printed
overlay does not. Each fixture is below 3,000 triangles, and all five together
are below the module's 18,000-triangle allocation. Renderer performance still
requires human review.

Five tests check full placement on the actual island, spawn/rock clearance,
inward facing, separation, deterministic and invalid-ground handling, finite
coloured geometry, fixture size, triangle budgets and atlas UV bounds. The
full module gate checks the repository before handoff. Human visual review is
pending; no screenshots or human PASS are claimed.

## How to review

1. Open the lobby and inspect its middle. All five fixtures should form a
   small inward-facing lounge with an open spawn and lanes between tables.
2. Walk around each prop and inspect its silhouette, ground contact, felt,
   chips, cards and printing. Check for overlap with rocks or vegetation.
3. Inspect roulette's wheel and betting grid, baccarat's Player/Banker labels,
   blackjack's curved table and card shoe, and craps' rails and dice.
4. Count five slot columns, each showing three symbols. Check the cabinet's
   marquee, buttons, lever, tray and stool.
5. Start a party game or minigame and return. The casino should hide and return
   with the lobby. Inspect draw calls and frame time in the performance HUD.
6. These are props for review; furniture interaction and playable casino rules
   would be a separate request.
