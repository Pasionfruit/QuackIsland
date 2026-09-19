/**
 * This Place Needs A Walmart, on the screen.
 *
 * The store is drawn in its own canvas by `StoreScene`; this is the shell: the
 * keys and the clicks turned into hands for `useStoreNet`, and the words - the
 * clock, **your grocery list** with what you have ticked off, **your trolley**,
 * who has how much of theirs and who is through, and what to do next.
 *
 * **WASD to move** (W is into the store, away from the door), **left click to
 * pick up** the nearest thing in reach - **or to put something back** - and
 * **Space to ram your trolley** forward.
 */
import { Canvas } from '@react-three/fiber'
import { memo, useEffect, useRef, useState, type RefObject } from 'react'
import { ACESFilmicToneMapping, PCFShadowMap } from 'three'
import { getNet, useNet, usePeers } from '../../09-net'
import { CUES, TopTimer, playCue, useFinish, type MinigameRun } from '../../15-minigames'
import { StoreScene } from './StoreScene'
import { COLOURS, CART, RAM, ROUND, firstDone, gotten, isShopping, placings, ramLeft, reachable, stillNeeds, stunned, toPutBack, type Game } from './rules'
import { ITEMS, LIST_SIZE } from './store'
import { myId, newGame, waitingGame } from './setup'
import { useStoreNet } from './useStoreNet'

const LOOK = {
  ink: '#1f2a36',
  faded: '#7f8b97',
  paper: '#f5f7fa',
  blue: '#1f5fbf',
  yellow: '#ffc220',
  green: '#2f9e5b',
  red: '#d9443a',
} as const

const FONT = "ui-rounded, 'Hiragino Maru Gothic ProN', 'Segoe UI', system-ui, -apple-system, sans-serif"

/** The keys that walk, by `KeyboardEvent.code`: east and south. W is north, into the store. */
const KEYS: Record<string, [number, number]> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
}

