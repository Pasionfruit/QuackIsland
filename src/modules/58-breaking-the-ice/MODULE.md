# 58-breaking-the-ice

## What this is

**Catalogue slot 2, "Breaking the Ice".** Three square layers of ice tiles,
stacked over the sea and centred on each other - smaller the further down
they sit. Wherever you walk, the tile under your feet cracks - the instant
you first stand on it, not before - and is gone three seconds later, whether
you are still on it or not. Stand, walk, or get pushed onto a tile that has
broken and you lose your footing - a short beat later gravity takes you, and
you fall until you land on a whole tile of the layer below, or - off the
bottom layer - into the sea. The iceberg keeps shrinking as the round runs
on, soonest and fastest on the layer nearest the water. Last one standing
wins.

It plugs into `15-minigames` and nothing else in the build knows it exists.
Importing the module registers it - one line in the composition root.

This is the **environment** and **controls** stages done. The assets stage is
not: the players are the island's capsule and the ice is flat coloured boxes.

## The rules, and where each one lives

| The brief said | Where it is |
| --- | --- |
| A floating iceberg of breakable tiles, three layers | `LAYERS`, `DIM`, `CELL`, `tileIndex`, `inFootprint` |
| Destroy tiles beneath and around each other | `crackUnderfoot` inside `stepRound` |
| Tiles crack before breaking, a brief chance to escape | `CRACK_TIME`, `Tiles.crackedAt`, `broken`, `cracked` |
| Push opponents toward holes | `PUSH`, `tryPush` inside `stepRound` |
| Falling through a layer drops you onto the one below | `landingBelow`, the gravity/landing pass in `stepRound` |
| The bottom layer, into the sea, eliminates you | `eliminate`, `MOVE.void` |
| The iceberg shrinks as the round runs on | `shrunk`, `ringsGoneAt`, `ringOf` - a pure function of the clock |
| Lower floors smaller | `LAYERS` sizes |
| WASD move; mouse look/camera; space jump; right click push | the screen |

## The ice

A tile is **intact**, **cracked**, or **broken** - never anything else. The
moment a grounded player is first found standing on an intact tile, it
cracks (`crackUnderfoot`) - not before, and never twice: standing there
longer, or somebody else arriving after, does not restart its fuse. Left
alone, a cracked tile breaks exactly `CRACK_TIME` (three) seconds after it
first cracked, fixed at that moment so a late joiner can work out exactly how
long is left from that one stored number, no replay needed.

- **There is no separate "break" action.** Walking is the whole of it - the
  brief said "have it be where the player is walking," so a tile's fuse
  starts the instant your feet are on it, whether you are standing still or
  passing through.
- **The shrink never needs to be sent.** Which outer ring of a layer is gone
  is worked out purely from the round's seed and clock (`shrunk`), the same
  trick `44-color-coded` uses for its panels - only ice somebody has actually
  stood on is ever put on the wire.

## Falling

Nobody is a discrete "on layer N" the way Punch Buggy's fighters are on one
flat platform - a player's `y` is real, with gravity and a launch speed
straight out of `02-player`'s own numbers, so the fall genuinely arcs.

- **A tile giving way under a grounded player starts a short coyote time**
  (`MOVE.hang`, `~0.15s`) before gravity actually takes hold - not the crack
  warning, which is the real "brief chance to escape" the brief asks for;
  this is a much smaller, purely physical grace.
- **Falling, the sim looks for a whole tile of a lower layer at the same
  (x, z)** (`landingBelow`), checked nearest layer first. Land on one and you
  are grounded there, `layer` updated; find none anywhere below you and you
  keep falling - straight past a layer that never had a tile under that
  spot, exactly as many-layered as the iceberg actually is at that point.
- **Below the bottom layer's height by `MOVE.void`, you are eliminated** -
  the fall keeps drawn a moment longer for the visual, but the round no
  longer counts you.
- **Jump** (`Space`) only leaves the ground when you are already on it,
  straight up at `PLAYER.jumpSpeed` - for clearing a crack, or a shove.

## Pushing

