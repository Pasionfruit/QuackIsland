/**
 * One Piece?!, on the screen.
 *
 * Two halves. On the left, **your table**: the empty frame in the middle, with
 * the faintest ghost of your picture in it, and the six pieces of your face
 * scattered either side, every one of them turned the wrong way. On the right,
 * **everybody's puzzles**, small, filling in piece by piece as they go, so you
 * can see who is about to beat you.
 *
 * **Drag a piece** (left button) to move it; picking one up selects it and
 * brings it to the front. **Right click a piece, or scroll the wheel**, to turn
 * the selected piece a quarter - clockwise, or back with the wheel up. Let go
 * of a piece near its place and the right way up and it clicks in, and stays.
 *
 * It is all DOM and SVG: no canvas. The table is laid out in its own units
 * (`TABLE`) and scaled to fit whatever room there is.
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { getMyName, getNet, useNet, usePeers } from '../../09-net'
import { CUES, TopTimer, playCue, useFinish, type MinigameRun } from '../../15-minigames'
import { Portrait } from './Portrait'
import {
  COLOURS,
  FULL,
  PIECE,
  PUZZLE,
  TABLE,
  cellOf,
  countPlaced,
  deselect,
  drop,
  finished,
  lockedMask,
  moveTo,
  newBoard,
  placings,
  select,
  timeLeft,
  turn,
  type Board,
  type Game,
} from './rules'
import { myId, newGame, waitingGame } from './setup'
import { usePuzzleNet } from './usePuzzleNet'

const LOOK = {
  ink: '#1f2a33',
  faded: '#6f7d88',
  paper: '#f2f6f8',
  table: '#c99a63',
  tableEdge: '#a8794a',
  sun: '#ffc94d',
  green: '#2f9e5b',
  red: '#d9443a',
} as const

const FONT = "ui-rounded, 'Hiragino Maru Gothic ProN', 'Segoe UI', system-ui, -apple-system, sans-serif"

/** The least time between two turns from the wheel, in ms - a trackpad sends dozens of events a flick. */
const WHEEL_GAP_MS = 140

