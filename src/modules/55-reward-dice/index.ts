/**
 * 55-reward-dice - the public contract.
 *
 * Converts a completed Volcano Island minigame into next-round bonus dice,
 * reveals them to the party, and resumes the preserved board exactly once.
 */

export {
  EMPTY_REWARD_DICE,
  REWARD_DICE,
  bonusForRank,
  createRewardDice,
  isRewardDiceSnapshot,
  returnRewardDice,
  rewardDiceForPlayer,
  type RewardAssignment,
  type RewardBonusKind,
  type RewardDicePhase,
  type RewardDiceSnapshot,
} from './internal/rules'

export {
  REWARD_DICE_WIRE,
  decodeRewardDiceMessage,
  encodeRewardDiceMessage,
  type RewardDiceMessage,
} from './internal/protocol'

export {
  getRewardDice,
  listenForRewardDice,
  requestRewardDiceSync,
  resetRewardDice,
  returnRewardsToBoard,
  syncRewardDiceLifecycle,
  useRewardDice,
} from './internal/state'

export { RewardDice } from './internal/RewardDiceView'
