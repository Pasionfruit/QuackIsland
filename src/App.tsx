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
import { GardenScreen } from './modules/14-garden'
import { Scoreboard } from './app/Scoreboard'
import { Boundary } from './app/Boundary'
import { Toasts } from './app/Toasts'

export default function App() {
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
          <MusicPlayer />
          <DebugPanel />
        </div>

        <Scoreboard />

        {/* Garden Goofs is the only 2D thing here, and it is drawn over the
            world rather than in it. It shows nothing at all until a round of
            it is actually running. */}
        <GardenScreen />

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
