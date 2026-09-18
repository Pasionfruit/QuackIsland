# 20-punch-buggy

## What this is

**Minigame 8.** A round platform floating high over the sea, and everybody on
it with a fist that comes off. Aim with the mouse, click and it shoots out where
you aim; click again and it comes back. A fist that reaches somebody's **side
or back** on its way out knocks them straight out of the round; one that meets
their **front, their arm or their fist** is blocked, and only shoves them. An arm
that is already out knocks nobody out either - but it is solid, and a shove off
the edge is out too. After ten seconds the platform starts to shrink. Thirty
seconds; the last one standing wins.

It plugs into `15-minigames` and nothing else in the build knows it exists.
Importing the module registers it - one line in `src/App.tsx`.

This is the **environment** and **controls** stages done. The assets stage is
not: the fighters are the island's capsule and the fists are spheres.

## The rules, and where each one lives

| The brief said | Where it is |
| --- | --- |
| A floating platform | `RING.radius`; past it is the sea |
| Everyone has an extendable punch | `Punch`, `RING.reach`, `fistAt` |
| Click to launch, click again to retract | `click` - `in` → `out`; `out` or `held` → `back` |
| A direct hit eliminates immediately | `stepRound` - a fist **on its way out** that meets a side or a back |
| Hitting somebody's punch is not a knockout | `guarded`, `RING.guard` - their front 90°, and their arm, block |
| Knock opponents off the platform | an arm that is out shoves (`RING.arm`); a blocked punch shoves (`RING.blockPush`); off the edge is out |
| The map shrinks after ten seconds | `radiusAt`, `RING.shrinkFrom`, `RING.radiusAtEnd` |
| Rooted with your punch out | `rooted`, `RING.commit` - no walking until it is on its way back |
| See the last knockout before the end | `Round.decidedAt`, `RING.outro` |
| Thirty seconds on the clock (the catalogue) | `RING.duration` |
| WASD - move; mouse - aim; left click - extend or retract | the screen |

## The punch

`in` at your side → a click → `out`, flying where you aim at 26 units a second
→ at full reach (6), or on meeting somebody, `held` → a click → `back`, home at
30 a second → `in`. A click while it is coming `back` does nothing: you cannot
throw again until it is home.

- **You aim with the mouse.** The pointer is found on the platform at shoulder
  height and you face it whenever your arm is home - walking does not turn you.
  The aim travels in the intent (`aim`, radians); an intent without one faces
  the way it walks, as before.
- **Throwing roots you.** From the throw until the arm is on its way back you
  cannot walk at all, and it cannot be pulled back for half a second
  (`RING.commit`). A click to pull back inside that half second waits and pulls
  back the moment it can - it is not lost. Coming back, you walk at 60%.
- **Only a fist on its way out, landing on a side or a back, knocks anybody
  out.** Somebody's front - 45° either side of where they face, which is where
  their own fist is - blocks it, and so does their arm or fist if it is out
  across the path short of their body. **A punch that lands on somebody's side
  or back knocks them out even while their own arm is out** - the arm only
  blocks from its shoulder, at the edge of the body, outwards. A blocked punch shoves them 1.4 units the way it was going
  (credited, for the edge) and stops. The check is swept - the fist's whole path
  this step - so a fist fast enough to pass through somebody between frames
  still meets them.
- **An arm that is out is solid.** Held out, or coming back, it shoves anybody
  it touches clear of it.
- **Your facing is locked while your arm is out** - the punch goes where you
  were aiming when you threw it.

## The edge

The platform is whole for the first ten seconds, then closes in steadily from a
radius of 11 to 4.5 at thirty (`radiusAt`). The scene draws it at the same
radius from the round's clock, so guests see the edge the host drops people off.
A body whose middle is past the edge falls. If an arm shoved them in
the second before (`RING.shoveMemory`), whoever's arm it was gets the credit on
the results: "knocked off by". Wandering off on your own is just "fell off".

