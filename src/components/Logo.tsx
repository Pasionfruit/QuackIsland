import { px, regularPoly, shapePoly, transformPts } from '../lib/pixel'
import { PixelCanvas } from './PixelCanvas'

/** The Polyland mark: three nested polygons orbiting a core. */
export function LogoMark({ scale = 1 }: { scale?: number }) {
  return (
    <PixelCanvas
      width={28}
      height={28}
      scale={scale}
      draw={(ctx, frame) => {
        px(ctx, 0, 0, 28, 28, '#0d0b26')
        px(ctx, 0, 0, 28, 1, '#37317a')
        px(ctx, 0, 27, 28, 1, '#37317a')
        px(ctx, 0, 0, 1, 28, '#37317a')
        px(ctx, 27, 0, 1, 28, '#37317a')
        const specs = [
          { sides: 6, r: 11, color: '#ff8a3d', speed: 0.006 },
          { sides: 4, r: 8, color: '#ffe066', speed: -0.011 },
          { sides: 3, r: 5.5, color: '#4fd6ff', speed: 0.018 },
        ]
        for (const s of specs) {
          const pts = transformPts(regularPoly(s.sides, frame * s.speed), {
            x: 14,
            y: 14,
            sx: s.r,
            sy: s.r,
          })
          shapePoly(ctx, pts, s.color, '#0a0820', 1)
        }
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
          polygon arcade
        </span>
      </span>
    </button>
  )
}
