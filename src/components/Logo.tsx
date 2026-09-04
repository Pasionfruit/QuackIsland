import { PAL } from '../art/palette'
import { campfire, pine } from '../art/props'
import { px } from '../lib/pixel'
import { PixelCanvas } from './PixelCanvas'

/** The Polyland mark: a small fire between two pines. */
export function LogoMark({ scale = 1 }: { scale?: number }) {
  return (
    <PixelCanvas
      width={30}
      height={30}
      scale={scale}
      draw={(ctx, frame) => {
        px(ctx, 0, 0, 30, 30, '#cfdfd8')
        px(ctx, 0, 20, 30, 10, PAL.grass)
        px(ctx, 0, 20, 30, 2, PAL.grassLit)
        pine(ctx, 5, 22, 17)
        pine(ctx, 25, 22, 14)
        campfire(ctx, 15, 24, frame, 0.62)
        px(ctx, 0, 0, 30, 1, PAL.dirtShade)
        px(ctx, 0, 29, 30, 1, PAL.dirtShade)
        px(ctx, 0, 0, 1, 30, PAL.dirtShade)
        px(ctx, 29, 0, 1, 30, PAL.dirtShade)
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
          POLY<em>LAND</em>
        </span>
        <span className="logo-sub" style={{ display: 'block' }}>
          a little camp of games
        </span>
      </span>
    </button>
  )
}
