import { isMinigameRoundSnapshot, MINIGAME_ROUND, type MinigameRoundSnapshot } from './rules'

export const MINIGAME_ROUND_WIRE = 'minigame-round/v1'

export type MinigameRoundMessage =
  | { channel: typeof MINIGAME_ROUND_WIRE; kind: 'snapshot'; snapshot: MinigameRoundSnapshot }
  | { channel: typeof MINIGAME_ROUND_WIRE; kind: 'sync'; sessionId: string; boardRound: number }

type MinigameRoundMessageBody =
  | { kind: 'snapshot'; snapshot: MinigameRoundSnapshot }
  | { kind: 'sync'; sessionId: string; boardRound: number }

export function encodeMinigameRoundMessage(
  message: MinigameRoundMessageBody,
): MinigameRoundMessage {
  return { channel: MINIGAME_ROUND_WIRE, ...message } as MinigameRoundMessage
}

export function decodeMinigameRoundMessage(value: unknown): MinigameRoundMessage | null {
  if (!value || typeof value !== 'object') return null
  const message = value as Record<string, unknown>
  if (message.channel !== MINIGAME_ROUND_WIRE) return null
  if (message.kind === 'snapshot') {
    return isMinigameRoundSnapshot(message.snapshot)
      ? { channel: MINIGAME_ROUND_WIRE, kind: 'snapshot', snapshot: message.snapshot }
      : null
  }
  if (message.kind === 'sync') {
    if (typeof message.sessionId !== 'string' || message.sessionId.length === 0 || message.sessionId.length > MINIGAME_ROUND.maxIdLength) return null
    if (!Number.isSafeInteger(message.boardRound) || (message.boardRound as number) < 1) return null
    return {
      channel: MINIGAME_ROUND_WIRE,
      kind: 'sync',
      sessionId: message.sessionId,
      boardRound: message.boardRound as number,
    }
  }
  return null
}
