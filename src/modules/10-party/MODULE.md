# 10-party

## What this is

Getting a board game started: the host opens one, everybody readies up, the
host starts it, and everyone is moved onto a shared island in the sky.

**The board game itself does not exist yet.** What does exist is the part that
has to be right before it can — who is here, who is ready, who may press start,
and everybody ending up in the same place at the same moment. Those are the
questions with exact answers, and they are all pure and tested in
`internal/party.ts`.

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
| `arenaHeightAt(x, z, below)` | The ground while a game is running. Pure |
| `spawnFor(index, count)` | Where the nth player stands. Pure |
| `PARTY` | Height, radius, spawn ring |
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

- **No board game.** No turns, no dice, no squares, no rules, no scoring. This
  is the lobby that comes before one.
- **No second terrain.** The arena is a slab, not a world: no water, no shore,
  no weather of its own.
- **No spectators, no teams, no kicking, no lobby chat.**
- **No reconnection into a running game.** Somebody who drops out and rejoins
  arrives back on the island.
- **No authority beyond the host's word.** Same trade as the rest of the
  networking: this is for playing with friends.

## Where the board is, and why it is up there

Straight above the island, at `PARTY.height`.

Beside it would have been the obvious choice and is the wrong one. Everything
in this world is centred on the origin: the sea is a plane 1800 m across and
the terrain mesh stops at 288 m, so a second island out to the side sits next
to two visible edges — the square end of the water and the square end of the
ground. Straight up there is nothing but sky, and looking down at your own
island from a floating board reads as deliberate.

**Walking off the edge drops you home.** `arenaHeightAt` falls back to whatever
the ground was below, so the accident is a fall onto the beach rather than a
fall forever, and the board needs no railing. There is a lip round the rim so
the edge reads as an edge rather than as the horizon.

## Which ground you are standing on

The player and the footprints both take a `groundAt`, and `src/app/scene.ts`
decides which one is live. That is the composition root's job precisely because
it is the only place allowed to know both that a board game exists and how
footprints are drawn:

```ts
function currentGround(x, z) {
  return getParty().phase === 'playing' ? arenaHeightAt(x, z, heightAt) : heightAt(x, z)
}
```

The player module has never heard of a party, and this module has never heard
of a footprint.

## How this talks to other browsers

Through `09-net`'s room channel, which passes **opaque** messages. The
transport never learns what a board game is, and this module never learns what
a WebSocket is. Adding a dice roll later is a new message shape here and no
change at all to the relay or to `09-net`.

## Known limitations

- **The board is a slab.** It is somewhere to stand while the game is built,
  and every minute spent making it pretty now is a minute spent on something
  about to be replaced by an actual board.
- **Arriving is a teleport**, with no transition. You are on the beach and then
  you are in the sky.
- **The teleport lays one stray footprint** and fires one footstep, because
  both systems see a very large step. Harmless, and cheaper to live with than
  to plumb a "do not count this" flag through two modules.
- **Sea level still applies.** The board is far above it, so nothing swims, but
  the water is still drawn under you.
- **Somebody joining mid-game** is told the phase by the host's next message
  and will find themselves on the island looking up.

## How to review

Two browsers in one lobby; `DEPLOY.md` has the commands.

- **Alone in a lobby**, host a game. The ready button should appear, start
  should be dead until you press ready, and then it should light up.
- **With two**, host on one. The other should see the ready button appear
  without doing anything.
- **Ready up on one only.** The host's start must stay dead and the dashboard
  should say it is waiting on one.
- **Ready up on both, then press start.** Both ducks should arrive on the
  board, apart from each other, and both should be able to walk.
- **Walk off the edge.** You should fall and land on the island, not fall
  forever.
- **Press back to the island.** Everybody should return, and everybody's ready
  should clear.
- **Hold Tab at every stage.** Everyone listed, pings filling in after a second
  or two, ready ticks matching what the dashboards say.
- **Close the guest's browser mid-gathering.** The host's start should become
  pressable rather than waiting forever for somebody who has gone.
- **Leave the lobby while on the board.** You should be put back to normal
  rather than stranded in the sky.
- **Check the perf HUD folds**, and that the frame rate stays on its header.

## Gate record

Filled in when the human passes it.

## Measured

Filled in from the perf HUD at gate time.
