import { useEffect, useRef, useState } from 'react'
import { codeFor } from '../../lib/controls'
import { ControlsSettings } from '../../components/ControlsSettings'
import { fitScene } from '../../lib/draw'
import { useFullscreen } from '../../lib/fullscreen'
import { NetClient, defaultServerUrl } from '../../net/client'
import { normalizeCode, type PartyParadePayload, type PeerInfo } from '../../net/protocol'
import { BOARD_TILES, ISLANDS, TILE_COUNT, WORLD_H, WORLD_W, type TileKind } from './engine/board'
import { PARADE_CAST, PLAYER_COLORS, PartyParadeEngine, VIEW_H, VIEW_W } from './engine/engine'
import { TILE_COLORS, TILE_LABELS, drawBoard, drawChrome, drawPawns, pawnSpot, type Camera } from './render'

/**
 * Party Parade: a lap of the islands, a die, and whatever the space you land
 * on decides to do about it.
 *
 * The board and the die are in. What the coloured spaces actually do to you,
 * and the minigames between rounds, are still to come.
 *
 * The host owns the die and the walk and broadcasts snapshots; a guest sends
 * "roll" and renders whatever arrived, carrying only the walk animation
 * forward locally between snapshots so a hop does not stutter.
 */

const net = new NetClient()
type Screen = 'lobby' | 'play'
type Role = 'solo' | 'host' | 'guest'

const KIND_ORDER: TileKind[] = ['start', 'plain', 'good', 'bad', 'hostile']

/** How quickly the camera catches up with whoever is up. */
const CAM_EASE = 0.08