**Right click**, a short cone ahead of you (`PUSH.cone`, `PUSH.reach`), gives
whoever it lands on a decaying knockback (`PUSH.impulse`, `PUSH.decay`) laid
over their own movement, plus a brief stun (`PUSH.stun`) that cuts how much
of their own steering gets through - long enough that a shove is not simply
walked off at once. It does not knock anyone out by itself: a push only
matters once it has carried somebody onto a hole or a shrunk edge, which the
same landing check above then deals with. Gated by its own cooldown
(`PUSH.cooldown`), the same running-count idiom as a break.

## The end

At one left standing - **plus 1.4 seconds** (`ROUND.outro`) - or at the
`ROUND.limit` (150s) safety net. Whoever is still standing when the clock
runs out shares first. Everybody else is ranked by how long they lasted, and
anyone who never fell outranks anyone who did, even at the same clock time.

## One round, and it is the host's

The same arrangement as the other minigames, with one addition: tile damage
is on its own channel, separate from player position, because it needs a
different rate.

- **The host runs the round** - its own keys, the stand-ins', every guest's -
  and sends where everybody is (`bti`) twenty times a second.
- **Tile damage** (`bti-t`) goes out only when it has actually changed, and at
  least once a second regardless, so a dropped message heals itself within a
  beat. It is the **sparse set of tiles a player has marked** that the shrink
  has not already independently claimed - never the whole grid, and it only
  ever shrinks as the round goes on, since the shrink itself is derived, not
  sent.
- **Jump and push are each a running count**, the same idiom as a punch's
  click: a guest says "I have pushed four times, ever," not "I pushed just
  now," so a message the network drops or repeats can neither lose an action
  nor double it. Tested with a third of the messages dropped, host and eight
  guests agreeing on who fell, where, and which tiles are gone.
- A guest that goes quiet stops moving on the host; its counts are never
  forgotten. Walking out of a round says "standing still." A pause stops the
  round for everybody, the host's own simulation included.
- **The canvas is rendered once**, and the scene redraws itself from a ref
  each frame - see Duck Hunt's notes for the error a per-frame `<Canvas>`
  caused.

**The roster is the lobby**, host first, up to eight - eight colours. Alone,
three stand-ins fill in: they keep off ice they know is about to give way,
close in on whoever is nearest, and push them once they are close enough -
the walking itself does the cracking, on stand-ins the same as anybody -
seeded per bot per decision, so the same round plays out the same way every
time it is replayed with the same seed.

## Seeing what happened

- Everybody is the island's capsule in their own colour, with a ring under
  your own body.
- Each layer is its own grid of boxes - intact ice, an orange tint while
  cracked, sunk out of sight once broken.
- Somebody who falls in is drawn tumbling away a moment longer before they
  are gone.
- The HUD has the clock (red for the last ten seconds), how many are still
  standing, and what the ice right under you is doing.

## The camera turns with the mouse

Unlike every other minigame here, the camera is not fixed: it sits behind and
above whichever body is yours, turned by the mouse (pointer lock, with
drag-to-turn as a fallback for a browser that refuses it), and **climbs or
drops with you as you change layers** - a fixed, shared, whole-arena shot
does not fit a game where players are, at any moment, standing at three
different heights. Once you have fallen, or the round has decided, it pulls
back to a wide shot of the whole iceberg, the same idea as `44-color-coded`'s
rig, which this one is built on.

## Public contract

Exported because it is worth testing, not because anything else needs it.

| Export | What it is |
| --- | --- |
| `LAYERS`, `DIM`, `CELL`, `TILE_COUNT`, `TILES_PER_LAYER`, `MOVE`, `PUSH`, `ROUND`, `CRACK_TIME`, `COLOURS` | The rules and the look, as numbers. |
| `createRound`, `createTiles`, `stepRound`, `spawns`, `standing`, `timeLeft`, `placings` | The round. Pure. |
| `tileIndex`, `inFootprint`, `tileCentre`, `tileAt`, `ringOf`, `ringsGoneAt`, `shrunk`, `broken`, `cracked` | The ice, addressed and judged. Pure. |
| `forward`, `rightOf` | Which way is which, at a yaw. Pure. |
| `Round`, `Player`, `Tiles`, `Intent`, `Entrant` | Its shapes. |
| `botIntent`, `botIntents`, `BOT_OPENING` | The stand-ins. |
| `newRound`, `roundRoster`, `nextSeed`, `waitingRound`, `myId`, `ME`, `SOLO_PLAYERS`, `MAX_PLAYERS` | Dealing a round. |
| `encodeSnapshot`, `decodeSnapshot`, `applySnapshot`, `encodeTiles`, `decodeTiles`, `applyTiles`, `sparseDamage`, `encodeIntent`, `decodeIntent`, `SNAPSHOT_TAG`, `TILE_TAG`, `INTENT_TAG` | A shared round on the wire. Pure. |
| `IceScreen` | The panel the registry draws. |

