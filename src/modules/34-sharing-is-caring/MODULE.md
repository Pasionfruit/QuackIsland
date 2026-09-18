# 34-sharing-is-caring

## What this is

**Minigame 20.** A walled round arena of sand floating over the sea, and a
gold crown spinning in the middle of it. Walk into the crown and it is yours;
while you wear it you score a point a second. Anybody who walks into you takes
it. After one minute, whoever has the most points wins.

The wearer is a little **faster** than everybody else, so nobody catches them by
running after them. Two rings of **rocks** stand in the sand to pin a runner
against, and everybody without the crown has a **boost** - a short burst of
speed that recharges - to spend at the right moment.

It plugs into `15-minigames` and nothing else in the build knows it exists.
Importing the module registers it - one line in `src/App.tsx`.

This is the **environment** and **controls** stages done. The assets stage is
not: the players are the island's capsule and the crown is primitives.

## The rules, and where each one lives

| The brief said | Where it is |
| --- | --- |
| A crown appears in the center of the arena | `Round.holder === null`; drawn over a glowing disc at the middle |
| The first player to grab it becomes the holder | `stepRound` - a body within `ARENA.crown` of the middle; the nearer wins a tie |
| While holding it, you earn points over time | `ARENA.rate`, one point a second, added to `Wearer.score` |
| Bump into the holder to steal it and become the new holder | `stepRound` → steal: a body touching the wearer takes it, the crowd is knocked back |
| After 1 minute, the most points wins | `ARENA.duration`, `placings` |
| WASD - move | the screen |
| The wearer is a little faster, so others have to trap them | `ARENA.crownPace` (1.1) |
| A rechargeable boost | `ARENA.boostPace`, `boostTime`, `recharge`, `canBoost`; Space or Shift on the screen |
| Obstacles | `rocksFor`, `Round.rocks`; solid in `stepRound` |

## The crown

- **Picked up by walking into it.** While it sits in the middle, the first body
  to reach it has it. Two arriving on one frame: the one nearer the middle.
- **A point a second while you wear it**, scored for the time just gone before
  anybody moves, so the steal frame is scored to whoever wore it for that frame.
  Scores are kept unrounded; the HUD and results show whole points.
- **Taken by a bump.** A body touching the wearer takes the crown - the closest
  one, if several are.
- **A steal clears the crowd.** Everybody within `ARENA.bump` (3) of the new
  wearer is knocked back out to it. Whoever lost the crown is **dazed** for 1.2
  seconds (`ARENA.daze`); everybody else knocked back **staggers** for 0.8
  (`ARENA.stagger`). Dazed or staggered, you cannot walk and cannot take the
  crown. Both reel on the spot so you can see why.
- **A second and a half of grace** (`ARENA.grace`) after the crown changes
  hands, in which it cannot change again. The crown throbs while it cannot be
  taken, so a bump that did nothing looks like it did nothing on purpose.
- **The wearer walks at 110%** (`ARENA.crownPace`). One chaser on foot falls
  behind; catching the wearer takes a boost at the right moment, a rock or the
  wall to pin them against, or a second chaser coming the other way. (It was
  85% until the rocks and the boost came in: then a slower wearer was the only
  way to be caught at all.)

## The boost

- **Space or Shift.** For 0.7 seconds (`ARENA.boostTime`) you walk at 180%
  (`ARENA.boostPace`) - faster than the wearer, so a boost from about three
  steps away closes the gap.
- **Then it recharges**, empty to full in five seconds (`ARENA.recharge`).
  Everybody starts charged. It is spent on the first step it is charged while
  the key says boost - so tap it; holding the key through the recharge fires it
  again the moment it is full.
- **The wearer cannot boost.** Their charge keeps filling, so they have one
  ready once they lose it (and the daze wears off). Taking the crown mid-boost
  ends the boost, so a thief does not rocket away with it.
- **Not while dazed or staggered.**
- **A tap is held for a quarter second** on the screen, so a quick press is not
  lost between two of the host's frames or two intents on the wire.

## The rocks

Two rings of squat stones: an inner ring at 5 from the middle (radius 0.9) and
an outer ring at 8.6 (radius 0.7), each rock halfway between two spawns - so
nobody's straight run to the crown is blocked, and nobody's is easier. With
fewer than four players each ring has twice as many rocks as players, so a small
arena is not bare. The layout follows only from how many are playing, so it is
not sent: a guest works it out. The rocks are lower than a player, so the tilted
camera sees a head over a rock in front of it. Bodies slide round them; a steal's
knock-back never leaves anybody inside one.

### Why the crowd-clearing, and how the numbers were picked

