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
    let onScreen = true

    const paint = () => {
      ctx.clearRect(0, 0, width, height)
      drawRef.current(ctx, frame)
    }
    const tick = () => {
      paint()
      frame++
      if (animate) raf = requestAnimationFrame(tick)
    }
    // A page of these is a page of faceted animals being remeshed every frame,
    // so anything scrolled out of view - or a backgrounded tab - stops.
    const running = () => onScreen && !document.hidden
    const sync = () => {
      if (!animate) return
      if (running()) {
        if (!raf) raf = requestAnimationFrame(tick)
      } else if (raf) {
        cancelAnimationFrame(raf)
        raf = 0
      }
    }

    // Refit whenever the element changes size, or the canvas gets resampled.
    const resize = new ResizeObserver(() => {
      ctx = fitScene(canvas, width, height)
      if (!animate) paint()
    })
    resize.observe(canvas)

    const visible = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting
        sync()
      },
      { rootMargin: '120px' },
    )
    visible.observe(canvas)
    document.addEventListener('visibilitychange', sync)

    // Paint once up front so the canvas is never blank while the
    // IntersectionObserver gets around to reporting where it is.
    paint()
    sync()

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', sync)
      visible.disconnect()
      resize.disconnect()
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
