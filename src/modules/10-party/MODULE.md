# 10-party

## What this is

Getting a board game started, and the island it is played on.

The host opens a game, everybody readies up, the host starts it, and everyone
is put on the starting line of a **hundred-and-twenty-tile spiral race** on a
separate island out across the water. The track winds **up the volcano** — three
turns round the cone, climbing 36 m from its foot to the crater rim, where the
treasure is.

**The game itself does not exist yet**: no turns, no dice, no movement along
the tiles. What does exist is everything that has to be right before it can —
the island, the track, who is here, who is ready, who may press start, and
everybody arriving on the same line at the same moment.

## Public contract

| Export | Meaning |
| --- | --- |
| `Party` | The scene entry: the board, and moving people onto it |
| `Arena` | Just the board, if something ever wants it alone |
| `useParty()` / `getParty()` | `{ phase, ready }` |
| `hostGame()` / `startGame()` / `endGame()` | Host only |
| `setReady(ready)` / `amReady()` | Yours |
| `canStart(phase, isHost, ids, ready)` | Whether start may be pressed. Pure |
| `allReady(ids, ready)` / `waitingFor(ids, ready)` | Pure |
| `spawnFor(index, count)` | Where the nth player lines up. World space. Pure |
| `partyHeightLocal(d)` / `partyHeightAt(x, z)` | The island's shape. Pure |
| `groundWithIsland(x, z, elsewhere)` | Both islands in one height function. Pure |
| `onPartyIsland(x, z)` / `distanceFromIsland(x, z)` | Pure |
| `buildBoard(count?)` | The spiral, tile by tile. Pure |
| `trackLength()` / `tileSpacing(count?)` | How long and how far apart. Pure |
| `ISLAND` | Where the island is, and its summit, plateau, shore |
| `BOARD` | Tiles, turns, inner and outer radius, tile size |
| `PARTY` | The starting line |
| `Tile` | `{ index, x, y, z, angle, radius, marked }` |
| `decodeParty` / `encodeParty` | The wire format. Pure, validating |
| `ME` | The id used for yourself, since the relay only names other people |
| `PartyPhase`, `PartyState`, `PartyMessage` | The shapes above |

## Invariants you may rely on

- **The host owns the phase**, the same way it owns the clock. A guest's copy
  is only ever set from the host's message; two clients each believing they
  are host would otherwise drag everybody on and off the board in turns.
- **Everybody owns their own ready flag**, the same way they own their duck.
- **An empty lobby is never ready.** Alone, you are a lobby of one, and you
  still have to press the button. "Nobody is unready" is true of nothing at
  all, which is not what start should mean.
- **The host counts too.** A host who could start without readying up would be
  starting a game they were not in.
- **Nothing off the wire is trusted.** A phase nobody has heard of — of any
  shape, `7` as much as `"chaos"` — rejects the whole message rather than
  being half-applied. A dashboard in an unknown phase has no way out.
- **Everyone works out their own spawn** from the same sorted list of ids, so
  nobody has to be told where to stand and two people cannot get the same spot.
- **Leaving the lobby ends the party**, so you are never stranded on a board
  with nobody on it.
- **People who leave stop counting** towards everyone being ready, or the host
  waits forever for somebody who closed their browser.

## Deliberate non-goals

- **No board game.** No turns, no dice, no moving along the tiles, no landing
  on one and having something happen. The track is a track, and this is the
  lobby that comes before a game on it.
- **No collision with the volcano.** You walk up it, or through the treasure.
- **No spectators, no teams, no kicking, no lobby chat.**
- **No reconnection into a running game.** Somebody who drops out and rejoins
  arrives back on the island.
- **No authority beyond the host's word.** Same trade as the rest of the
  networking: this is for playing with friends.

## Where the island is, and how big

Nine hundred metres out across the water from the spawn island — far enough to
be somewhere else, close enough to see home from.

