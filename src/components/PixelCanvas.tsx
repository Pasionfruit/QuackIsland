import { useEffect, useRef } from 'react'

export interface PixelCanvasProps {
  /** Backing-store size in real pixels; CSS size is this times `scale`. */
  width: number
  height: number
  scale?: number
  /** Called every animation frame (or once, when `animate` is false). */
  draw: (ctx: CanvasRenderingContext2D, frame: number) => void
  animate?: boolean
  className?: string
  /** Stretch to the container width instead of using `scale`. */
  fluid?: boolean
}

export function PixelCanvas({
  width,
  height,
  scale = 1,
  draw,
  animate = true,
  className,
  fluid = false,
}: PixelCanvasProps) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const drawRef = useRef(draw)
  drawRef.current = draw

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false

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
  }, [width, height, animate])

  return (
    <canvas
      ref={ref}
      width={width}
      height={height}
      className={className}
      style={
        fluid
          ? { width: '100%', height: 'auto', imageRendering: 'pixelated' }
          : { width: width * scale, height: height * scale, imageRendering: 'pixelated' }
      }
    />
  )
}
