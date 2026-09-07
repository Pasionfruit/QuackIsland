import { useEffect, useRef, useState } from 'react'
import { ControlsSettings } from '../../components/ControlsSettings'
import { codeFor } from '../../lib/controls'
import { fitScene } from '../../lib/draw'
import { useFullscreen } from '../../lib/fullscreen'
import { NetClient, defaultServerUrl } from '../../net/client'
import { normalizeCode, type PartyParadePayload, type PeerInfo } from '../../net/protocol'
import {
  BOARD_TILES,
  GATE_TEXT,
  ISLANDS,
  MAIN_COUNT,
  SHORT_COUNT,
  TREASURE_INDEX,
  WORLD_H,
  WORLD_W,
  distanceToGoal,
  type TileKind,
} from './engine/board'
import { PARADE_CAST, PLAYER_COLORS, PartyParadeEngine, VIEW_H, VIEW_W } from './engine/engine'
import {
  TILE_COLORS,
  TILE_LABELS,
  drawBoard,
  drawChrome,
  drawInk,
  drawPawns,
  pawnSpot,
  screenToWorld,
  type Camera,
  type InkStroke,
} from './render'

/**
 * Party Parade: a run from the start line to the treasure, a die, and whatever
 * the space you land on decides to do about it.
 *
 * The host owns the die, the walk and the checkpoints and broadcasts
 * snapshots; a guest sends "roll", "this way at the fork", and whatever it
 * scribbles on the map, then renders what arrives - carrying only the walk
 * animation forward locally between snapshots so a hop does not stutter.
 *
 * Ink is the one thing that never goes near the host: the relay already fans a
 * message out to everyone else in the room, so a scribble reaches every other
 * player in one hop, the same shortcut Sketch takes with its strokes.
 */

const net = new NetClient()
type Screen = 'lobby' | 'play'
type Role = 'solo' | 'host' | 'guest'
/** The camera follows the turn until you take hold of it, and "find me" sticks to your own pawn. */
type CamMode = 'turn' | 'me' | 'free'

const KIND_ORDER: TileKind[] = ['start', 'plain', 'good', 'bad', 'hostile', 'gate', 'treasure']
const CAM_EASE = 0.08

function CastPicker({ value, taken, onPick }: { value: number; taken: Set<number>; onPick: (i: number) => void }) {
  return (
    <div className="picks">
      {PARADE_CAST.map((c, i) => {
        const locked = taken.has(i) && i !== value
        return (
          <button
            key={c.id}
            type="button"
            className={`pick ${i === value ? 'pick--on' : ''} ${locked ? 'pick--locked' : ''}`}
            disabled={locked}
            onClick={() => onPick(i)}
            title={locked ? `${c.name} is taken` : c.blurb}
          >
            <span className="pick__name">{c.name}</span>
            <span className="pick__lock">{locked ? 'taken' : c.blurb}</span>
          </button>
        )
      })}
    </div>
  )
}

