/**
 * 46-youre-the-bomb - the public contract.
 *
 * Minigame 42. A long room with bombs hidden in the floor and a hole at the far
 * end. Scan to see the bombs around you, pick your way through, shove anybody in
 * your way, and drop through the hole before the giant rolling pin comes through
 * the room at 45 seconds. First out wins.
 *
 * It plugs into `15-minigames` and nothing else in the build knows it exists.
 * Importing this module registers it - one line in the composition root.
 *
 * The exports below are the rules, and they are here because they are worth
 * testing rather than because anybody else needs them.
 */
import { registerMinigame } from '../15-minigames'
import { RoomScreen } from './internal/RoomScreen'
import { newGame } from './internal/setup'

registerMinigame('youre-the-bomb', {
  newGame: () => newGame(),
  Panel: RoomScreen,
})

export { COLS, ROOM, ROWS, cellAt, cellMiddle, inHole, roomFor, scan, spawnPoint, type Bomb, type Point, type Room } from './internal/room'

export {
  BODY,
  BOMB,
  COLOURS,
  PIN,
  PUSH,
  ROUND,
  SCAN,
  canAct,
  clock,
  cooldownLeft,
  createGame,
  inRoom,
  judgeEnd,
  leave,
  live,
  move,
  pinZ,
  placings,
  push,
  steer,
  stepGame,
  tick,
  wrapAngle,
  yawTowards,
  type Entrant,
  type Game,
  type How,
  type Player,
} from './internal/rules'

export { BOT, botSteer, nextSquare } from './internal/ai'

export { MAX_PLAYERS, ME, SOLO_PLAYERS, gameRoster, myId, newGame, nextSeed, waitingGame, type GameSetup } from './internal/setup'

export { INTENT_TAG, SNAPSHOT_TAG, applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot, type Intent, type Snapshot, type WireBlown, type WirePlayer } from './internal/wire'

export { PALETTE, RoomScene, type ScanRef } from './internal/RoomScene'

export { RoomScreen } from './internal/RoomScreen'
