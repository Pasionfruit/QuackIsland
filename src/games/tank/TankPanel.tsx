import { useCallback, useEffect, useRef, useState } from 'react'
import { fitScene } from '../../lib/draw'
import { NetClient, defaultServerUrl } from '../../net/client'
import { normalizeCode, type PeerInfo, type TankPayload } from '../../net/protocol'
import { play } from '../duck/audio'
import { PLAYER_COLORS, TankEngine, type TankInput } from './engine/engine'
import { drawAimLine, renderMatch } from './engine/render'
import { VIEW_H, VIEW_W } from './engine/types'

/**
 * Tank Trouble.
 *
 * WASD to move, mouse to aim, left click to fire, right click to drop a mine.
 * The host runs the maze and broadcasts it; guests send their live input
 * state a few times a second and the host applies it directly - trigger
 * cooldowns and bullet caps are all enforced host-side, same authority split
 * as Smash and Duck szn.
 */

const net = new NetClient()
type Screen = 'lobby' | 'play'
type Role = 'solo' | 'host' | 'guest'

export function TankPanel() {
  const [screen, setScreen] = useState<Screen>('lobby')
  const [role, setRole] = useState<Role>('solo')
  const [status, setStatus] = useState('idle')
  const [detail, setDetail] = useState('')
  const [code, setCode] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [name, setName] = useState('Tank')
  const [colorIndex, setColorIndex] = useState(0)
  const [peers, setPeers] = useState<PeerInfo[]>([])
  const [slot, setSlot] = useState(0)
  const [, setTick] = useState(0)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const engineRef = useRef<TankEngine | null>(null)
  const roleRef = useRef<Role>('solo')
  roleRef.current = role
  const slotRef = useRef(0)
  slotRef.current = slot
  const inputRef = useRef<TankInput>({ moveX: 0, moveY: 0, aimX: VIEW_W / 2, aimY: VIEW_H / 2, fire: false, mine: false })
  const keysRef = useRef({ w: false, a: false, s: false, d: false })
  /** Colours guests have picked, keyed by slot - the host applies these when
   *  the match actually starts, so a peer never gets stuck with the default. */
  const peerColorsRef = useRef(new Map<number, string>())
  const prevPhase = useRef('lobby')

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
          for (const p of players) eng.addPlayer(p.slot, p.name, peerColorsRef.current.get(p.slot))
          for (const t of [...eng.tanks]) {
            if (t.slot >= 0 && !players.some((p) => p.slot === t.slot)) eng.removePlayer(t.slot)
          }
        }
      },
      onPayload: (payload, from) => {
        const msg = payload as TankPayload
        const eng = engineRef.current
        if (!msg || !eng) return
        if (roleRef.current === 'host') {
          if (msg.k === 'input') eng.setInput(from, msg.i)
          else if (msg.k === 'color') peerColorsRef.current.set(from, msg.color)
        } else if (msg.k === 'snap') {
          eng.applySnapshot(msg.s as ReturnType<TankEngine['snapshot']>)
        } else if (msg.k === 'start') {
          setScreen('play')
        }
      },
    })
    return () => net.close()
  }, [])

  useEffect(() => {
    if (role === 'guest') net.send({ k: 'color', color: PLAYER_COLORS[colorIndex] } satisfies TankPayload)
  }, [role, colorIndex])

  const beginMatch = useCallback(() => {
    const eng = new TankEngine({ players: 0 })
    if (role === 'solo') {
      eng.addPlayer(0, 'You', PLAYER_COLORS[colorIndex])
    } else {
      for (const p of peers) {
        if (p.slot === slot) continue
        eng.addPlayer(p.slot, p.name, peerColorsRef.current.get(p.slot))
      }
      eng.addPlayer(slot, name, PLAYER_COLORS[colorIndex])
    }
    eng.start()
    engineRef.current = eng
    setScreen('play')
    if (role === 'host') net.send({ k: 'start' } satisfies TankPayload)
  }, [role, peers, slot, name, colorIndex])

  // ----------------------------------------------------------------- input

  useEffect(() => {
    if (screen !== 'play') return
    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      const k = keysRef.current
      if (e.code === 'KeyW') k.w = down
      else if (e.code === 'KeyA') k.a = down
      else if (e.code === 'KeyS') k.s = down
      else if (e.code === 'KeyD') k.d = down
      else return
      e.preventDefault()
    }
    const kd = onKey(true)
    const ku = onKey(false)
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    return () => {
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
    }
  }, [screen])

  const toView = (e: { clientX: number; clientY: number }) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: VIEW_W / 2, y: VIEW_H / 2 }
    const box = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - box.left) / box.width) * VIEW_W,
      y: ((e.clientY - box.top) / box.height) * VIEW_H,
    }
  }

  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const at = toView(e)
    inputRef.current.aimX = at.x
    inputRef.current.aimY = at.y
  }
  const onDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    if (e.button === 2) inputRef.current.mine = true
    else inputRef.current.fire = true
  }
  const onUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 2) inputRef.current.mine = false
    else inputRef.current.fire = false
  }

  // ------------------------------------------------------------------ loop

  useEffect(() => {
    if (screen !== 'play') return
    const canvas = canvasRef.current
    if (!canvas) return
    let ctx = fitScene(canvas, VIEW_W, VIEW_H)
    let raf = 0
    let last = performance.now()
    let acc = 0
    let sinceSend = 0
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

      const k = keysRef.current
      inputRef.current.moveX = (k.d ? 1 : 0) - (k.a ? 1 : 0)
      inputRef.current.moveY = (k.s ? 1 : 0) - (k.w ? 1 : 0)

      while (acc >= TICK) {
        acc -= TICK
        if (roleRef.current === 'guest') {
          eng.frame++
        } else {
          eng.setInput(slotRef.current, { ...inputRef.current })
          const before = eng.phase
          eng.step()
          for (const ev of eng.drainEvents()) {
            if (ev.kind === 'shot') play('shot')
            else if (ev.kind === 'explode') play('burst')
          }
          if (before !== eng.phase) play('ding')
        }
      }

      if (roleRef.current === 'host') {
        sinceSend++
        if (sinceSend >= 3) {
          sinceSend = 0
          net.send({ k: 'snap', s: eng.snapshot() } satisfies TankPayload)
        }
      } else if (roleRef.current === 'guest') {
        sinceSend++
        if (sinceSend >= 2) {
          sinceSend = 0
          net.send({ k: 'input', i: { ...inputRef.current } } satisfies TankPayload)
        }
      }

      if (prevPhase.current !== eng.phase) {
        prevPhase.current = eng.phase
        setTick((t) => t + 1)
      }
      renderMatch(ctx, eng)
      const me = eng.tanks.find((t) => t.slot === slotRef.current)
      if (me && me.alive) {
        drawAimLine(ctx, me.x, me.y, inputRef.current.aimX, inputRef.current.aimY, me.color)
      }
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [screen])

  const eng = engineRef.current

  if (screen === 'lobby') {
    return (
      <div>
        <div className="gamehead">
          <h2>Tank Trouble</h2>
          <span className="chip chip--live">
            <span className="dot" /> Playable
          </span>
          <span className="chip">Top-down arena</span>
          <span className="chip">1-8 players</span>
        </div>

        <div className="infogrid">
          <div className="panel">
            <div className="panel__title">Into the pit</div>
            <p className="muted" style={{ marginTop: 0 }}>
              WASD to move, mouse to aim and shoot, right click to drop a mine. Twenty levels of
              sentry tanks, one life each per level - if everybody falls, the run ends; if anyone
              is still standing when the maze is clear, you move on.
            </p>
            <div className="chiprow" style={{ marginTop: 10 }}>
              <button className="btn" onClick={beginMatch}>
                Play solo
              </button>
              <button
                className="btn btn--ghost"
                onClick={() => net.host(defaultServerUrl(), name, 'tank-trouble', 8)}
              >
                Host a pit
              </button>
            </div>
            <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
              <label className="fighter__title">Your name</label>
              <input className="input" value={name} maxLength={16} onChange={(e) => setName(e.target.value)} />
              <label className="fighter__title">Your tank colour</label>
              <div className="chiprow">
                {PLAYER_COLORS.map((c, i) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColorIndex(i)}
                    title={`Tank colour ${i + 1}`}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 999,
                      background: c,
                      border: i === colorIndex ? '2px solid var(--ink, #222)' : '2px solid transparent',
                      boxShadow: i === colorIndex ? '0 0 0 2px rgba(255,255,255,0.6) inset' : 'none',
                      cursor: 'pointer',
                    }}
                  />
                ))}
              </div>
              <label className="fighter__title">Join a pit</label>
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
            <div className="panel__title">The pit</div>
            {code ? (
              <>
                <p style={{ marginTop: 0 }}>
                  Room code <strong style={{ fontSize: 20 }}>{code}</strong>
                </p>
                <div style={{ display: 'grid', gap: 6 }}>
                  {peers.map((p) => (
                    <div key={p.slot} className="keyrow">
                      <span>{p.name}</span>
                      <span className="muted">{p.slot === 0 ? 'host' : `tank ${p.slot + 1}`}</span>
                    </div>
                  ))}
                </div>
                {role === 'host' && (
                  <button className="btn" style={{ marginTop: 12 }} onClick={beginMatch}>
                    Start the run ({peers.length || 1})
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
                Host a pit to get a four-letter code, or join one somebody read out to you. Up to
                eight tanks. Run <code>npm run dev:all</code> so the relay is up.
              </p>
            )}
          </div>

          <div className="panel">
            <div className="panel__title">Rules of the pit</div>
            <ul className="muted" style={{ marginTop: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
              <li>Five bouncing shells in the air at once, no more.</li>
              <li>Mines arm after a beat - yours can still catch you.</li>
              <li>One hit and a tank is out for the level, no exceptions.</li>
              <li>Fresh maze, more sentries, faster shots - every level.</li>
            </ul>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="gamehead">
        <h2>Tank Trouble</h2>
        <span className="chip">Level {eng?.level ?? 1} / 20</span>
        <div className="spacer" />
        <button className="btn btn--ghost btn--sm" onClick={() => setScreen('lobby')}>
          Leave the pit
        </button>
      </div>

      <div className="stage-wrap">
        <canvas
          ref={canvasRef}
          className="stage"
          style={{ width: '100%', height: 'auto', aspectRatio: `${VIEW_W} / ${VIEW_H}`, cursor: 'crosshair' }}
          onMouseMove={onMove}
          onMouseDown={onDown}
          onMouseUp={onUp}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>

      <div className="infogrid">
        <div className="panel">
          <div className="panel__title">Tanks</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {eng?.players.map((p) => (
              <div className="keyrow" key={p.slot}>
                <span style={{ color: p.color }}>{p.name}</span>
                <span>{p.alive ? 'in the fight' : 'out this level'}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="panel__title">Controls</div>
          <div className="keys">
            <div className="keyrow">
              <span>Move</span>
              <kbd>W A S D</kbd>
            </div>
            <div className="keyrow">
              <span>Aim / fire</span>
              <kbd>Mouse / Left click</kbd>
            </div>
            <div className="keyrow">
              <span>Drop a mine</span>
              <kbd>Right click</kbd>
            </div>
          </div>
        </div>
        <div className="panel">
          <div className="panel__title">This run</div>
          {(eng?.phase === 'over' || eng?.phase === 'victory') && (
            <button className="btn" onClick={beginMatch}>
              Run it again
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