export function PartyParadePanel() {
  const [screen, setScreen] = useState<Screen>('lobby')
  const [role, setRole] = useState<Role>('solo')
  const [status, setStatus] = useState('idle')
  const [detail, setDetail] = useState('')
  const [code, setCode] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [name, setName] = useState('Player')
  const [peers, setPeers] = useState<PeerInfo[]>([])
  const [slot, setSlot] = useState(0)
  const [picks, setPicks] = useState<Record<number, number>>({ 0: 0 })
  const [drawing, setDrawing] = useState(false)
  const [, setTick] = useState(0)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const engineRef = useRef<PartyParadeEngine | null>(null)
  const roleRef = useRef<Role>('solo')
  roleRef.current = role
  const slotRef = useRef(0)
  slotRef.current = slot
  const peersRef = useRef<PeerInfo[]>([])
  peersRef.current = peers
  const picksRef = useRef<Record<number, number>>({ 0: 0 })
  picksRef.current = picks
  const nameRef = useRef('Player')
  nameRef.current = name
  const drawingRef = useRef(false)
  drawingRef.current = drawing

  const camRef = useRef<Camera>({ x: WORLD_W / 2, y: WORLD_H / 2, zoom: 1 })
  const camModeRef = useRef<CamMode>('turn')
  const inkRef = useRef<(InkStroke & { slot: number })[]>([])
  const strokeRef = useRef<number[] | null>(null)
  const dragRef = useRef<{ x: number; y: number } | null>(null)
  const fullscreen = useFullscreen<HTMLDivElement>()

  function buildEngine(roster: { slot: number; name: string; castIndex: number }[]): PartyParadeEngine {
    const eng = new PartyParadeEngine()
    for (const r of roster) eng.addPlayer(r.slot, r.name, r.castIndex)
    return eng
  }

  function rosterFromLobby(): { slot: number; name: string; castIndex: number }[] {
    if (roleRef.current === 'solo') {
      return [{ slot: 0, name: nameRef.current || 'You', castIndex: picksRef.current[0] ?? 0 }]
    }
    return peersRef.current.map((p) => ({
      slot: p.slot,
      name: p.name,
      castIndex: picksRef.current[p.slot] ?? p.slot % PARADE_CAST.length,
    }))
  }

  useEffect(() => {
    net.on({
      onStatus: (s, d) => {
        setStatus(s)
        setDetail(d ?? '')
        if (s === 'closed' || s === 'error') {
          setRole('solo')
          setCode('')
          setPeers([])
        }
      },
      onRoom: (c, sl) => {
        setCode(c)
        setSlot(sl)
        setRole(sl === 0 ? 'host' : 'guest')
        setPicks((prev) => ({ ...prev, [sl]: prev[sl] ?? sl % PARADE_CAST.length }))
      },
      onPeers: (players) => {
        setPeers(players)
        setPicks((prev) => {
          const next = { ...prev }
          const used = new Set(Object.values(next))
          for (const p of players) {
            if (next[p.slot] !== undefined) continue
            let want = p.slot % PARADE_CAST.length
            for (let i = 0; i < PARADE_CAST.length && used.has(want); i++) want = (want + 1) % PARADE_CAST.length
            next[p.slot] = want
            used.add(want)
          }
          return next
        })
      },
      onPayload: (payload, from) => {
        const msg = payload as PartyParadePayload
        if (!msg) return

        // Ink goes peer to peer in both directions - the host has no say in it.
        if (msg.k === 'ink') {
          inkRef.current.push({ slot: from, color: msg.color, pts: msg.pts })
          return
        }
        if (msg.k === 'clearInk') {
          inkRef.current = inkRef.current.filter((s) => s.slot !== from)
          return
        }

        if (roleRef.current === 'host') {
          const eng = engineRef.current
          switch (msg.k) {
            case 'roll':
              eng?.roll(from)
              break
            case 'route':
              eng?.chooseRoute(from, msg.shortcut)
              break
            case 'pick':
              setPicks((prev) => {
                if (Object.entries(prev).some(([s, c]) => Number(s) !== from && c === msg.castIndex)) return prev
                const next = { ...prev, [from]: msg.castIndex }
                net.send({
                  k: 'picks',
                  map: Object.entries(next).map(([s, c]) => [Number(s), c]),
                } satisfies PartyParadePayload)
                return next
              })
              break
            default:
              break
          }
          return
        }

        if (msg.k === 'start') {
          engineRef.current = buildEngine(msg.roster)
          inkRef.current = []
          setScreen('play')
          setTick((t) => t + 1)
        } else if (msg.k === 'snap') {
          engineRef.current?.applySnapshot(msg.s as ReturnType<PartyParadeEngine['snapshot']>)
        } else if (msg.k === 'picks') {
          const next: Record<number, number> = {}
          for (const [s, c] of msg.map) next[s] = c
          setPicks(next)
        }
      },
    })
    return () => net.close()
  }, [])

  function beginMatch(): void {
    const roster = rosterFromLobby()
    engineRef.current = buildEngine(roster)
    inkRef.current = []
    const first = BOARD_TILES[0]
    camRef.current = { x: first.x, y: first.y, zoom: 1 }
    camModeRef.current = 'turn'
    setScreen('play')
    if (role === 'host') net.send({ k: 'start', roster } satisfies PartyParadePayload)
  }

  function pickCast(i: number): void {
    if (roleRef.current === 'guest') {
      net.send({ k: 'pick', castIndex: i } satisfies PartyParadePayload)
      return
    }
    setPicks((prev) => {
      const mine = slotRef.current
      if (Object.entries(prev).some(([s, c]) => Number(s) !== mine && c === i)) return prev
      const next = { ...prev, [mine]: i }
      if (roleRef.current === 'host') {
        net.send({
          k: 'picks',
          map: Object.entries(next).map(([s, c]) => [Number(s), c]),
        } satisfies PartyParadePayload)
      }
      return next
    })
  }

  function rollDie(): void {
    const eng = engineRef.current
    if (!eng || eng.turnPhase !== 'idle' || eng.phase !== 'board') return
    if (eng.current?.slot !== slotRef.current) return
    if (roleRef.current === 'guest') net.send({ k: 'roll' } satisfies PartyParadePayload)
    else eng.roll(slotRef.current)
    setTick((t) => t + 1)
  }

  function chooseRoute(shortcut: boolean): void {
    const eng = engineRef.current
    if (!eng || eng.turnPhase !== 'fork' || eng.pending?.slot !== slotRef.current) return
    if (roleRef.current === 'guest') net.send({ k: 'route', shortcut } satisfies PartyParadePayload)
    else eng.chooseRoute(slotRef.current, shortcut)
    setTick((t) => t + 1)
  }

  /** Snaps the camera back onto your own pawn and keeps it there. */
  function findMe(): void {
    camModeRef.current = 'me'
    setTick((t) => t + 1)
  }

  function clearMyInk(): void {
    inkRef.current = inkRef.current.filter((s) => s.slot !== slotRef.current)
    net.send({ k: 'clearInk' } satisfies PartyParadePayload)
    setTick((t) => t + 1)
  }

  // ------------------------------------------------------------------ input

  useEffect(() => {
    if (screen !== 'play') return
    const rollKey = codeFor('partyparade.roll', 'Space')
    const findKey = codeFor('partyparade.find', 'KeyF')
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      if (e.code === rollKey) {
        e.preventDefault()
        rollDie()
      } else if (e.code === findKey) {
        e.preventDefault()
        findMe()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [screen])

  /** Canvas point in world units, so ink and panning both land where they look. */
  function worldAt(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const sx = ((e.clientX - rect.left) / rect.width) * VIEW_W
    const sy = ((e.clientY - rect.top) / rect.height) * VIEW_H
    return screenToWorld(sx, sy, camRef.current)
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>): void {
    e.currentTarget.setPointerCapture(e.pointerId)
    const w = worldAt(e)
    if (drawingRef.current) {
      strokeRef.current = [w.x, w.y]
    } else {
      dragRef.current = { x: w.x, y: w.y }
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>): void {
    const w = worldAt(e)
    if (drawingRef.current && strokeRef.current) {
      const pts = strokeRef.current
      const lx = pts[pts.length - 2]
      const ly = pts[pts.length - 1]
      // Thin the trail out, or a slow hand sends hundreds of points a second.
      if (Math.hypot(w.x - lx, w.y - ly) > 3 && pts.length < 400) pts.push(w.x, w.y)
      return
    }
    if (dragRef.current) {
      // Dragging the board moves the camera and takes it off the action until
      // the next turn - that is what the "find me" button undoes.
      const cam = camRef.current
      cam.x += dragRef.current.x - w.x
      cam.y += dragRef.current.y - w.y
      camModeRef.current = 'free'
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>): void {
    e.currentTarget.releasePointerCapture(e.pointerId)
    dragRef.current = null
    const pts = strokeRef.current
    strokeRef.current = null
    if (!pts || pts.length < 4) return
    const color = PLAYER_COLORS[slotRef.current % PLAYER_COLORS.length]
    inkRef.current.push({ slot: slotRef.current, color, pts })
    net.send({ k: 'ink', color, pts } satisfies PartyParadePayload)
  }

  // ------------------------------------------------------------------- loop

  useEffect(() => {
    if (screen !== 'play') return
    const canvas = canvasRef.current
    if (!canvas) return
    let ctx = fitScene(canvas, VIEW_W, VIEW_H)
    const observer = new ResizeObserver(() => {
      ctx = fitScene(canvas, VIEW_W, VIEW_H)
    })
    observer.observe(canvas)

    let raf = 0
    let frame = 0
    let sinceSend = 0
    let lastKey = ''

    const tick = () => {
      raf = requestAnimationFrame(tick)
      const eng = engineRef.current
      if (!eng) return
      frame++

      if (roleRef.current === 'guest') {
        eng.stepVisual()
      } else {
        eng.step()
        sinceSend++
        const busy = eng.turnPhase !== 'idle'
        if (roleRef.current === 'host' && sinceSend >= (busy ? 3 : 20)) {
          sinceSend = 0
          net.send({ k: 'snap', s: eng.snapshot() } satisfies PartyParadePayload)
        }
      }

      // Whoever is up gets followed, unless you have taken the camera yourself.
      const key = `${eng.turnIndex}:${eng.phase}`
      if (key !== lastKey) {
        lastKey = key
        camModeRef.current = 'turn'
        setTick((t) => t + 1)
      }
      const mode = camModeRef.current
      const focus =
        mode === 'me' ? eng.playerAt(slotRef.current) : mode === 'turn' ? eng.current : undefined
      if (focus) {
        const spot = pawnSpot(eng, focus)
        const cam = camRef.current
        cam.x += (spot.x - cam.x) * CAM_EASE
        cam.y += (spot.y - cam.y) * CAM_EASE
      }

      drawBoard(ctx, frame, camRef.current)
      drawInk(ctx, inkRef.current, camRef.current)
      drawPawns(ctx, eng, frame, slotRef.current, camRef.current)
      drawChrome(ctx, eng, slotRef.current, frame, camRef.current)

      const turnKey = `${eng.turnPhase}:${eng.winner}`
      if (turnKey !== lastKey) {
        lastKey = turnKey
        setTick((t) => t + 1)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [screen])

  const eng = engineRef.current
  const lobbyRoster: { slot: number; name: string }[] =
    role === 'solo' ? [{ slot: 0, name: name || 'You' }] : peers

  const kindCounts = KIND_ORDER.map((k) => ({
    kind: k,
    n: BOARD_TILES.filter((t) => t.kind === k).length,
  })).filter((r) => r.n > 0)

  // ------------------------------------------------------------------ lobby

  if (screen === 'lobby') {
    const myPick = picks[slot] ?? 0
    const taken = new Set(
      Object.entries(picks)
        .filter(([s]) => Number(s) !== slot)
        .map(([, c]) => c),
    )
    return (
      <div>
        <div className="gamehead">
          <h2>Party Parade</h2>
          <span className="chip chip--gold">
            <span className="dot" /> Prototype
          </span>
          <span className="chip">Party board game</span>
          <span className="chip">2-8 players</span>
        </div>

        <div className="infogrid">
          <div className="panel">
            <div className="panel__title">A board, a die, and forty minutes of betrayal.</div>
            <p className="muted" style={{ marginTop: 0 }}>
              {MAIN_COUNT} spaces from the start line to the treasure, across {ISLANDS.length} islands.
              Three checkpoints hold up whoever is in front, and a {SHORT_COUNT}-space causeway cuts across
              the middle for anyone willing to risk what is on it.
            </p>
            <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
              First to the treasure wins. The minigames between rounds are still being built.
            </p>
            <div className="chiprow" style={{ marginTop: 12 }}>
              <button className="btn" onClick={beginMatch}>
                Walk the course (solo)
              </button>
              <button
                className="btn btn--ghost"
                onClick={() => net.host(defaultServerUrl(), name, 'party-parade', 8)}
              >
                Host a match
              </button>
            </div>
            <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
              <label className="fighter__title">Your name</label>
              <input className="input" value={name} maxLength={16} onChange={(e) => setName(e.target.value)} />
              <label className="fighter__title">Join a match</label>
              <div className="chiprow">
                <input
                  className="input"
                  value={joinCode}
                  placeholder="CODE"
                  maxLength={4}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  style={{ width: 90 }}
                />
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={() => net.join(defaultServerUrl(), normalizeCode(joinCode), name)}
                >
                  Join
                </button>
              </div>
              {status !== 'idle' && (
                <span className="muted" style={{ fontSize: 12 }}>
                  {status}
                  {detail ? ` - ${detail}` : ''}
                </span>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel__title">Pick your animal</div>
            <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
              One each - anybody already spoken for is greyed out. Choose here: once the parade sets off you
              are stuck with it.
            </p>
            <CastPicker value={myPick} taken={taken} onPick={pickCast} />
          </div>

          <div className="panel">
            <div className="panel__title">The parade</div>
            {code ? (
              <>
                <p style={{ marginTop: 0 }}>
                  Room code <strong style={{ fontSize: 20 }}>{code}</strong>
                </p>
                <div style={{ display: 'grid', gap: 6 }}>
                  {lobbyRoster.map((p) => (
                    <div key={p.slot} className="keyrow">
                      <span>
                        <span
                          style={{
                            display: 'inline-block',
                            width: 9,
                            height: 9,
                            borderRadius: 999,
                            background: PLAYER_COLORS[p.slot % PLAYER_COLORS.length],
                            marginRight: 8,
                          }}
                        />
                        {p.name}
                      </span>
                      <span className="muted">
                        {PARADE_CAST[(picks[p.slot] ?? p.slot % PARADE_CAST.length) % PARADE_CAST.length].name}
                      </span>
                    </div>
                  ))}
                </div>
                {role === 'host' && (
                  <button className="btn" style={{ marginTop: 12 }} onClick={beginMatch}>
                    Start the parade ({peers.length || 1})
                  </button>
                )}
                {role === 'guest' && (
                  <p className="muted" style={{ marginTop: 12 }}>
                    Waiting for the host to start.
                  </p>
                )}
              </>
            ) : (
              <p className="muted" style={{ marginTop: 0 }}>
                Host to get a four-letter code, or join one somebody read out to you. Two to eight players,
                one animal each.
              </p>
            )}
          </div>

          <div className="panel">
            <div className="panel__title">The course</div>
            <div style={{ display: 'grid', gap: 6 }}>
              {kindCounts.map((r) => (
                <div className="keyrow" key={r.kind}>
                  <span>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 12,
                        height: 9,
                        borderRadius: 3,
                        background: TILE_COLORS[r.kind],
                        marginRight: 8,
                      }}
                    />
                    {TILE_LABELS[r.kind]}
                  </span>
                  <span className="muted">{r.n}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ------------------------------------------------------------------- play

  const myTurn = eng?.current?.slot === slot && eng?.phase === 'board'
  const canRoll = !!eng && eng.turnPhase === 'idle' && myTurn
  const myFork = eng?.turnPhase === 'fork' && eng.pending?.slot === slot
  const myGate = eng && myTurn ? eng.gateFor(slot) : null
  const over = eng?.phase === 'over'
  const standings = eng?.standings() ?? []

  return (
    <div>
      <div className="gamehead">
        <h2>Party Parade</h2>
        <span className="chip">Round {eng?.round ?? 1}</span>
        <span className="chip chip--gold">
          {over
            ? `${eng?.playerAt(eng.winner ?? -1)?.name ?? 'Somebody'} wins`
            : eng?.current
              ? myTurn
                ? 'Your roll'
                : `${eng.current.name} to roll`
              : 'Waiting'}
        </span>
        <div className="spacer" />
        <button className="btn btn--ghost btn--sm" onClick={() => setScreen('lobby')}>
          Leave the parade
        </button>
      </div>

      <div className="stage-wrap" ref={fullscreen.ref}>
        <button
          type="button"
          className="btn btn--ghost btn--sm stage-wrap__fullscreen"
          onClick={fullscreen.toggle}
        >
          {fullscreen.active ? 'Exit fullscreen' : 'Fullscreen'}
        </button>
        <canvas
          ref={canvasRef}
          className="stage"
          style={{
            width: '100%',
            height: 'auto',
            aspectRatio: `${VIEW_W} / ${VIEW_H}`,
            cursor: drawing ? 'crosshair' : 'grab',
            touchAction: 'none',
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />

        <div className="stage-ctl stage-ctl--tools">
          <button
            type="button"
            className={`btn btn--sm ${drawing ? '' : 'btn--ghost'}`}
            onClick={() => setDrawing((d) => !d)}
          >
            {drawing ? 'Drawing' : 'Draw'}
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={clearMyInk}>
            Rub out
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={findMe}>
            Find me
          </button>
        </div>

        <div className="stage-ctl stage-ctl--roll">
          {myFork ? (
            <>
              <button type="button" className="btn btn--sm" onClick={() => chooseRoute(true)}>
                Take the causeway
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => chooseRoute(false)}>
                Keep to the road
              </button>
            </>
          ) : (
            !over && (
              <button type="button" className="btn" disabled={!canRoll} onClick={rollDie}>
                {canRoll ? 'Roll the die' : eng?.turnPhase === 'idle' ? 'Not your turn' : 'Rolling...'}
              </button>
            )
          )}
        </div>
      </div>

      <div className="infogrid">
        <div className="panel">
          <div className="panel__title">{over ? 'Final standings' : 'The run'}</div>
          {myGate && (
            <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
              You are in front at a checkpoint - you need to {GATE_TEXT[myGate.rule]} to get through.
            </p>
          )}
          <div style={{ display: 'grid', gap: 6 }}>
            {standings.map((p) => (
              <div className="keyrow" key={p.slot}>
                <span style={{ color: p.color }}>
                  {p.slot === eng?.current?.slot && !over ? '> ' : ''}
                  {p.name}
                  {p.slot === slot ? ' (you)' : ''}
                  {p.tookShortcut ? ' *' : ''}
                </span>
                <span className="muted">
                  {p.finished
                    ? `finished #${p.rank}`
                    : p.tileIndex === TREASURE_INDEX
                      ? 'at the treasure'
                      : `${distanceToGoal(p.tileIndex)} to go`}
                  {p.skipTurns > 0 ? ' - stuck' : ''}
                </span>
              </div>
            ))}
          </div>
          <p className="muted" style={{ marginTop: 10, fontSize: 12 }}>
            * took the causeway. Space rolls, F finds you again. Drag the board to look around.
          </p>
        </div>

        <div className="panel">
          <div className="panel__title">The course</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {kindCounts.map((r) => (
              <div className="keyrow" key={r.kind}>
                <span>
                  <span
                    style={{
                      display: 'inline-block',
                      width: 12,
                      height: 9,
                      borderRadius: 3,
                      background: TILE_COLORS[r.kind],
                      marginRight: 8,
                    }}
                  />
                  {TILE_LABELS[r.kind]}
                </span>
                <span className="muted">{r.n}</span>
              </div>
            ))}
          </div>
          <p className="muted" style={{ marginTop: 10, fontSize: 12 }}>
            The three checkpoints only stop whoever is in front: they have to roll an odd number, an even
            one, then above a five to get through. Everybody behind walks straight past.
          </p>
        </div>

        <ControlsSettings
          title="Controls"
          resetPrefix="partyparade"
          groups={[
            {
              title: 'Turn',
              rows: [
                { key: 'partyparade.roll', label: 'Roll the die', fallback: 'Space' },
                { key: 'partyparade.find', label: 'Find my pawn', fallback: 'KeyF' },
              ],
            },
          ]}
        />
      </div>
    </div>
  )
}