## Sizes

**A body is exactly the island pill's own radius** (`PLAYER.radius`). A punch
lands when the fist looks like it touches the body, not a hand's width before -
Messy Maze's invisible walls were a body collision bigger than the body drawn.
Bodies are solid against each other.

## The end

At one left standing - **plus 1.2 seconds** (`RING.outro`) - or at thirty
seconds. The round is decided at the knockout (`decidedAt`), then runs on with
nobody moving and only the clock going, so the last one out is seen to fly on
every browser before Finish comes down. The clock runs out at once: there is no
knockout to watch. Whoever is still standing shares
first - one person if somebody won outright, more if the clock ran out.
Everybody else is ranked by how long they lasted, sharing a place with anybody
who went out on the same frame.

## One round, and it is the host's

The same arrangement as the other minigames:

- **The host runs the round** - its own keys, the stand-ins', every guest's - and
  sends it (`pb`) twenty times a second. Guests send intents (`pb-in`) four
  times a second and on every change, and ease towards what comes back.
- **A click is a running count, not an event.** A guest says "I have clicked 7
  times" over and over; the host deals with every click beyond the ones it has.
  Repeating it never doubles a punch, losing one message never loses one. Tested
  with a third of the messages dropped.
- **An intent is for one round.** The count starts at zero each round; a guest
  still repeating last round's count as the next one starts is ignored.
- A guest that goes quiet stops walking on the host; its clicks are never
  forgotten. Walking out of a round says "standing still". a pause stops the round for everybody.
- **The canvas is rendered once**, and the scene redraws itself from a ref each
  frame - see Duck Hunt's notes for the error a per-frame `<Canvas>` caused.

**The roster is the lobby**, host first, up to eight - eight colours. Alone,
three stand-ins fill in: they keep off the edge, wherever it has got to, aim at
the nearest fighter, circle round to their side if that fighter is facing them,
wait a moment, throw, pull back, and sidestep a fist coming straight at them
some of the time. A target near the edge gets thrown at even from the front: a
blocked punch still shoves. They walk at 80%, throw nothing in the first two and a half
seconds (`BOT_OPENING`), and wait 0.7 to 1.7 seconds after that before throwing.
Without those, they knocked out two of four players inside a second and a half,
before a person had found which pill was theirs. Everybody also starts well out
on the platform (`RING.spawnRing`), further from their neighbours than a punch
reaches.

## Seeing what happened

- Everybody is the island pill in their own colour, with a ring under you.
- An arm stretches out from the body the way it faces, the fist on its end.
- Somebody punched flashes white where it landed, and is thrown back, spinning,
  away from whoever hit them; somebody off the edge drops. Either way they are
  gone in a second - and the one that ends the round is watched all the way out.
- The platform - sand, rim and rock - shrinks with the edge.
- The HUD has the clock (red for the last five seconds), how many are standing,
  and what your fist is doing and what a click will do about it.

## The camera does not move

High and back, tilted at 58 degrees so the gap between a fist and a body can be
judged, with the whole platform, edge to edge, in view the whole round. Fitted
exactly and tested against a real camera at eight window shapes.

## Public contract

Exported because it is worth testing, not because anything else needs it.

| Export | What it is |
| --- | --- |
| `RING`, `COLOURS`, `PUNCHES` | The rules and the look, as numbers. |
| `createRound`, `stepRound`, `click`, `fistAt`, `spawns`, `standing`, `timeLeft`, `placings` | The round. Pure. |
| `Round`, `Fighter`, `Intent`, `Punch`, `Out`, `Entrant`, `Point` | Its shapes. |
| `botIntent`, `botIntents`, `BOT_OPENING` | The stand-ins. |
| `newRound`, `roundRoster`, `nextSeed`, `waitingRound`, `myId`, `ME`, `SOLO_FIGHTERS`, `MAX_FIGHTERS` | Dealing a round. |
| `encodeSnapshot`, `decodeSnapshot`, `applySnapshot`, `encodeIntent`, `decodeIntent`, `SNAPSHOT_TAG`, `INTENT_TAG` | A shared round on the wire. Pure. |
| `frameScene`, `BOUNDS`, `TILT`, `FOV`, `FILL` | Where the camera stands. Pure. |
| `PunchBuggyScreen` | The panel the registry draws. |

