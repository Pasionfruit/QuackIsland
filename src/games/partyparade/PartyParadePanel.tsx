import { useEffect, useRef, useState } from 'react'
import { fitScene } from '../../lib/draw'
import { useFullscreen } from '../../lib/fullscreen'
import { NetClient, defaultServerUrl } from '../../net/client'
import { normalizeCode, type PartyParadePayload, type PeerInfo } from '../../net/protocol'
import { BOARD_TILES, ISLANDS, type TileKind } from './engine/board'
import { PARADE_CAST, PLAYER_COLORS, PartyParadeEngine, VIEW_H, VIEW_W } from './engine/engine'
import { TILE_COLORS, TILE_LABELS, drawBoard, drawPawns } from './render'

/**
 * Party Parade: a lap of the islands, a die, and whatever the tile you land
 * on decides to do about it.
 *
 * This is the board itself - the map, the loop, and the cast standing on the
 * start line. The die, moving, what the tiles do, and the minigames between
 * rounds are the phases after this one; the engine and the board data are
 * shaped so those attach rather than replace anything here.
 *
 * The roster comes from the room, not from a config: both the host and every
 * guest build an identical engine from the same server-issued peer list when
 * the match starts, so the opening board needs no snapshot to agree on.
 */

const net = new NetClient()
type Screen = 'lobby' | 'play'
type Role = 'solo' | 'host' | 'guest'

const KIND_ORDER: TileKind[] = ['start', 'plain', 'good', 'bad', 'hostile']

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
  const [, setTick] = useState(0)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const engineRef = useRef<PartyParadeEngine | null>(null)
  const roleRef = useRef<Role>('solo')
  roleRef.current = role
  const slotRef = useRef(0)
  slotRef.current = slot
  const peersRef = useRef<PeerInfo[]>([])
  peersRef.current = peers
  const nameRef = useRef('Player')
  nameRef.current = name
  const fullscreen = useFullscreen<HTMLDivElement>()

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
      },
      onPeers: (players) => setPeers(players),
      onPayload: (payload) => {
        const msg = payload as PartyParadePayload
        if (!msg) return
        if (msg.k === 'start') {
          // A guest builds its own engine from the same roster the host used.
          const eng = new PartyParadeEngine()
          for (const p of peersRef.current) eng.addPlayer(p.slot, p.name)
          engineRef.current = eng
          setScreen('play')
          setTick((t) => t + 1)
        } else if (msg.k === 'snap') {
          engineRef.current?.applySnapshot(msg.s as ReturnType<PartyParadeEngine['snapshot']>)
          setTick((t) => t + 1)
        }
      },
    })
    return () => net.close()
  }, [])

  function beginMatch(): void {
    const eng = new PartyParadeEngine()
    if (role === 'solo') eng.addPlayer(0, nameRef.current || 'You')
    else for (const p of peers) eng.addPlayer(p.slot, p.name)
    engineRef.current = eng
    setScreen('play')
    if (role === 'host') net.send({ k: 'start', config: {} } satisfies PartyParadePayload)
  }

  // ------------------------------------------------------------------ loop

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
    // Nothing is simulated here - the engine has no step(). The loop only
    // paints, so the water moves and the cast keeps breathing.
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const eng = engineRef.current
      if (!eng) return
      frame++
      drawBoard(ctx, frame)
      drawPawns(ctx, eng.players, frame, slotRef.current)
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
              A lap of four islands joined by bridges. Take turns around the loop, land on tiles, then
              everyone drops into a minigame to decide who gets the good stuff.
            </p>
            <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
              This build is the board itself - the map is in, the die is not. Rolling, moving, what the
              tiles do to you and the minigames between rounds are still being built.
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
                      <span className="muted">{PARADE_CAST[p.slot % PARADE_CAST.length].name}</span>
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
                Host to get a four-letter code, or join one somebody read out to you. Everybody gets one of
                the animals, dealt in order, so a full room is eight different faces on the board.
              </p>
            )}
          </div>

          <div className="panel">
            <div className="panel__title">The board</div>
            <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
              {BOARD_TILES.length} spaces in one loop across {ISLANDS.length} islands. Pass the start flag
              and you have done a lap.
            </p>
            <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
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

  return (
    <div>
      <div className="gamehead">
        <h2>Party Parade</h2>
        <span className="chip">{BOARD_TILES.length} spaces</span>
        <span className="chip chip--gold">On the start line</span>
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
          <div className="panel__title">On the board</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {(eng?.players ?? []).map((p) => (
              <div className="keyrow" key={p.slot}>
                <span style={{ color: p.color }}>
                  {p.name}
                  {p.slot === slot ? ' (you)' : ''}
                </span>
                <span className="muted">{PARADE_CAST[p.castIndex % PARADE_CAST.length].name}</span>
              </div>
            ))}
          </div>
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
            Everybody is parked on the start flag until the die exists. Landing on a coloured space will do
            something about it in a later build.
          </p>
        </div>
      </div>
    </div>
  )
}
