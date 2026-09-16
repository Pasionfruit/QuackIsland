/**
 * 13-modes - the public contract.
 *
 * Which game the party is playing. A catalogue of the games there are, one
 * choice shared by everybody in the lobby, and the host's hand on it.
 *
 * It holds no game. `island` is played by `10-party`; nothing plays `garden`
 * yet. A game module reads `getGameMode()` to know whether it is the one being
 * played, and the lobby popup in `src/app` is what points it at one.
 */

export {
  DEFAULT_MODE,
  MODES,
  decodeMode,
  encodeMode,
  isModeId,
  isPlayable,
  modeById,
  nextMode,
  type GameMode,
  type ModeId,
  type ModeMessage,
} from './internal/modes'

export {
  CHOICE_ANSWER_MS,
  CHOICE_REPEAT_MS,
  applyChoice,
  decodeChoice,
  encodeChoice,
  hostChoice,
  type Choice,
  type ChoiceMessage,
} from './internal/choice'

export {
  announceMode,
  askForMode,
  chooseMode,
  getGameMode,
  listenForModes,
  resetMode,
  useGameMode,
  useModeSync,
} from './internal/state'
