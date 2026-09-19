# 28-feeding-time

## What this is

**Minigame 6.** Ducks paddle about a pond, and everybody stands on the near bank
with a pocket of crackers. Point at the water, hold the left button and let go to
throw one:

- **The pointer is the aim.** A dotted line runs from your spot out to a ring on
  the water under the pointer.
- **How long you hold is how far it goes.** A power meter fills while the button
  is held - and falls back if held past full, so it is timed, not just held. A
  tick on the meter marks the power that reaches the pointer, and a marker in
  your colour on the water shows where the throw would land at the power held.
- **A cracker that lands near a duck feeds it:** a point, and that duck is busy
  eating for a moment.

Most ducks fed at forty-five seconds wins.

It plugs into `15-minigames` and nothing else in the build knows it exists.
Importing the module registers it - one line in `src/App.tsx`.

This is the **environment** and **controls** stages done. The assets stage is
not: the ducks and crackers are primitives, and the players are the island's
capsule.

## The rules, and where each one lives

| The brief said | Where it is |
| --- | --- |
| Feed the ducks at the pond by throwing crackers | `throwCracker`, `stepGame` landing crackers |
| Aim, then hold and release to set the power (changed from the original flick, on request) | `aimThrow`, `chargePower`, `CHARGE`, `groundAt`, the screen's pointer handling |
| The faster you throw, the more crackers you can feed | a throw is as quick as the power it needs; `POND.reload` is only 0.25 s |
| Aim carefully to land them near the ducks | the pointer and the power; `POND.feed` (1.25) |
| Most ducks fed wins | `placings` |

## The aim and the charge

This replaced a flick - drag from the bottom third to the top third, its lean the
aim and its speed the distance - which players found too hard to control.

- **Aim:** `groundAt(across, down, aspect)` finds the spot on the ground under the
  pointer through the same camera the canvas uses (tested against three's own
  camera). The throw goes from your spot towards it, up to one radian either way
  (`aimAngle`).
- **Charge:** hold the button anywhere on the board. `chargePower(seconds held)`
  rises from 0 to 1 over `CHARGE.fill` (1.1 s), then falls back to 0 and rises
  again for as long as it is held.
- **Throw:** letting go throws, with the power held at that moment
  (`aimThrow`). The distance is 3 at no power and 20 at full, evenly in between
  (`powerDistance`). A throw lands exactly on the pointer only when the power is
  right for it (`distancePower` of the distance to it) - that tick on the meter
  is the target.
- **Pointing is not throwing:** moving the pointer about throws nothing; neither
  does holding, until you let go. A press during the countdown or a pause
  charges nothing.

## The throw

- **Where it starts:** from your own spot on the bank - players stand along it in
  roster order.
- **Flight:** it lands after `0.3 + 0.035 × distance` seconds.
- **Feeding:** on landing, the nearest duck within 1.25 that is not already eating
  is fed. The thrower gets a point, and the duck eats for 1.6 s, taking nothing
  else meanwhile. A cracker that feeds nobody floats a moment and is gone.
- **Reload:** 0.25 s between one player's throws. The host allows a guest's throw
  0.08 s early, since a guest's clock is only eased to the host's.
- **At the whistle:** crackers still in the air land, and count.

## The ducks

- **Numbers:** seven, and one more for every player past four.
- **Swimming:** each paddles its own wobbly loop inside the pond, at its own pace,
  either way round.
- **Shared:** where a duck is at any moment is a function of the seed and the
  clock, so every browser draws the same ducks. The seed is not a secret: knowing
  where a duck will be does not aim and time the throw for you.
- **On the water:** tested over two minutes for twenty seeds - including eight
  players' worth of ducks - with room to spare.

## One pond, and it is the host's

- **The host runs the round** - the clock, every throw, every landing - and sends
  it (`ft`) twelve times a second: scores, the crackers in the air or floating,
  and which ducks are eating.
- **A guest sends a throw** (`ft-in`): round, a number that goes up every throw,
  the lean and the distance. It is said again until taken, and counted once. The
  host clamps a throw to the limits.
- **A guest's own cracker leaves its hand at once**, drawn flying from the moment
  of letting go and handed over to the host's cracker once the host has it.
  Whether it fed a duck is the host's to say.
- **a pause stops the round for everybody.** Alone, the clock stops.
- **The canvas is rendered once**, and the scene redraws itself from a ref each
  frame - see Duck Hunt's notes.

**The roster is the lobby**, host first, up to eight. Alone, three stand-ins fill
in. A stand-in picks a duck that is not eating, leads it, and throws every 1.1 to
2 seconds - its lean up to seven degrees out, its distance up to a sixth. Against
a script throwing at the nearest duck as fast as it can, they come out a few
ducks behind.

## Seeing what happened

- **The pond:** grass, a sandy edge, reeds round the far side, and everybody on
  the bank facing the water, a ring under your own spot.
- **Ducks** paddle their loops, bobbing; a duck eating dips its head.
- **Crackers** arc out from whoever threw them and land with a ripple - white for a
  miss, a ring in the thrower's colour round the duck for a feed.
- **Your aim:** a dotted line from your spot to a white ring under the pointer
  (the ring is the size a cracker has to land within to feed), and while the
  button is held a ring in your colour where the throw would land.
