# 14-garden

## What this is

**Garden Goofs**: a 2D lane defence played on an eight-by-twelve lawn, by the
whole party at once. Animals hold the lanes, seeds land on the grass and have
to be clicked before they go, and the pot they pay into is shared.

What works now:

- **One lawn**, 8 rows by 12 columns, drawn in the DOM over the world, with a
  house on the left edge - the one thing the party is defending.
- **One loadout, chosen as a team.** Eight animals out of forty-nine, from one
  shelf into one set of packets. Nobody plants until everybody says they are
  done.
- **A card is an icon and a name.** What it costs and what it does are a hover
  away, in the title - the shelf is forty-nine of them and reading forty-nine
  paragraphs before picking anything is not a menu, it is homework.
- **Seeds land sporadically** and run out. Clicking one pays the shared pot;
  missing it costs the party the seed.
- **Anybody plants anything**, by dragging a packet onto a square or by
  clicking the packet and then the square. The pot pays, so what one player
  plants is what another player cannot.
- **The trowel digs one back up.** Drag it, top right, onto a planted square.
  Nothing is refunded - the seeds were spent the moment it went in the ground.
- **A wave count, bottom right**, so the party knows how long the round has
  gone on. Nothing changes when it advances yet - see below.
- **Escape pauses and offers a way out.** It covers the board and stops this
  browser's own contribution to the round clock; from there you can resume or
  leave the party.
- **The whole roster**: forty-nine defenders and twenty-five pests, with
  costs, health, reach, speed, bite and a silhouette apiece.

What is still missing is the other half of a lane defence: **the pests do not
walk yet**. All twenty-five are written down and none of them has ever been in
a round - nothing is eaten, nothing fights, nothing is scored, and no round is
ever won or lost.

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

**A house sits on the house edge.** A small drawn roof and wall, on the left
of the lawn, at column 0 - the same edge `houseCol()` already named. It is
decoration over an existing fact rather than a new one: the column was always
the thing being defended, and until now nothing on the screen said so. The
lane against it also carries a warm inner edge of its own, so the row that
matters most reads as a front line even before anything is walking up it.

## The shelf: a card is an icon and a name

Everything else - cost, what it does - is a hover away, in the card's title.
Forty-nine cards is already a lot to look at; forty-nine cards each carrying
its own paragraph is a page to read before the party has chosen anything.

Laid out as a **flat 7x7 grid**, not grouped by role the way the catalogue
itself is. One screen, no scrolling, no header to read past first - the whole
shelf is visible at once, which is what lets a party compare cards rather than
hunt through a list for one it remembers seeing.

**The roster is sized to the grid, not the other way round.** Forty-nine
defenders because seven squared is forty-nine: growing the roster past that
means widening the grid to match, not just adding a row to a table. Twenty-five
pests carry no such constraint, since nothing draws them in a picker yet.

- **Species are data**, in two frozen tables. Adding one - within the limit the
  grid sets - is an entry, not a branch: nothing switches on an id anywhere.
- **The loadout is the decision.** `GOOFS.handSize` is 8 of the 49; with that
  many on the shelf a round is decided as much by what the party left behind as
  by what it brought.
- **An animal travels as its index in the catalogue**, not its name, so a full
  lawn stays far inside the relay's four-kilobyte message limit however long
  the names get.

## The pieces

`GardenPiece` is the base of everything on the lawn. It carries what is true of
both sides and no more - what it is, where it is, how much of it is left - and
that is genuinely all a Pea Shooter and a Raccoon have in common.

```
GardenPiece            species, row, col, health, shape, hurt(), alive, condition, square
 ├─ Defender           cost, enriches, planter
 └─ Pest               flies
```

**Species are data; pieces are alive.** The catalogues are frozen tables read by
the shelf long before any round exists; a piece is one duck in one square with
the health it has left.

## The roster, and the art brief

Seventy-four species: **forty-nine** that defend the lawn - capped there by the
7x7 shelf, see above - and **twenty-five** that come for it, uncapped. All of
it is one table in `internal/pieces.ts` and not one branch anywhere switches on
an id, so a pest's seventy-fifth is a line and nothing else; a defender's
fiftieth is that and a wider grid.

Two of them share a name with something on the other side, on purpose - there
is a **Garden Snail** that helps and a **Snail** that eats the lawn, and the
same for spiders. They are different creatures with different ids, and a test
holds the two catalogues apart: an id in both would let a pest through a
defender's guard.

### Style, for whoever builds the assets

Cute, colourful, goofy 3D garden-game look, matching the island. Rounded
shapes, toy-like proportions, bright colours, expressive faces, simple readable
silhouettes, family-friendly, low-poly and game-ready.

