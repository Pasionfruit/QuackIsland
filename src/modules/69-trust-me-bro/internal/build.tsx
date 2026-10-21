import { getNet } from '../../09-net'
import type { MinigameBuild } from '../../15-minigames'
import { newRound, waitingRound } from './setup'
import { TrustMeBroPanel } from './TrustMeBroPanel'
import type { Round } from './rules'

/** Ready for catalogue registration once a new id is authorized. */
export const trustMeBroBuild: MinigameBuild = {
  newGame: () => getNet().status === 'joined' && !getNet().host ? waitingRound() : newRound(),
  Panel: ({ run }) => <TrustMeBroPanel run={run} initial={run.game as Round} />,
}