## Invariants you may rely on

- **A tile cracks the instant somebody first stands on it, never twice, and
  is gone exactly `CRACK_TIME` later.** Tested.
- **Only ice somebody has actually stood on is ever sent; the shrink is
  derived by every client from the same seed and clock.** Tested.
- **A tile never cracks under somebody who is airborne** - only a grounded
  player's own tile starts its fuse. Tested.
- **Falling looks for a whole tile of a lower layer at the same spot, nearest
  first, and keeps falling past a layer with nothing there.** Tested.
- **Below the bottom layer, you are eliminated; nowhere else are you.**
  Tested.
- **A push only knocks back whoever is ahead of you and in reach - never
  anyone behind you.** Tested.
- **Jump and push counts said many times are dealt with once each**, and an
  intent only counts for its own round. Tested.
- **The round ends at one standing, after a beat to watch the last fall, or
  at the safety-net limit; the standing share first, the rest rank by how
  long they lasted.** Tested.
- **Eight players with a lossy network agree on who fell, where they landed,
  and which tiles are gone.** Tested.

## Deliberate non-goals

- No models, no sound beyond the shared cues other minigames already use.
- No client-side prediction for your own movement or actions.
- No body collision: players can stand inside each other. Only a push moves
  anybody.
- No score kept between rounds.

## Known limitations

- **A guest's own movement, jumps and pushes are a round trip behind their
  keys**, with no prediction - about 50ms plus ping, the same limitation
  every other minigame here has.
- **Grid sizes, timings and reach/impulse numbers are a starting point**, not
  a tuned final balance - the brief asks for the shape of the game, and the
  exact pace of the shrink is the kind of thing only playtesting settles.
- **The shared plumbing is copied again** - host/guest hook, results card,
  roster rules. Moving it into `15-minigames` is overdue, same note as
  Punch Buggy's.

## How to review

Open a lobby, leave the game on Volcano Island, press **minigames**, open
**Breaking the Ice**, and press **play**.

- **Look at the iceberg.** Three squares of ice stacked and centred, smaller
  and lower each layer down, over the sea. Four players in four colours,
  spread round the top.
- **Move the mouse.** The camera turns behind you; **WASD** moves relative to
  where you are looking.
- **Walk onto a fresh tile.** It tints at once - cracked. Stand there, or
  walk away: three seconds after you first arrived, it is gone regardless.
- **Stand on a tile as it breaks.** A short beat, then you drop - and land on
  the layer below, not eliminated.
- **Walk off the edge of a layer where nothing is below you.** You keep
  falling, past where a lower layer would have caught you.
- **Fall through the bottom layer.** Into the sea - out.
- **Right click somebody standing near a hole.** They are knocked toward it.
- **Wait out the round.** The iceberg visibly shrinks and the outer rings
  vanish, soonest on the bottom layer.
- **Space, near a crack.** You hop clear of it.
- **Let a stand-in fall in.** The others keep playing; last one standing
  wins. **Again** starts a new round.

### With two browsers

- **Both walk and fall.** Each sees the other's tiles crack and break, and
  which layer they land on.
- **One host, one guest, both watch the same iceberg shrink.** No
  disagreement about which tiles are gone.
- **Host: again.** Both are dealt in, tiles reset.

## Gate record

Not yet gated.

## Measured

Not measured against the world's budget, because it does not draw into the
world's canvas. Three instanced meshes for the tiles (one draw call each,
up to 81/49/25 instances) plus a pill and a marker per player - well under
forty draw calls with eight players. One shadow-casting light.

Like the other minigames, a **second WebGL context** while a round is up.