- **The power meter** at the bottom: fills in your colour while held, a white tick
  at the power that reaches the pointer, and "point at the water · hold to charge
  · let go to throw" under it.
- **Your own feeds** flash "Fed! +1" up top.
- **The HUD** has the clock (red for the last ten seconds) and everybody's ducks
  fed; the results add throws and the share that fed.

## The camera does not move

Behind the bank, over everybody's shoulders, looking out across the pond at 40
degrees, so higher up the screen is further out over the water. The whole pond and
bank in view. Fitted to the pond's edge and the bank, and tested at eight window
shapes.

## Public contract

Exported because it is worth testing, not because anything else needs it.

| Export | What it is |
| --- | --- |
| `POND`, `CHARGE`, `COLOURS` | The rules and the look, as numbers. |
| `aimThrow`, `aimAngle`, `chargePower`, `powerDistance`, `distancePower`, `landing`, `flightTime`, `spotOf`, `onPond` | Aiming, charging and throwing. Pure. |
| `layDucks`, `ducksFor`, `duckAt`, `duckCount` | The ducks. Pure. |
| `createGame`, `throwCracker`, `canThrow`, `stepGame`, `timeLeft`, `placings` | The round. Pure. |
| `Game`, `Feeder`, `Cracker`, `Duck`, `Throw`, `Point`, `Entrant` | Its shapes. |
| `botThrows`, `BOT_EVERY`, `BOT_AIM` | The stand-ins. |
| `newGame`, `gameRoster`, `nextSeed`, `waitingGame`, `myId`, `ME`, `SOLO_FEEDERS`, `MAX_FEEDERS` | Dealing a round. |
| `encodeSnapshot`, `decodeSnapshot`, `applySnapshot`, `encodeIntent`, `decodeIntent`, `SNAPSHOT_TAG`, `INTENT_TAG` | A shared pond on the wire. Pure. |
| `frameScene`, `groundAt`, `POINTS`, `TILT`, `FOV`, `FILL` | The camera, and the ground under the pointer. Pure. |
| `FeedingTimeScreen` | The panel the registry draws. |

## Invariants you may rely on

- **The charge rises to full over 1.1 s and falls back, always 0 to 1.** Tested.
- **A throw goes the way the pointer is, within the lean; more power goes further,
  within limits; the power that reaches the pointer lands on it.** Tested.
- **The spot under the pointer is the one the canvas camera sees, at any window
  shape.** Tested.
- **Ducks stay on the water; more ducks for more players; the same ducks for the
  same seed.** Tested.
- **A cracker landing by a duck feeds it for a point; far from a duck, or on the
  bank, it feeds nobody; a duck eating takes nothing.** Tested.
- **The reload holds, a throw said again counts once, and a guest's is allowed a
  moment early.** Tested.
- **A throw asked for past the limits is clamped.** Tested.
- **The round ends at forty-five seconds, landing what is still in the air; ranked by ducks
  fed.** Tested.
- **Stand-ins throw on their rhythm, feed plenty, and miss some.** Tested.
- **Eight players with a lossy network agree on every score, and no throw counts
  twice.** Tested.
- **The pond and bank are in frame at any window shape.** Tested.

## Deliberate non-goals

- No models, no sound.
- No moving camera.
- No arc drawn in the air: the aim is shown on the water only.
- No taking a duck from somebody else's cracker: the first to land feeds it.

## Known limitations

- **A guest's throw leaves on the host a moment after letting go**, so it lands a
  moment later there than on the guest's screen. The ducks move a hand's width in
  that time.
- **The landing marker makes the aim readable**, so the skill is now leading a
  moving duck and timing the release, not reading a flick.
- **The shared plumbing is copied a fourteenth time** - camera fit, host/guest hook,
  results card. Moving it into `15-minigames` is overdue.

## How to review

Open a lobby, leave the game on Volcano Island, press **minigames**, open
**6 · Feeding Time**, and press **play**.

- **Look at the pond.** Ducks paddling, four pills on the bank, a ring under yours,
  the power meter at the bottom.
- **Move the pointer about.** A dotted line follows it from your spot to a ring on
  the water, the meter's tick moves, and nothing is thrown.
- **Hold the button.** The meter fills and a ring in your colour moves out along
  the line; hold on past full and it comes back. Let go with the fill on the tick:
  the cracker lands in the white ring.
- **Land one by a duck.** The duck dips its head, a ring in your colour, "Fed! +1".
- **Throw at a duck that is already eating.** Nothing.
- **Watch the stand-ins** throw and feed, and miss.
- **At forty-five seconds,** the results: ducks fed, throws, and the share that fed. **Again**
  starts a new round.

### With two browsers

- **Both see the same ducks.**
- **Guest: throw.** The cracker leaves at once on your own screen, and the host sees
  it land.
- **Both feed ducks.** Both agree on the scores.

## Gate record

Not yet gated.

## Measured

Not measured against the world's budget, because it does not draw into the world's
canvas. Seventy reeds (one mesh each), the pond three, a duck five, a cracker two;
eleven ducks and a few dozen crackers stays under two hundred draw calls. One
shadow-casting light.

Like the other minigames, a **second WebGL context** while a round is up.
