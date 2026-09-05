import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Fullscreen for one element, shared by every game panel.
 *
 * The browser's Fullscreen API works on any element, so this hands back a ref
 * for the game's `.stage-wrap` rather than the whole page - the canvas fills
 * the screen, the surrounding lobby chrome does not come along for the ride.
 */
export function useFullscreen<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [active, setActive] = useState(false)

  useEffect(() => {
    const onChange = () => setActive(document.fullscreenElement === ref.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggle = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void ref.current?.requestFullscreen()
    }
  }, [])

  return { ref, active, toggle }
}