const minutes = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`

export function StoreScreen({ run }: { run: MinigameRun }) {
  // First hook on purpose: the run-localrot skill reads the game from here.
  const [game, setGame] = useState<Game>(() => (getNet().host ? newGame() : waitingGame()))
  const net = useNet()
  const peers = usePeers()
  const me = net.id ?? myId()
  const nameOf = (id: string) => (id === me ? 'you' : (peers.find((p) => p.id === id)?.name ?? id))
  // The podium does the results; see `useFinish`.
  useFinish(game.over, () =>
    placings(game).map((e) => ({ id: e.player.id, place: e.place, name: nameOf(e.player.id), colour: COLOURS[e.index % COLOURS.length], mine: e.player.id === me })),
  )
  const paused = useRef(run.paused)
  paused.current = run.paused

  const wire = useStoreNet()
  const live = useRef(game)
  live.current = game
  const held = useRef(new Set<string>())
  const clicks = useRef(0)
  const rams = useRef(0)

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const current = live.current
      let mx = 0
      let mz = 0
      for (const code of held.current) {
        const k = KEYS[code]
        if (k) {
          mx += k[0]
          mz += k[1]
        }
      }
      const length = Math.hypot(mx, mz)
      const hands = { mx: length > 0 ? mx / length : 0, mz: length > 0 ? mz / length : 0, clicks: clicks.current, rams: rams.current }
      clicks.current = 0
      rams.current = 0
      const did = wire.advance(current, dt, hands, paused.current)
      if (did.took) playCue(CUES.balloonPop, 0.4)
      if (did.put) playCue(CUES.stepDown, 0.45)
      if (did.rammed) playCue(CUES.launch, 0.35)
      if (did.changed) setGame({ ...current })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent, down: boolean) => {
      if (e.code === 'Space') {
        e.preventDefault()
        if (down && !e.repeat && !paused.current && !live.current.over) rams.current += 1
        return
      }
      if (!(e.code in KEYS)) return
      if (e.code.startsWith('Arrow')) e.preventDefault()
      if (down && !paused.current) held.current.add(e.code)
      else held.current.delete(e.code)
    }
    const onDown = (e: KeyboardEvent) => onKey(e, true)
    const onUp = (e: KeyboardEvent) => onKey(e, false)
    const onBlur = () => held.current.clear()
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  useEffect(() => {
    if (run.paused || game.over) held.current.clear()
  }, [run.paused, game.over])

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || paused.current || live.current.over) return
    clicks.current += 1
  }

  const ready = game.players.length > 0
  const mineIndex = game.players.findIndex((p) => p.mine)
  const mine = game.players[mineIndex]
  useStoreSounds(game)
  const t = game.elapsed
  const first = firstDone(game)
  const left = first !== null ? Math.min(ROUND.limit, first + ROUND.after) - t : ROUND.limit - t
  const needs = mine ? stillNeeds(game, mine) : []
  const through = game.players.filter((p) => p.doneAt !== null).sort((a, b) => a.doneAt! - b.doneAt!)
  const ramCooling = mine ? ramLeft(game, mine) / RAM.cooldown : 0
  const shopping = !!mine && isShopping(mine) && !game.over

  let banner: { text: string; sub?: string; tone: 'hint' | 'good' | 'warn' | 'bad' } | null = null
  if (ready && !game.over && mine) {
    const near = shopping ? reachable(game, mineIndex) : -1
    if (mine.doneAt !== null) banner = { text: `Through the checkout - ${ordinal(through.indexOf(mine) + 1)}!`, sub: 'watching the rest', tone: 'good' }
    else if (mine.left) banner = null
    else if (stunned(game, mine)) banner = { text: 'Rammed!', sub: 'something may have fallen out', tone: 'bad' }
    else if (needs.length === 0) banner = { text: 'Got everything - to a checkout!', sub: 'down a green lane by the door', tone: 'good' }
    else if (mine.cart.length >= CART.size) {
      const spare = ITEMS[game.items[mine.cart[toPutBack(game, mine)]].kind]
      banner = { text: 'Trolley full', sub: `click to put back the ${spare.name}`, tone: 'warn' }
    } else if (near >= 0) {
      const item = ITEMS[game.items[near].kind]
      banner = needs.includes(game.items[near].kind) ? { text: `Click to grab the ${item.name} ${item.icon}`, tone: 'good' } : { text: `${item.icon} ${item.name} - not on your list`, sub: 'grab it anyway to keep it from somebody else', tone: 'hint' }
    } else if (t < 5) banner = { text: 'Find the three things on your list!', sub: 'follow the beams · click to grab · space to ram', tone: 'hint' }
  }

  return (
    <div style={page}>
      <div style={hud}>
        <span style={{ fontWeight: 800, fontSize: 16, color: LOOK.blue }}>This Place Needs A Walmart</span>
        {ready ? (
          <>
            <TopTimer left={game.over ? null : left}>
              <span style={{ ...pill, background: first !== null ? LOOK.red : LOOK.yellow, color: first !== null ? '#fff' : LOOK.ink }} data-time-left={Math.max(0, Math.ceil(left))}>
                {minutes(Math.max(0, Math.ceil(left)))}
              </span>
            </TopTimer>
            <span style={{ ...pill, background: LOOK.ink, color: '#fff' }} data-through={through.length}>
              {through.length} through
            </span>
          </>
        ) : (
          <span style={{ color: LOOK.faded }}>waiting for the host…</span>
        )}
        <span style={{ flex: 1 }} />
        {game.players.map((p, index) => {
          const colour = COLOURS[index % COLOURS.length]
          const place = through.indexOf(p)
          return (
            <span
              key={p.id}
              style={{ ...pill, background: p.left ? 'rgba(255,255,255,0.85)' : colour, color: p.left ? LOOK.faded : '#fff', opacity: p.left ? 0.45 : 1, outline: p.mine ? `2px solid ${LOOK.ink}` : 'none', outlineOffset: 1 }}
              data-got={gotten(game, p)}
              data-done={p.doneAt ?? ''}
            >
              {nameOf(p.id)} · {place >= 0 ? `✓ ${ordinal(place + 1)}` : `${gotten(game, p)}/${LIST_SIZE}`}
            </span>
          )
        })}
      </div>

      <div style={boardStyle} onPointerDown={onPointerDown} onContextMenu={(e) => e.preventDefault()} data-board>
        <Stage live={live} />

        {ready && mine ? (
          <div style={listCard} data-list={mine.list.join(',')}>
            <div style={listTitle}>Grocery list</div>
            {mine.list.map((kind, k) => {
              // A list never has the same thing twice, so a line is ticked off when it is no longer needed.
              const done = !needs.includes(kind)
              return (
                <div key={k} style={{ ...listLine, textDecoration: done ? 'line-through' : 'none', color: done ? LOOK.faded : LOOK.ink }} data-got={done ? 1 : 0}>
                  <span style={{ fontSize: 20 }}>{ITEMS[kind].icon}</span> {ITEMS[kind].name} {done ? '✓' : ''}
                </div>
              )
            })}
            <div style={{ ...listTitle, marginTop: 8 }}>Trolley</div>
            <div style={{ display: 'flex', gap: 6 }} data-cart={mine.cart.length}>
              {Array.from({ length: CART.size }, (_, k) => {
                const item = mine.cart[k]
                const kind = item === undefined ? null : game.items[item].kind
                const spare = kind !== null && !mine.list.includes(kind)
                return (
                  <span key={k} style={{ ...slot, borderColor: spare ? LOOK.red : '#c5ced8' }} title={kind === null ? 'empty' : ITEMS[kind].name}>
                    {kind === null ? '' : ITEMS[kind].icon}
                  </span>
                )
              })}
            </div>
          </div>
        ) : null}

        {shopping ? (
          <div style={meter} data-ram={ramCooling.toFixed(2)}>
            <div style={{ ...meterFill, width: `${(1 - ramCooling) * 100}%` }} />
            <span style={meterText}>{ramCooling > 0 ? 'ram…' : 'space: ram'}</span>
          </div>
        ) : null}

        {banner ? (
          <div style={bannerWrap}>
            <div style={{ ...bannerBox, ...TONES[banner.tone] }} data-banner={banner.tone}>
              {banner.text}
            </div>
            {banner.sub ? <div style={bannerSub}>{banner.sub}</div> : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** The canvas, rendered once - see `StoreScene`. */
const Stage = memo(function Stage({ live }: { live: RefObject<Game> }) {
  return (
    <Canvas
      shadows={SHADOWS}
      dpr={DPR}
      camera={CAMERA}
      gl={GL}
      onCreated={({ gl }) => {
        gl.toneMapping = ACESFilmicToneMapping
        gl.toneMappingExposure = 1
      }}
    >
      <StoreScene live={live} />
    </Canvas>
  )
})

const SHADOWS = { type: PCFShadowMap }
const DPR: [number, number] = [1, 2]
const CAMERA = { fov: 55, near: 0.1, far: 200, position: [0, 15, 22] as [number, number, number] }
const GL = { antialias: true, powerPreference: 'high-performance' as const }

/** A bonk for being rammed, a thud for anybody else rammed, and a whoosh for everybody through the checkout. */
function useStoreSounds(game: Game): void {
  const seen = useRef<{ id: number; stuns: Map<string, number>; done: Set<string> }>({ id: -1, stuns: new Map(), done: new Set() })
  useEffect(() => {
    if (seen.current.id !== game.id) {
      seen.current = { id: game.id, stuns: new Map(game.players.map((p) => [p.id, p.stunUntil])), done: new Set(game.players.filter((p) => p.doneAt !== null).map((p) => p.id)) }
    }
    const s = seen.current
    if (game.players.length === 0) return
    for (const p of game.players) {
      const was = s.stuns.get(p.id) ?? -Infinity
      if (p.stunUntil > was + 1e-6) {
        s.stuns.set(p.id, p.stunUntil)
        if (Number.isFinite(p.stunUntil)) playCue(p.mine ? CUES.bonk : CUES.bump, p.mine ? 0.8 : 0.4)
      }
      if (p.doneAt !== null && !s.done.has(p.id)) {
        s.done.add(p.id)
        playCue(CUES.balloonInflate, p.mine ? 0.8 : 0.35)
      }
    }
  }, [game])
}

const page: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 42,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  background: '#cfd8e3',
  color: LOOK.ink,
  font: `14px/1.5 ${FONT}`,
  userSelect: 'none',
}

const hud: React.CSSProperties = {
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 16px',
  background: LOOK.paper,
  borderBottom: '2px solid #d8dee6',
  flexWrap: 'wrap',
}

const pill: React.CSSProperties = {
  padding: '3px 12px',
  borderRadius: 999,
  font: `600 12px/1.5 ${FONT}`,
  whiteSpace: 'nowrap',
}

const boardStyle: React.CSSProperties = { flex: 1, minHeight: 0, width: '100%', position: 'relative', overflow: 'hidden', touchAction: 'none', cursor: 'pointer' }

const listCard: React.CSSProperties = {
  position: 'absolute',
  left: 16,
  bottom: 16,
  minWidth: 170,
  padding: '10px 14px',
  borderRadius: 14,
  background: 'rgba(255,255,255,0.94)',
  boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
  pointerEvents: 'none',
}

const listTitle: React.CSSProperties = { font: `800 11px/1.4 ${FONT}`, letterSpacing: 1, textTransform: 'uppercase', color: LOOK.blue }

const listLine: React.CSSProperties = { font: `700 15px/1.6 ${FONT}`, display: 'flex', alignItems: 'center', gap: 6 }

const slot: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 8,
  border: '2px solid',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 20,
  background: '#f3f6f9',
}

const meter: React.CSSProperties = {
  position: 'absolute',
  left: '50%',
  bottom: 20,
  transform: 'translateX(-50%)',
  width: 170,
  height: 20,
  borderRadius: 999,
  background: 'rgba(31,42,54,0.6)',
  overflow: 'hidden',
  pointerEvents: 'none',
}

const meterFill: React.CSSProperties = { position: 'absolute', left: 0, top: 0, bottom: 0, background: 'rgba(255,194,32,0.75)' }

const meterText: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  textAlign: 'center',
  color: '#fff',
  font: `800 11px/20px ${FONT}`,
  letterSpacing: 1,
  textTransform: 'uppercase',
}

const bannerWrap: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: 18,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
  pointerEvents: 'none',
  padding: '0 16px',
}

const bannerBox: React.CSSProperties = {
  maxWidth: '100%',
  padding: '6px 18px',
  borderRadius: 14,
  font: `800 20px/1.25 ${FONT}`,
  textAlign: 'center',
}

const TONES: Record<'hint' | 'good' | 'warn' | 'bad', React.CSSProperties> = {
  hint: { background: 'rgba(245,247,250,0.95)', color: LOOK.ink, font: `700 16px/1.3 ${FONT}` },
  good: { background: LOOK.green, color: '#fff' },
  warn: { background: LOOK.yellow, color: LOOK.ink },
  bad: { background: LOOK.red, color: '#fff', transform: 'rotate(-2deg)' },
}

const bannerSub: React.CSSProperties = { color: '#fff', font: `700 14px/1.3 ${FONT}`, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }
