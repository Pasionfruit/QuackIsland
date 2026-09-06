import { useCallback, useEffect, useRef, useState } from 'react'
import { ControlsSettings } from '../../components/ControlsSettings'
import { codeFor } from '../../lib/controls'
import { fitScene } from '../../lib/draw'
import { useFullscreen } from '../../lib/fullscreen'
import { NetClient, defaultServerUrl } from '../../net/client'
import { normalizeCode, type HidePayload, type PeerInfo } from '../../net/protocol'
import { HideEngine, type HideInput } from './engine/engine'
import { HIDE_MAPS, hideMapById } from './engine/maps'
import { drawEndCard, drawHud, renderFirstPerson } from './engine/render'
import { VIEW_H, VIEW_W } from './engine/types'

/**
 * Hide & Seek: Mario Chase in first person.
 *
 * WASD only - A and D turn, W and S walk - because nothing here needs a
 * mouse. The host runs the chase and broadcasts it; guests send their turn
 * and move state a few times a second, same authority split as the other
 * three games. Only the runner's client draws the minimap; everyone else
 * only ever sees what is in front of them, plus a bar for how many feet away
 * the runner is.
 */

const net = new NetClient()
type Screen = 'lobby' | 'play'
type Role = 'solo' | 'host' | 'guest'

