import { PAL } from '../art/palette'
import { campfire, pine } from '../art/props'
import { rect } from '../lib/draw'
import { SceneCanvas } from './SceneCanvas'

/** The Animal Instinct mark: a small fire between two pines. */
export function LogoMark({ scale = 1 }: { scale?: number }) {
  return (
    <SceneCanvas
      width={30}
      height={30}
      scale={scale}
      draw={(ctx, frame) => {
        rect(ctx, 0, 0, 30, 30, '#cfdfd8')
        rect(ctx, 0, 20, 30, 10, PAL.grass)
        rect(ctx, 0, 20, 30, 2, PAL.grassLit)
        pine(ctx, 5, 22, 17)
        pine(ctx, 25, 22, 14)
        campfire(ctx, 15, 24, frame, 0.62)
        rect(ctx, 0, 0, 30, 1, PAL.dirtShade)
        rect(ctx, 0, 29, 30, 1, PAL.dirtShade)
        rect(ctx, 0, 0, 1, 30, PAL.dirtShade)
        rect(ctx, 29, 0, 1, 30, PAL.dirtShade)
      }}
    />
  )
}

export function Logo({ onClick }: { onClick?: () => void }) {
  return (
    <button className="logo" onClick={onClick} type="button">
      <LogoMark scale={1.4} />
      <span>
        <span className="logo-word">
          ANIMAL <em>INSTINCT</em>
        </span>
        <span className="logo-sub" style={{ display: 'block' }}>
          a little camp of games
        </span>
      </span>
    </button>
  )
}
