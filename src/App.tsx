import { GameCanvas, PerfHUD } from './modules/00-core'
import { World } from './app/World'

export default function App() {
  return (
    <>
      <GameCanvas>
        <World />
      </GameCanvas>
      <PerfHUD />
    </>
  )
}
