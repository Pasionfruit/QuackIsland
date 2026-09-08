/**
 * 10-party - the public contract.
 *
 * Getting a board game started: the host opens one, everybody readies up, the
 * host starts it, and everyone is moved onto a shared island in the sky.
 *
 * The board game itself does not exist yet. What does exist is the part that
 * has to be right before it can: who is here, who is ready, who may press
 * start, and everybody ending up in the same place at the same moment.
 */

export {
  PARTY,
  allReady,
  arenaHeightAt,
  canStart,
  decodeParty,
  encodeParty,
  spawnFor,
  waitingFor,
  type PartyMessage,
  type PartyPhase,
} from './internal/party'

export {
  ME,
  amReady,
  announceParty,
  endGame,
  forgetPlayer,
  getParty,
  hostGame,
  listenForParty,
  resetParty,
  setReady,
  startGame,
  useParty,
  type PartyState,
} from './internal/state'

export { Arena } from './internal/ArenaView'
export { Party } from './internal/PartyView'
