/**
 * 15-minigames - the public contract.
 *
 * The minigames Volcano Island is made of: forty-one of them, thirty
 * free-for-all and eleven one-vs-all, as a catalogue you can browse and a seam
 * each one plugs into when it is built.
 *
 * It plays none of them. What it owns is the part that has to be right before
 * forty-one of anything can be built: one list that is the plan, one place a
 * built game registers itself, one screen that draws whichever is open, and a
 * template for every game that has not been written yet - which today is all
 * of them.
 *
 * Building a minigame means calling `registerMinigame` with a starting state
 * and a panel. Nothing else in here changes, and nothing in here has to know
 * which game it was.
 */

export {
  BUILD_STEPS,
  MINIGAMES,
  MINIGAME_TARGET,
  isMinigameId,
  isPlayable,
  minigameById,
  minigamesOfKind,
  nextStep,
  progress,
  stepsDone,
  type BuildStep,
  type Control,
  type Minigame,
  type MinigameId,
  type MinigameKind,
} from './internal/catalogue'

export {
  NO_CALL,
  encodeCall,
  followCall,
  isMinigameCall,
  parseCall,
  type CallKind,
  type MinigameCall,
  type ParsedCall,
} from './internal/call'

export {
  COUNT_FROM,
  beginRun,
  buildFor,
  builtMinigames,
  countShown,
  forgetBuilds,
  freshRun,
  isBuilt,
  isPausable,
  pauseRun,
  registerMinigame,
  resumeRun,
  tickRun,
  type MinigameBuild,
  type MinigameRun,
  type RunPhase,
} from './internal/registry'

export {
  backOut,
  closeMinigames,
  getMinigameCall,
  getMinigameScreen,
  openDashboard,
  openMinigame,
  pauseMinigame,
  playMinigame,
  resumeMinigame,
  tickMinigame,
  useMinigameScreen,
  useMinigameSync,
  type MinigameScreenState,
} from './internal/state'

export { MinigameScreen } from './internal/MinigameScreen'
