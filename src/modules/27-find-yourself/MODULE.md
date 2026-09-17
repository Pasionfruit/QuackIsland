# 27-find-yourself

## What this is

**Minigame 12.** A row of identical red cups on a table, and under each one
somebody's face - every player's, as their own pill in their colour, and an empty
spare or two. Each stage goes:

- **Show:** the cups lift to show who is where.
- **Shuffle:** they come down and shuffle, two at a time, trading places on arcs
  past each other.
- **Pick:** everybody clicks the cup they think their own face is under.
- **Reveal:** the cups come up.

There are three stages. Each shuffle is longer and faster than the last, and the
stages are worth 1, 2 and 3 points. Most points wins.

It plugs into `15-minigames` and nothing else in the build knows it exists.
Importing the module registers it - one line in `src/App.tsx`.

This is the **environment** and **controls** stages done. The assets stage is
not: the faces are the island's capsule and the cups are cylinders.

## The rules, and where each one lives

| The brief said | Where it is |
| --- | --- |
| Cups with each player's face underneath | `dealStage` - `faces`, `cupCount` |
| Cups shuffle around the table at increasing speeds | `TABLE.swaps` (7, 12, 18), `TABLE.swapTime` (0.6, 0.42, 0.28 s), `cupsAt` |
| After each stage, select the cup hiding your face | the `pick` phase, `pick` |
| 3 stages worth 1, 2 and 3 points | `TABLE.points`, `stepGame` scoring on the reveal |
| Each stage faster and harder to track | more swaps, each quicker |
| Most points at the end wins | `placings` |
| Mouse - aim; left click - select a cup | `pickSlot`, the scene's pointer handling |

## A stage

- **The deal.** A cup for every player and at least one spare, never fewer than
  five. Faces are dealt afresh each stage, from the seed.
- **Show, 2.5 s.** The cups are up and a banner says which colour is yours.
- **Cover, 0.7 s.** The cups come down.
- **Shuffle.** Two cups trade places at a time, easing out and back in, one in
  front of the row and one behind so they pass. The same pair is never swapped
  twice running, since that would look like nothing happened.
  - Stage 1: 7 swaps at 0.6 s each.
  - Stage 2: 12 swaps at 0.42 s.
  - Stage 3: 18 swaps at 0.28 s.
- **Pick, 7 s.** Click a cup. The first click is your pick for the stage. The
  phase ends early once everybody still here has picked.
- **Result, 3.2 s.** The cups lift up and back off the faces, a marker in every
  picker's colour stands in front of the cup they chose (larger and glowing if
  it was really theirs), and the stage's points go to everybody who found
  themselves.

## Picks are hidden until the cups come up

A snapshot sends a pick as "has picked" until the reveal, so nobody can follow a
player who kept their eye on the right cup. A guest's own pick stays on its own
screen, ringed in its colour, the moment it clicks.

The shuffle itself is **not** hidden. Every browser animates it from the seed,
and a browser that can animate a shuffle can follow it. The dev tools can find
your cup; your eyes are meant to.

## One table, and it is the host's

- **The host runs the game** - phases, clock, its own pick, the stand-ins', the
  guests' - and sends it (`fy`) ten times a second.
- **A guest sends its pick** (`fy-in`): game, stage, slot. It is said again every
  150 ms while picking and counted once; a pick for another stage is refused.
- **A guest's clock is eased to the host's** within a phase and snapped to it
  across one, never running past the end of a phase, since the host says when a
  phase is over. The shuffle it draws is the host's, swap for swap.
- **Somebody who leaves the lobby is not waited for.**
- **Pausing in a lobby stops only your hands.** Alone, the clock stops.
- **The canvas is rendered once**, and the scene redraws itself from a ref each
  frame - see Duck Hunt's notes.

**The roster is the lobby**, host first, up to eight. Alone, three stand-ins fill
in. A stand-in takes 1.2 to 4 seconds to pick, and tracks its own cup 80% of the
time in stage 1, 55% in stage 2 and 35% in stage 3 - otherwise it picks another
cup at random.

## The camera does not move

In front of the table, raised 42 degrees, fitted to the row of cups actually on
the table (five for a small game, nine for eight players) with room for swaps
and lifts. Tested at eight window shapes for five, seven and nine cups. So is a
click: every cup, low and high, projected through a real camera and picked back,
and a click between two cups picks neither.

