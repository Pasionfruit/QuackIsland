# 10-party

## What this is

Getting a board game started, and the island it is played on.

The host opens a game, everybody readies up, the host starts it, and everyone
is put on the starting line of a **hundred-and-twenty-tile race** on a separate
island out across the water.

The island is a **150 m volcano with a horseshoe crater**, and it is not round:
its coast runs between 230 and 356 m from the middle, so it is half again as
wide one way as the other. The track starts out on the flat at the island's
edge and winds three times up the cone to the treasure on the crater floor,
leaning in and out of a true spiral as it climbs.

**The game itself does not exist yet**: no turns, no dice, no movement along
the tiles. What does exist is everything that has to be right before it can —
the island, the track, who is here, who is ready, who may press start, and
everybody arriving on the same line at the same moment.

## Public contract

| Export | Meaning |
| --- | --- |
| `outlineAt(angle)` | How far out of round the island is here. Pure |
| `localRadius(x, z)` | World point to island-local radius. Pure |
| `islandReach()` | The furthest it reaches in any direction. Pure |
| `breachDepthAt(d, angle)` | How deep the horseshoe cuts here. Pure |
| `partyHeightLocalAt(d, angle)` | The ground, breach and all. Pure |
| `trackPointAt(theta)` | A point on the road, on the ground it climbs. Pure |
| `buildIslandMesh()` | The island's shape as plain arrays. Pure |
| `BOARD_LAYER` | The three.js layer the tiles are on |
| `OUTLINE`, `BREACH` | The out-of-round waves, and the horseshoe |
| `Party` | The scene entry: the board, and moving people onto it |
| `PartyProps` | `{ active?, home? }` - which game this is, and where home is |
| `Arena` | Just the board, if something ever wants it alone |
| `useParty()` / `getParty()` | `{ phase, ready, disbanded }` |
| `hostGame()` / `startGame()` / `endGame()` | Host only |
| `setReady(ready)` / `amReady()` | Yours |
| `canStart(phase, isHost, ids, ready)` | Whether start may be pressed. Pure |
| `disbandParty()` | Ends the party: everybody leaves and goes home. Host only |
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

## This is one game among several

The race up the volcano is a **game mode**, not the only thing a party can do.
Which one is being played lives in `13-modes`, and the composition root hands
the answer down as `active`:

```tsx
createElement(Party, { active: () => getGameMode() === 'island' })
```

Passed in rather than imported, for the same reason as the ground the player
walks on: which game is running is a question for whatever is composing the
scene, and this module has never heard of a catalogue of games. Left out, it is
the only game there is, which is what it was.

What `active` gates is **the teleport, and nothing else**. The island is still
built, still drawn, and still walked on when another game is selected, because
it is a place rather than a game - you can swim out to it while other people
are playing something else. A game mode decides what happens when a game
*starts*, not what the world contains.

## Ending a round, and ending the party

Two different things, and reading one as the other either strands people or
scatters them:

- **`endGame()`** puts the phase back to `off`. The round is over, everybody is
  un-readied, and the lobby carries on. Nothing moves.
- **`disbandParty()`** ends the **party**. Everybody leaves the lobby and goes
  home to their own island. It is the host's alone, it is the last thing they
  send, and the message goes out *before* the socket closes - closing flushes
  what is already queued, so everybody hears it before the host is gone. The
  other way round, a guest would only find out by noticing the host had
  vanished.

`PartyState.disbanded` is a **count**, not a flag. What anybody watching wants
is the event - go home, say so on screen - and an event has to be told apart
from the last one: a flag that went true and true again is one thing that
happened, and two parties were called off. `PartyView` takes the count as its
cue to teleport, and the interface takes it as its cue to say so.

Going home needs a `home` callback, passed in from the composition root for the
same reason as everything else here: home is a place on the *terrain*, and this
module has never heard of the terrain.

## Invariants you may rely on

- **Only the host can disband.** A guest claiming to be one could otherwise
  send everybody home from inside somebody else's lobby, so a `disband` is
  ignored unless you are not the host - which is exactly who should be acting
  on it, and the host acts on its own call directly.
- **The host answers anybody who speaks.** Receiving a ready flag makes the
  host announce where things stand, which is how somebody who joined
  mid-gathering finds out. The phase itself is only broadcast when it changes,
  so without this a late arrival sits in `off` while everybody else is getting
  ready. The interface announces each arrival by sending its own ready state.
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

A hundred and twenty tiles, three turns round the volcano: **2.42 km** of road
from the island's edge to the treasure.

