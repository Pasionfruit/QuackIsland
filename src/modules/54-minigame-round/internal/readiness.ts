import { MINIGAME_ROUND } from './rules'

export const MINIGAME_ROUND_READY_WIRE = 'minigame-round-ready/v1'

export interface MinigameRoundReadyMessage {
  channel: typeof MINIGAME_ROUND_READY_WIRE
  kind: 'ready'
  sessionId: string
  boardRound: number
}

export function encodeMinigameRoundReady(
  sessionId: string,
  boardRound: number,
): MinigameRoundReadyMessage {
  return { channel: MINIGAME_ROUND_READY_WIRE, kind: 'ready', sessionId, boardRound }
}

export function decodeMinigameRoundReady(value: unknown): MinigameRoundReadyMessage | null {
  if (!value || typeof value !== 'object') return null
  const message = value as Record<string, unknown>
  if (message.channel !== MINIGAME_ROUND_READY_WIRE || message.kind !== 'ready') return null
  if (
    typeof message.sessionId !== 'string' ||
    message.sessionId.length === 0 ||
    message.sessionId.length > MINIGAME_ROUND.maxIdLength
  ) return null
  if (!Number.isSafeInteger(message.boardRound) || (message.boardRound as number) < 1) return null
  return {
    channel: MINIGAME_ROUND_READY_WIRE,
    kind: 'ready',
    sessionId: message.sessionId,
    boardRound: message.boardRound as number,
  }
}

export function allConnectedMinigamePlayersReady(
  roster: readonly string[],
  connected: readonly string[],
  ready: readonly string[],
): boolean {
  const rosterIds = new Set(roster)
  const readyIds = new Set(ready)
  const expected = connected.filter((id) => rosterIds.has(id))
  return expected.length > 0 && expected.every((id) => readyIds.has(id))
}