## Invariants you may rely on

- **A click sends a fist out if it is in, and back if it is out and has been for
  half a second; nothing else. A click too soon waits.** Tested.
- **Only a fist on its way out knocks anybody out, and only in the side or the
  back**, even from a step long enough to pass through them, never past its
  reach, never its own thrower. Tested.
- **A front, or an arm out across the path, blocks and is shoved.** Tested.
- **The punch goes where it is aimed; nobody walks with their arm out.** Tested.
- **The platform is whole for ten seconds, then shrinks; the edge drops people.**
  Tested.
- **The round is over 1.2 seconds after it is decided, with nobody moving in
  between.** Tested.
- **An arm that is out shoves instead**, and a shove off the edge in the last
  second is credited. Tested.
- **The facing locks while an arm is out, and the pace drops while it comes back.**
  Tested.
- **Off the edge is out.** Tested.
- **A body is the island pill's size, and bodies are solid.** Tested.
- **The round ends at one standing or at thirty seconds; the standing share
  first; the rest rank by how long they lasted.** Tested.
- **A click count said many times is dealt with once**, and an intent only counts
  for its own round. Tested.
- **Eight fighters with a lossy network agree on who went out, how, and by
  whom.** Tested.
- **The whole platform is in frame and fills it, at any window shape.** Tested.

## Deliberate non-goals

- No models, no sound.
- No health: one direct hit is out.
- No moving camera.

## Known limitations

- **A guest's own movement and punches are a round trip behind their keys**, with
  no prediction - about 50 ms plus ping. For a game about timing a punch, this is
  the first thing to revisit if it feels late.
- **The shared plumbing is copied a sixth time** - camera fit, host/guest hook,
  results card. Moving it into `15-minigames` is overdue.

## How to review

Open a lobby, leave the game on Volcano Island, press **minigames**, open
**8 · Punch Buggy**, and press **play**.

- **Look at the platform.** A round of sand on a rock, the sea far below, four
  fighters in four colours round it facing the middle, a ring under you.
- **Move the mouse.** You turn to face the pointer. **Walk with WASD**: you keep
  facing it.
- **Click.** Your arm shoots out where you aim and stays out, and you cannot
  walk. Click straight away: nothing for half a second, then it comes home.
- **Punch somebody in the side or back.** A white flash, they are thrown back,
  spinning, and gone; your fist stops where it hit.
- **Punch somebody facing you, or through their arm.** They are shoved back, not
  knocked out. Shove them off the edge: they drop, and the results say you
  knocked them off.
- **Wait past ten seconds.** The platform shrinks; stand near the edge and it
  drops you.
- **Knock out the last stand-in.** You see them fly for a second before Finish.
- **Walk off the edge yourself.** You drop, and the HUD says so.
- **Watch the stand-ins.** They close in, throw, pull back, and mostly stay on.
- **Let the clock run out with more than one standing.** They share first.
  **Again** starts a new round.

### With two browsers

- **Both walk and punch.** Each sees the other's arm go out and come back.
- **Punch the other.** Both browsers agree they are out, and who did it.
- **Host: again.** Both are dealt in.

## Gate record

Not yet gated.

## Measured

Not measured against the world's budget, because it does not draw into the
world's canvas. The platform is four meshes; each fighter is the pill plus an
arm and a fist - under forty draw calls with eight. One shadow-casting light.

Like the other minigames, a **second WebGL context** while a round is up.
