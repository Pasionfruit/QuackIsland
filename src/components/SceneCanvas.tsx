import { useEffect, useRef } from 'react'
import { SUPERSAMPLE, setupScene } from '../lib/draw'

export interface SceneCanvasProps {
  /** Size in world units; the backing store is this times the supersample. */
  width: number
  height: number
  /** CSS size multiplier when not fluid. */
  scale?: number
  /** Called every animation frame (or once, when `animate` is false). */
  draw: (ctx: CanvasRenderingContext2D, frame: number) => void
  animate?: boolean
  className?: string
  /** Stretch to the container width instead of using `scale`. */
  fluid?: boolean
  ss?: number
}

/**
 * A canvas that draws in world units at a higher device resolution, so the
 * flat-shaded polygons stay clean at any display size.
 */
export function SceneCanvas({
  width,
  height,
  scale = 1,
  draw,
  animate = true,
  className,
  fluid = false,
  ss = SUPERSAMPLE,
}: SceneCanvasProps) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const drawRef = useRef(draw)
  drawRef.current = draw

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = setupScene(canvas, width, height, ss)

    let frame = 0
    let raf = 0
    const tick = () => {
      ctx.clearRect(0, 0, width, height)
      drawRef.current(ctx, frame)
      frame++
      if (animate) raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [width, height, animate, ss])

  return (
    <canvas
      ref={ref}
      className={className}
      style={
        fluid
          ? { width: '100%', height: 'auto', display: 'block' }
          : { width: width * scale, height: height * scale, display: 'block' }
      }
    />
  )
}
