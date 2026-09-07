import { GameCanvas, PerfHUD } from './modules/00-core'
import { World } from './app/World'
import { DebugPanel } from './app/DebugPanel'

export default function App() {
  return (
    <>
      <GameCanvas>
        <World />
      </GameCanvas>
      <PerfHUD />
      <DebugPanel />
    </>
  )
}
