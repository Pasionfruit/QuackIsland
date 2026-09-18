# 20-punch-buggy

## What this is

**Minigame 8.** A round platform floating high over the sea, and everybody on
it with a fist that comes off. Click and it shoots out the way you are facing;
click again and it comes back. A fist that reaches somebody on its way out
knocks them straight out of the round. An arm that is already out does not -
but it is solid, and walking into people with it shoves them, and a shove off
the edge is out too. Thirty seconds; the last one standing wins.

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
| A direct hit eliminates immediately | `stepRound` - a fist **on its way out** that meets a body |
| Knock opponents off the platform | an arm that is out shoves (`RING.arm`); off the edge is out |
| Stay mobile, avoid incoming punches | `RING.speed`, slower with your arm out (`RING.armedPace`) |
| Thirty seconds on the clock (the catalogue) | `RING.duration` |
| WASD - move; left click - extend or retract | the screen |

## The punch

`in` at your side → a click → `out`, flying the way you face at 26 units a
second → at full reach (6), or on meeting somebody, `held` → a click → `back`,
home at 30 a second → `in`. A click while it is `out` pulls it back early. A
click while it is coming `back` does nothing: you cannot throw again until it is
home.

- **Only a fist on its way out knocks anybody out.** That is what "directly
  hits" means here. The check is swept - the fist's whole path this step against
  every body - so a fist fast enough to pass through somebody between frames
  still meets them. It stops where it lands.
- **An arm that is out is solid.** Held out, or coming back, it shoves anybody
  it touches clear of it. That is how you knock somebody off the edge without
  landing a punch: put your arm out and walk them off.
- **Your facing is locked while your arm is out**, and you move at 60% - the
  punch goes where you were facing when you threw it, and throwing it is a
  commitment.
- **You face the way you walk.** There is nothing to aim with the mouse; a click
  anywhere on the view punches.

## The edge

A body whose middle is past the platform's edge falls. If an arm shoved them in
the second before (`RING.shoveMemory`), whoever's arm it was gets the credit on
the results: "knocked off by". Wandering off on your own is just "fell off".

## Sizes

**A body is exactly the island pill's own radius** (`PLAYER.radius`). A punch
lands when the fist looks like it touches the body, not a hand's width before -
Messy Maze's invisible walls were a body collision bigger than the body drawn.
Bodies are solid against each other.

## The end

At one left standing, or at thirty seconds. Whoever is still standing shares
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
three stand-ins fill in: they keep off the edge, go for the nearest fighter, line
up, wait a moment, throw, pull back, and sidestep a fist coming straight at them
some of the time. They walk at 80%, throw nothing in the first two and a half
seconds (`BOT_OPENING`), and wait 0.7 to 1.7 seconds after that before throwing.
Without those, they knocked out two of four players inside a second and a half,
before a person had found which pill was theirs. Everybody also starts well out
on the platform (`RING.spawnRing`), further from their neighbours than a punch
reaches.

## Seeing what happened

- Everybody is the island pill in their own colour, with a ring under you.
- An arm stretches out from the body the way it faces, the fist on its end.
- Somebody punched is thrown back, spinning, away from whoever hit them; somebody
  off the edge drops. Either way they are gone in a second.
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

- **A click sends a fist out if it is in, and back if it is out; nothing else.**
  Tested.
- **Only a fist on its way out knocks anybody out**, even from a step long enough
  to pass through them, never past its reach, never its own thrower. Tested.
- **An arm that is out shoves instead**, and a shove off the edge in the last
  second is credited. Tested.
- **The facing locks and the pace drops while an arm is out.** Tested.
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
- No aiming with the mouse: the punch goes the way you face.

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
- **Walk with WASD.** You turn to face the way you walk.
- **Click.** Your arm shoots out the way you face and stays out; the HUD says
  "click to pull back". Click again: it comes home, and you can punch again.
- **Walk with your arm out.** Slower, and you keep facing the same way.
- **Punch somebody.** They are thrown back, spinning, and gone; your fist stops
  where it hit.
- **Hold your arm out and walk into somebody.** They are shoved, not knocked out.
  Shove them off the edge: they drop, and the results say you knocked them off.
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
