import { GameCanvas, PerfHUD } from './modules/00-core'
import { MusicPlayer } from './modules/05-music'
import { World } from './app/World'
import { DebugPanel } from './app/DebugPanel'

export default function App() {
  return (
    <>
      <GameCanvas>
        <World />
      </GameCanvas>
      <PerfHUD />
      {/* One fixed column down the top right, so the two panels stack instead
          of each pinning itself to the same corner and overlapping. */}
      <div
        style={{
          position: 'fixed',
          top: 10,
          right: 10,
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 8,
        }}
      >
        <MusicPlayer />
        <DebugPanel />
      </div>
    </>
  )
}