export function OnePieceScreen({ run }: { run: MinigameRun }) {
  // First hook on purpose: the run-localrot skill reads the game from here.
  const [game, setGame] = useState<Game>(() => (getNet().host ? newGame() : waitingGame()))
  const net = useNet()
  const peers = usePeers()
  const me = net.id ?? myId()
  const nameOf = (id: string) => (id === me ? 'you' : (peers.find((p) => p.id === id)?.name ?? id))
  /** What goes on a picture: a real name rather than "you". */
  const labelOf = (id: string) => (id === me ? getMyName() : nameOf(id))

  // Held back through the two seconds of Finish; see `useFinish`.
  useFinish(game.over, () =>
    placings(game).map((e) => ({ id: e.player.id, place: e.place, name: nameOf(e.player.id), colour: COLOURS[e.index % COLOURS.length], mine: e.player.id === me })),
  )
  const paused = useRef(run.paused)
  paused.current = run.paused

  const wire = usePuzzleNet()
  const live = useRef(game)
  live.current = game

  /** Your table. Yours alone: it never goes on the wire. */
  const [dealt] = useState(() => newBoard(game.seed))
  const board = useRef<Board>(dealt)
  /** The game the table was last dealt for. */
  const dealtFor = useRef(game.id)
  const [, redraw] = useState(0)
  const touched = () => redraw((n) => n + 1)

  /** The piece being dragged, and where on it it was picked up. */
  const drag = useRef<{ piece: number; pointer: number; dx: number; dy: number } | null>(null)
  const surface = useRef<HTMLDivElement>(null)
  const lastWheel = useRef(0)

  const mayTouch = () => {
    const current = live.current
    const mine = current.players.find((p) => p.mine)
    return !paused.current && !current.over && !!mine && !mine.left && !finished(mine)
  }

  /** A pointer's place on the table, in table units. */
  const toTable = (clientX: number, clientY: number) => {
    const el = surface.current
    if (!el) return null
    const box = el.getBoundingClientRect()
    if (box.width <= 0 || box.height <= 0) return null
    return { x: ((clientX - box.left) * TABLE.width) / box.width, y: ((clientY - box.top) * TABLE.height) / box.height }
  }

  const clickedIn = (did: boolean) => {
    if (!did) return
    playCue(CUES.bump)
  }

  useEffect(() => {
    const spin = (e: WheelEvent) => {
      if (!mayTouch() || e.deltaY === 0) return
      const selected = board.current.selected
      if (selected === null) return
      const now = performance.now()
      if (now - lastWheel.current < WHEEL_GAP_MS) return
      lastWheel.current = now
      clickedIn(turn(board.current, selected, e.deltaY > 0 ? 1 : -1))
      touched()
    }
    window.addEventListener('wheel', spin, { passive: true })
    return () => window.removeEventListener('wheel', spin)
  }, [])

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const current = live.current

      // A new game: a new table, dealt from its seed.
      if (current.id !== dealtFor.current) {
        dealtFor.current = current.id
        board.current = newBoard(current.seed)
        drag.current = null
      }

      const moved = wire.advance(current, dt, lockedMask(board.current), paused.current)
      if (moved) setGame({ ...current })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const onPieceDown = (index: number) => (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (!mayTouch()) return
    const b = board.current
    if (!select(b, index)) return
    if (e.button === 2) {
      clickedIn(turn(b, index, 1))
    } else if (e.button === 0) {
      const at = toTable(e.clientX, e.clientY)
      const piece = b.pieces[index]
      if (at) {
        drag.current = { piece: index, pointer: e.pointerId, dx: at.x - piece.x, dy: at.y - piece.y }
        e.currentTarget.setPointerCapture?.(e.pointerId)
      }
    }
    touched()
  }

  const onPieceMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const held = drag.current
    if (!held || held.pointer !== e.pointerId) return
    if (!mayTouch()) {
      drag.current = null
      return
    }
    const at = toTable(e.clientX, e.clientY)
    if (!at) return
    moveTo(board.current, held.piece, at.x - held.dx, at.y - held.dy)
    touched()
  }

  const onPieceUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const held = drag.current
    if (!held || held.pointer !== e.pointerId) return
    drag.current = null
    if (mayTouch()) clickedIn(drop(board.current, held.piece))
    touched()
  }

  const ready = game.players.length > 0
  const mineIndex = game.players.findIndex((p) => p.mine)
  const mine = game.players[mineIndex]
  const playing = ready && !game.over
  const left = timeLeft(game)
  const colour = COLOURS[Math.max(0, mineIndex) % COLOURS.length]
  const inCount = countPlaced(lockedMask(board.current))
  const order = placings(game)

  let caption = ''
  let captionColour = '#fff'
  if (playing && mine) {
    if (finished(mine)) {
      const place = order.find((e) => e.index === mineIndex)?.place ?? 1
      caption = `Solved! You came ${ordinal(place)} - waiting for the others…`
      captionColour = '#8ff0ad'
    } else if (inCount === 0) {
      caption = 'Drag a piece into the frame · right click or scroll to turn it'
    } else {
      caption = `${inCount} of ${PUZZLE.pieces} in - keep going`
    }
  }

  return (
    <div style={page}>
      <div style={hud}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>One Piece?!</span>
        {ready ? (
          <span style={{ ...pill, background: LOOK.ink, color: '#fff' }} data-in={inCount}>
            {mine && finished(mine) ? 'solved' : `${inCount} of ${PUZZLE.pieces} in`}
          </span>
        ) : (
          <span style={{ color: LOOK.faded }}>waiting for the host…</span>
        )}
        <span style={{ flex: 1 }} />
        {game.players.map((p, index) => (
          <span
            key={p.id}
            style={{
              ...pill,
              background: p.mine ? COLOURS[index % COLOURS.length] : 'rgba(255,255,255,0.85)',
              color: p.mine ? '#fff' : LOOK.ink,
              boxShadow: p.mine ? 'none' : `inset 0 0 0 2px ${COLOURS[index % COLOURS.length]}`,
              opacity: p.left ? 0.5 : 1,
            }}
            data-placed={countPlaced(p.placed)}
          >
            {nameOf(p.id)} · {finished(p) ? '✓' : `${countPlaced(p.placed)}/${PUZZLE.pieces}`}
          </span>
        ))}
      </div>

      {playing ? (
        <TopTimer left={game.over ? null : left}>
          <span style={{ ...pill, background: left <= 15 ? LOOK.red : LOOK.ink, color: '#fff' }} data-time-left={Math.ceil(left)}>
            {Math.ceil(left)}s
          </span>
        </TopTimer>
      ) : null}

      <div style={boardStyle} onContextMenu={(e) => e.preventDefault()} data-board>
        <div style={tableColumn}>
          {mine ? (
            <FitTable>
              <div
                ref={surface}
                style={tableSurface}
                onPointerDown={() => {
                  deselect(board.current)
                  touched()
                }}
                data-table
              >
                <Frame colour={colour} name={labelOf(mine.id)} />
                {board.current.order.map((index) => {
                  const piece = board.current.pieces[index]
                  const { col, row } = cellOf(index)
                  const selected = board.current.selected === index
                  const dragging = drag.current?.piece === index
                  return (
                    <div
                      key={`${game.id}:${index}`}
                      style={{
                        ...pieceBox,
                        left: piece.x - PIECE.w / 2,
                        top: piece.y - PIECE.h / 2,
                        transform: `rotate(${piece.spin * 90}deg) scale(${dragging ? 1.04 : 1})`,
                        boxShadow: piece.locked
                          ? 'none'
                          : selected
                            ? `0 0 0 4px ${LOOK.sun}, 0 10px 22px rgba(0,0,0,0.35)`
                            : '0 5px 12px rgba(0,0,0,0.3)',
                        pointerEvents: piece.locked ? 'none' : 'auto',
                        cursor: piece.locked ? 'default' : dragging ? 'grabbing' : 'grab',
                        zIndex: piece.locked ? 1 : 2,
                      }}
                      onPointerDown={onPieceDown(index)}
                      onPointerMove={onPieceMove}
                      onPointerUp={onPieceUp}
                      onPointerCancel={onPieceUp}
                      data-piece={index}
                      data-turns={piece.turns}
                      data-locked={piece.locked ? 1 : 0}
                    >
                      <svg
                        viewBox={`${col * PIECE.w} ${row * PIECE.h} ${PIECE.w} ${PIECE.h}`}
                        width={PIECE.w}
                        height={PIECE.h}
                        style={{ display: 'block' }}
                        aria-hidden
                      >
                        <Portrait colour={colour} name={labelOf(mine.id)} />
                      </svg>
                    </div>
                  )
                })}
              </div>
            </FitTable>
          ) : null}
          {playing ? <div style={{ ...captionStyle, color: captionColour }}>{caption}</div> : null}
        </div>

        <div style={sidebar}>
          <div style={{ font: `700 13px/1.3 ${FONT}`, color: '#dfe7f1', marginBottom: 4 }}>Everybody's puzzles</div>
          {game.players.map((p, index) => {
            const placed = order.find((e) => e.index === index)
            return (
              <div key={p.id} style={{ ...racerRow, opacity: p.left ? 0.45 : 1 }} data-racer={p.id}>
                <MiniPuzzle colour={COLOURS[index % COLOURS.length]} name={labelOf(p.id)} placed={p.placed} />
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ font: `700 13px/1.3 ${FONT}`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nameOf(p.id)}</span>
                  <span style={{ font: `600 12px/1.3 ${FONT}`, color: finished(p) ? '#8ff0ad' : '#b7c3d0' }}>
                    {finished(p) ? `#${placed?.place ?? '?'} · ${p.finishedAt?.toFixed(1)}s` : p.left ? 'left' : `${countPlaced(p.placed)} of ${PUZZLE.pieces}`}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function ordinal(n: number): string {
  const tens = n % 100
  const suffix = tens >= 11 && tens <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')
  return `${n}${suffix}`
}

/** The table, scaled to the room it has and kept its own shape. */
function FitTable({ children }: { children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.6)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const fit = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      if (w > 0 && h > 0) setScale(Math.min(w / TABLE.width, h / TABLE.height))
    }
    fit()
    if (typeof ResizeObserver !== 'function') {
      window.addEventListener('resize', fit)
      return () => window.removeEventListener('resize', fit)
    }
    const watch = new ResizeObserver(fit)
    watch.observe(el)
    return () => watch.disconnect()
  }, [])
  return (
    <div ref={box} style={fitBox}>
      <div style={{ width: TABLE.width * scale, height: TABLE.height * scale, position: 'relative' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: TABLE.width, height: TABLE.height, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

/** The frame the picture goes in: a ghost of it, and a line round every place. */
function Frame({ colour, name }: { colour: string; name: string }) {
  return (
    <div style={{ position: 'absolute', left: TABLE.frameX, top: TABLE.frameY, width: TABLE.frame, height: TABLE.frame, zIndex: 0 }} data-frame>
      <div style={frameBorder} />
      <svg viewBox={`0 0 ${TABLE.frame} ${TABLE.frame}`} width={TABLE.frame} height={TABLE.frame} style={{ display: 'block', position: 'absolute', inset: 0 }} aria-hidden>
        <rect x={0} y={0} width={TABLE.frame} height={TABLE.frame} fill="#f5ecdf" />
        <g opacity={0.13}>
          <Portrait colour={colour} name={name} />
        </g>
        {Array.from({ length: PUZZLE.pieces }, (_, i) => {
          const { col, row } = cellOf(i)
          return (
            <rect
              key={i}
              x={col * PIECE.w + 1}
              y={row * PIECE.h + 1}
              width={PIECE.w - 2}
              height={PIECE.h - 2}
              fill="none"
              stroke="rgba(90,60,30,0.35)"
              strokeWidth={2}
              strokeDasharray="8 6"
            />
          )
        })}
      </svg>
    </div>
  )
}

/** Somebody's puzzle, small: what they have in, and a gap where they have not. */
function MiniPuzzle({ colour, name, placed }: { colour: string; name: string; placed: number }) {
  return (
    <svg viewBox={`0 0 ${TABLE.frame} ${TABLE.frame}`} width={62} height={62} style={{ flex: '0 0 auto', borderRadius: 8, background: '#f5ecdf' }} aria-hidden>
      <Portrait colour={colour} name={name} />
      {Array.from({ length: PUZZLE.pieces }, (_, i) => {
        if (placed & (1 << i)) return null
        const { col, row } = cellOf(i)
        return <rect key={i} x={col * PIECE.w} y={row * PIECE.h} width={PIECE.w} height={PIECE.h} fill="#2a3244" stroke="#48526a" strokeWidth={6} />
      })}
      {placed === FULL ? <rect x={3} y={3} width={TABLE.frame - 6} height={TABLE.frame - 6} fill="none" stroke="#8ff0ad" strokeWidth={14} /> : null}
    </svg>
  )
}

const page: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 42,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  background: '#1d2433',
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
  borderBottom: '2px solid #d3dee5',
  flexWrap: 'wrap',
}

const pill: React.CSSProperties = {
  padding: '3px 12px',
  borderRadius: 999,
  font: `600 12px/1.5 ${FONT}`,
  whiteSpace: 'nowrap',
}

const boardStyle: React.CSSProperties = { flex: 1, minHeight: 0, width: '100%', position: 'relative', overflow: 'hidden', display: 'flex' }

const tableColumn: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  padding: '14px 16px 14px 20px',
  boxSizing: 'border-box',
}

const fitBox: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const tableSurface: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  borderRadius: 28,
  background: `radial-gradient(ellipse at 50% 40%, #d8ab73, ${LOOK.table} 60%, ${LOOK.tableEdge})`,
  boxShadow: `inset 0 0 0 6px ${LOOK.tableEdge}, 0 16px 40px rgba(0,0,0,0.45)`,
  touchAction: 'none',
}

const frameBorder: React.CSSProperties = {
  position: 'absolute',
  inset: -12,
  borderRadius: 10,
  background: '#7a5230',
  boxShadow: 'inset 0 0 0 3px #5e3d22, 0 4px 10px rgba(0,0,0,0.3)',
}

const pieceBox: React.CSSProperties = {
  position: 'absolute',
  width: PIECE.w,
  height: PIECE.h,
  transformOrigin: '50% 50%',
  transition: 'transform 0.14s ease-out, box-shadow 0.14s ease-out',
  touchAction: 'none',
}

const captionStyle: React.CSSProperties = {
  flex: '0 0 auto',
  padding: '3px 12px',
  borderRadius: 999,
  background: 'rgba(16, 22, 28, 0.6)',
  font: `700 14px/1.3 ${FONT}`,
  textShadow: '0 1px 3px rgba(0,0,0,0.6)',
  textAlign: 'center',
}

const sidebar: React.CSSProperties = {
  flex: '0 0 210px',
  height: '100%',
  boxSizing: 'border-box',
  padding: '16px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  background: 'rgba(0,0,0,0.18)',
  color: '#fff',
  overflow: 'hidden',
}

const racerRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10 }
