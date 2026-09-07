/**
 * Every minigame in one place: the union the panel and the renderer switch on,
 * and the one factory that turns an id into a running game.
 */
import { ChipperGame, JumboGame, MazeGame, SaucerGame, ZombieGame } from './arena'
import { DodgeGame, MasherGame, PrecisionGame, ReactionGame } from './games'
import type { MgRosterEntry, MinigameId } from './types'

export type AnyMinigame =
  | ReactionGame
  | MasherGame
  | DodgeGame
  | PrecisionGame
  | ZombieGame
  | JumboGame
  | SaucerGame
  | ChipperGame
  | MazeGame

export function buildMinigame(id: MinigameId, roster: MgRosterEntry[], seed = 1): AnyMinigame {
  switch (id) {
    case 'masher':
      return new MasherGame(roster, seed)
    case 'dodge':
      return new DodgeGame(roster, seed)
    case 'precision':
      return new PrecisionGame(roster, seed)
    case 'zombie':
      return new ZombieGame(roster, seed)
    case 'jumbo':
      return new JumboGame(roster, seed)
    case 'saucer':
      return new SaucerGame(roster, seed)
    case 'chipper':
      return new ChipperGame(roster, seed)
    case 'maze':
      return new MazeGame(roster, seed)
    default:
      return new ReactionGame(roster, seed)
  }
}

export { NEVER, PRECISION_RANGE, DODGE_JUMP_FRAMES } from './games'
export {
  CHIP_IN_RANGE,
  CHIP_PERFECT,
  CHIP_TARGET,
  ChipperGame,
  JUMBO_AIR,
  LENS,
  MAZE_CH,
  MAZE_COLS,
  MAZE_CW,
  MAZE_LOST,
  MAZE_ROWS,
  SAUCER_NEVER,
} from './arena'
