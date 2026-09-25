import { isVolcanoVictorySnapshot, type VolcanoVictorySnapshot } from './rules'

export const VOLCANO_VICTORY_WIRE = 'volcano-victory/v1' as const

export type VolcanoVictoryMessage =
  | { kind: 'snapshot'; snapshot: VolcanoVictorySnapshot }
  | { kind: 'sync'; sessionId: string; boardSessionId: string }

export function encodeVolcanoVictoryMessage(message: VolcanoVictoryMessage): Record<string, unknown> {
  return { wire: VOLCANO_VICTORY_WIRE, ...message }
}

function boundedId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 180
}

export function decodeVolcanoVictoryMessage(payload: unknown): VolcanoVictoryMessage | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const value = payload as Record<string, unknown>
  if (value.wire !== VOLCANO_VICTORY_WIRE) return null
  if (value.kind === 'snapshot' && isVolcanoVictorySnapshot(value.snapshot)) {
    return { kind: 'snapshot', snapshot: value.snapshot }
  }
  if (value.kind === 'sync' && boundedId(value.sessionId) && boundedId(value.boardSessionId)) {
    return { kind: 'sync', sessionId: value.sessionId, boardSessionId: value.boardSessionId }
  }
  return null
}