| | |
| --- | --- |
| Tile | a **rounded square**, 1.2 m across — half again the duck's 0.8 m |
| Spacing | 20.3 m of walking between one and the next, 40 tiles a lap |
| Climb | 9 m up to 150 m — the whole mountain — at a **5.8% gradient** |
| Cone | 58° at the crater, easing to flat at its foot; 150 m tall |
| Wave | ±17 m of lean, seven times over the climb |
| Evenness | every gap within **0.02%** of every other |

### It is a spiral with a wave in it

The radius carries a sine wave on top of the steady march inwards, eased out at
both ends so the track still starts and finishes exactly where it should. That
is the "not perfectly" part: the road leans out and back in as it climbs
instead of tightening at a constant rate.

A wave in the radius is a wave in the *height* as well — leaning out on a cone
is going downhill — so the road rolls rather than climbing every single step.
It gives back at most 5 m at a time, and **over any fifteen tiles it never
loses height at all**. Fifteen is measured, not chosen: it is exactly how long
the roll is, and the test says so, so retuning the wave reports what it did to
the road's rhythm.

The wave has to stay well under half the gap between one lap and the next, or
the track would touch itself; it leans towards its neighbours from both sides
at once. There is a test.

### Why the spacing is walked rather than integrated

Three things make the geometry awkward, and one decision deals with all of
them: the track **climbs**, so a metre of map is more than a metre of walking;
the island is **not round**, so the same angle is a different distance out each
lap; and the wave means the radius is not even monotonic. Integrating a speed
function would need the derivative of all three and would have to be redone
every time the island changed shape.

So the curve is **walked** instead — sampled finely in three dimensions, actual
hops added up, tiles stepped along the total. Fewer moving parts, nothing to
keep in step with the island, and it stays right whatever the island becomes
next.

Measured: the walking distance between consecutive tiles is even to 0.02%. The
**straight-line** distance is not, and should not be — near the crater the road
climbs a 58° wall in a tight turn, so the last few tiles are 10.7 m apart in a
straight line and 20.3 m apart along the road. The test measures the road,
because the road is what you walk.

### The horseshoe

A wedge cut out of one side, deepest at the crater and gone by about two crater
radii out. From above the summit reads as a horseshoe; from the side, as a
breached wall with a notch running out of it.

It is kept **short** on purpose, and the reason is the road. The track wraps the
cone three times, so it crosses the breach once a lap whatever else is true —
and a valley running a third of the way down the mountain turned two of those
crossings into nineteen-metre plunges between one tile and the next, which is a
cliff rather than a road. Confined to the crater, the two lower crossings miss
it and the last dips a few metres: a road going through a gap in a wall, which
is what the gap is for.

One thing had to be handled for it to work at all. At the exact centre of the
crater every angle is the same point, so a notch with depth there asks one
point to be at several heights at once — which came out of the mesh as a fan of
vertical slivers and out of the ground function as a cliff with no width. The
breach fades out of the middle, and the crater keeps its floor.

### The cone profile

Not a smoothstep. A smoothstep eases at *both* ends, and what that gives you is
a dome with a dent in it: the first fifty metres out from the rim fell barely
five, so there was no rim to breach and no cone to wrap. `1 - (1 - t)²` is
steepest exactly where a volcano should be — 58° at the crater's edge, easing
to flat as it meets the plateau. The crease it leaves at the rim is not a flaw,
it is the rim.

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

## The tiles

Rounded squares, built as a flat shape with real arcs at the corners and
extruded — a bevel would round them in section rather than in plan, and plan is
the angle almost everybody sees a tile from.

They sit on **their own layer**, `BOARD_LAYER`, and on their own plane. Layer 0
stays enabled so the ordinary camera still draws them; the point of the extra
one is that anything wanting the track without the island — a map, a minimap, a
camera that looks only at the board — gets it by enabling a single layer.

Each tile is **tilted into the slope** it sits on and lifted along that slope's
own normal rather than straight up. On a cone that runs to 58° a flat tile
buries half its uphill corner, and a tile lifted vertically on a steep slope has
a different clearance on each side.

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
- **The last few tiles are close together on the ground** even though they are
  the same walk apart as every other pair. That is the crater wall: 58° of
  climb in a tight turn eats the distance vertically.
- **The road crosses the breach once a lap.** Twice it misses the notch
  entirely and once it dips a few metres through it.
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
- **Walk the track from the first tile.** It starts on the flat at the island's
  edge, reaches the volcano's foot, and winds three times to the top. It should
  lean out and back in as it goes rather than tightening evenly — and it should
  roll a little without ever really losing ground.
- **Look at the crater from above, or from across the water.** A horseshoe: a
  rim with one side bitten out of it, not a ring and not a bowl.
- **Sail round the island.** The coast should be visibly longer one way than the
  other — never an arc you could have drawn with a compass.
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