function CastPicker({
  value,
  taken,
  onPick,
}: {
  value: number
  taken: Set<number>
  onPick: (i: number) => void
}) {
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
  /** Lobby choices, slot -> index into PARADE_CAST. The host is the one that keeps score. */
  const [picks, setPicks] = useState<Record<number, number>>({ 0: 0 })
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
  const camRef = useRef<Camera>({ x: WORLD_W / 2, y: WORLD_H / 2, zoom: 1 })
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
        // Give anyone who has not chosen a default animal, so a roster is
        // never half-empty while people are still arriving.
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

        if (roleRef.current === 'host') {
          const eng = engineRef.current
          switch (msg.k) {
            case 'roll':
              eng?.roll(from)
              break
            case 'pick':
              if (eng) {
                eng.setCast(from, msg.castIndex)
              } else {
                setPicks((prev) => {
                  const clash = Object.entries(prev).some(
                    ([s, c]) => Number(s) !== from && c === msg.castIndex,
                  )
                  if (clash) return prev
                  const next = { ...prev, [from]: msg.castIndex }
                  net.send({ k: 'picks', map: Object.entries(next).map(([s, c]) => [Number(s), c]) } satisfies PartyParadePayload)
                  return next
                })
              }
              break
            default:
              break
          }
          return
        }

        if (msg.k === 'start') {
          engineRef.current = buildEngine(msg.roster)
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
    // Start the camera on the field rather than sliding in from the middle.
    const first = BOARD_TILES[0]
    camRef.current = { x: first.x, y: first.y, zoom: 1 }
    setScreen('play')
    if (role === 'host') net.send({ k: 'start', roster } satisfies PartyParadePayload)
  }

  function pickCast(i: number): void {
    const eng = engineRef.current
    if (eng && screen === 'play') {
      if (roleRef.current === 'guest') net.send({ k: 'pick', castIndex: i } satisfies PartyParadePayload)
      else eng.setCast(slotRef.current, i)
      setTick((t) => t + 1)
      return
    }
    if (roleRef.current === 'guest') {
      net.send({ k: 'pick', castIndex: i } satisfies PartyParadePayload)
      return
    }
    setPicks((prev) => {
      const mine = slotRef.current
      if (Object.entries(prev).some(([s, c]) => Number(s) !== mine && c === i)) return prev
      const next = { ...prev, [mine]: i }
      if (roleRef.current === 'host') {
        net.send({ k: 'picks', map: Object.entries(next).map(([s, c]) => [Number(s), c]) } satisfies PartyParadePayload)
      }
      return next
    })
  }

  function rollDie(): void {
    const eng = engineRef.current
    if (!eng || eng.turnPhase !== 'idle') return
    if (eng.current?.slot !== slotRef.current) return
    if (roleRef.current === 'guest') net.send({ k: 'roll' } satisfies PartyParadePayload)
    else eng.roll(slotRef.current)
    setTick((t) => t + 1)
  }

  // ------------------------------------------------------------------ input

  useEffect(() => {
    if (screen !== 'play') return
    const rollKey = codeFor('partyparade.roll', 'Space')
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      if (e.code !== rollKey) return
      e.preventDefault()
      rollDie()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [screen])

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
    let lastPhase = ''

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
        // Only worth sending while something is actually moving.
        const busy = eng.turnPhase !== 'idle'
        if (roleRef.current === 'host' && sinceSend >= (busy ? 3 : 20)) {
          sinceSend = 0
          net.send({ k: 'snap', s: eng.snapshot() } satisfies PartyParadePayload)
        }
      }

      // The camera rides with whoever is up, so a 180-space board still reads.
      const focus = eng.current
      if (focus) {
        const spot = pawnSpot(eng, focus)
        const cam = camRef.current
        cam.x += (spot.x - cam.x) * CAM_EASE
        cam.y += (spot.y - cam.y) * CAM_EASE
      }

      drawBoard(ctx, frame, camRef.current)
      drawPawns(ctx, eng, frame, slotRef.current, camRef.current)
      drawChrome(ctx, eng, slotRef.current, frame, camRef.current)

      const key = `${eng.turnPhase}:${eng.turnIndex}`
      if (key !== lastPhase) {
        lastPhase = key
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
  const roster: { slot: number; name: string }[] = role === 'solo' ? [{ slot: 0, name: name || 'You' }] : peers

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
              {TILE_COUNT} spaces in one loop across {ISLANDS.length} islands, joined by bridges. Take turns
              round the circuit; the camera follows whoever is up.
            </p>
            <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
              The board and the die are in. What the coloured spaces do to you, and the minigames between
              rounds, are still being built.
            </p>
            <div className="chiprow" style={{ marginTop: 12 }}>
              <button className="btn" onClick={beginMatch}>
                Walk the board (solo)
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
              One each - anybody already spoken for is greyed out. You can swap during the match too.
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
                  {roster.map((p) => (
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
        </div>
      </div>
    )
  }

  // ------------------------------------------------------------------- play

  const me = eng?.playerAt(slot)
  const myTurn = eng?.current?.slot === slot
  const canRoll = !!eng && eng.turnPhase === 'idle' && myTurn
  const takenInMatch = new Set((eng?.players ?? []).filter((p) => p.slot !== slot).map((p) => p.castIndex))

  return (
    <div>
      <div className="gamehead">
        <h2>Party Parade</h2>
        <span className="chip">Round {eng?.round ?? 1}</span>
        <span className="chip chip--gold">
          {eng?.current ? (myTurn ? 'Your roll' : `${eng.current.name} to roll`) : 'Waiting'}
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
          style={{ width: '100%', height: 'auto', aspectRatio: `${VIEW_W} / ${VIEW_H}` }}
        />
      </div>

      <div className="infogrid">
        <div className="panel">
          <div className="panel__title">{myTurn ? 'Your turn' : 'The turn'}</div>
          <div className="chiprow" style={{ marginTop: 0 }}>
            <button className="btn" disabled={!canRoll} onClick={rollDie}>
              {canRoll ? 'Roll the die' : eng?.turnPhase === 'idle' ? 'Not your turn' : 'Rolling...'}
            </button>
            <span className="muted" style={{ fontSize: 12 }}>
              Space rolls too.
            </span>
          </div>
          <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
            {(eng?.players ?? []).map((p) => (
              <div className="keyrow" key={p.slot}>
                <span style={{ color: p.color }}>
                  {p.slot === eng?.current?.slot ? '> ' : ''}
                  {p.name}
                  {p.slot === slot ? ' (you)' : ''}
                </span>
                <span className="muted">
                  space {p.tileIndex + 1}
                  {p.laps > 0 ? ` - lap ${p.laps + 1}` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel__title">Swap your animal</div>
          <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
            Purely cosmetic, so change it whenever you like - just not to one somebody else is already
            using.
          </p>
          <CastPicker value={me?.castIndex ?? 0} taken={takenInMatch} onPick={pickCast} />
        </div>

        <div className="panel">
          <div className="panel__title">What the spaces mean</div>
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
            Landing on a coloured space will do something about it in a later build.
          </p>
        </div>

        <ControlsSettings
          title="Controls"
          resetPrefix="partyparade"
          groups={[{ title: 'Turn', rows: [{ key: 'partyparade.roll', label: 'Roll the die', fallback: 'Space' }] }]}
        />
      </div>
    </div>
  )
}
