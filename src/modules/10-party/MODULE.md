# 10-party

## What this is

Getting a board game started, and the island it is played on.

The host opens a game, everybody readies up, the host starts it, and everyone
is put on the starting line of a **hundred-and-twenty-tile spiral race** on a
separate island out across the water — the track runs from the beach inwards,
three turns, finishing at the foot of a volcano with treasure on top.

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

A hundred and twenty tiles, three turns, from the beach in to the volcano — a
**2.58 km** run, with tiles 16 m across and 21.7 m apart.

Those numbers are all one decision. Three turns is what keeps the tiles close
enough together to read as a road: at four the gaps stretch to thirteen metres
and the spiral becomes a dotted line, and at two the tiles overlap. Tile size
is set against the *track*, not against the duck — a tile a duck's width across
would be a speck on an island this size. The spiral's arms end up 48.8 m apart,
so there is 32.8 m of clear plateau between one lap of the track and the next.

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

## Known limitations

- **Arriving is a teleport**, with no transition. You are on one beach and then
  you are on another.
- **The tiles do nothing.** They are discs on the ground; nothing knows which
  one you are standing on.
- **The volcano is scenery.** It does not erupt, and the treasure cannot be
  picked up — there is a currency module waiting for it, and nothing connects
  the two yet.
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
- **Run the whole spiral.** Three turns, tiles evenly spaced the whole way —
  no bunching as it tightens, no gaps at the start. It should finish at the
  foot of the volcano.
- **Look up from the last tile.** The treasure should be on top.
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
