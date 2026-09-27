import { createStore, useStore } from '../../00-core'
import { stunPlayer } from '../../02-player'
import { getNet, sendToRoom, subscribeRoom } from '../../09-net'
import { CUES, playCue } from '../../15-minigames'
import { decodeLobbyPistolHit, encodeLobbyPistolHit } from './protocol'
import { LOBBY_PISTOL, scoreLobbyHit, type LobbyScore } from './rules'

export interface LobbyPistolState {
  room: string | null
  scores: Readonly<Record<string, LobbyScore>>
}

const store = createStore<LobbyPistolState>({ room: null, scores: {} })
const seenShots = new Set<string>()
let serial = 0

export function useLobbyPistols(): LobbyPistolState {
  return useStore(store)
}

export function getLobbyPistols(): LobbyPistolState {
  return store.get()
}

/** A scoreboard belongs to a lobby, so it disappears when that lobby does. */
export function syncLobbyPistolRoom(room: string | null): void {
  if (store.get().room === room) return
  seenShots.clear()
  store.set({ room, scores: {} })
}

function remember(shotId: string): boolean {
  if (seenShots.has(shotId)) return false
  seenShots.add(shotId)
  if (seenShots.size > LOBBY_PISTOL.rememberedShots) {
    const first = seenShots.values().next().value
    if (first) seenShots.delete(first)
  }
  return true
}

function acceptLobbyHit(shooterId: string, targetId: string, shotId: string): void {
  if (!remember(shotId) || !shooterId || !targetId || shooterId === targetId) return
  const current = store.get()
  store.set({ ...current, scores: scoreLobbyHit(current.scores, shooterId, targetId) })
  const me = getNet().id
  playCue(CUES.gunShot, me === shooterId ? 0.55 : 0.22)
  playCue(CUES.fallingOver, me === targetId ? 0.6 : 0.25)
  if (me === targetId) stunPlayer(LOBBY_PISTOL.knockdownSeconds)
}

/** Announces a verified client-side hit and applies it locally right away. */
export function shootLobbyPlayer(targetId: string): void {
  const shooterId = getNet().id
  if (!shooterId || !targetId || shooterId === targetId) return
  const shotId = `${shooterId}:${Math.round(performance.now() * 1000)}:${serial++}`
  acceptLobbyHit(shooterId, targetId, shotId)
  sendToRoom({ ...encodeLobbyPistolHit(targetId, shotId) })
}

/** Starts the one room listener; callers clean it up with the returned stop. */
export function listenForLobbyPistols(): () => void {
  return subscribeRoom((from, raw) => {
    const hit = decodeLobbyPistolHit(raw)
    if (hit) acceptLobbyHit(from, hit.targetId, hit.shotId)
  })
}