## Public contract

Exported because it is worth testing, not because anything else needs it.

| Export | What it is |
| --- | --- |
| `TABLE`, `COLOURS`, `PHASES` | The rules and the look, as numbers. |
| `cupCount`, `slotX`, `dealStage`, `stageFor`, `slotsAfter`, `facesBySlot`, `shuffleTime` | The cups and the shuffles. Pure. |
| `createGame`, `stepGame`, `pick`, `leave`, `allPicked`, `found`, `currentStage`, `phaseLength`, `cupsAt`, `placings` | The game. Pure. |
| `Game`, `Finder`, `Stage`, `Phase`, `Entrant` | Its shapes. |
| `botPicks`, `BOT_TRACKS`, `BOT_DECIDES` | The stand-ins. |
| `newGame`, `gameRoster`, `nextSeed`, `waitingGame`, `myId`, `ME`, `SOLO_FINDERS`, `MAX_FINDERS` | Dealing a game. |
| `encodeSnapshot`, `decodeSnapshot`, `applySnapshot`, `picksShown`, `encodeIntent`, `decodeIntent`, `HIDDEN`, `SNAPSHOT_TAG`, `INTENT_TAG` | A shared table on the wire. Pure. |
| `frameScene`, `pickSlot`, `pointsFor`, `POINTS`, `TOP`, `CUP_HEIGHT`, `LIFT`, `LIFT_BACK`, `TILT`, `FOV`, `FILL` | The camera and clicks. Pure. |
| `FindYourselfScreen` | The panel the registry draws. |

## Invariants you may rely on

- **A cup for every player and a spare, never fewer than five; every player under
  exactly one cup; dealt afresh each stage.** Tested.
- **More swaps, each quicker, every stage; never the same pair twice running.** Tested.
- **Cups end up where the swaps take them.** Tested with a worked example.
- **Mid-swap, two cups are partway between their slots, passing on opposite
  sides; cups are down while shuffling, up while showing.** Tested.
- **Each stage goes show, cover, shuffle, pick, result.** Tested.
- **One pick a stage, only while picking; finding yourself scores the stage's
  worth: 1, 2, 3.** Tested.
- **Picking ends early once everybody still here has picked.** Tested.
- **Stand-ins pick after a moment, and find themselves less each stage.** Tested.
- **Picks are hidden in snapshots until the reveal; a guest's own pick is kept.** Tested.
- **Eight players with a lossy network agree on every pick and score.** Tested.
- **The row is in frame at any window shape for any number of cups, and a click
  on a cup is that cup.** Tested.

## Deliberate non-goals

- No models, no sound.
- No moving camera.
- No changing your pick once made.
- No hiding the shuffle from the browser that animates it.

## Known limitations

- **The shuffle can be followed in code.** It has to reach every browser to be
  drawn.
- **With two players the extra cups make it a guess among five**; with eight, nine
  cups and three faces too many to watch at once. That is the game.
- **The shared plumbing is copied a thirteenth time** - camera fit, host/guest
  hook, results card. Moving it into `15-minigames` is overdue.

## How to review

Open a lobby, leave the game on Volcano Island, press **minigames**, open
**12 · Find Yourself**, and press **play**.

- **Show.** Five cups up, four faces under them, a banner telling you which colour
  is you.
- **Cover and shuffle.** The cups come down and trade places in pairs, passing in
  front and behind.
- **Pick.** Move the pointer over the cups - a white ring under the one you are on
  - and click: a ring in your colour, and the HUD ticks you as picked.
- **Result.** The cups lift up and back. Markers in front show who picked what; the
  right ones glow. "You found yourself! +1", or not.
- **Stages 2 and 3.** Faster each time. The HUD shows the stage and its worth.
- **The results.** A tick for each stage everybody found themselves in, and totals.
  **Again** deals a new game.

### With two browsers

- **Both see the same faces and the same shuffle.**
- **Pick in one.** The other sees "picked" but not which cup, until the cups come up.
- **After the reveal,** both agree on picks and points.

## Gate record

Not yet gated.

## Measured

Not measured against the world's budget, because it does not draw into the
world's canvas. A cup is three meshes, a face the pill, the table four; nine cups
and eight faces is well under a hundred draw calls. One shadow-casting light.

Like the other minigames, a **second WebGL context** while a game is up.
