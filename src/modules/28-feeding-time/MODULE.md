# 28-feeding-time

## What this is

**Minigame 6.** Ducks paddle about a pond, and everybody stands on the near bank
with a pocket of crackers. Hold the left button in the bottom third of the screen
and flick the mouse up into the top third to throw one:

- **The flick's lean is the aim.**
- **The flick's speed is how far it goes.**
- **A cracker that lands near a duck feeds it:** a point, and that duck is busy
  eating for a moment.

Most ducks fed at a minute wins.

It plugs into `15-minigames` and nothing else in the build knows it exists.
Importing the module registers it - one line in `src/App.tsx`.

This is the **environment** and **controls** stages done. The assets stage is
not: the ducks and crackers are primitives, and the players are the island's
capsule.

## The rules, and where each one lives

| The brief said | Where it is |
| --- | --- |
| Feed the ducks at the pond by throwing crackers | `throwCracker`, `stepGame` landing crackers |
| Hold the left button and rapidly drag from the bottom third to the top third | `flickToThrow`, `FLICK`, the screen's pointer handling |
| The faster you throw, the more crackers you can feed | a flick is a throw the moment it reaches the top third; `POND.reload` is only 0.25 s |
| Aim carefully to land them near the ducks | the flick's lean and speed; `POND.feed` (1.25) |
| Most ducks fed wins | `placings` |

## The flick

`flickToThrow(from, to, seconds, aspect)`:

- **Starting:** it has to start in the bottom third of the view.
- **Throwing:** it throws the moment the pointer reaches the top third - no need
  to let go.
- **Too slow:** more than 0.7 s from press to top third is not a throw. A slow
  drag throws nothing.
- **Aim:** the lean - how far across the drag goes for how far up, measured in
  the same units - is the throw's angle off straight ahead, up to one radian
  either way.
- **Distance:** the drag's speed in view heights a second sets how far it goes. At
  0.5 or slower it goes the least (3), and at 3.2 or faster the most (20), evenly
  in between.

There is no landing marker. Reading a flick is the game.

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
  where a duck will be does not flick the mouse for you.
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
  of the flick and handed over to the host's cracker once the host has it.
  Whether it fed a duck is the host's to say.
- **Pausing in a lobby stops only your hands.** Alone, the clock stops.
- **The canvas is rendered once**, and the scene redraws itself from a ref each
  frame - see Duck Hunt's notes.

**The roster is the lobby**, host first, up to eight. Alone, three stand-ins fill
in. A stand-in picks a duck that is not eating, leads it, and throws every 1.1 to
2 seconds - its lean up to seven degrees out, its distance up to a sixth. Against
a script flicking at the nearest duck as fast as it can, they come out a few
ducks behind.

## Seeing what happened

- **The pond:** grass, a sandy edge, reeds round the far side, and everybody on
  the bank facing the water, a ring under your own spot.
- **Ducks** paddle their loops, bobbing; a duck eating dips its head.
- **Crackers** arc out from whoever threw them and land with a ripple - white for a
  miss, a ring in the thrower's colour round the duck for a feed.
- **The view** marks the bottom third, where a flick must start ("hold here and
  flick up"), and the top third's edge. A white trail follows the drag.
- **Your own feeds** flash "Fed! +1" up top.
- **The HUD** has the clock (red for the last ten seconds) and everybody's ducks
  fed; the results add throws and the share that fed.

## The camera does not move

Behind the bank, over everybody's shoulders, looking out across the pond at 40
degrees, so a flick up the screen goes out over the water. The whole pond and
bank in view. Fitted to the pond's edge and the bank, and tested at eight window
shapes.

## Public contract

Exported because it is worth testing, not because anything else needs it.

| Export | What it is |
| --- | --- |
| `POND`, `FLICK`, `COLOURS` | The rules and the look, as numbers. |
| `flickToThrow`, `landing`, `flightTime`, `spotOf`, `onPond` | Throwing. Pure. |
| `layDucks`, `ducksFor`, `duckAt`, `duckCount` | The ducks. Pure. |
| `createGame`, `throwCracker`, `canThrow`, `stepGame`, `timeLeft`, `placings` | The round. Pure. |
| `Game`, `Feeder`, `Cracker`, `Duck`, `Throw`, `Point`, `Entrant` | Its shapes. |
| `botThrows`, `BOT_EVERY`, `BOT_AIM` | The stand-ins. |
| `newGame`, `gameRoster`, `nextSeed`, `waitingGame`, `myId`, `ME`, `SOLO_FEEDERS`, `MAX_FEEDERS` | Dealing a round. |
| `encodeSnapshot`, `decodeSnapshot`, `applySnapshot`, `encodeIntent`, `decodeIntent`, `SNAPSHOT_TAG`, `INTENT_TAG` | A shared pond on the wire. Pure. |
| `frameScene`, `POINTS`, `TILT`, `FOV`, `FILL` | The camera. Pure. |
| `FeedingTimeScreen` | The panel the registry draws. |

## Invariants you may rely on

- **Only a flick from the bottom third to the top third, within 0.7 s, throws.** Tested.
- **A straight flick goes straight; a leaning one leans; a faster one goes further,
  within limits.** Tested.
- **Ducks stay on the water; more ducks for more players; the same ducks for the
  same seed.** Tested.
- **A cracker landing by a duck feeds it for a point; far from a duck, or on the
  bank, it feeds nobody; a duck eating takes nothing.** Tested.
- **The reload holds, a throw said again counts once, and a guest's is allowed a
  moment early.** Tested.
- **A throw asked for past the limits is clamped.** Tested.
- **The round ends at a minute, landing what is still in the air; ranked by ducks
  fed.** Tested.
- **Stand-ins throw on their rhythm, feed plenty, and miss some.** Tested.
- **Eight players with a lossy network agree on every score, and no throw counts
  twice.** Tested.
- **The pond and bank are in frame at any window shape.** Tested.

## Deliberate non-goals

- No models, no sound.
- No moving camera.
- No landing marker or aiming guide.
- No taking a duck from somebody else's cracker: the first to land feeds it.

## Known limitations

- **A guest's throw leaves on the host a moment after the flick**, so it lands a
  moment later there than on the guest's screen. The ducks move a hand's width in
  that time.
- **Aim is the flick, not the pointer**, which is the brief - but a player expecting
  to point at a duck will need a throw or two to learn it.
- **The shared plumbing is copied a fourteenth time** - camera fit, host/guest hook,
  results card. Moving it into `15-minigames` is overdue.

## How to review

Open a lobby, leave the game on Volcano Island, press **minigames**, open
**6 · Feeding Time**, and press **play**.

- **Look at the pond.** Ducks paddling, four pills on the bank, a ring under yours,
  the bottom third marked "hold here and flick up".
- **Drag up slowly.** A trail follows, and nothing is thrown.
- **Flick up fast and straight.** A cracker arcs out straight ahead from your spot.
  Flick faster: it goes further. Lean the flick: it goes that way.
- **Land one by a duck.** The duck dips its head, a ring in your colour, "Fed! +1".
- **Throw at a duck that is already eating.** Nothing.
- **Watch the stand-ins** throw and feed, and miss.
- **At a minute,** the results: ducks fed, throws, and the share that fed. **Again**
  starts a new round.

### With two browsers

- **Both see the same ducks.**
- **Guest: flick.** The cracker leaves at once on your own screen, and the host sees
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
