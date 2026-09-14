# 14-garden

## What this is

**Garden Goofs, without the game.** A 2D lane defence played on a six-by-nine
lawn: animals hold the lanes, pests come up them, and seeds are one pot shared
by the whole party.

What is built is everything a round needs before it can start:

- **The lawn** - six rows, nine columns, pure indices.
- **The pieces** - `GardenPiece`, and the two catalogues under it: four animals
  and eight pests.
- **The lobby** - endless, co-op or versus, chosen by the host.
- **The menu** - the host presses start and everybody chooses the animals they
  are taking in. Nobody plays until everybody has finished choosing.
- **The pot** - one shared number, the host's to be right about.

Then the lawn is drawn and **nothing happens**, because there is no game.
Nothing is planted, nothing walks in, nothing is eaten, nothing is scored.

## It is a 2D game

Drawn in the DOM, over the world, in `GardenScreen`. Not a place in the world:
there is no board in the sea, no raft, nothing to swim to, and nothing in this
module is measured in metres. A square is a row and a column; how big that is
on the screen is the view's business and nobody else's.

The world carries on behind it, which is where everybody's body still is. That
is the difference between the two games this build has: Volcano Island moves
your body somewhere, and Garden Goofs draws over it.

## The lawn

| | |
| --- | --- |
| Rows | 6, and a row is a **lane** |
| Columns | 9 |
| Squares | 54, indexed in reading order |

**Column 0 is the house end; column 8 is where pests come in**, so a pest walks
from 8 down towards 0 along one row. That is the one thing here which is a game
decision rather than arithmetic, and it is written down so the whole build
agrees on it before anybody writes a wave. There is a test.

A column is a **number, not an index**: a defender sits in a square and a pest
spends most of its life between two, so `col` is 6.4 for most of a worm's life
and `piece.square` is the one it is standing in.

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
the menu long before any game exists; a piece is one duck in one square with the
health it has left. Keeping them apart is what lets the lobby be built first.

### The four animals

| | Cost | Health | Role | Reach |
| --- | --- | --- | --- | --- |
| Duck | 25 | 100 | eats | the lane |
| Frog | 50 | 80 | eats | 3 squares |
| Rabbit | 25 | 60 | **enriches** | none |
| Turtle | 40 | 400 | walls | none |

Exactly one animal turns up seeds, and it cannot defend itself - the pot has to
come from somewhere, and a lawn of nothing but growers should be as broken as a
lawn with none. Tested, both ways.

### The eight pests

Worm, beetle, snail, ant, grasshopper, bee, spider, moth. Each has health, a
speed in squares a second, a bite, and how it gets about: `walks`, `flies` (a
wall is no use) or `hops` (clears exactly one thing in the way). At least one
flies, and there is a test that says so - a defence with no answer to the air
is a defence that cannot be balanced.

**The numbers are first numbers.** They are in a table precisely so that
balancing later is editing a table rather than hunting through code.

## Seeds are shared

One pot for the whole party, not one each. Somebody has to be right about a
shared number, and it is the host - the same person who is right about the
clock, the weather and the phase.

Nothing spends seeds yet. `changeSeeds` is host-only, and when planting exists
a guest planting a duck will have to go through the host; see the limitations.

## Picking, and when a round begins

The party phase is `10-party`'s, and says the host pressed start. What happens
then is this module's:

```
gardenPhase(playing, everyone, hands)
  not playing                  -> 'off'
  playing, somebody still out  -> 'picking'
  playing, everybody in        -> 'planting'
```

A hand is in `hands` **only once its owner has confirmed it**. A half-chosen
hand is a draft and stays in the menu, because this is the answer to "has
everybody picked" and a half-finished answer is worse than none.

`GOOFS.handSize` is 3 out of the 4 animals. Fewer than there are, on purpose:
three out of four is a decision every round - bring the turtle or bring the
frog - and four out of four is a list you click through without reading.

## Public contract

