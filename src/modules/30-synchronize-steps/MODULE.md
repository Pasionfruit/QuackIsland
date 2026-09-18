# 30-synchronize-steps

## What this is

**Minigame 19.** Everybody starts on top of a tower twenty steps high. Every two
seconds everybody picks how far to go down: 1, 4 or 6. Then the picks are
revealed. If exactly two picked the same number, both go down that far. If three
or more did, they all drop eight. Anybody alone on a number stays put. The game
ends as soon as anybody reaches the bottom. Highest at the end wins.

It plugs into `15-minigames` and nothing else in the build knows it exists.
Importing the module registers it - one line in `src/App.tsx`.

This is the **environment** and **controls** stages done. The assets stage is
not: the players are the island's capsule and the staircase is boxes.

## The rules, and where each one lives

| The brief said | Where it is |
| --- | --- |
| Players start on a tower 20 steps high | `TOWER.steps`, `createGame` |
| Every 2 seconds, choose 1, 4 or 6 steps down | `TOWER.choose`, `TOWER.options`, `choose` |
| Two players choose the same number: both move down that many | `moveFor`, `resolve` |
| 3 or more choose the same number: all jump 8 down | `TOWER.crowdDrop`, `moveFor` |
| The only player on an option stays still | `moveFor` |
| Eliminated on reaching the bottom, and the game ends | `resolve` sets `out`, `reachedBottom` ends it |
| Winner by the final top-to-bottom order | `placings` |
| 1 / 4 / 6 to choose, mouse to select an option | the screen: number keys (top row or numpad) and three buttons |

## The round

- **Picking** lasts two seconds. You can pick, and change your pick, as often as
  you like; the last one counts.
- **The reveal** lasts 1.9 seconds. Everybody's pick is shown, grouped by number,
  and everybody walks down to where it takes them, one step at a time.
- **Moves** can take you below the bottom. You stop at nought, and you are out.
- **The end** comes as soon as anybody reaches the bottom, or when one player or
  none is left on the tower (somebody leaving the lobby does not end it). It also comes
  after thirty rounds: two players who keep picking different numbers never move,
  so without a limit the game would never end.
- **Placing:** anybody still on the tower is placed by how high they are. Then
  everybody who is out, the later they went out the better, and from higher up
  the better. Players level on both share a place.

### Decisions to check

- **A player who has not picked by the end of a round gets a pick at random**,
  shown as "(late)". Without this, not picking would be the best move in the game,
  since you would never move.
- **The first to the bottom ends the game.** Everybody still up is placed by
  height; everybody who went down that round by the step they fell from.
- **Last one standing also ends it**, for when everybody else leaves the lobby.
- **Two left on the same step can only tie**, since any move takes them both down
  the same amount. That follows from the rules, and they share a place.
- **Thirty rounds** is about a minute and a half at most.

## Nobody sees anybody else's pick until the reveal

A pick you could see before making yours is a pick you would avoid, and the game
is about guessing. So while picking, a snapshot says who has picked but not what.
Your own pick shows on your own screen as a number over your head and a
highlighted button; everybody else's shows as a tick.

## One tower, and it is the host's

- **The host runs the rounds.** It keeps the clock, takes everybody's pick (its
  own, the stand-ins', the guests' as they arrive), resolves the reveal, and
  sends the tower (`ss`) ten times a second.
- **A guest sends its pick** (`ss-in`): game, round and number. It is said again
  every quarter second for the rest of the round, since a guest may change its
  mind, and the latest one the host hears counts. A pick for another round or
  another game is ignored.
- **A guest's clock runs on between snapshots**, eased towards the host's, so the
  timer bar runs smoothly.
- **Somebody who leaves the lobby is out** where they stand, that round.
- **a pause stops the round for everybody.** Alone, the clock stops.
- **The canvas is rendered once**, and the scene redraws itself from a ref each
  frame - see Duck Hunt's notes.

**The roster is the lobby**, host first, up to eight. Alone, three stand-ins fill
in. A stand-in picks at some point in the first second and a half. It leans
towards the numbers fewest players picked last round, but only as a lean.

## Seeing what happened

- **The tower:** one wide stone staircase going down from left to right, twenty
  steps numbered down its front. Each player has a lane with treads tinted in
  their colour. Everybody starts together at the top left.
- **Picking:** a bubble over your head shows your number, a tick over anybody
  else's head says they have picked, and the bar under the stage runs down.
- **The reveal:** every bubble shows its number, green if the player was alone,
  yellow for a pair, red for a crowd. Cards across the top say what each number
  did ("pair - down 4", "crowd - down 8", "alone - stays", "nobody") and who
  picked it. A moment later everybody walks down, hopping one step at a time.
