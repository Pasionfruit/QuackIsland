# 14-garden

## What this is

**Garden Goofs**: a 2D lane defence played on an eight-by-twelve lawn, by the
whole party at once. Animals hold the lanes, seeds land on the grass and have
to be clicked before they go, and the pot they pay into is shared.

What works now:

- **One lawn**, 8 rows by 12 columns, drawn in the DOM over the world.
- **One loadout, chosen as a team.** Everybody picks from the same shelf into
  the same packets. Nobody plants until everybody says they are done.
- **Seeds land sporadically** and run out. Clicking one pays the shared pot;
  missing it costs the party the seed.
- **Anybody plants anything**, by dragging a packet onto a square or by
  clicking the packet and then the square. The pot pays, so what one player
  plants is what another player cannot.

What is still missing is the other half of a lane defence: **no pests**.
Nothing walks in, nothing is eaten, nothing fights, nothing is scored, and no
round is ever won or lost.

## It is a 2D game

Drawn in the DOM, over the world, in `GardenScreen`. Not a place in the world:
there is no board in the sea, nothing to swim to, and nothing in this module is
measured in metres. A square is a row and a column; how big that is on screen
is the view's business and nobody else's.

The world carries on behind it, which is where everybody's body still is. That
is the difference between the two games this build has: Volcano Island moves
your body somewhere, and Garden Goofs draws over it.

## The lawn

| | |
| --- | --- |
| Rows | 8, and a row is a **lane** |
| Columns | 12 |
| Squares | 96, indexed in reading order |

**Eight lanes because two people play on one lawn.** Six was a board one player
could cover on their own, and two players covering one board between them is
two players watching each other play.

**Column 0 is the house end; the last column is where pests will come in**, so
a pest walks from the far end towards 0 along one row. That is the one thing
here which is a game decision rather than arithmetic, and it is written down so
the whole build agrees on it before anybody writes a wave. There is a test.

A column is a **number, not an index**: a defender sits in a square and a pest
spends most of its life between two, so `col` is 6.4 for most of a worm's life
and `piece.square` is the one it is standing in.

## Growing to fifty animals and twenty-five pests

That is where this is going, and everything here is shaped for it:

- **Species are data**, in two frozen tables. Adding one is an entry, not a
  branch: nothing switches on an id anywhere.
- **The shelf groups by role** (`shelf()`), because fifty in one flat column is
  a scroll rather than a choice. A role nobody thought of still appears, under
  `other`, so a new kind of animal cannot quietly go missing. There is a test.
- **The loadout is the decision.** `GOOFS.handSize` is 6 of however many exist;
  with fifty on the shelf a round is decided as much by what the party left
  behind as by what it brought.
- **An animal travels as its index in the catalogue**, not its name, so a full
  lawn stays far inside the relay's four-kilobyte message limit however long
  the names get.

## The pieces

`GardenPiece` is the base of everything on the lawn. It carries what is true of
both sides and no more - what it is, where it is, how much of it is left - and
that is genuinely all a duck and a beetle have in common.

```
GardenPiece            species, row, col, health, hurt(), alive, condition, square
 ├─ Defender           cost, enriches, planter
 └─ Pest               flies
```

**Species are data; pieces are alive.** The catalogues are frozen tables read by
the shelf long before any round exists; a piece is one duck in one square with
the health it has left.

### The four animals, so far

| | Cost | Health | Role | Reach |
| --- | --- | --- | --- | --- |
| Duck | 25 | 100 | eats | the lane |
| Frog | 50 | 80 | eats | 3 squares |
| Rabbit | 25 | 60 | **enriches** | none |
| Turtle | 40 | 400 | walls | none |

Exactly one animal turns up seeds, and it cannot defend itself - the pot has to
come from somewhere, and a lawn of nothing but growers should be as broken as a
lawn with none. Tested, both ways.

### The eight pests, so far

