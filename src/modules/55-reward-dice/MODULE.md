# 55-reward-dice

## Purpose

This module owns the handoff from a completed Volcano Island minigame to the
next board round. It converts synchronized placements into one-round dice,
shows the result to every player, closes the minigame screen, and lets only the
host return the party to the preserved board.

Every player keeps a base d6. Rank 1 adds a golden d6, rank 2 adds a silver d4,
rank 3 adds a bronze d2, and every other rank receives no bonus die. Tied ranks
receive the same bonus. The bonus provider is scoped to the same board session
and exactly `sourceBoardRound + 1`, so it cannot leak into later rounds.

## Public contract

The public surface is `index.ts`.

- `createRewardDice`, `returnRewardDice`, `rewardDiceForPlayer`,
  `bonusForRank`, and `isRewardDiceSnapshot` are the pure reward rules.
- `RewardDiceSnapshot`, `RewardAssignment`, and the related types describe the
  bounded synchronized state.
- `encodeRewardDiceMessage` and `decodeRewardDiceMessage` define the bounded
  `reward-dice/v1` room protocol.
- `getRewardDice` and `useRewardDice` expose the current coordinator snapshot.
- `listenForRewardDice`, `requestRewardDiceSync`, and
  `syncRewardDiceLifecycle` coordinate host snapshots and late guest sync.
- `returnRewardsToBoard` is the host-only, idempotent board handoff.
- `resetRewardDice` clears local reward state and the board dice provider.
- `RewardDice` mounts the DOM overlay outside the react-three-fiber scene.

## Ownership and flow

The host creates rewards only from a completed `54-minigame-round` snapshot
whose synchronized Continue action has been recorded. The snapshot retains the
minigame session, board session, source round, target round, placements, and a
monotonic revision. Guests accept snapshots only from the elected host and only
when they match their local room, player roster, minigame, and board.

On reveal, the module installs `53-board-movement`'s public dice-provider seam,
acknowledges the consumed minigame session, and closes the minigame UI on every
browser. The overlay lists the same assignments for the party. Guests wait;
the host can choose Return to board once. That action resumes the exact source
board session and round through `resumeBoardMovement`, publishes a `returned`
revision, and leaves the dice provider available for the target round.

No result is rerolled in this module. Board movement remains authoritative for
seeded die values, rolling animation, turn progression, and movement.

## Failure behavior

Malformed or oversized wire messages are ignored. Snapshots with duplicate
players, invalid rank/die combinations, the wrong room, an unrelated board or
minigame session, a stale revision, or a sender other than the host are not
adopted. A return request that cannot resume the matching board does not publish
a returned state. Duplicate return actions are inert.

## Human review

Use one host browser and one guest browser in the same Island party:

1. Complete a board round and its final minigame. Confirm the results remain
   visible and only the host has Continue.
2. Press Continue on the host. Confirm the minigame closes on both browsers and
   both show the same reward panel before the board resumes.
3. In a two-player party, confirm first place shows base d6 plus golden d6 and
   second place shows base d6 plus silver d4. The current player should be
   identified on each browser.
4. Confirm only the host has Return to board and the guest shows a waiting
   message.
5. Press Return to board once. Confirm the overlay closes on both browsers and
   both return to the next round on the preserved board with unchanged player
   positions.
6. Roll both turns. Confirm first place rolls a base d6 and golden d6, while
   second place rolls a base d6 and silver d4. Confirm movement uses the sum.
7. Advance through the following minigame cycle and confirm old reward dice do
   not apply outside their target round.

Automated coverage includes two-player and eight-player assignment, tied
placements, players outside the podium, target-round scoping, duplicate return
actions, bounded protocol decoding, host creation, guest adoption, host-only
return, and failed board resumption.

## Non-goals

- Persistent reward inventory beyond the immediately following board round.
- Changes to board die generation, validation, or animation.
- Tile actions, obstacles, or branching movement.
- Durable database or server-authoritative simulation.

## Measured

DOM and state only: zero three.js draw calls and zero triangles.
