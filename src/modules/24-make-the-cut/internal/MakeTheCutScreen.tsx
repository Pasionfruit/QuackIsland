/**
 * Make The Cut, on the screen.
 *
 * The tower is drawn in its own canvas by `MakeTheCutScene`; this is the shell:
 * the keys in, a cut clicked in the canvas passed on, `useTowerNet` deciding what
 * they do, and the words - who is choosing first, whose turn it is and how long
 * they have, how many strings and eliminating strings are left, what the last
 * cut was, and the results.
 *
 * **WASD to walk the tower top, the mouse to aim at a string, left click to cut
 * it.** Only on your turn, and only a string you can reach - the ring on the
 * boards round you - which lights gold under the pointer.
 */
import { Canvas } from '@react-three/fiber'
import { memo, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { ACESFilmicToneMapping, PCFShadowMap } from 'three'
import { getNet, useNet, usePeers } from '../../09-net'
import { replayMinigame, useFinish, type MinigameRun } from '../../15-minigames'
import { FOV } from './camera'
import { MakeTheCutScene, type SceneHands } from './MakeTheCutScene'
import { COLOURS, TOWER, deadlyLeft, inReach, placings, whoseTurn, type Cutter, type Game, type Intent, type Last } from './rules'
import { myId, newGame, waitingGame } from './setup'
import { useTowerNet } from './useTowerNet'

const LOOK = {
  ink: '#3d3a36',
  faded: '#857d72',
  paper: '#f4ecdc',
  sun: '#ffc94d',
  red: '#d9443a',
  green: '#2f9e5b',
} as const

const FONT =
  "ui-rounded, 'Hiragino Maru Gothic ProN', 'Segoe UI', system-ui, -apple-system, sans-serif"

export function MakeTheCutScreen({ run }: { run: MinigameRun }) {
  // First hook on purpose: the run-localrot skill reads the game from here.
  const [game, setGame] = useState<Game>(() => (getNet().host ? newGame() : waitingGame()))
  // Held back through the two seconds of Finish; see `useFinish`.
  const results = useFinish(game.phase === 'over', () =>
    placings(game).map((e) => ({ id: e.cutter.id, place: e.place, name: nameOf(e.cutter.id), colour: COLOURS[e.index % COLOURS.length], mine: e.cutter.id === me })),
  )
  const paused = useRef(run.paused)
  paused.current = run.paused

  const net = useNet()
  const peers = usePeers()
  const me = net.id ?? myId()
  const wire = useTowerNet()
  const live = useRef(game)
  live.current = game

  const keys = useRef({ up: false, down: false, left: false, right: false })
  /** A string clicked, waiting for the next frame. */
  const cutting = useRef<number | null>(null)
  const aimed = useRef<number | null>(null)

  const nameOf = (id: string) => (id === me ? 'you' : (peers.find((p) => p.id === id)?.name ?? id))

  const hands = useMemo<SceneHands>(
    () => ({
      canCut: () => {
        const g = live.current
        const mine = g.players.findIndex((p) => p.mine)
        return !paused.current && mine >= 0 && whoseTurn(g) === mine
      },
      aimed,
      onCut: (string) => {
        const g = live.current
        const mine = g.players.findIndex((p) => p.mine)
        if (mine >= 0 && inReach(g, mine, string)) cutting.current = string
      },
    }),
    [],
  )

  useEffect(() => {
    const set = (e: KeyboardEvent, down: boolean) => {
      const k = keys.current
      switch (e.code) {
        case 'KeyW':
          k.up = down
          break
        case 'KeyS':
          k.down = down
          break
        case 'KeyA':
          k.left = down
          break
        case 'KeyD':
          k.right = down
          break
        default:
          return
      }
      e.preventDefault()
    }
    const down = (e: KeyboardEvent) => set(e, true)
    const up = (e: KeyboardEvent) => set(e, false)
    const forget = () => {
      keys.current = { up: false, down: false, left: false, right: false }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', forget)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', forget)
    }
  }, [])

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const k = keys.current
      // Up on the keyboard is away from the camera: the far side of the tower.
      const walking: Intent = { x: (k.right ? 1 : 0) - (k.left ? 1 : 0), y: (k.down ? 1 : 0) - (k.up ? 1 : 0) }
      const string = cutting.current
      cutting.current = null
      const current = live.current
      if (wire.advance(current, dt, walking, string, paused.current)) setGame({ ...current })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const ready = game.players.length > 0
  const mineIndex = game.players.findIndex((p) => p.mine)
  const mine = game.players[mineIndex]
  const turn = whoseTurn(game)
  const myTurn = turn !== null && turn === mineIndex
  const whole = game.cut.filter((c) => c === null).length
  const aimedString = aimed.current
  const tooFar = myTurn && aimedString !== null && !inReach(game, mineIndex, aimedString)

  return (
    <div style={page}>
      <div style={hud}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Make The Cut</span>
        {ready ? <Status game={game} nameOf={nameOf} /> : <span style={{ color: LOOK.faded }}>waiting for the host…</span>}
        {ready ? (
          <span style={{ ...pill, background: 'rgba(61,58,54,0.12)', color: LOOK.ink }} data-strings={whole} data-deadly={deadlyLeft(game)}>
            {whole} strings · {deadlyLeft(game)} eliminating
          </span>
        ) : null}
        <span style={{ flex: 1 }} />
        {game.players.map((cutter, index) => (
          <span
            key={cutter.id}
            style={{
              ...pill,
              background: cutter.out ? 'rgba(61,58,54,0.12)' : COLOURS[index % COLOURS.length],
              color: cutter.out ? LOOK.faded : '#fff',
              textDecoration: cutter.out ? 'line-through' : 'none',
              outline: turn === index ? `3px solid ${LOOK.ink}` : 'none',
            }}
          >
            {nameOf(cutter.id)}
          </span>
        ))}
      </div>

      <div style={{ ...board, cursor: myTurn ? 'crosshair' : 'default' }} onContextMenu={(e) => e.preventDefault()} data-board>
        <Stage live={live} hands={hands} />
        {game.phase === 'draw' && ready ? <Draw game={game} nameOf={nameOf} /> : null}
        {game.phase === 'result' && game.last ? <Result last={game.last} game={game} nameOf={nameOf} /> : null}
        {myTurn && game.phase === 'turn' ? (
          <Banner
            colour={tooFar ? LOOK.faded : COLOURS[mineIndex % COLOURS.length]}
            text={tooFar ? 'Too far - walk closer to that string' : 'Your turn - walk to a string, aim, and click to cut it'}
            data="your-turn"
          />
        ) : null}
        {mine?.out && game.phase !== 'over' && game.phase !== 'result' ? <Banner colour={LOOK.faded} text="You are off the tower - watching" /> : null}
      </div>

      {results && ready ? <Over game={game} me={me} nameOf={nameOf} onAgain={net.host ? replayMinigame : null} /> : null}
    </div>
  )
}

