import { getNet } from '../../09-net'
import type { MinigameBuild } from '../../15-minigames'
import { TeamPanel } from './TeamPanel'
import { newRound, waitingRound } from './setup'
import type { Round } from './rules'
export const meInTeamBuild: MinigameBuild = { newGame: () => getNet().status==='joined'&&!getNet().host ? waitingRound() : newRound(), Panel: ({run}) => <TeamPanel run={run} initial={run.game as Round} /> }
