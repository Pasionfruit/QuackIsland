import { GameCanvas, PerfHUD } from './modules/00-core'
import { MusicPlayer } from './modules/05-music'
import { WalletHUD } from './modules/11-currency'
import { World } from './app/World'
import { DebugPanel } from './app/DebugPanel'
import { PartyPanel } from './app/PartyPanel'
import { LobbyPopup } from './app/LobbyPopup'
import { Scoreboard } from './app/Scoreboard'

export default function App() {
  return (
    <>
      <GameCanvas>
        <World />
      </GameCanvas>

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