export function HidePanel() {
  const [screen, setScreen] = useState<Screen>('lobby')
  const [role, setRole] = useState<Role>('solo')
  const [status, setStatus] = useState('idle')
  const [detail, setDetail] = useState('')
  const [code, setCode] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [name, setName] = useState('Player')
  const [mapId, setMapId] = useState(HIDE_MAPS[0].id)
  const [peers, setPeers] = useState<PeerInfo[]>([])
  const [slot, setSlot] = useState(0)
  const [runnerSlot, setRunnerSlot] = useState(0)
  const [, setTick] = useState(0)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const engineRef = useRef<HideEngine | null>(null)
  const roleRef = useRef<Role>('solo')
  roleRef.current = role
  const slotRef = useRef(0)
  slotRef.current = slot
  const runnerSlotRef = useRef(0)
  runnerSlotRef.current = runnerSlot
  const inputRef = useRef<HideInput>({ turn: 0, move: 0 })
  const keysRef = useRef({ w: false, a: false, s: false, d: false })
  const prevPhase = useRef('lobby')
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
      onPeers: (players) => {
        setPeers(players)
        const eng = engineRef.current
        if (eng && roleRef.current === 'host') {
          for (const p of players) eng.addPlayer(p.slot, p.name, p.slot === runnerSlotRef.current ? 'runner' : 'chaser')
          for (const t of [...eng.players]) {
            if (!players.some((p) => p.slot === t.slot)) eng.removePlayer(t.slot)
          }
        }
      },
      onPayload: (payload, from) => {
        const msg = payload as HidePayload
        if (!msg) return
        if (roleRef.current === 'host') {
          const eng = engineRef.current
          if (msg.k === 'input') eng?.setInput(from, msg.i)
          else if (msg.k === 'pickRunner') setRunnerSlot(msg.slot)
          return
        }
        if (msg.k === 'start') {
          const eng = new HideEngine({ players: 0, mapId: msg.mapId })
          setRunnerSlot(msg.runnerSlot)
          setMapId(msg.mapId)
          engineRef.current = eng
          setScreen('play')
        } else if (msg.k === 'snap') {
          engineRef.current?.applySnapshot(msg.s as ReturnType<HideEngine['snapshot']>)
        } else if (msg.k === 'pickMap') {
          setMapId(msg.mapId)
        }
      },
    })
    return () => net.close()
  }, [])

  const beginMatch = useCallback(() => {
    const eng = new HideEngine({ players: 0, mapId })
    if (role === 'solo') {
      eng.addPlayer(0, 'You', 'runner')
    } else {
      for (const p of peers) eng.addPlayer(p.slot, p.name, p.slot === runnerSlot ? 'runner' : 'chaser')
    }
    eng.start()
    engineRef.current = eng
    setScreen('play')
    if (role === 'host') net.send({ k: 'start', mapId, runnerSlot } satisfies HidePayload)
  }, [role, peers, mapId, runnerSlot])

  const pickMap = (id: string) => {
    if (role !== 'host' && role !== 'solo') return
    setMapId(id)
    if (role === 'host') net.send({ k: 'pickMap', mapId: id } satisfies HidePayload)
  }

  const pickRunner = (targetSlot: number) => {
    if (role === 'host' || role === 'solo') setRunnerSlot(targetSlot)
    else net.send({ k: 'pickRunner', slot: targetSlot } satisfies HidePayload)
  }

  // ----------------------------------------------------------------- input

  useEffect(() => {
    if (screen !== 'play') return
    const codes = {
      w: codeFor('hide.forward', 'KeyW'),
      a: codeFor('hide.turnLeft', 'KeyA'),
      s: codeFor('hide.backward', 'KeyS'),
      d: codeFor('hide.turnRight', 'KeyD'),
    }
    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      const k = keysRef.current
      if (e.code === codes.w) k.w = down
      else if (e.code === codes.a) k.a = down
      else if (e.code === codes.s) k.s = down
      else if (e.code === codes.d) k.d = down
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
      inputRef.current.turn = (k.d ? 1 : 0) - (k.a ? 1 : 0)
      inputRef.current.move = (k.w ? 1 : 0) - (k.s ? 1 : 0)

      while (acc >= TICK) {
        acc -= TICK
        if (roleRef.current === 'guest') {
          eng.frame++
        } else {
          eng.setInput(slotRef.current, { ...inputRef.current })
          eng.step()
        }
      }

      if (roleRef.current === 'host') {
        sinceSend++
        if (sinceSend >= 3) {
          sinceSend = 0
          net.send({ k: 'snap', s: eng.snapshot() } satisfies HidePayload)
        }
      } else if (roleRef.current === 'guest') {
        sinceSend++
        if (sinceSend >= 2) {
          sinceSend = 0
          net.send({ k: 'input', i: { ...inputRef.current } } satisfies HidePayload)
        }
      }

      if (prevPhase.current !== eng.phase) {
        prevPhase.current = eng.phase
        setTick((t) => t + 1)
      }

      const viewer = eng.players.find((p) => p.slot === slotRef.current)
      if (viewer) {
        renderFirstPerson(ctx, eng, viewer)
        if (eng.phase === 'over') drawEndCard(ctx, eng, viewer)
        else drawHud(ctx, eng, viewer)
      } else {
        ctx.fillStyle = '#14120f'
        ctx.fillRect(0, 0, VIEW_W, VIEW_H)
      }
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [screen])

  const eng = engineRef.current
  const map = hideMapById(mapId)

  // ------------------------------------------------------------------ lobby

  if (screen === 'lobby') {
    const roster: { slot: number; name: string }[] =
      role === 'solo' ? [{ slot: 0, name: 'You' }] : peers

    return (
      <div>
        <div className="gamehead">
          <h2>Hide &amp; Seek</h2>
          <span className="chip chip--live">
            <span className="dot" /> Playable
          </span>
          <span className="chip">First person chase</span>
          <span className="chip">3-8 players</span>
        </div>

        <div className="infogrid">
          <div className="panel">
            <div className="panel__title">One runner, everyone else chasing</div>
            <p className="muted" style={{ marginTop: 0 }}>
              W/S to walk, A/D to turn. The runner sees the whole map and everyone on it; a chaser
              only sees what is in front of them, plus a bar for how close they are. Survive 3:30 to
              win as the runner - touch them to win as a chaser. A star appears halfway through the
              clock: forty seconds of shrugging chasers off instead of running from them.
            </p>
            <div className="chiprow" style={{ marginTop: 10 }}>
              <button className="btn" onClick={beginMatch}>
                Play solo (practice)
              </button>
              <button
                className="btn btn--ghost"
                onClick={() => net.host(defaultServerUrl(), name, 'hide-and-seek', 8)}
              >
                Host a chase
              </button>
            </div>
            <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
              <label className="fighter__title">Your name</label>
              <input className="input" value={name} maxLength={16} onChange={(e) => setName(e.target.value)} />
              <label className="fighter__title">Join a chase</label>
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
            <div className="panel__title">The chase</div>
            {code ? (
              <>
                <p style={{ marginTop: 0 }}>
                  Room code <strong style={{ fontSize: 20 }}>{code}</strong>
                </p>
                <div style={{ display: 'grid', gap: 6 }}>
                  {roster.map((p) => (
                    <div key={p.slot} className="keyrow">
                      <span>
                        {p.name}
                        {p.slot === runnerSlot ? ' · Runner' : ''}
                      </span>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        disabled={p.slot === runnerSlot}
                        onClick={() => pickRunner(p.slot)}
                      >
                        {p.slot === slot ? 'Be the runner' : 'Make runner'}
                      </button>
                    </div>
                  ))}
                </div>
                {role === 'host' && (
                  <button className="btn" style={{ marginTop: 12 }} onClick={beginMatch}>
                    Start the chase ({peers.length || 1})
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
                Host a chase to get a four-letter code, or join one somebody read out to you. Up to
                eight players - three or more makes an actual chase.
              </p>
            )}
          </div>

          <div className="panel">
            <div className="panel__title">Map</div>
            <div style={{ display: 'grid', gap: 6 }}>
              {HIDE_MAPS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`btn btn--sm ${m.id === mapId ? '' : 'btn--ghost'}`}
                  style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                  onClick={() => pickMap(m.id)}
                  disabled={role === 'guest'}
                >
                  {m.name}
                </button>
              ))}
            </div>
            <p className="muted" style={{ marginTop: 10, fontSize: 12 }}>
              {map.theme} Four sections, each its own colour, and a {map.interactiveName} to lean on.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ------------------------------------------------------------------- play

  return (
    <div>
      <div className="gamehead">
        <h2>Hide &amp; Seek</h2>
        <span className="chip">{map.name}</span>
        <div className="spacer" />
        <button className="btn btn--ghost btn--sm" onClick={() => setScreen('lobby')}>
          Leave the chase
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
        <ControlsSettings
          title="Controls"
          resetPrefix="hide"
          groups={[
            {
              title: 'Movement',
              rows: [
                { key: 'hide.forward', label: 'Walk forward', fallback: 'KeyW' },
                { key: 'hide.backward', label: 'Walk backward', fallback: 'KeyS' },
                { key: 'hide.turnLeft', label: 'Turn left', fallback: 'KeyA' },
                { key: 'hide.turnRight', label: 'Turn right', fallback: 'KeyD' },
              ],
            },
          ]}
        />
        <div className="panel">
          <div className="panel__title">In the chase</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {eng?.players.map((p) => (
              <div className="keyrow" key={p.slot}>
                <span style={{ color: p.role === 'runner' ? '#e0794f' : '#4f8fbf' }}>
                  {p.name}
                  {p.role === 'runner' ? ' · Runner' : ''}
                </span>
                <span>{p.invincibleFrames > 0 ? 'invincible' : ''}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="panel__title">This chase</div>
          {eng?.phase === 'over' && (
            <>
              <p style={{ marginTop: 0 }}>
                {eng.winner === 'runner' ? 'The runner survived the clock.' : 'The runner was caught.'}
              </p>
              <button className="btn" onClick={beginMatch}>
                Run it again
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
