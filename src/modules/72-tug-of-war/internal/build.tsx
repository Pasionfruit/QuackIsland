import { getNet } from '../../09-net'
import type { MinigameBuild } from '../../15-minigames'
import { TugPanel } from './TugPanel'
import { newRound,waitingRound } from './setup'
import type { Round } from './rules'
export const tugOfWarBuild:MinigameBuild={newGame:()=>getNet().status==='joined'&&!getNet().host?waitingRound():newRound(),Panel:({run})=><TugPanel run={run} initial={run.game as Round}/>}