Worm, beetle, snail, ant, grasshopper, bee, spider, moth. Each has health, a
speed in squares a second, a bite, and how it gets about: `walks`, `flies` (a
wall is no use) or `hops`. **None of them is in a round yet.**

**The numbers are first numbers.** They are in a table precisely so that
balancing later is editing a table rather than hunting through code.

## Seeds

Seeds land on the lawn on their own, one every `SEED.every` seconds give or
take `SEED.jitter`, anywhere at all - a planted square included, because a seed
is a thing lying on the grass rather than a thing growing in it, and reaching
over your own turtle is the game working.

Each one sits for `SEED.life` seconds and then it is gone. That countdown is
the whole clicking game: a seed nobody reaches is a seed the party does not
get. `SEED.most` caps how many can be waiting at once, or a party that stops
clicking comes back to a paved lawn and a pot that pays for everything.

**Two seconds are not sent as a timestamp.** Two browsers do not share a clock,
so a seed carries *how long it has left*, which means the same thing in every
browser that reads it. Everybody counts their own copy down, so seeds fade
smoothly between the host's messages instead of jumping when one arrives.

## Who is allowed to be right

Three owners, and this is the whole reason `state.ts` exists:

| | Owner | Why |
| --- | --- | --- |
| The way it is played | the host | `13-modes`'s `hostChoice`, like the game itself |
| The loadout | everybody | one lawn, one pot, one loadout - anybody may change it |
| The round | **the host** | two people *will* click the same seed |

So a guest never changes a round: it asks. `claim` and `plant` are requests,
the host runs the same pure rules from `round.ts` over its own copy, and what
comes back is what happened. The cost is a round trip before your own click
lands, which on a lobby-sized network is nothing. What it buys is that two
lawns cannot drift apart.

**The host sends the whole round after every change**, packed into arrays of
numbers, rather than sending a description of the change. Deltas are smaller
and every one of them is a chance to end up with two lawns that disagree - and
these changes happen at the speed of a person clicking, not sixty times a
second. A full lawn of ninety-six plants packs to well under three kilobytes,
and there is a test that says so, because the relay refuses four.

## Public contract

| Export | Meaning |
| --- | --- |
| `GRID`, `Cell` | 8 by 12, and what a square is |
| `everyCell()` / `cellIndex(r, c)` / `cellAt(i)` / `inGrid(r, c)` | The board. Pure |
| `isLight(r, c)` / `laneProgress(col)` / `houseCol()` / `entryCol()` | Drawing it, and which way is which. Pure |
| `GardenPiece`, `Defender`, `Pest` | The base class and the two sides |
| `DEFENDERS`, `PESTS` | The two catalogues. Frozen |
| `defenderById` / `pestById` / `isDefenderId` / `isPestId` | Looking one up, guarding one. Pure |
| `SEED` | How often seeds land, how long they last, what they are worth |
| `Round`, `Seed`, `Plant` | A round in progress |
| `spawnSeed` / `nextSpawnIn` / `age` / `addSeed` / `claimSeed` | The seed game. Pure |
| `plant` / `refusePlant` / `plantAt` / `uproot` / `Refusal` | Planting, and why not. Pure |
| `GOOFS` | Loadout size, starting seeds |
| `toggle` / `validHand` / `handIsFull` | The party's loadout. Pure |
| `gardenPhase` / `canBegin` / `everyoneHasPicked` / `waitingToPick` | Whether a round can begin. Pure |
| `shelf()` | The animals, grouped for a menu that has to hold fifty. Pure |
| `toWire` / `fromWire` / `decodeRound` / `decodeGoofs` / `encodeGoofs` | The wire, and its validation. Pure |
| `useGoofs()` / `getGoofs()` | `{ hand, picked, round }` |
| `toggleAnimal(id)` / `setDone(done)` / `amDone()` | Choosing, as a party |
| `claim(id)` / `place(row, col, id)` | Clicking a seed, and planting. Requests, if you are a guest |
| `startRound()` / `tick(delta)` / `useRoundClock(running)` | Running a round |
| `useGardenMode()` / `chooseGardenMode(id)` / `GARDEN_MODES` | Endless, co-op, versus |
| `useGoofsSync()` | Keep the lobby in step. Call once, from something always mounted |
| `GardenScreen` | The 2D screen. Mounted in `App.tsx`, outside the canvas |

