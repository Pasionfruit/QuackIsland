/** The small, validated room message used for a lobby knockdown. */

export const LOBBY_PISTOL_TAG = 'lobby-pistol'

export interface LobbyPistolHitMessage {
  tag: typeof LOBBY_PISTOL_TAG
  type: 'hit'
  targetId: string
  shotId: string
}

export function encodeLobbyPistolHit(targetId: string, shotId: string): LobbyPistolHitMessage {
  return { tag: LOBBY_PISTOL_TAG, type: 'hit', targetId, shotId }
}

export function decodeLobbyPistolHit(raw: Record<string, unknown>): LobbyPistolHitMessage | null {
  if (
    raw.tag !== LOBBY_PISTOL_TAG ||
    raw.type !== 'hit' ||
    typeof raw.targetId !== 'string' ||
    raw.targetId.length < 1 ||
    typeof raw.shotId !== 'string' ||
    raw.shotId.length < 1
  ) return null
  return { tag: LOBBY_PISTOL_TAG, type: 'hit', targetId: raw.targetId, shotId: raw.shotId }
}