The first version knocked only the two bodies apart, with a one-second grace.
Played against the stand-ins it went one of two ways: at a slower stand-in
pace, a person who grabbed the crown kept it for 54 of 60 seconds; at a faster
one, the crown changed hands **every second for the whole minute** - four
chasers pile onto the wearer, somebody is always touching, and every hold
lasted exactly the grace. A longer grace or a bigger knock-back only moved the
floor.

Three things together broke the scrum, found by simulating whole rounds
against the stand-ins and logging every change of hands: knocking back
everybody near the new wearer, not just the loser; stopping the loser from
taking it straight back when the wearer runs into them; and staggering the
bystanders for long enough that the wearer actually gets away. With the
numbers above, a round alone sees twenty to thirty changes of hands, holds of
two to three seconds with the odd long run, and winners on twenty to forty
points. With the faster wearer, the boost and the rocks, five seeded rounds of a
chaser who boosts from three steps saw 28 to 34 changes of hands, the longest
hold 3 to 6 seconds, and everybody on 9 to 25 points. That is a simulation against stand-ins, not people - see known
limitations.

## The arena

A radius of 11, the same as Punch Buggy's platform. **The edge is a wall**:
nobody falls off, because there is nothing here to lose but the crown. Bodies
are the island pill's own radius (`PLAYER.radius`) and are solid against each
other and the rocks.

## The end

At sixty seconds exactly; nothing is scored past it, however long the last
frame. Places go by points, compared to the hundredth - what the wire carries -
so the host and a guest rank the same round the same way. Level scores share a
place.

## One round, and it is the host's

The same arrangement as the other minigames:

- **The host runs the round** - its own keys, the stand-ins', every guest's - and
  sends it (`sc`) twenty times a second: positions, who wears the crown, since
  when, and everybody's score, takes, daze, boost and charge. Guests send which way they are walking
  (`sc-in`), and whether they want to boost, four times a second and on every change, and ease towards what
  comes back.
- **A guest has nothing to count.** Picking up and stealing are both decided
  where the bodies are, which is on the host, so there is no running count to
  keep the way Punch Buggy has for clicks.
- **An intent is for one round.** A guest still repeating last round's direction
  as the next one is dealt is ignored. A guest that goes quiet for a second
  stops walking on the host. Walking out of a round says "standing still".
  a pause stops the round for everybody.
- A snapshot naming a wearer who is not in it is refused whole.
- **The canvas is rendered once**, and the scene redraws itself from a ref each
  frame.

**The roster is the lobby**, host first, up to eight - eight colours. Alone,
three stand-ins fill in, at 90% pace, so a person is never simply outrun by one. They go for the crown while it sits in
the middle (boosting over the last few steps), chase whoever wears it and boost when within 3.5 of them (each aiming a little to its own side, from
the seed, so they do not arrive as one queue), and when they wear it they run
from the chasers near them - along the wall rather than into it. They all steer
round a rock in their way. A test plays a
whole minute against them and checks the crown changes hands and a person
chasing it scores.

## Seeing what happened

- Everybody is the island pill in their own colour, with a ring under you.
- The crown spins over a pulsing gold disc until somebody takes it, then sits on
  their head. When it changes hands it hops across in an arc rather than
  blinking over, so a steal is something you see.
- A gold ring pulses under whoever wears it.
- Somebody boosting has a cyan ring under them and a cyan streak behind.
- The HUD has your boost meter: filling while it charges, lit when ready, dimmed
  with "no boost with the crown" while you wear it.
- The HUD has the clock (red for the last ten seconds), who has the crown, and
  your points. A scoreboard in the corner has everybody, best first, with the
  crown against its wearer.
- The results card has everybody's points and how many times they took it.

## The camera does not move

High and back, tilted at 58 degrees so the gap between you and the wearer can be
judged, with the whole arena, wall to wall and crown-high, in view the whole
round. Fitted exactly and tested against a real camera at eight window shapes.

## Public contract

Exported because it is worth testing, not because anything else needs it.

| Export | What it is |
| --- | --- |
| `ARENA`, `COLOURS` | The rules and the look, as numbers. |
| `createRound`, `stepRound`, `holderOf`, `canTake`, `canBoost`, `rocksFor`, `spawns`, `timeLeft`, `placings`, `points` | The round. Pure. |
| `Round`, `Wearer`, `Intent`, `Entrant`, `Point`, `Rock` | Its shapes. |
| `botIntent`, `botIntents` | The stand-ins. |
| `newRound`, `roundRoster`, `nextSeed`, `waitingRound`, `myId`, `ME`, `SOLO_PLAYERS`, `MAX_PLAYERS` | Dealing a round. |
| `encodeSnapshot`, `decodeSnapshot`, `applySnapshot`, `encodeIntent`, `decodeIntent`, `SNAPSHOT_TAG`, `INTENT_TAG` | A shared round on the wire. Pure. |
| `frameScene`, `BOUNDS`, `TILT`, `FOV`, `FILL` | Where the camera stands. Pure. |
| `SharingIsCaringScreen` | The panel the registry draws. |

