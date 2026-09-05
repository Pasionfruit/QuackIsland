import { useCallback, useEffect, useRef, useState } from 'react'
import { fitScene } from '../../lib/draw'
import { useFullscreen } from '../../lib/fullscreen'
import { NetClient, defaultServerUrl } from '../../net/client'
import { normalizeCode, type DuckPayload, type PeerInfo } from '../../net/protocol'
import { play, isMuted, setMuted } from './audio'
import { DuckEngine, STAGES, type DuckSnapshot } from './engine/engine'
import { renderRound } from './engine/render'
import { VIEW_H, VIEW_W, type HitEvent } from './engine/types'

/**
 * Duck szn.
 *
 * One mouse per person, up to eight of them. The host runs the gallery and
 * broadcasts it; everyone else sends where they are pointing and when they
 * pulled the trigger, and the host decides what was hit. That keeps the target
 * spawns and the shared combo authoritative in one place, which matters when
 * eight people are all feeding the same multiplier.
 */

const net = new NetClient()
type Screen = 'lobby' | 'play'
type Role = 'solo' | 'host' | 'guest'

/** Which noise a hit event should make. */
function soundFor(e: HitEvent): Parameters<typeof play>[0] {
  if (e.kind === 'miss') return 'miss'
  if (e.kind === 'mii') return 'penalty'
  if (e.kind === 'duck') return 'ding'
  if (e.kind === 'balloon') return 'pop'
  if (e.kind === 'can') return e.points > 20 ? 'burst' : 'clank'
  if (e.kind === 'ufo') return e.points > 40 ? 'rescue' : 'burst'
  return 'pop'
}

