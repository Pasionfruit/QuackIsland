# 68-minigame-kit

The standard base cases every minigame is built from. Before this module, every
one of the 41 games had its own copy of the same identity helper, lobby roster,
seed dealer, wire guards and host/guest net loop. A fix to one, like the
placeholder round that flashed Finish at a joining guest, had to be found and
made again in each of the others.

A new game should now be its rules, its scene and its screen. Everything below
comes from here.

## What it gives a game

| Base case | Exports | Used by |
|---|---|---|
| **Roster**: you, the lobby or stand-ins, a seed | `myId`, `ME`, `MAX_PLAYERS`, `lobbyRoster`, `entrantsOf`, `seedDealer`, `Seat`, `Entrant` | every minigame's `setup.ts` |
| **One-vs-all deal** | `resolveTheOne`, `castOneVsAll`, `holding`, `oneVsAllSetup`, `oneVsAllProblems` | 64, 65, 67 |
| **Wire units and guards** | `cm`, `mrad`, `cs`, `fixed`, `r2`, `isNumber`, `isCount`, `isInt`, `isId`, `MRAD_LIMIT` | 64, 65, 67 (free-for-all games still have their own copies) |
| **Wire messages** | `encodePose`/`decodePose`, `encodeClaim`/`decodeClaim`, `encodeHeader`/`decodeHeader`, `sides`, `playerRows`, `mergePlayers`, `adoptRound` | 64, 65, 67 |
| **Arena net loop** | `useArenaNet`, `createArenaLink`, `ArenaRules`, `ArenaRoom`, `LIVE_ROOM` | 64, 65, 67 |

### One-vs-all, in one call

A one-vs-all game's whole `setup.ts`:

```ts
const kit = oneVsAllSetup({ game: 'jackal', solo: SOLO_PLAYERS, standIn: (seat) => `runner ${seat}`, createRound })
export const { nextSeed, newRound, waitingRound } = kit
export const gameRoster = kit.roster
```

Its `createRound` takes the 1 from `castOneVsAll(entrants, chosen)`. Its
`setup.test.ts` asserts `oneVsAllProblems(kit, oneOf, playersOf)` equals `[]`.
That one assertion covers all of these:

- the waiting round is never over and has no winner;
- alone, the human is the 1;
- a stand-in is never the 1;
- the host's pick is honoured;
- a pick who has left falls back to the first human.

### The arena loop

`ArenaRules` is what a game supplies: its wire functions, plus `tick`, `drive`
(your hands on your own body), `bots`, `hear` (one guest message, on the host),
an optional `settle`, `leave` and `judgeEnd`. The kit handles everything else
the same way for every game:

- splitting the host and guest sides;
- the shared pause;
- an empty round;
- the queue of guest messages, filtered to the current round;
- `sinceLast` per guest, which is what a move is clamped against;
- dropping players who left the lobby, but never stand-ins;
- throttled snapshots (66 ms) and guest reports (50 ms);
- the guest's clock easing toward the host's, jumping when 0.4 s or more apart;
- sending a guest's claims through `say`.

`createArenaLink(rules, room)` is the same loop with a fake room, which is how
`__tests__/arena.test.ts` drives it.

## Decisions

- **A stand-in is never the 1, even when chosen.** `resolveTheOne` refuses a
  chosen bot and falls back to the first human. Before, each game fell back to
  `roster[0]`. That only matched the stated rule because, playing alone, the
  human happens to be seat 1. Big Backs had a test that chose a stand-in, so it
  now uses people and asserts the refusal.
- **One wire key for the 1.** Every one-vs-all snapshot carries the 1's id as
  `o1`. Big Backs used `h` and now uses `o1`. All clients run the same build,
  so nothing old is left on the wire to read `h`.
- **Each game's own exports are kept.** `resolveSniper`, `resolveHunter` and
  `resolveMama` are still exported, now as `resolveTheOne`. Every setup still
  exports `myId`, `ME`, its roster function and `nextSeed` under the same names.
  Tests, screens and contract snapshots did not change.
- **Seeds are dealt exactly as before**: same hash input, same game tags. The
  four hidden-information games (18, 22, 23, 24) still deal from their own
  `secret()`, which is deliberate.

## Not migrated yet

- Free-for-all **net loops and wire files**. They have the same shape as the
  arena loop (`16-zombie-tag`, `19-duck-hunt`, `20-punch-buggy`,
  `32-hes-one-shot` most closely), but each should move over when it is next
  touched, with its own tests, not all in one sweep. Turn-based and intent-based
  games such as `61-op-finder` need a separate, smaller loop.
- The **rosters of 16, 17 and 18**. They differ from the template (string ids,
  a layout picker, a different solo shape), so they keep their own and use only
  `myId`/`ME` (16, 18) plus `seedDealer` (17).

## How to review

1. Play Jackal, Big Backs Are Near and Mama Tank with two browsers
   (`run-localrot` can open several). The host's pick of the 1 should stick,
   the guest should never see Finish flash while joining, shots should still
   land, and a guest who leaves should be dropped.
2. Play each of them alone. You should be the 1, and the stand-ins should play
   the rest.
3. Spot-check a few free-for-all games alone and in a lobby: roster size,
   stand-in names, a fresh round each time.