## Invariants you may rely on

- **The crown starts in the middle with nobody, and nobody scores until it is
  taken.** Tested.
- **The first body to reach it takes it, the nearer on a tie, and not from a
  step away.** Tested.
- **Only the wearer scores, a point a second, and a long frame never hands out
  more than a twentieth of a second.** Tested.
- **A bump takes it and knocks back everybody crowding the new wearer; a bump
  between two people without it does nothing but push.** Tested.
- **Whoever lost it is dazed and everybody else knocked back staggers: neither
  walks nor takes the crown until it wears off.** Tested.
- **It cannot change hands again inside the grace.** Tested.
- **Alone, the crown passes about without ping-ponging, and a person running
  with it is caught.** Tested over a whole minute.
- **The wearer is faster than a chaser on foot, slower than one boosting, and
  cannot boost.** Tested.
- **A boost lasts its time, then takes the full recharge; taking the crown ends
  it; nobody dazed can boost.** Tested.
- **Rocks stand clear of the crown, the wall and every spawn's run to the middle,
  and nobody walks through one.** Tested for two to eight players.
- **Stand-ins boost at a wearer near enough, not from afar, and steer round a
  rock in their way.** Tested.
- **Boost, charge and the rocks reach a guest.** Tested.
- **Bodies never overlap, and nobody leaves the arena.** Tested.
- **The round ends at exactly a minute, nothing is scored after, and level
  scores share a place.** Tested.
- **Eight players with a lossy network agree on who has the crown and the
  final placings.** Tested.
- **The whole arena is in frame and fills it, at any window shape.** Tested.

## Deliberate non-goals

- No models, no sound.
- No falling off: the edge is a wall.
- No push or items. Bumping is walking into somebody; the boost is the one extra.
- No moving camera.

## Known limitations

- **A guest's own movement is a round trip behind their keys**, with no
  prediction - about 50 ms plus ping. Chasing somebody down may feel a touch
  late for a guest; the host has no lag at all, which is an edge in a game
  decided by who touches whom first.
- **The shared plumbing is copied again** - camera fit, host/guest hook,
  results card. Moving it into `15-minigames` is overdue.
- **The numbers are tuned against stand-ins, not people** - the grace, the
  paces, the knock-back, the daze and the stagger, and now the boost and the rocks. People chase worse and run
  better than the stand-ins; the round wants playing in a real lobby before
  anybody trusts them.

## How to review

Open a lobby, leave the game on Volcano Island, press **minigames**, open
**20 · Sharing Is Caring**, and press **play**.

- **Look at the arena.** A round of sand with a low wall, the sea far below,
  four pills in four colours round the edge facing a gold crown spinning over a
  glowing disc, a ring under you.
- **Walk with WASD.** You turn to face the way you walk; the wall and the rocks
  stop you, and you slide round a rock.
- **Tap Space.** A burst of speed with a cyan streak; the meter empties and
  refills over five seconds.
- **Race for the crown.** Whoever reaches it first has it on their head, a gold
  ring under them, and the HUD says so.
- **Wear it.** Your points count up a second at a time; you are a little faster,
  and your boost meter says you cannot boost.
- **Get caught.** The crown hops to the other head, you and anybody near are
  knocked back, and you reel on the spot, unable to move, for a moment. The
  crown throbs while it cannot be taken.
- **Chase a stand-in that has it.** It runs along the wall; catch it and the
  crown hops to you.
- **Watch the scoreboard** in the corner reorder as points come in.
- **Let the minute run out.** The results rank by points, say how many times
  each took it, and share a place on a tie. **Again** starts a new round.

### With two browsers

- **Both walk.** Each sees the other move.
- **One takes the crown.** Both browsers show it on the same head and count the
  same points.
- **The other bumps them.** Both see the crown hop, and agree on the scores at
  the end.
- **Host: again.** Both are dealt in.

## Gate record

Not yet gated.

## Measured

Not measured against the world's budget, because it does not draw into the
world's canvas. The arena is five meshes, the crown under fifteen, each player
the pill and two boost meshes (hidden unless boosting), the rocks two meshes each
(up to 32 rocks with eight players) - about a hundred and twenty draw calls with eight. One shadow-casting light.

Like the other minigames, a **second WebGL context** while a round is up.