**Not** realistic, scary, grotesque, or zombie-like. Nothing here is horror.

- **Defenders look friendly and helpful.** They are on your side and they know
  it.
- **Pests look mischievous and silly, never threatening.** The difference
  between a nuisance and a monster is most of what makes this game what it is.
- **Every asset needs its own silhouette**, readable at the size of one square
  from across the lawn.

That last rule is already load-bearing rather than aspirational: every species
carries a `shape`, the placeholder is drawn in those proportions, and a test
checks no two shapes come out the same size. A Bamboo is tall and thin and a
Pumpkin Shield is wide and low **today**, in coloured pills, before anybody
models a thing. When the models arrive they have to match the shape the species
already claims.

**No art has been generated.** This module does not own the asset pipeline and
must not call it - see the Meshy rule in `AGENTS.md`. What is here is the
roster, the numbers, the colours and the silhouettes; the models are a separate
job with a separate owner.

### The numbers are first numbers

They are ordered sensibly against each other - a Watermelon Mortar costs more
and hits harder than a Pea Shooter, a Garden Gremlin takes ten Mites' worth of
punishment - and not one of them has been played with, because there is nothing
to play yet. Balancing is editing a column in a table, which is the only way a
roster this size was ever going to be balanced at all.

### The forty-nine defenders

Generated from `internal/pieces.ts`, which is the only place any of
this is true. `reach` of 99 means the whole lane.

**Shooters — they clear the lane in front of them** (10)

| Name | Cost | Health | Reach | Recharge | Shape |
| --- | --- | --- | --- | --- | --- |
| Pea Shooter | 25 | 100 | lane | 5s | tall |
| Acorn Cannon | 50 | 110 | lane | 7s | tall |
| Carrot Cannon | 75 | 100 | lane | 8s | tall |
| Corn Popper | 100 | 90 | 4 | 10s | tall |
| Tomato Tosser | 125 | 90 | lane | 12s | round |
| Berry Blaster | 150 | 90 | lane | 12s | round |
| Pepper Popper | 150 | 80 | 3 | 20s | tall |
| Cucumber Catapult | 175 | 100 | lane | 15s | wide |
| Pumpkin Launcher | 200 | 120 | lane | 18s | squat |
| Watermelon Mortar | 300 | 110 | lane | 30s | squat |

**Guards — they stand in the way** (14)

| Name | Cost | Health | Reach | Recharge | Shape |
| --- | --- | --- | --- | --- | --- |
| Lily Pad | 25 | 100 | 0 | 8s | wide |
| Potato Pal | 25 | 350 | 0 | 20s | squat |
| Moss Mat | 50 | 180 | 0 | 10s | wide |
| Sticky Flower | 75 | 90 | 1 | 12s | tall |
| Mushroom Bouncer | 75 | 150 | 1 | 14s | round |
| Vine Trap | 75 | 120 | 1 | 15s | long |
| Thorn Bush | 100 | 200 | 1 | 12s | spiky |
| Cactus Guard | 125 | 250 | 1 | 16s | spiky |
| Pumpkin Shield | 125 | 600 | 0 | 25s | round |
| Garden Snail | 50 | 200 | 0 | 12s | round |
| Turtle | 100 | 500 | 0 | 20s | wide |
| Crab | 100 | 220 | 1 | 14s | wide |
| Mole | 125 | 150 | 0 | 16s | squat |
| Garden Gnome | 250 | 400 | 1 | 30s | tall |

**Growers — they pay for everything else** (15)

| Name | Cost | Health | Reach | Recharge | Shape |
| --- | --- | --- | --- | --- | --- |
| Sunflower | 25 | 60 | 0 | 6s | tall |
| Daisy | 50 | 60 | 0 | 9s | tall |
| Water Lily | 50 | 70 | 0 | 10s | wide |
| Berry Bush | 75 | 100 | 0 | 12s | round |
| Mint Plant | 75 | 70 | 0 | 15s | tall |
| Lucky Clover | 100 | 60 | 0 | 20s | round |
| Lavender | 100 | 70 | 0 | 18s | tall |
| Rose Bush | 125 | 120 | 0 | 16s | spiky |
| Bamboo | 150 | 200 | 0 | 22s | tall |
| Magic Mushroom | 200 | 80 | 0 | 30s | round |
| Rabbit | 50 | 90 | 0 | 10s | squat |
| Earthworm | 50 | 80 | 0 | 10s | long |
| Squirrel | 75 | 90 | 0 | 12s | squat |
| Butterfly | 75 | 50 | 0 | 12s | winged |
| Bee | 100 | 60 | 0 | 14s | winged |

**Eaters — they deal with whatever gets close** (10)

