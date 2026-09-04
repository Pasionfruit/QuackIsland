import { useEffect, useRef } from 'react'
import { fitScene } from '../lib/draw'

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
}: SceneCanvasProps) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const drawRef = useRef(draw)
  drawRef.current = draw

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return

    let ctx = fitScene(canvas, width, height)
    let frame = 0
    let raf = 0

    const paint = () => {
      ctx.clearRect(0, 0, width, height)
      drawRef.current(ctx, frame)
    }
    const tick = () => {
      paint()
      frame++
      if (animate) raf = requestAnimationFrame(tick)
    }

    // Refit whenever the element changes size, or the canvas gets resampled.
    const observer = new ResizeObserver(() => {
      ctx = fitScene(canvas, width, height)
      if (!animate) paint()
    })
    observer.observe(canvas)

    tick()
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [width, height, animate])

  return (
    <canvas
      ref={ref}
      className={className}
      style={
        fluid
          ? { width: '100%', height: 'auto', aspectRatio: width + ' / ' + height, display: 'block' }
          : { width: width * scale, height: height * scale, display: 'block' }
      }
    />
  )
}
