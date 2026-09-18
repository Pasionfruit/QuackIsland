/**
 * Let Him Cook, on the screen.
 *
 * The kitchen is drawn in its own canvas by `LetHimCookScene`; this is the
 * shell: `useKitchenNet` running or following the kitchen, a click on an item
 * passed to it on your turn, and the words - what the chef is doing, whose turn
 * it is and how long they have, the line, the turn order, what the last pick
 * was, and the results.
 *
 * **Aim with the mouse, left click to pick.** Only on your turn; the item under
 * the pointer lifts and gets a ring when a click would take it.
 */
import { Canvas } from '@react-three/fiber'
import { memo, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { ACESFilmicToneMapping, PCFShadowMap } from 'three'
import { getNet, useNet, usePeers } from '../../09-net'
import { TopTimer, replayMinigame, useFinish, type MinigameRun } from '../../15-minigames'
import { FOV } from './camera'
import { LetHimCookScene, myTurn, type SceneHands } from './LetHimCookScene'
import { COLOURS, INGREDIENTS, KITCHEN, cookTime, fastForwarding, placings, stillIn, turnTime, whoseTurn, type Cook, type Game, type Pick } from './rules'
import { myId, newGame, waitingGame } from './setup'
import { useKitchenNet } from './useKitchenNet'

const LOOK = {
  ink: '#4a3524',
  faded: '#8a725c',
  sand: '#f6e4bf',
  sun: '#ffc94d',
  red: '#d9443a',
  green: '#2f9e5b',
} as const

const FONT =
  "ui-rounded, 'Hiragino Maru Gothic ProN', 'Segoe UI', system-ui, -apple-system, sans-serif"

export function LetHimCookScreen({ run }: { run: MinigameRun }) {
  // First hook on purpose: the run-localrot skill reads the game from here.
  const [game, setGame] = useState<Game>(() => (getNet().host ? newGame() : waitingGame()))
  // Held back through the two seconds of Finish; see `useFinish`.
  const results = useFinish(game.phase === 'over', () =>
    placings(game).map((e) => ({ id: e.cook.id, place: e.place, name: nameOf(e.cook.id), colour: COLOURS[e.index % COLOURS.length], mine: e.cook.id === me })),
  )
  const paused = useRef(run.paused)
  paused.current = run.paused

  const net = useNet()
  const peers = usePeers()
  const me = net.id ?? myId()
  const wire = useKitchenNet()
  const live = useRef(game)
  live.current = game
  /** A click on an item, waiting for the next frame. */
  const clicked = useRef<number | null>(null)

  const nameOf = (id: string) => (id === me ? 'you' : (peers.find((p) => p.id === id)?.name ?? id))

  const hands = useMemo<SceneHands>(
    () => ({
      canPick: () => !paused.current && myTurn(live.current) && wire.pending() === null,
      onPick: (slot) => {
        clicked.current = slot
      },
      pending: () => wire.pending(),
    }),
    [],
  )

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const current = live.current
      const choice = clicked.current
      clicked.current = null
      if (wire.advance(current, dt, choice, paused.current)) setGame({ ...current })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const ready = game.players.length > 0
  const mineIndex = game.players.findIndex((p) => p.mine)
  const mine = game.players[mineIndex]
  const turn = whoseTurn(game)
  const isMine = turn !== null && turn === mineIndex

  return (
    <div style={page}>
      <div style={hud}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Let Him Cook</span>
        {ready ? <Status game={game} nameOf={nameOf} /> : <span style={{ color: LOOK.faded }}>waiting for the host…</span>}
        {ready && game.phase !== 'over' && fastForwarding(game) ? (
          <span style={{ ...pill, background: LOOK.sun, color: LOOK.ink }} data-fast-forward>
            fast-forward ×{KITCHEN.fastForward}
          </span>
        ) : null}
        <span style={{ flex: 1 }} />
        {mine ? (
          <span style={{ ...pill, background: mine.out ? LOOK.faded : COLOURS[mineIndex % COLOURS.length], color: '#fff' }} data-claims={mine.claims}>
            {mine.out ? 'out' : `${mine.claims} claimed`}
          </span>
        ) : null}
      </div>
      {ready ? <Line game={game} nameOf={nameOf} /> : null}

      <div style={boardStyle} onContextMenu={(e) => e.preventDefault()} data-board>
        <Stage live={live} hands={hands} />
        {game.phase === 'cooking' && game.recipe > 0 && game.clock < KITCHEN.intro ? (
          <Banner
            colour={LOOK.ink}
            text={
              game.recipe + 1 === KITCHEN.recipes
                ? 'Every copy is claimed - the last recipe, and the quickest. Watch!'
                : 'Every copy is claimed - the chef cooks again, quicker. Watch!'
            }
          />
        ) : null}
        {game.phase === 'cooking' && game.recipe === 0 && game.clock < KITCHEN.intro ? (
          <Banner colour={LOOK.ink} text="Watch what the chef puts in the pot" />
        ) : null}
        {isMine && game.phase === 'turns' ? <Banner colour={COLOURS[mineIndex % COLOURS.length]} text="Your turn - click an ingredient that was in the recipe" data="your-turn" /> : null}
        {game.phase === 'result' && game.last ? <Result last={game.last} game={game} nameOf={nameOf} /> : null}
        {game.phase === 'order' ? <Order game={game} nameOf={nameOf} /> : null}
      </div>

      {results && ready ? <Over game={game} me={me} nameOf={nameOf} onAgain={net.host ? replayMinigame : null} /> : null}
    </div>
  )
}

/** What is happening, in a few words, with the time it has left. */
function Status({ game, nameOf }: { game: Game; nameOf: (id: string) => string }) {
  const turn = whoseTurn(game)
  let text = ''
  let left: number | null = null
  switch (game.phase) {
    case 'cooking': {
      const total = cookTime(Math.max(game.picks.length, 1), game.recipe)
      text = game.recipe === 0 ? 'The chef is cooking - watch!' : `Recipe ${game.recipe + 1} of ${KITCHEN.recipes} - watch!`
      left = game.picks.length > 0 ? Math.max(0, total - game.clock) : null
      break
    }
    case 'order':
      text = 'Turn order'
      break
    case 'turns':
      text = turn === null ? '' : game.players[turn].mine ? 'Your turn' : `${nameOf(game.players[turn].id)}'s turn`
      left = Math.max(0, turnTime(game.recipe) - game.clock)
      break
    case 'result':
      text = 'Checking the recipe…'
      break
    case 'over':
      text = 'Service is over'
      break
  }
  return (
    <>
      <span style={{ ...pill, background: LOOK.ink, color: '#fff' }} data-phase={game.phase}>
        {text}
      </span>
      {left !== null ? (
        <TopTimer><span style={{ ...pill, background: game.phase === 'turns' && left <= 3 ? LOOK.red : LOOK.ink, color: '#fff' }} data-time-left={Math.ceil(left)}>
          {Math.ceil(left)}s
        </span></TopTimer>
      ) : null}
    </>
  )
}

/** Everybody in the line, in turn order, whoever is up first; then everybody out. */
function Line({ game, nameOf }: { game: Game; nameOf: (id: string) => string }) {
  const out = game.players.map((cook, index) => ({ cook, index })).filter((e) => e.cook.out)
  out.sort((a, b) => (a.cook.out?.order ?? 0) - (b.cook.out?.order ?? 0))
  return (
    <div style={lineBar} data-line={game.queue.join(',')}>
      {game.queue.map((index, position) => {
        const cook = game.players[index]
        const up = position === 0 && (game.phase === 'turns' || game.phase === 'result')
        return (
          <span
            key={cook.id}
            style={{
              ...chip,
              background: COLOURS[index % COLOURS.length],
              color: '#fff',
              outline: up ? `3px solid ${LOOK.ink}` : 'none',
              transform: up ? 'scale(1.08)' : 'none',
            }}
          >
            <span style={{ opacity: 0.75 }}>{position + 1}</span>
            <span style={nameStyle}>{nameOf(cook.id)}</span>
          </span>
        )
      })}
      {out.map(({ cook, index }) => (
        <span key={cook.id} style={{ ...chip, background: 'rgba(74,53,36,0.14)', color: LOOK.faded, textDecoration: 'line-through' }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: COLOURS[index % COLOURS.length] }} />
          <span style={nameStyle}>{nameOf(cook.id)}</span>
        </span>
      ))}
    </div>
  )
}