| Name | Cost | Health | Reach | Recharge | Shape |
| --- | --- | --- | --- | --- | --- |
| Ladybug | 50 | 70 | 3 | 8s | round |
| Duck | 75 | 130 | 4 | 10s | squat |
| Frog | 100 | 110 | 3 | 12s | squat |
| Chicken | 100 | 120 | 2 | 12s | squat |
| Hedgehog | 125 | 180 | 1 | 14s | spiky |
| Garden Spider | 125 | 90 | 2 | 15s | spiky |
| Bird | 150 | 90 | lane | 16s | winged |
| Otter | 150 | 160 | 3 | 18s | long |
| Goat | 175 | 250 | 1 | 20s | squat |
| Penguin | 175 | 180 | 2 | 20s | tall |

### The twenty-five pests

| Name | Health | Speed | Bite | Moves | Shape |
| --- | --- | --- | --- | --- | --- |
| Mite | 20 | 0.55 | 4 | walks | round |
| Aphid | 25 | 0.4 | 5 | walks | round |
| Ant | 30 | 0.45 | 6 | walks | long |
| Flea | 35 | 0.6 | 6 | hops | round |
| Mosquito | 40 | 0.5 | 9 | flies | winged |
| Fly | 45 | 0.55 | 7 | flies | winged |
| Moth | 50 | 0.34 | 7 | flies | winged |
| Worm | 60 | 0.16 | 8 | walks | long |
| Locust | 80 | 0.5 | 13 | flies | winged |
| Grasshopper | 90 | 0.3 | 10 | hops | long |
| Termite | 90 | 0.24 | 18 | walks | long |
| Earwig | 100 | 0.3 | 12 | walks | long |
| Spider | 110 | 0.26 | 14 | walks | spiky |
| Weevil | 110 | 0.22 | 11 | walks | round |
| Caterpillar | 120 | 0.18 | 10 | walks | long |
| Cicada | 130 | 0.28 | 12 | flies | winged |
| Slug | 150 | 0.12 | 14 | walks | long |
| Centipede | 160 | 0.35 | 15 | walks | long |
| Snail | 180 | 0.1 | 16 | walks | round |
| Squirrel Thief | 180 | 0.55 | 15 | hops | squat |
| Crow | 200 | 0.45 | 18 | flies | winged |
| Beetle | 220 | 0.2 | 12 | walks | round |
| Gopher | 260 | 0.2 | 20 | walks | squat |
| Raccoon | 400 | 0.22 | 25 | walks | squat |
| Garden Gremlin | 600 | 0.18 | 30 | walks | tall |

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

## The trowel

The one thing that takes a plant back off the lawn. Drag it, top right of the
bar, onto a planted square - or click it and then click the square, the same
click-then-click every other tool here accepts. `uproot` is what runs: the
square clears and **nothing comes back**. The seeds were spent the moment the
animal went in the ground; digging it up again is not a refund, it is clearing
the square for something else.

Only shown while there is a lawn to use it on - it is absent during picking,
where there is nothing planted yet to dig up.

Same shape as planting, the other way round: a guest's drop is a request
(`dig`), the host runs `uproot` over its own copy and the answer is whatever
comes back. Dropping it on an empty square is refused, in words, the same as
every other refusal here - a drop that silently does nothing is a bug report.

## The wave

`Round.elapsed` is a clock the whole party shares, aged by everybody the same
way seeds are - each browser counts its own copy up between the host's
messages, so it moves smoothly rather than jumping when one arrives.
`waveAt(elapsed)` turns that into a number: the first `WAVE.length` seconds are
wave 1, the next are wave 2, and so on. It is shown bottom right for as long as
there is a round running.

**Nothing changes when the wave advances**, yet. There are no pests to send,
so a wave here is a clock with a name and nothing riding on it. It exists now
because the display was asked for before the sending was built, and the honest
thing to ship is a wave count that counts - not one wired to a pretend value
that would have to be replaced the day waves start meaning something.

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
| `WAVE` | How long one wave lasts |
| `waveAt(elapsed)` | Which wave, given how long the round has run. Pure |
| `Round`, `Seed`, `Plant` | A round in progress. `Round.elapsed` is what `waveAt` reads |
| `spawnSeed` / `nextSpawnIn` / `age` / `addSeed` / `claimSeed` | The seed game, and the round clock. Pure |
| `plant` / `refusePlant` / `plantAt` / `uproot` / `Refusal` | Planting, digging up, and why not. Pure |
| `GOOFS` | Loadout size, starting seeds |
| `toggle` / `validHand` / `handIsFull` | The party's loadout. Pure |
| `gardenPhase` / `canBegin` / `everyoneHasPicked` / `waitingToPick` | Whether a round can begin. Pure |
| `toWire` / `fromWire` / `decodeRound` / `decodeGoofs` / `encodeGoofs` | The wire, and its validation. Pure |
| `useGoofs()` / `getGoofs()` | `{ hand, picked, round }` |
| `toggleAnimal(id)` / `setDone(done)` / `amDone()` | Choosing, as a party |
| `claim(id)` / `place(row, col, id)` / `dig(row, col)` | Clicking a seed, planting, and digging one up. Requests, if you are a guest |
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
- **The shelf is forty-nine cards, laid out 7x7, and no more.** The roster is
  sized to the grid; there is no overflow case to get wrong because there is no
  fiftieth card to place.
