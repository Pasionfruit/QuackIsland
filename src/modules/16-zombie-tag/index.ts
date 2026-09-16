/**
 * 16-zombie-tag - the public contract.
 *
 * Minigame 1. Six zombies, an enclosed arena full of crates, and everybody
 * spawning in the middle. Get caught and you join the chase; the last one
 * running wins.
 *
 * It plugs into `15-minigames` and nothing else in the build knows it exists.
 * Importing this module registers it - one line in the composition root - and
 * from that moment the dashboard's Zombie Tag tile leads somewhere real
 * instead of to a briefing with nothing behind it.
 *
 * The exports below are the rules, and they are here because they are worth
 * testing rather than because anybody else needs them. Nothing outside this
 * module should be reaching for them.
 */
import { registerMinigame } from '../15-minigames'
import { ZombieTagScreen } from './internal/ZombieTagScreen'
import { newRound } from './internal/setup'

registerMinigame('zombie-tag', {
  newGame: () => newRound(),
  Panel: ZombieTagScreen,
})

export {
  ARENA,
  HALF_H,
  HALF_W,
  OBSTACLES,
  clampToArena,
  inObstacle,
  playerSpawns,
  pushOutOfBox,
  settle,
  zombieSpawns,
  type Obstacle,
  type Point,
} from './internal/arena'

export {
  NO_INTENT,
  createBody,
  createRound,
  placings,
  shove,
  speedOf,
  stepRound,
  survivedFor,
  survivors,
  zombies,
  type Body,
  type Intent,
  type Round,
  type Side,
  type Spawn,
} from './internal/round'

export { crowdIntents, runnerIntent, zombieIntent } from './internal/ai'

export {
  ME,
  SOLO_RUNNERS,
  emptyRound,
  lobbyRoster,
  myId,
  newRound,
  type RoundSetup,
} from './internal/setup'

export {
  INTENT_TAG,
  SNAPSHOT_TAG,
  SNAP_DISTANCE,
  applySnapshot,
  decodeIntent,
  decodeSnapshot,
  easeTowards,
  encodeIntent,
  encodeSnapshot,
  hearIntent,
  type Snapshot,
  type WireBody,
} from './internal/wire'

export { ZombieTagScreen } from './internal/ZombieTagScreen'
