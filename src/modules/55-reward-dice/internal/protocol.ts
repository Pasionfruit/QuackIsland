import { isRewardDiceSnapshot, type RewardDiceSnapshot } from './rules'

export const REWARD_DICE_WIRE = 'reward-dice/v1'

export type RewardDiceMessage =
  | { channel: typeof REWARD_DICE_WIRE; kind: 'snapshot'; snapshot: RewardDiceSnapshot }
  | { channel: typeof REWARD_DICE_WIRE; kind: 'sync'; sessionId: string; minigameSessionId: string }

type RewardDiceMessageBody =
  | { kind: 'snapshot'; snapshot: RewardDiceSnapshot }
  | { kind: 'sync'; sessionId: string; minigameSessionId: string }

export function encodeRewardDiceMessage(message: RewardDiceMessageBody): RewardDiceMessage {
  return { channel: REWARD_DICE_WIRE, ...message } as RewardDiceMessage
}

export function decodeRewardDiceMessage(value: unknown): RewardDiceMessage | null {
  if (!value || typeof value !== 'object') return null
  const message = value as Record<string, unknown>
  if (message.channel !== REWARD_DICE_WIRE) return null
  if (message.kind === 'snapshot') {
    return isRewardDiceSnapshot(message.snapshot)
      ? { channel: REWARD_DICE_WIRE, kind: 'snapshot', snapshot: message.snapshot }
      : null
  }
  if (
    message.kind === 'sync' &&
    typeof message.sessionId === 'string' &&
    message.sessionId.length > 0 &&
    message.sessionId.length <= 180 &&
    typeof message.minigameSessionId === 'string' &&
    message.minigameSessionId.length > 0 &&
    message.minigameSessionId.length <= 180
  ) {
    return {
      channel: REWARD_DICE_WIRE,
      kind: 'sync',
      sessionId: message.sessionId,
      minigameSessionId: message.minigameSessionId,
    }
  }
  return null
}