- **Digging up a plant with the trowel pays nothing back.** `uproot` only ever
  clears the square; there is no path anywhere that returns a seed for it.
- **The round clock moves whether or not a seed happens to be loose.** The wave
  count reads `Round.elapsed`, and it must not stall just because the lawn is
  briefly empty of seeds.

## Deliberate non-goals

- **No pests in a round.** Twenty-five of them are planned, none of them
  walks, and nothing is sent on a wave when it turns.
- **No fighting, no score, no winning or losing.**
- **No art and no animation.** Every creature is a coloured pill.
- **No per-mode rules yet** - endless, co-op and versus differ in name only.
- **Nothing in 3D.**
- **No shared pause.** Escape stops one browser's own clock; it is not a
  message and does not stop the round for anybody else. See the limitation
  below for what that means for a host who pauses.

## Known limitations

- **A guest sees its own click land a round trip late.** That is the price of
  the host being the only one allowed to be right, and at lobby latency it is
  not visible. It would be, over a bad connection.
- **Seeds stop landing if the host's tab goes to the background**, because the
  round runs on `requestAnimationFrame` and browsers stop that in a hidden tab.
  The guests keep their lawns; nothing new arrives on them.
- **A host who pauses stops the round for everyone**, because pausing stops
  the same clock that spawning and ageing already ran on, and only the host's
  copy of that clock was ever real. A guest who pauses only stops their own -
  the round carries on without them and the next broadcast catches them up.
  This is a consequence of who runs the clock, not a special case written for
  pausing.
- **The wave count is cosmetic.** It is a real, synced clock - see the invariant
  above - but nothing reads it back yet beyond the number on the screen.
- **The three ways to play are names.**
- **The world still takes WASD while the screen is up** - escape opens the
  pause card, but the body underneath can still be walked until you use it.

## How to review

Two browsers in one lobby is the real test, but everything except the waiting
works on your own - out of a lobby you are your own host.

- **Pick Garden Goofs, ready up, start.** The shelf appears: forty-nine cards
  in a 7x7 grid, each one an icon and a name, with the loadout empty above it.
- **Hover a card.** The cost and what it does should appear as a tooltip, and
  nowhere else - the card itself stays down to the icon and the name.
- **Pick eight animals.** The ninth should refuse rather than push one out.
- **Click one in the loadout row.** It comes back out again.
- **With two browsers:** one player adding an animal must show up in the
  other's loadout, and either of them must be able to take it out again. That
  is what "as a team" means.
- **Press done choosing in both.** The lawn only appears when both have.
- **Look at the board.** A house should sit on the left with a roof, a wall
  and a door, and the lane against it should carry a warm edge the other lanes
  do not. Count the squares: eight rows of twelve.
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
- **Look bottom right.** A wave count should read *wave 1* the moment the lawn
  appears, and climb on its own as the round goes on - in both browsers,
  together.
- **Drag the trowel, top right, onto a planted square.** It clears, and the
  pot does **not** move - digging one up is not a refund.
- **Click the trowel and then a planted square.** Same result, the click-then-
  click way in.
- **Drop the trowel on an empty square.** It refuses and says so, and nothing
  changes.
- **Dig one up as a guest, and watch the host's browser.** The square should
  clear there too, and the pot should still not move in either one.
- **Press escape.** A pause card covers the board with *resume* and *leave the
  party*. Press escape again, or resume: it goes away and nothing was lost.
- **As a guest, press escape and wait.** The host's seeds should keep landing
  without you; coming back should show a lawn that moved on.
- **As the host, press escape and wait.** Seeds should stop landing for
  everyone until you resume - the round is genuinely paused, not just hidden.
- **Press leave the party from the pause card.** You should end up back on
  your own island, the same as leaving from the lobby popup.
- **Press end the party.** Everybody goes home; starting again gives a fresh
  lawn, an empty loadout and a full pot.

## Gate record

Filled in when the human passes it.

## Measured

Nothing to measure in the canvas: this module draws no 3D at all.