| Export | Meaning |
| --- | --- |
| `GRID`, `Cell` | 6 by 9, and what a square is |
| `everyCell()` / `cellIndex(r, c)` / `cellAt(i)` / `inGrid(r, c)` | The board. Pure |
| `isLight(r, c)` / `laneProgress(col)` / `houseCol()` / `entryCol()` | Drawing it, and which way is which. Pure |
| `GardenPiece`, `Defender`, `Pest` | The base class and the two sides |
| `DEFENDERS`, `PESTS` | The two catalogues. Frozen |
| `DefenderSpecies`, `PestSpecies`, `Species` | What is in them |
| `defenderById` / `pestById` / `isDefenderId` / `isPestId` | Looking one up, guarding one. Pure |
| `GOOFS` | Hand size, starting seeds |
| `gardenPhase` / `everyoneHasPicked` / `waitingToPick` | Whether a round can begin. Pure |
| `validHand` / `handIsFull` | What counts as a hand. Pure |
| `canAfford` / `cheapestCost` | The pot against the price list. Pure |
| `decodeGoofs` / `encodeGoofs` | The wire format, and its validation. Pure |
| `useGoofs()` / `getGoofs()` | `{ hands, seeds }` |
| `pickHand(hand)` / `myHand()` / `clearHands()` / `forgetPicker(id)` | Your hand, and everybody's |
| `resetSeeds()` / `changeSeeds(by)` | The pot. Host only |
| `useGardenMode()` / `chooseGardenMode(id)` / `GARDEN_MODES` | Endless, co-op, versus |
| `needsPlayers(id)` | The fewest players a mode makes sense with. Pure |
| `useGoofsSync()` | Keep the lobby in step. Call once, from something always mounted |
| `GardenScreen` | The 2D screen. Mounted in `App.tsx`, outside the canvas |

## Invariants you may rely on

- **Six by nine, lanes along the rows, house at column 0.** Everything written
  later will assume it and none of it will say so.
- **A fractional column is not a square.** `inGrid` refuses one, which is what
  stops a walking pest being treated as standing somewhere.
- **Nothing is deader than dead.** `hurt` clamps at zero; a health of -9000
  leaks into every health bar that ever reads it.
- **A hand is whole or it is not a hand.** Empty, oversized, or naming an
  animal nobody has heard of is refused outright - and a duplicate is dropped
  rather than refused, because clicking twice is a slip and not a lie.
- **The pot is the host's.** A guest's `changeSeeds` does nothing.
- **An unreadable message is refused whole.** A hand of nine or a pot of NaN
  would put something in the menu that cannot be drawn and cannot be cleared.
- **Leaving a lobby clears the table.** Hands go, the pot goes back to the
  start, and the next round begins from nobody.

## Deliberate non-goals

- **No game.** Nothing is planted, nothing walks, nothing is eaten or scored,
  and the three modes differ in name only.
- **No art and no animation.** Every creature is a coloured pill - see the note
  in `13-modes`.
- **No spending.** Seeds are shared and counted; nothing takes any.
- **Nothing in 3D.** No board in the world, nothing to swim to.

## Known limitations

- **The pot is host-owned with no way to ask it for anything.** That is fine
  while nothing spends. When planting exists, a guest will have to ask the host
  and be told yes or no, or two people will plant the last duck at once.
- **The world takes your keys while the screen is up.** WASD still walks your
  body behind the overlay, and V still swaps the view. Harmless, and worth
  fixing when the board wants keys of its own.
- **Nothing prunes a hand mid-round** except a player leaving; a round that
  starts is stuck with the hands it started with.
- **The three modes are names.** The lobby promises them; the game will have to
  keep the promise.

## How to review

Two browsers in one lobby is the real test, but everything except the waiting
works on your own - out of a lobby you are your own host.

- **Pick Garden Goofs in the lobby, ready up, press start.** A 2D board should
  cover the screen with a menu over it, and the world should still be there
  behind the dark.
- **Read the menu.** Four animals, each with a cost, a health, a recharge and a
  line saying what it is for. The pests it is warning you about are listed
  along the bottom.
- **Pick a fourth animal.** You should not be able to: three is the hand, and
  the ones you have not chosen go dim once it is full.
- **Click one you have chosen.** It should come back out again.
- **Press take these in.** Your hand should lock, and the menu should say who
  it is still waiting for.
- **With two browsers:** the round must not begin until *both* have taken their
  animals in. One player picking should not move the other player's screen on.
- **Then the lawn.** Six rows of nine, checkerboarded, with your chosen animals
  in a tray above it and the shared seed count in the bar.
- **Watch the seed count in both browsers.** It is one pot: they must agree.
- **Press end the round as the host.** Both go back to the world, and starting
  again should open the menu fresh with nobody's hand in it.
- **Have the guest leave mid-pick.** The host must stop waiting on them.
- **Make the window narrow.** The board should stay square-ruled and on the
  screen rather than running off the side.

## Gate record

Filled in when the human passes it.

## Measured

Nothing to measure in the canvas: this module draws no 3D at all.