It is **580 m across at the waterline**, with a **125 m volcano** in the
middle. That makes it, by land area, about two and a half times the spawn
island: 0.26 km² against 0.10. The volcano is more than four times the height
of anything on the mainland, which is the point — it is the thing you can see
from home, across three hundred metres of open water.

Two things pin down where it sits, and it lives between them:

| | |
| --- | --- |
| Its own foot reaches 380 m, the mainland's coast about 200 | so nearer than ~580 and the two islands run into each other |
| The sea reaches 1500 m | so further than 1120 and it stands in open nothing |

Nine hundred leaves three hundred metres of open water between the beaches and
two hundred more of sea beyond its far side. **The sea had to grow with it**:
the water plane went from 1800 m across to 3000, because its depth is baked
once from a height function and an island past its rim would have nothing under
it. That change is what made the swell longer — see `04-water`.

An earlier version of this was a slab floating in the sky, put there to dodge
those edges. An actual island turned out to be both nicer and easier once the
sea was told about it.

**The island is always there.** It is a place, not something conjured when a
game starts: you can see it across the water, and you can swim to it. A board
that appeared out of nothing would read as a bug.

## The spiral

A hundred and twenty tiles, three turns round the volcano, climbing the whole
way: **333 m** of track from the cone's foot to the crater rim.

| | |
| --- | --- |
| Tile | 1.2 m across — **half again the duck's 0.8 m**, and nothing more |
| Spacing | 2.8 m, so a 1.6 m gap: a stride between one space and the next |
| Climb | 9.7 m up to 45.8 m, at a **10.8% gradient** |
| Cone | 57°, 60 m across, 46 m tall |
| Evenness | every gap within **0.6%** of every other |

**The cone is shaped around the road, not the road around the cone.** That is
the whole design. A hundred and twenty tiles a duck and a half wide make a
track about 330 m long whatever else is true — that length is fixed the moment
the tile size is. Three turns of it wraps a cone of about this radius, and a
cone of that radius can be as tall as a 330 m road can climb at a gradient
somebody would walk up. Every number above follows from the first one.

It is a *steep* cone, and that is the point of wrapping: the road is a gentle
10.8% because it goes round three times, so the thing it goes round is free to
be dramatic. At 46 m it is half again the height of anything on the mainland.

### Why the arc length is measured in three dimensions

Stepping tiles by equal distance **over the map** would bunch them wherever the
cone is steepest, because a metre of map is more than a metre of walking there
— and the steepest stretch is the middle of the climb, so the error would sit
exactly where it shows. The arc table carries `dh/dr` for that reason, taken as
a central difference on the island's own height function so the road cannot
disagree with the hill it is on.

Measured: gaps along the ground vary by 0.6%, where the flat measure would let
them vary by 1.9%. A test asserts the three-dimensional spacing is the more
even of the two, so this cannot quietly become pointless work.

The one thing that is easy to get subtly wrong is the spacing. An Archimedean
spiral walked at a constant *angle* bunches its tiles up as the radius
shrinks — and this track runs inwards, so the last stretch would be a jam and
the first a hike. Tiles are stepped along by **arc length** instead, which
needs the length of the curve, which needs integrating it. There is a closed
form and it is horrible; two thousand steps of the trapezium rule is accurate
to well under a millimetre and is obviously right.

A test checks that every gap between consecutive tiles is the same to within
two percent, which is the chord-versus-arc difference and nothing else.

Everybody lines up **across** the track behind the first tile rather than in a
ring: this is the start of a race, and a ring would hand whoever spawned
nearest the second tile a free head start.

## Which ground you are standing on

The player, the footprints **and the sea** all take a height function, and
`src/app/scene.ts` supplies one that knows about both islands:

```ts
function currentGround(x, z) {
  return groundWithIsland(x, z, heightAt)
}
```

That is the composition root's job precisely because it is the only place
allowed to know that a board game exists, how footprints are drawn, and where
the sea bed is. The player module has never heard of a party, and this module
has never heard of a footprint.

The sea has to be told, and that is not optional: its depth is baked once from
a height function, so a sea that had never heard of this island would be drawn
straight over the top of it. The player's **bounds** come from the same place,
or you could not reach the island at all — they used to stop at the edge of the
mainland's mesh.

