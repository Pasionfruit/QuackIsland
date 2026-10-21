import { getNet } from '../../09-net'
import type { MinigameBuild } from '../../15-minigames'
import { DuckSznPanel } from './DuckSznPanel'
import { newRound, waitingRound } from './setup'
import type { Round } from './rules'

export const duckSznBuild: MinigameBuild = {
  newGame: () => getNet().status === 'joined' && !getNet().host ? waitingRound() : newRound(),
  Panel: ({ run }) => <DuckSznPanel run={run} initial={run.game as Round} />,
}
