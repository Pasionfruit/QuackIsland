import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { useNet } from '../../09-net'
import { useParty } from '../../10-party'
import { useGameMode } from '../../13-modes'
import { useBoardMovement } from '../../53-board-movement'
import { useMinigameRound } from '../../54-minigame-round'
import {
  listenForRewardDice,
  returnRewardsToBoard,
  syncRewardDiceLifecycle,
  useRewardDice,
} from './state'
import type { RewardAssignment } from './rules'
import './reward-dice.css'

function rankLabel(rank: number): string {
  if (rank === 0) return 'No podium'
  if (rank === 1) return '1st place'
  if (rank === 2) return '2nd place'
  if (rank === 3) return '3rd place'
  return `${rank}th place`
}

function bonusLabel(assignment: RewardAssignment): string {
  if (assignment.bonus?.kind === 'gold') return 'Gold d6 bonus'
  if (assignment.bonus?.kind === 'silver') return 'Silver d4 bonus'
  if (assignment.bonus?.kind === 'bronze') return 'Bronze d2 bonus'
  return 'Base die only'
}

function RewardDiceOverlay(): React.JSX.Element | null {
  const reward = useRewardDice()
  const minigame = useMinigameRound()
  const board = useBoardMovement()
  const net = useNet()
  const party = useParty()
  const mode = useGameMode()

  useEffect(() => listenForRewardDice(), [])
  useEffect(() => {
    syncRewardDiceLifecycle()
  }, [
    board.phase,
    board.round,
    board.sessionId,
    minigame.continueRequested,
    minigame.phase,
    minigame.revision,
    minigame.sessionId,
    mode,
    net.host,
    net.id,
    net.room,
    net.status,
    party.phase,
  ])

  if (reward.phase !== 'reveal') return null
  const ordered = [...reward.assignments].sort((left, right) => {
    const leftRank = left.rank === 0 ? Number.MAX_SAFE_INTEGER : left.rank
    const rightRank = right.rank === 0 ? Number.MAX_SAFE_INTEGER : right.rank
    return leftRank - rightRank || left.name.localeCompare(right.name)
  })

  return (
    <div className="reward-dice-shell" role="dialog" aria-label="Volcano Island reward dice">
      <section className="reward-dice-panel">
        <header>
          <span>Minigame rewards</span>
          <h2>Dice for round {reward.targetBoardRound}</h2>
          <p>Every player rolls a base d6. Podium bonuses are added to that roll.</p>
        </header>

        <ol className="reward-dice-list">
          {ordered.map((assignment) => (
            <li
              key={assignment.playerId}
              className={assignment.playerId === net.id ? 'is-me' : undefined}
              data-bonus={assignment.bonus?.kind ?? 'base'}
            >
              <div>
                <span>{rankLabel(assignment.rank)}</span>
                <strong>{assignment.name}{assignment.playerId === net.id ? ' - you' : ''}</strong>
              </div>
              <div className="reward-dice-roll" aria-label={`Base d6 plus ${bonusLabel(assignment)}`}>
                <b data-kind="base">d6</b>
                {assignment.bonus && <b data-kind={assignment.bonus.kind}>d{assignment.bonus.sides}</b>}
              </div>
              <small>{bonusLabel(assignment)}</small>
            </li>
          ))}
        </ol>

        <footer>
          {net.host ? (
            <button type="button" onClick={returnRewardsToBoard}>Return to board</button>
          ) : (
            <span>Waiting for the host to return to the board</span>
          )}
        </footer>
      </section>
    </div>
  )
}

export function RewardDice(): null {
  useEffect(() => {
    const mount = document.createElement('div')
    mount.dataset.rewardDiceRoot = 'true'
    document.body.append(mount)
    const root = createRoot(mount)
    root.render(<RewardDiceOverlay />)
    return () => {
      root.unmount()
      mount.remove()
    }
  }, [])
  return null
}