/** What is happening, with the time left on a turn. */
function Status({ game, nameOf }: { game: Game; nameOf: (id: string) => string }) {
  const turn = whoseTurn(game)
  let text = ''
  let left: number | null = null
  if (game.phase === 'draw') text = 'Choosing who cuts first…'
  else if (game.phase === 'turn' && turn !== null) {
    text = game.players[turn].mine ? 'Your turn' : `${nameOf(game.players[turn].id)}'s turn`
    left = Math.max(0, TOWER.turn - game.clock)
  } else if (game.phase === 'result') text = 'Snap!'
  else if (game.phase === 'over') text = 'Game over'
  return (
    <>
      <span style={{ ...pill, background: LOOK.ink, color: '#fff' }} data-phase={game.phase}>
        {text}
      </span>
      {left !== null ? (
        <span style={{ ...pill, background: left <= 3 ? LOOK.red : LOOK.ink, color: '#fff' }} data-time-left={Math.ceil(left)}>
          {Math.ceil(left)}s
        </span>
      ) : null}
    </>
  )
}

/** The draw: names flicking past, slowing, landing on whoever cuts first. */
function Draw({ game, nameOf }: { game: Game; nameOf: (id: string) => string }) {
  const settled = game.clock >= TOWER.draw - 0.9
  // Flicks slow down as the draw goes on.
  const flick = Math.floor((game.clock * 12) / (1 + game.clock))
  const shown = settled ? game.turn : (game.turn + flick) % game.players.length
  const cutter = game.players[shown]
  const name = cutter.mine ? 'You' : nameOf(cutter.id)
  return (
    <div style={drawWrap}>
      <div style={{ ...drawCard, borderColor: COLOURS[shown % COLOURS.length] }} data-first={settled ? game.players[game.turn].id : ''}>
        <div style={{ color: LOOK.faded, fontSize: 13 }}>{settled ? 'First to cut' : 'Choosing who cuts first'}</div>
        <div style={{ fontSize: 26, fontWeight: 800, color: COLOURS[shown % COLOURS.length] }}>{name}</div>
      </div>
    </div>
  )
}

/** What the last cut was. */
function Result({ last, game, nameOf }: { last: Last; game: Game; nameOf: (id: string) => string }) {
  const cutter = game.players[last.player]
  const who = cutter.mine ? 'You' : nameOf(cutter.id)
  const forThem = last.auto ? `Time's up - a string was cut for ${cutter.mine ? 'you' : who}. ` : ''
  const text = last.deadly
    ? `${forThem}${last.auto ? 'It was' : `${who} cut`} an eliminating string - launched off the tower!`
    : `${forThem}${last.auto ? 'It was a normal string.' : `${who} cut a normal string. Safe.`}`
  return <Banner colour={last.deadly ? LOOK.red : LOOK.green} text={text} data={last.deadly ? 'deadly' : 'safe'} />
}

function Banner({ text, colour, data }: { text: string; colour: string; data?: string }) {
  return (
    <div style={bannerWrap}>
      <div style={{ ...banner, background: colour }} data-banner={data ?? ''}>
        {text}
      </div>
    </div>
  )
}