## How this talks to other browsers

Through `09-net`'s room channel, which passes **opaque** messages. The
transport never learns what a board game is, and this module never learns what
a WebSocket is. Adding a dice roll later is a new message shape here and no
change at all to the relay or to `09-net`.

## The island was invisible

Worth writing down, because nothing about it looked like a bug.

The land mesh was **wound inside out**. three.js draws front faces only, front
means anticlockwise seen from outside, and `computeVertexNormals` takes its
normals from the same winding — so every triangle of the island faced the sea
bed. From anywhere a player could stand the ground was not dark, it was *not
there*: you looked straight through the island at the water, and only the
tiles, the rim and the treasure were left hanging in the air.

No other test in this module noticed, and none of them could have: they all
asked about heights and positions, which were right the whole time. The shape
now lives in `internal/mesh.ts` as plain arrays, with no three.js in it, and a
test walks every triangle and checks it faces the sky.

## Known limitations

- **Arriving is a teleport**, with no transition. You are on one beach and then
  you are on another.
- **The tiles do nothing.** They are discs on the ground; nothing knows which
  one you are standing on.
- **The volcano is scenery.** It does not erupt, and the treasure cannot be
  picked up — there is a currency module waiting for it, and nothing connects
  the two yet.
- **Nothing stops you walking straight up the cone** beside the track. The road
  is the scenic route, not the only one.
- **The plateau is now empty.** The track used to cross it and now climbs the
  volcano instead, so 235 m of flat sand has nothing on it but the walk to the
  start.
- **The teleport lays one stray footprint** and fires one footstep, because
  both systems see a very large step. Harmless, and cheaper to live with than
  to plumb a "do not count this" flag through two modules.
- **Somebody joining mid-game** is told the phase by the host's next message,
  and is not moved to the island until the next one starts.
- **The island has no shore or rocks of its own.** `07-shore` and `12-rocks`
  scatter against the mainland's bounds, so its beach is bare.

## How to review

Two browsers in one lobby; `DEPLOY.md` has the commands.

- **Alone in a lobby**, host a game. The ready button should appear, start
  should be dead until you press ready, and then it should light up.
- **With two**, host on one. The other should see the ready button appear
  without doing anything.
- **Ready up on one only.** The host's start must stay dead and the dashboard
  should say it is waiting on one.
- **Ready up on both, then press start.** Both ducks should arrive on the
  starting line, side by side, facing along the track, and both should be able
  to walk.
- **Look at the island from the water.** You should see *ground* — sand, lit
  from above. If the island is a floating ring of tiles over open sea, the mesh
  is inside out again.
- **Walk the spiral from the first tile.** Three turns up the cone, climbing
  every step, tiles evenly spaced the whole way — no bunching where it steepens
  and none where it tightens.
- **Stand on a tile.** It should be about half again your own width: room to
  stand, and no more.
- **Look up from halfway.** You should be able to see the track above you
  wrapping the cone, and the treasure over the rim.
- **Step off the last tile.** The treasure should be right there, inside the
  crater rim.
- **Walk into the sea off the party island.** You should swim, in water that
  shallows properly at its beach — if the sea is drawn over the island, the
  height function has not reached it.
- **Look back towards the spawn island** from the party beach. It should be
  there across the water.
- **Press back to the island.** Everybody should return, and everybody's ready
  should clear.
- **Hold Tab at every stage.** Everyone listed, pings filling in after a second
  or two, ready ticks matching what the dashboards say.
- **Close the guest's browser mid-gathering.** The host's start should become
  pressable rather than waiting forever for somebody who has gone.
- **Swim to it without joining a lobby.** It is a place; it should be there.
- **Leave the lobby while on the board.** Nothing should strand you.
- **Check the perf HUD folds**, and that the frame rate stays on its header.

## Gate record

Filled in when the human passes it.

## Measured

Filled in from the perf HUD at gate time.
