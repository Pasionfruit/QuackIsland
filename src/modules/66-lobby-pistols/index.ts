/** Lobby-only non-lethal pistols, synchronized knockdowns, and a local K/D HUD. */
export { LobbyPistols, isLobbyPistolActive } from './internal/LobbyPistolsView'
export {
  getLobbyPistols,
  listenForLobbyPistols,
  shootLobbyPlayer,
  syncLobbyPistolRoom,
  useLobbyPistols,
  type LobbyPistolState,
} from './internal/state'
export { decodeLobbyPistolHit, encodeLobbyPistolHit, LOBBY_PISTOL_TAG, type LobbyPistolHitMessage } from './internal/protocol'
export { aimedLobbyTarget, LOBBY_PISTOL, scoreLobbyHit, type LobbyScore, type LobbyTarget, type Point3 } from './internal/rules'