export function DuckPanel() {
  const [screen, setScreen] = useState<Screen>('lobby')
  const [role, setRole] = useState<Role>('solo')
  const [status, setStatus] = useState('idle')
  const [detail, setDetail] = useState('')
  const [code, setCode] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [name, setName] = useState('Shooter')
  const [peers, setPeers] = useState<PeerInfo[]>([])
  const [slot, setSlot] = useState(0)
  const [muted, setMutedState] = useState(isMuted())
  const [tick, setTick] = useState(0)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const engineRef = useRef<DuckEngine | null>(null)
  const roleRef = useRef<Role>('solo')
  roleRef.current = role
  const slotRef = useRef(0)
  slotRef.current = slot
  const aimRef = useRef({ x: VIEW_W / 2, y: VIEW_H / 2 })

  // ----------------------------------------------------------------- netcode

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
      onPeers: (players) => {
        setPeers(players)
        const eng = engineRef.current
        if (eng && roleRef.current === 'host') {
          for (const p of players) eng.addShooter(p.slot, p.name)
          for (const s of [...eng.shooters]) {
            if (!players.some((p) => p.slot === s.slot)) eng.removeShooter(s.slot)
          }
        }
      },
      onPayload: (payload, from) => {
        const msg = payload as DuckPayload
        const eng = engineRef.current
        if (!msg || !eng) return
        if (roleRef.current === 'host') {
          // Guests only ever ask; the host decides.
          if (msg.k === 'aim') eng.aim(from, msg.x, msg.y)
          else if (msg.k === 'shoot') {
            eng.aim(from, msg.x, msg.y)
            eng.shoot(from, msg.x, msg.y)
          }
        } else {
          if (msg.k === 'snap') eng.applySnapshot(msg.s as DuckSnapshot)
          else if (msg.k === 'start') setScreen('play')
        }
      },
    })
    return () => net.close()
  }, [])

  // -------------------------------------------------------------- the round

  const beginRound = useCallback(() => {
    // Online rounds start empty and take their lanes from the room, so the
    // colours line up with the lobby list.
    const eng = new DuckEngine({ players: 0 })
    if (role === 'solo') {
      eng.addShooter(0, 'You')
    } else {
      for (const p of peers) eng.addShooter(p.slot, p.name)
      eng.addShooter(slot, name)
    }
    engineRef.current = eng
    setScreen('play')
    if (role === 'host') net.send({ k: 'start' } satisfies DuckPayload)
  }, [role, peers, slot, name])

  useEffect(() => {
    if (screen !== 'play') return
    const canvas = canvasRef.current
    if (!canvas) return
    let ctx = fitScene(canvas, VIEW_W, VIEW_H)
    let raf = 0
    let last = performance.now()
    let acc = 0
    let sinceSend = 0
    let sinceAim = 0
    const TICK = 1 / 60

    const observer = new ResizeObserver(() => {
      ctx = fitScene(canvas, VIEW_W, VIEW_H)
    })
    observer.observe(canvas)

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      let dt = (now - last) / 1000
      last = now
      if (dt > 0.2) dt = 0.2
      acc += dt

      const eng = engineRef.current
      if (!eng) return

      while (acc >= TICK) {
        acc -= TICK
        if (roleRef.current === 'guest') {
          // Guests do not simulate; they animate what the host sent.
          eng.frame++
        } else {
          eng.aim(slotRef.current, aimRef.current.x, aimRef.current.y)
          eng.step()
          if (eng.barked) play('bark')
          for (const e of eng.drainEvents()) play(soundFor(e))
        }
      }

      if (roleRef.current === 'host') {
        sinceSend++
        if (sinceSend >= 3) {
          sinceSend = 0
          net.send({ k: 'snap', s: eng.snapshot() } satisfies DuckPayload)
        }
      } else if (roleRef.current === 'guest') {
        sinceAim++
        if (sinceAim >= 3) {
          sinceAim = 0
          net.send({ k: 'aim', x: aimRef.current.x, y: aimRef.current.y } satisfies DuckPayload)
        }
      }

      renderRound(ctx, eng)
      setTick((t) => (t + 1) % 1000000)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [screen])

  /** Canvas pixels to view units, so the reticle sits under the pointer. */
  const toView = (e: { clientX: number; clientY: number }) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const box = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - box.left) / box.width) * VIEW_W,
      y: ((e.clientY - box.top) / box.height) * VIEW_H,
    }
  }

  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    aimRef.current = toView(e)
  }

  const onShoot = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const at = toView(e)
    aimRef.current = at
    const eng = engineRef.current
    if (!eng) return
    play('shot')
    if (roleRef.current === 'guest') {
      net.send({ k: 'shoot', x: at.x, y: at.y } satisfies DuckPayload)
      return
    }
    eng.shoot(slotRef.current, at.x, at.y)
  }

  const eng = engineRef.current
  const board = eng ? [...eng.shooters].sort((a, b) => b.score - a.score) : []
  void tick
  const fullscreen = useFullscreen<HTMLDivElement>()

  // ------------------------------------------------------------------ lobby

  if (screen === 'lobby') {
    return (
      <div>
        <div className="gamehead">
          <h2>Duck szn</h2>
          <span className="chip chip--live">
            <span className="dot" /> Playable
          </span>
          <span className="chip">Shooting gallery</span>
          <span className="chip">1-8 players</span>
        </div>

        <div className="infogrid">
          <div className="panel">
            <div className="panel__title">Take a lane</div>
            <p className="muted" style={{ marginTop: 0 }}>
              Five stages, one shared combo. Everybody feeds the same multiplier, and one
              missed shot resets it for the whole range - so it is worth holding fire.
            </p>
            <div className="chiprow" style={{ marginTop: 10 }}>
              <button className="btn" onClick={beginRound}>
                Play solo
              </button>
              <button
                className="btn btn--ghost"
                onClick={() => net.host(defaultServerUrl(), name, 'duck-szn', 8)}
              >
                Host a range
              </button>
            </div>

            <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
              <label className="fighter__title">Your name</label>
              <input
                className="input"
                value={name}
                maxLength={16}
                onChange={(e) => setName(e.target.value)}
              />
              <label className="fighter__title">Join a range</label>
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
            <div className="panel__title">The range</div>
            {code ? (
              <>
                <p style={{ marginTop: 0 }}>
                  Room code <strong style={{ fontSize: 20 }}>{code}</strong>
                </p>
                <div style={{ display: 'grid', gap: 6 }}>
                  {peers.map((p) => (
                    <div key={p.slot} className="keyrow">
                      <span>{p.name}</span>
                      <span className="muted">{p.slot === 0 ? 'host' : `lane ${p.slot + 1}`}</span>
                    </div>
                  ))}
                </div>
                {role === 'host' && (
                  <button className="btn" style={{ marginTop: 12 }} onClick={beginRound}>
                    Start the round ({peers.length || 1})
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
                Host a range to get a four-letter code, or join one somebody read out to you.
                Up to eight lanes. Run <code>npm run dev:all</code> so the relay is up.
              </p>
            )}
          </div>

          <div className="panel">
            <div className="panel__title">The five stages</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {STAGES.map((s, i) => (
                <div key={s.id}>
                  <div className="fighter__name" style={{ fontSize: 13 }}>
                    {i + 1}. {s.name}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {s.brief}
                  </div>
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
        <h2>Duck szn</h2>
        <span className="chip">
          Stage {(eng?.stageIndex ?? 0) + 1} / {eng?.config.stages.length ?? 5}
        </span>
        <span className="chip">{eng?.stage.name}</span>
        <div className="spacer" />
        <button
          className="btn btn--ghost btn--sm"
          onClick={() => {
            const next = !muted
            setMuted(next)
            setMutedState(next)
          }}
        >
          {muted ? 'Sound off' : 'Sound on'}
        </button>
        <button className="btn btn--ghost btn--sm" onClick={() => setScreen('lobby')}>
          Leave the range
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
          style={{ width: '100%', height: 'auto', aspectRatio: `${VIEW_W} / ${VIEW_H}`, cursor: 'none' }}
          onMouseMove={onMove}
          onMouseDown={onShoot}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>

      <div className="infogrid">
        <div className="panel">
          <div className="panel__title">Lane scores</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {board.map((s) => (
              <div className="keyrow" key={s.slot}>
                <span style={{ color: s.color }}>{s.name}</span>
                <span>
                  {s.score}
                  <span className="muted" style={{ marginLeft: 8, fontSize: 11 }}>
                    {s.shots ? Math.round((s.hits / s.shots) * 100) : 0}%
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel__title">How it works</div>
          <ul className="muted" style={{ marginTop: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
            <li>Point with the mouse, click to fire.</li>
            <li>Every hit in a row raises the multiplier. One miss and it is gone.</li>
            <li>The painted faces cost points - leave them alone.</li>
            <li>If the dog barks, a duck is crossing. Ten points flat, combo or no combo.</li>
          </ul>
        </div>

        <div className="panel">
          <div className="panel__title">This stage</div>
          <p style={{ marginTop: 0 }}>{eng?.stage.name}</p>
          <p className="muted">{eng?.stage.brief}</p>
          {eng?.phase === 'over' && (
            <button className="btn" onClick={beginRound}>
              Run it again
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
