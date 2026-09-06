/**
 * Esc to pause, Esc to resume - shared by every real-time game.
 *
 * A pause here is a room-wide timeout rather than a personal one: whoever
 * presses Esc stops the match for everybody. That falls out of the hosting
 * model almost for free - only the host actually simulates, so a host that
 * stops stepping has already frozen the world for every guest - and the only
 * extra piece is telling the room who called it, which rides the same relay
 * every game already uses. Guests freeze their own animation too, so a paused
 * screen looks the same on every machine.
 *
 * Turn-based games are deliberately left out: Case Closed has no clock to
 * stop, so an Esc menu there would be a pause in name only.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

/** The one payload shape every game understands, alongside its own. */
export interface PauseMessage {
  k: 'pause'
  on: boolean
  /** Whoever called it, so the others can be told who to blame. */
  who: string
}

export function isPauseMessage(payload: unknown): payload is PauseMessage {
  return !!payload && typeof payload === 'object' && (payload as { k?: unknown }).k === 'pause'
}

/** Esc while typing a name or a guess belongs to the text box, not the match. */
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || typeof el.tagName !== 'string') return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
}

export interface Pause {
  paused: boolean
  /** Set when somebody else called the timeout; null when it was this player. */
  calledBy: string | null
  /**
   * The live value, for a render loop that is set up once and must not be
   * torn down and rebuilt every time the pause flips.
   */
  ref: React.MutableRefObject<boolean>
  toggle: () => void
  resume: () => void
  /** Applies a `pause` payload that arrived from another player. */
  applyRemote: (msg: PauseMessage) => void
  /** Drops the pause without telling the room - for leaving or restarting. */
  clear: () => void
}

export function usePause(
  opts: {
    /** Only listen while the match is actually on screen. */
    active?: boolean
    /** Ignore the key entirely - e.g. the match is already over. */
    disabled?: boolean
    /**
     * Which key codes toggle. Defaults to Esc; a game with a rebindable
     * pause action passes its own, e.g. `[codeFor('smash.__pause', 'Escape')]`.
     */
    keys?: string[]
    /** Called when this player toggles, so the panel can tell the room. */
    onToggle?: (on: boolean) => void
  } = {},
): Pause {
  const { active = true, disabled = false, keys, onToggle } = opts
  const keyList = keys && keys.length ? keys : ['Escape']
  const keyId = keyList.join(',')
  const [paused, setPaused] = useState(false)
  const [calledBy, setCalledBy] = useState<string | null>(null)

  const ref = useRef(false)
  ref.current = paused
  const disabledRef = useRef(disabled)
  disabledRef.current = disabled
  const onToggleRef = useRef(onToggle)
  onToggleRef.current = onToggle

  const toggle = useCallback(() => {
    if (disabledRef.current) return
    const next = !ref.current
    ref.current = next
    setPaused(next)
    setCalledBy(null)
    onToggleRef.current?.(next)
  }, [])

  const resume = useCallback(() => {
    if (!ref.current) return
    ref.current = false
    setPaused(false)
    setCalledBy(null)
    onToggleRef.current?.(false)
  }, [])

  const applyRemote = useCallback((msg: PauseMessage) => {
    ref.current = msg.on
    setPaused(msg.on)
    setCalledBy(msg.on ? msg.who || 'Somebody' : null)
  }, [])

  const clear = useCallback(() => {
    ref.current = false
    setPaused(false)
    setCalledBy(null)
  }, [])

  useEffect(() => {
    if (!active) return
    const codes = keyId.split(',')
    const onKey = (e: KeyboardEvent) => {
      if (!codes.includes(e.code)) return
      if (isTyping(e.target)) return
      e.preventDefault()
      toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, keyId, toggle])

  // Leaving the match (or the whole panel) should never strand a pause behind.
  useEffect(() => {
    if (!active && ref.current) clear()
  }, [active, clear])

  return { paused, calledBy, ref, toggle, resume, applyRemote, clear }
}
