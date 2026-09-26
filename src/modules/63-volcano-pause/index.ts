/** Shared player-owned pausing for the board portion of Volcano Island. */
export {
  clearVolcanoPause,
  getVolcanoPause,
  mayResumeVolcanoGame,
  pauseVolcanoGame,
  resumeVolcanoGame,
  useVolcanoPause,
  useVolcanoPauseSync,
  type VolcanoPauser,
  type VolcanoPauseState,
} from './internal/state'
export { CONTROL_CODES, isVolcanoBoardParty, shouldBlockKey } from './internal/guards'
export { VolcanoPause } from './internal/VolcanoPauseView'