function ingredientName(kind: number, many = false): string {
  const ingredient = INGREDIENTS[kind]
  return many ? ingredient.many : ingredient.one
}

/** What the last pick was, and what it meant. */
function Result({ last, game, nameOf }: { last: Pick; game: Game; nameOf: (id: string) => string }) {
  const cook = game.players[last.player]
  const who = cook.mine ? 'You' : nameOf(cook.id)
  const kind = last.kind
  const icon = kind === null ? '' : `${INGREDIENTS[kind].icon} `
  let text = ''
  if (last.ok && kind !== null) text = `${icon}${who} picked the ${ingredientName(kind)} - it was in the recipe!`
  else if (last.why === 'wrong' && kind !== null) text = `${icon}${who} picked the ${ingredientName(kind)} - it was not in the recipe. Out!`
  else if (last.why === 'gone' && kind !== null) text = `${icon}Every ${ingredientName(kind)} in the recipe was already claimed. ${who} ${cook.mine ? 'are' : 'is'} out!`
  else if (last.why === 'time') text = `${who} ran out of time. Out!`
  else if (last.why === 'left') text = `${who} left the kitchen.`
  return <Banner colour={last.ok ? LOOK.green : LOOK.red} text={text} data={last.ok ? 'right' : `out-${last.why}`} />
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

/** The turn order, dealt at random, before the first turn. */
function Order({ game, nameOf }: { game: Game; nameOf: (id: string) => string }) {
  return (
    <div style={orderWrap}>
      <div style={orderCard} data-order={game.queue.join(',')}>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Turn order</div>
        {game.queue.map((index, position) => (
          <div key={index} style={scoreRow}>
            <span style={{ opacity: 0.5, minWidth: 18 }}>{position + 1}</span>
            <span style={{ width: 12, height: 12, borderRadius: 999, background: COLOURS[index % COLOURS.length] }} />
            <span style={{ fontWeight: game.players[index].mine ? 700 : 400 }}>{nameOf(game.players[index].id)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** The canvas, rendered once - see `LetHimCookScene`. */
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
      <LetHimCookScene live={live} hands={hands} />
    </Canvas>
  )
})

const SHADOWS = { type: PCFShadowMap }
const DPR: [number, number] = [1, 2]
const CAMERA = { fov: FOV, near: 0.5, far: 200, position: [0, 12, 14] as [number, number, number] }
const GL = { antialias: true, powerPreference: 'high-performance' as const }

/** The results: the last cook standing, then everybody by how long they lasted. */
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
  const mine = order.find((entry) => entry.cook.id === me)
  const winner = stillIn(game)[0]
  const headline = !mine ? 'Service is over' : mine.place === 1 ? 'Last cook standing!' : 'Out of the kitchen'
  const how = (cook: Cook) => {
    const claims = `${cook.claims} claimed`
    if (!cook.out) return `last standing · ${claims}`
    const why = { wrong: 'not in the recipe', gone: 'all claimed', time: 'out of time', left: 'left' }[cook.out.why]
    return `${why} · ${claims}`
  }
  return (
    <div style={overBackdrop}>
      <div style={overCard}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 2 }}>{headline}</div>
        <div style={{ color: LOOK.faded, marginBottom: 12 }}>
          {winner ? `${winner.id === me ? 'You' : nameOf(winner.id)} outlasted everybody.` : 'Nobody is left.'}
          {game.recipe > 0 ? ` The chef cooked ${game.recipe + 1} recipes.` : ''}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
          {order.map((entry) => (
            <div key={entry.cook.id} style={scoreRow} data-place={entry.place}>
              <span style={{ opacity: 0.5, minWidth: 18 }}>{entry.place}</span>
              <span style={{ width: 12, height: 12, borderRadius: 999, background: COLOURS[entry.index % COLOURS.length] }} />
              <span style={{ flex: 1, fontWeight: entry.cook.id === me ? 700 : 400 }}>{nameOf(entry.cook.id)}</span>
              <span style={{ opacity: 0.6, fontSize: 12 }}>{how(entry.cook)}</span>
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
  background: '#f3dfc1',
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
  background: LOOK.sand,
  borderBottom: '2px solid #ecd0a0',
  flexWrap: 'wrap',
}

const lineBar: React.CSSProperties = {
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 16px',
  background: 'rgba(246, 228, 191, 0.7)',
  flexWrap: 'wrap',
}

const pill: React.CSSProperties = {
  padding: '3px 12px',
  borderRadius: 999,
  font: `600 12px/1.5 ${FONT}`,
  whiteSpace: 'nowrap',
}

const chip: React.CSSProperties = {
  ...pill,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '2px 10px',
}

const nameStyle: React.CSSProperties = { maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis' }

const boardStyle: React.CSSProperties = { flex: 1, minHeight: 0, width: '100%', position: 'relative', overflow: 'hidden' }

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
  maxWidth: 640,
}

const orderWrap: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  pointerEvents: 'none',
  background: 'rgba(74, 53, 36, 0.25)',
}

const orderCard: React.CSSProperties = {
  width: 260,
  maxWidth: 'calc(100vw - 32px)',
  boxSizing: 'border-box',
  padding: '16px 20px',
  borderRadius: 20,
  background: LOOK.sand,
  boxShadow: '0 6px 0 rgba(0,0,0,0.18)',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

const overBackdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 46,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(40, 28, 18, 0.45)',
}

const overCard: React.CSSProperties = {
  width: 380,
  maxWidth: 'calc(100vw - 32px)',
  boxSizing: 'border-box',
  padding: '18px 20px',
  borderRadius: 20,
  background: LOOK.sand,
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
