/**
 * 40-whats-your-rpm - the public contract.
 *
 * Minigame 31. A race down a feed of sixty reels on a mini phone: scroll with
 * the mouse wheel as fast as you can, and when an ad takes over the screen,
 * click its Skip Ad button - somewhere different every time, and smaller the
 * further you get - to carry on. The first to the end of the feed wins.
 *
 * It plugs into `15-minigames` and nothing else in the build knows it exists.
 * Importing this module registers it - one line in the composition root.
 *
 * The exports below are the rules, and they are here because they are worth
 * testing rather than because anybody else needs them.
 */
import { registerMinigame } from '../15-minigames'
import { RpmScreen } from './internal/RpmScreen'
import { newGame } from './internal/setup'

registerMinigame('whats-your-rpm', {
  newGame: () => newGame(),
  Panel: RpmScreen,
})

export {
  ADS,
  COLOURS,
  FEED,
  blocked,
  capOf,
  clearWheel,
  createGame,
  drainWheel,
  finished,
  leave,
  newPlayer,
  newWheel,
  nextAd,
  placings,
  planAds,
  queueWheel,
  report,
  rpm,
  scroll,
  skipAd,
  stepGame,
  timeLeft,
  wheelReels,
  type Ad,
  type Entrant,
  type Game,
  type Player,
  type Wheel,
} from './internal/rules'

export { adCopyAt, reelAt, type AdCopy, type Reel } from './internal/reels'

export { BOT_RATE, BOT_REACT, botRate, botReaction, stepBots } from './internal/ai'

export { MAX_PLAYERS, ME, SOLO_PLAYERS, gameRoster, myId, newGame, nextSeed, waitingGame, type GameSetup } from './internal/setup'

export {
  INTENT_TAG,
  SNAPSHOT_TAG,
  applySnapshot,
  decodeIntent,
  decodeSnapshot,
  encodeIntent,
  encodeSnapshot,
  type Intent,
  type Snapshot,
  type WirePlayer,
} from './internal/wire'

export { FILL, FOV, POINTS, TILT, TRACK, frameScene, laneZ, trackX, type Shot } from './internal/camera'

export { RpmScreen } from './internal/RpmScreen'