- **Out:** you land on the ground past the bottom step, and your HUD pill says
  "out".
- **The end:** the results card, highest first, gives each player's step, or the
  round they went out in and the step they fell from.

## The camera does not move

It stands out front and well up (48 degrees), with the whole staircase in view.
It is fitted to however many lanes there are, so four players are not lost on a
tower built for eight. It is tilted steeply enough that a player never hides the
one in the lane behind: over one lane, the line of sight to the next player's
feet is higher than a player is tall. At every point along the staircase all the
lanes are the same height, so the steps never hide anybody either. Tested at
eight window shapes for two, four and eight lanes.

## Public contract

Exported because it is worth testing, not because anything else needs it.

| Export | What it is |
| --- | --- |
| `TOWER`, `PHASES`, `COLOURS` | The rules and the look, as numbers. |
| `createGame`, `choose`, `moveFor`, `resolve`, `stepGame`, `leave`, `onTower`, `reachedBottom`, `placings` | The game. Pure. |
| `Game`, `Stepper`, `Move`, `Phase`, `Entrant` | Its shapes. |
| `botChoices`, `BOT_PICKS` | The stand-ins. |
| `newGame`, `gameRoster`, `nextSeed`, `waitingGame`, `myId`, `ME`, `SOLO_STEPPERS`, `MAX_STEPPERS` | Dealing a game. |
| `encodeSnapshot`, `decodeSnapshot`, `applySnapshot`, `encodeIntent`, `decodeIntent`, `HIDDEN`, `SNAPSHOT_TAG`, `INTENT_TAG`, `WireStepper` | A shared tower on the wire. Pure. |
| `frameScene`, `pointsFor`, `POINTS`, `STAIRS`, `LANES`, `stepX`, `stepY`, `laneZ`, `hopAt`, `walkAt`, `TILT`, `FOV`, `FILL` | The staircase and the camera. Pure. |
| `SynchronizeStepsScreen` | The panel the registry draws. |

## Invariants you may rely on

- **Alone stays, a pair moves by its number, three or more drop eight.** Tested.
- **Only 1, 4 or 6, only while picking, only for this round; the last pick counts.**
  Tested.
- **Anybody who has not picked gets a random pick, the same one for the same seed.**
  Tested.
- **Nobody out is counted in a pick.** Tested.
- **The bottom is out and ends the game; so does one or none left, or thirty
  rounds. Leaving the lobby does not end it.** Tested.
- **The walk down goes one step at a time and is done before the reveal is.**
  Tested.
- **Placed by height, then by how late and from how high they went out, level
  sharing.** Tested.
- **Stand-ins pick once each in the first second and a half, and their games end.**
  Tested.
- **Snapshots show who has picked but not what until the reveal; a guest's own
  pick is kept.** Tested.
- **Eight players with a lossy network, changing their minds and sometimes not
  picking, agree on every step.** Tested.
- **A hop starts on one step, lands on the other, and clears the treads on the
  way.** Tested.
- **The tower is in frame at any window shape, and nobody hides the lane behind.**
  Tested.

## Deliberate non-goals

- No models, no sound.
- No moving camera.
- No showing picks before the reveal.
- No score kept between games.

## Known limitations

- **A pick made in the last moment of a round may not reach the host** before the
  round ends. The guest then gets a random pick, marked "(late)".
- **In a very small window** the reveal cards cover much of the staircase.
- **The shared plumbing is copied a sixteenth time**: camera fit, host/guest hook,
  results card. Moving it into `15-minigames` is overdue.

## How to review

Open a lobby, leave the game on Volcano Island, press **minigames**, open
**19 · Synchronize Steps**, and press **play**.

- **Everybody at the top**, left of the staircase, one lane each.
- **Press 4.** The 4 button lights up and a 4 appears over your head. Press 6: it
  changes. Click 1: it changes again.
- **The reveal.** Cards across the top say what each number did and who picked
  it. Everybody walks down to their new step, one step at a time.
- **Sit a round out.** A pick is made for you, marked "(late)".
- **Press a number during the reveal.** It does not carry into the next round.
- **Reach the bottom.** You land on the ground, your pill says "out", and the
  game ends.
- **The end.** The results run top to bottom.

### With two browsers

- **Pick in one.** The other sees a tick over that player, not the number.
- **At the reveal,** both show the same picks and the same steps.

## Gate record

Not yet gated.

## Measured

Not measured against the world's budget, because it does not draw into the
world's canvas. The staircase is twenty boxes, twenty number planes and one
instanced mesh of treads. A player is the pill and a sprite. There is one
shadow-casting light.

Like the other minigames, it opens a **second WebGL context** while a game is up.