## Invariants you may rely on

- **Eight by twelve, lanes along the rows, house at column 0.**
- **A fractional column is not a square.** `inGrid` refuses one, which is what
  stops a walking pest being treated as standing somewhere.
- **First click wins a seed, and the second pays nothing.** Two players will
  click the same seed; the loser must not be told they earned twenty-five that
  nobody adds to the pot.
- **A refused planting costs nothing.** Every refusal hands back the round it
  was given, so a caller that forgot to check cannot spend seeds on a square it
  did not get.
- **Never two seeds in one square**, which would be one seed you cannot click.
- **Never two animals in one square**, on the wire or off it - a round that
  says otherwise is refused whole.
- **An unreadable round is refused whole**, not patched up. Half a lawn is
  worse than a lawn that did not arrive, because the next one will.
- **Nothing is deader than dead.** `hurt` clamps at zero.
- **Leaving a lobby clears the table.**

## Deliberate non-goals

- **No pests in a round.** Twenty-five of them are planned, eight are written
  down, none of them walks.
- **No fighting, no waves, no score, no winning or losing.**
- **No art and no animation.** Every creature is a coloured pill.
- **No per-mode rules yet** - endless, co-op and versus differ in name only.
- **Nothing in 3D.**

## Known limitations

- **A guest sees its own click land a round trip late.** That is the price of
  the host being the only one allowed to be right, and at lobby latency it is
  not visible. It would be, over a bad connection.
- **Seeds stop landing if the host's tab goes to the background**, because the
  round runs on `requestAnimationFrame` and browsers stop that in a hidden tab.
  The guests keep their lawns; nothing new arrives on them.
- **Nothing pays back for digging an animal up**, and nothing stops you doing
  it. There is no undo and no refund because there is no round to balance yet.
- **The three ways to play are names.**
- **The world takes your keys while the screen is up.** WASD still walks your
  body behind the overlay.

## How to review

Two browsers in one lobby is the real test, but everything except the waiting
works on your own - out of a lobby you are your own host.

- **Pick Garden Goofs, ready up, start.** The shelf appears with the loadout
  empty above it and the animals grouped by what they are for below.
- **Pick six animals.** The seventh should refuse rather than push one out.
- **Click one in the loadout row.** It comes back out again.
- **With two browsers:** one player adding an animal must show up in the
  other's loadout, and either of them must be able to take it out again. That
  is what "as a team" means.
- **Press done choosing in both.** The lawn only appears when both have.
- **Count the squares.** Eight rows of twelve.
- **Wait.** Seeds should land every few seconds, somewhere unpredictable, and
  shrink as they run out. Click one: the pot goes up by 25 in *both* browsers.
- **Have both players click the same seed at once.** The pot must go up once.
- **Let one run out.** It disappears and the pot does not change.
- **Drag a packet onto a square.** It plants, and the pot drops by its cost.
- **Click a packet and then a square.** Same again - both ways work, because a
  long drag across twelve columns on a trackpad is miserable.
- **Drop one on a square that is taken.** It refuses and says so in the tray,
  and the pot does not move.
- **Spend the pot down.** Packets you cannot afford go dim and refuse to drag.
- **Watch the other browser while you plant.** Animals must appear there too,
  and the pot must agree in both. It is one pot.
- **Press end the party.** Everybody goes home; starting again gives a fresh
  lawn, an empty loadout and a full pot.

## Gate record

Filled in when the human passes it.

## Measured

Nothing to measure in the canvas: this module draws no 3D at all.
