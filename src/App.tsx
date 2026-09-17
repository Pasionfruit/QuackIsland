/**
 * The page.
 *
 * Two halves behind two error boundaries: the world in the canvas, and the
 * interface over it. One of them falling over must not take the other with it,
 * and neither may leave a blank page with nothing to read - see `Boundary`.
 */
import { GameCanvas, PerfHUD } from './modules/00-core'
import { MusicPlayer } from './modules/05-music'
import { WalletHUD } from './modules/11-currency'
import { World } from './app/World'
import { DebugPanel } from './app/DebugPanel'
import { PartyPanel } from './app/PartyPanel'
import { LobbyPopup } from './app/LobbyPopup'
import { useParty } from './modules/10-party'
import { GardenScreen } from './modules/14-garden'
import { MinigameScreen, useMinigameScreen, useMinigameSync } from './modules/15-minigames'
import { musicStopped } from './app/music'
// Imported for the side effect: it registers itself with the minigame
// registry, which is the whole of how a built game plugs in.
import './modules/16-zombie-tag'
import './modules/17-messy-maze'
import './modules/18-probable-stop'
import './modules/19-duck-hunt'
import './modules/20-punch-buggy'
import './modules/21-i-see-the-light'
import './modules/22-let-him-cook'
import './modules/23-lady-luck'
import './modules/24-make-the-cut'
import './modules/25-wack-attack'
import './modules/26-sprint-triathlon'
import './modules/27-find-yourself'
import './modules/28-feeding-time'
import './modules/29-time-it'
import './modules/30-synchronize-steps'
import './modules/31-helping-dad'
import './modules/32-hes-one-shot'
import './modules/33-keyboard-warrior'
import './modules/35-chef-caricature'
import './modules/34-sharing-is-caring'
import './modules/36-musical-mayhem'
import './modules/37-wheres-midnight'
import './modules/38-pet-race'
import { Scoreboard } from './app/Scoreboard'
import { Boundary } from './app/Boundary'
import { Toasts } from './app/Toasts'

export default function App() {
  // Whatever the party is doing - background music has no other way to know
  // a game has started, and stopping it is the whole point of asking.
  const party = useParty()
  // A minigame being played stops it too - see `musicStopped`.
  const minigame = useMinigameScreen()
  const quiet = musicStopped(party.phase, minigame)

  // Takes a guest wherever the host has gone. Live for everybody; the host's
  // own calls come back to them and are ignored.
  useMinigameSync()

  return (
    <>
      <Boundary what="the world">
        <GameCanvas>
          <World />
        </GameCanvas>
      </Boundary>

      <Boundary what="the interface">
        {/* Two fixed columns, so panels stack instead of each pinning itself to
            the same corner and overlapping. */}
        <div style={{ ...column, top: 10, left: 10, alignItems: 'flex-start' }}>
          <LobbyPopup />
          <PerfHUD />
          <WalletHUD />
          <PartyPanel />
        </div>

        <div style={{ ...column, top: 10, right: 10, alignItems: 'flex-end' }}>
          <MusicPlayer stopped={quiet} />
          <DebugPanel />
        </div>

        <Scoreboard />

        {/* Garden Goofs is the only 2D thing here, and it is drawn over the
            world rather than in it. It shows nothing at all until a round of
            it is actually running. */}
        <GardenScreen />

        {/* Volcano Island's minigames: the catalogue, and whichever one is
            open. Nothing until somebody opens it from the party panel. */}
        <MinigameScreen />

        {/* Notes about things that happened to you rather than things you
            did: somebody leaving, the host calling the party off. */}
        <Toasts />
      </Boundary>
    </>
  )
}

const column: React.CSSProperties = {
  position: 'fixed',
  zIndex: 10,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}