/** The canvas, rendered once - see `MakeTheCutScene`. */
const Stage = memo(function Stage({ live, hands }: { live: RefObject<Game>; hands: SceneHands }) {
  return (
    <Canvas
      shadows={SHADOWS}
      dpr={DPR}
      camera={CAMERA}
      gl={GL}
      onCreated={({ gl }) => {
        gl.toneMapping = ACESFilmicToneMapping
        gl.toneMappingExposure = 1.05
      }}
    >
      <MakeTheCutScene live={live} hands={hands} />
    </Canvas>
  )
})

const SHADOWS = { type: PCFShadowMap }
const DPR: [number, number] = [1, 2]
const CAMERA = { fov: FOV, near: 0.5, far: 300, position: [0, 40, 30] as [number, number, number] }
const GL = { antialias: true, powerPreference: 'high-performance' as const }

/** The results: the last one on the tower, then everybody by how long they lasted. */
function Over({
  game,
  me,
  nameOf,
  onAgain,
}: {
  game: Game
  me: string
  nameOf: (id: string) => string
  onAgain: (() => void) | null
}) {
  const order = placings(game)
  const mine = order.find((entry) => entry.cutter.id === me)
  const winner = order.find((entry) => entry.place === 1)
  const headline = !mine ? 'Game over' : mine.place === 1 ? 'Last one on the tower!' : 'Off the tower'
  const how = (cutter: Cutter) => {
    const cuts = `${cutter.cuts} ${cutter.cuts === 1 ? 'cut' : 'cuts'}`
    if (!cutter.out) return `still standing · ${cuts}`
    if (cutter.out.string < 0) return `left · ${cuts}`
    return `launched · ${cuts}`
  }
  return (
    <div style={overBackdrop}>
      <div style={overCard}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 2 }}>{headline}</div>
        <div style={{ color: LOOK.faded, marginBottom: 12 }}>
          {winner ? `${winner.cutter.id === me ? 'You' : nameOf(winner.cutter.id)} made the cut.` : ''}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
          {order.map((entry) => (
            <div key={entry.cutter.id} style={scoreRow} data-place={entry.place}>
              <span style={{ opacity: 0.5, minWidth: 18 }}>{entry.place}</span>
              <span style={{ width: 12, height: 12, borderRadius: 999, background: COLOURS[entry.index % COLOURS.length] }} />
              <span style={{ flex: 1, fontWeight: entry.cutter.id === me ? 700 : 400 }}>{nameOf(entry.cutter.id)}</span>
              <span style={{ opacity: 0.6, fontSize: 12 }}>{how(entry.cutter)}</span>
            </div>
          ))}
        </div>
        {onAgain ? (
          <button type="button" onClick={onAgain} style={againButton} data-again>
            again
          </button>
        ) : (
          <div style={{ ...againButton, opacity: 0.55, textAlign: 'center' }}>waiting for the host</div>
        )}
      </div>
    </div>
  )
}

const page: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 42,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  background: '#bfe0f0',
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
  borderBottom: '2px solid #e2d4b8',
  flexWrap: 'wrap',
}

const pill: React.CSSProperties = {
  padding: '3px 12px',
  borderRadius: 999,
  font: `600 12px/1.5 ${FONT}`,
  whiteSpace: 'nowrap',
}

const board: React.CSSProperties = { flex: 1, minHeight: 0, width: '100%', position: 'relative', overflow: 'hidden' }

const bannerWrap: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 20,
  display: 'flex',
  justifyContent: 'center',
  pointerEvents: 'none',
  padding: '0 16px',
}

const banner: React.CSSProperties = {
  padding: '8px 18px',
  borderRadius: 999,
  color: '#fff',
  font: `700 16px/1.3 ${FONT}`,
  boxShadow: '0 4px 0 rgba(0,0,0,0.18)',
  textAlign: 'center',
  maxWidth: 680,
}

const drawWrap: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 20,
  display: 'flex',
  justifyContent: 'center',
  pointerEvents: 'none',
}

const drawCard: React.CSSProperties = {
  minWidth: 220,
  padding: '10px 22px',
  borderRadius: 18,
  border: '4px solid',
  background: LOOK.paper,
  textAlign: 'center',
  boxShadow: '0 5px 0 rgba(0,0,0,0.15)',
}

const overBackdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 46,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(30, 40, 50, 0.45)',
}

const overCard: React.CSSProperties = {
  width: 380,
  maxWidth: 'calc(100vw - 32px)',
  boxSizing: 'border-box',
  padding: '18px 20px',
  borderRadius: 20,
  background: LOOK.paper,
  boxShadow: '0 6px 0 rgba(0,0,0,0.18)',
  font: `14px/1.5 ${FONT}`,
  color: LOOK.ink,
}

const scoreRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 }

const againButton: React.CSSProperties = {
  display: 'block',
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 16px',
  borderRadius: 999,
  border: 'none',
  background: LOOK.sun,
  boxShadow: '0 4px 0 #d79a22',
  color: LOOK.ink,
  font: `700 16px/1.2 ${FONT}`,
  cursor: 'pointer',
}
