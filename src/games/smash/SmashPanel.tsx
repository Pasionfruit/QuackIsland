import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PAL } from '../../art/palette'
import { pine } from '../../art/props'
import { SceneCanvas } from '../../components/SceneCanvas'
import { CONTROL_HINTS, Keyboard, packInput, SMASH_CONTROL_HINTS, unpackInput } from '../../lib/input'
import { fitScene, rect } from '../../lib/draw'
import { useFullscreen } from '../../lib/fullscreen'
import { NetClient, defaultServerUrl } from '../../net/client'
import { normalizeCode, type PeerInfo, type SmashPayload } from '../../net/protocol'
import { PLAYABLE, ROSTER, charById, drawChar, playableId } from './engine/characters'
import { portraitFor } from './portraits'
import { loadSprites } from './sprites'
import { SmashEngine, TICK, type MatchConfig } from './engine/engine'
import { renderMatch } from './engine/render'
import { LAKESIDE_BLUFF, VIEW_H, VIEW_W } from './engine/stage'
import type { CharDef, MoveId } from './engine/types'

const MOVE_INPUT: Record<MoveId, string> = {
  attack: 'ATTACK',
  attackSide: '< or > + ATTACK',
  attackUp: 'UP + ATTACK',
  attackDown: 'DOWN + ATTACK',
  special: 'SPECIAL',
  specialSide: '< or > + SPECIAL',
  specialUp: 'UP + SPECIAL',
  specialDown: 'DOWN + SPECIAL',
}

const STOCK_CHOICES = [1, 2, 3, 5]
const CPU_LEVELS: { value: 1 | 2 | 3; label: string }[] = [
  { value: 1, label: 'Easy' },
  { value: 2, label: 'Normal' },
  { value: 3, label: 'Hard' },
]

type Screen = 'mode' | 'select' | 'play'
type Mode = 'local' | 'online'
type Role = 'host' | 'guest'

// ---------------------------------------------------------------- portraits

/**
 * A fighter's card in the select screen and the "chosen" panel. Every roster
 * member now has a painted portrait (see portraits.ts); the procedural
 * scene - the same rig the arena falls back to when a fighter has no sprite
 * sheet - is the fallback for a fighter that doesn't.
 */
function Portrait({
  def,
  size = 64,
  animate = true,
  scenery = true,
}: {
  def: CharDef
  size?: number
  animate?: boolean
  scenery?: boolean
}) {
  const portrait = portraitFor(def.id)
  if (portrait) {
    return (
      <img
        src={portrait}
        alt={def.name}
        width={size}
        height={size}
        style={{ width: size, height: size, objectFit: 'cover', borderRadius: size >= 72 ? 10 : 6, display: 'block' }}
      />
    )
  }
  return (
    <SceneCanvas
      width={size}
      height={size}
      animate={animate}
      draw={(ctx, frame) => {
        const g = ctx.createLinearGradient(0, 0, 0, size)
        g.addColorStop(0, '#cfe1e4')
        g.addColorStop(1, '#e6e7d3')
        ctx.fillStyle = g
        ctx.fillRect(0, 0, size, size)
        rect(ctx, 0, size * 0.72, size, size * 0.28, PAL.grass)
        rect(ctx, 0, size * 0.72, size, size * 0.05, PAL.grassLit)
        if (scenery) {
          pine(ctx, size * 0.12, size * 0.76, size * 0.3)
          pine(ctx, size * 0.9, size * 0.76, size * 0.24)
        }
        const bob = Math.sin(frame * 0.06) * 0.8
        drawChar(ctx, def, size / 2, size * 0.9 + bob, {
          facing: 1,
          scale: (size * 0.72) / def.height,
          phase: frame,
          shadow: true,
        })
      }}
    />
  )
}

function StatBars({ def }: { def: CharDef }) {
  const rows: [string, number][] = [
    ['PWR', def.stats.power],
    ['SPD', def.stats.speed],
    ['WGT', def.stats.weight],
  ]
  return (
    <div className="bars" style={{ marginTop: 10 }}>
      {rows.map(([label, value]) => (
        <div className="bar" key={label}>
          <span style={{ width: 40 }}>{label}</span>
          <span className="bar__track">
            {[1, 2, 3, 4, 5].map((i) => (
              <span key={i} className={`bar__pip ${i <= value ? 'bar__pip--on' : ''}`} />
            ))}
          </span>
        </div>
      ))}
    </div>
  )
}

function MoveTable({ def }: { def: CharDef }) {
  const ids: MoveId[] = [
    'attack',
    'attackSide',
    'attackUp',
    'attackDown',
    'special',
    'specialSide',
    'specialUp',
    'specialDown',
  ]
  return (
    <table className="moves">
      <thead>
        <tr>
          <th>Input</th>
          <th>Move</th>
          <th>Dmg</th>
          <th>Startup</th>
        </tr>
      </thead>
      <tbody>
        {ids.map((id) => {
          const m = def.moves[id]
          return (
            <tr key={id}>
              <td>{MOVE_INPUT[id]}</td>
              <td className="name">{m.name}</td>
              <td>{m.damage}</td>
              <td>{m.startup}f</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function Slot({
  label,
  color,
  picked,
  onPick,
  subtitle,
  locked,
}: {
  label: string
  color: string
  picked: string
  onPick?: (id: string) => void
  subtitle: string
  locked?: boolean
}) {
  const def = charById(picked)
  return (
    <div className="panel">
      <div className="slot__head">
        <span className="slot__label" style={{ color }}>
          {label}
        </span>
        <span className="chip">{subtitle}</span>
      </div>

      <div className="picks">
        {ROSTER.map((c) => (
          <button
            key={c.id}
            type="button"
            className={['pick', c.id === picked ? 'pick--on' : '', c.locked ? 'pick--locked' : ''].join(
              ' ',
            )}
            style={c.id === picked && !c.locked ? { color: c.theme.dark } : undefined}
            onClick={() => !c.locked && onPick?.(c.id)}
            disabled={locked || c.locked}
            title={c.locked ? `${c.name} - ${c.unlockHint ?? 'Locked'}` : `${c.name} - ${c.title}`}
          >
            <Portrait def={c} size={52} animate={c.id === picked && !c.locked} scenery={false} />
            <span className="pick__name">{c.name}</span>
            {c.locked && <span className="pick__lock">LOCKED</span>}
          </button>
        ))}
      </div>

      <div className="chosen">
        <Portrait def={def} size={78} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="chosen__title">{def.title}</div>
          <h3 style={{ color: def.theme.dark }}>{def.name}</h3>
          <StatBars def={def} />
          <p className="blurb">{def.blurb}</p>
        </div>
      </div>
    </div>
  )
}

// -------------------------------------------------------------------- arena

interface ArenaProps {
  config: MatchConfig
  net?: { client: NetClient; role: Role }
  /** Lets the panel hand match-time payloads (inputs, snapshots) down here. */
  registerHandler: (fn: ((msg: SmashPayload) => void) | null) => void
  onChangeFighters: () => void
  onLeave: () => void
}

function Arena({ config, net, registerHandler, onChangeFighters, onLeave }: ArenaProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const engineRef = useRef<SmashEngine | null>(null)
  const [paused, setPaused] = useState(false)
  const [winner, setWinner] = useState<number | null>(null)
  const [debug, setDebug] = useState(false)

  const role = net?.role
  const pausedRef = useRef(false)
  const winnerRef = useRef<number | null>(null)
  const debugRef = useRef(false)
  pausedRef.current = paused
  winnerRef.current = winner
  debugRef.current = debug

  // Guest side: the newest snapshot waiting to be drawn.
  const pendingSnap = useRef<SmashPayload | null>(null)
  // Host side: the guest's most recent input.
  const remoteInput = useRef(0)

  const rematch = useCallback(() => {
    engineRef.current?.reset()
    setWinner(null)
    setPaused(false)
    if (role === 'host') net?.client.send({ k: 'rematch' } satisfies SmashPayload)
  }, [net, role])

  useEffect(() => {
    registerHandler((msg) => {
      if (msg.k === 'input' && role === 'host') {
        remoteInput.current = msg.bits
      } else if (msg.k === 'snap' && role === 'guest') {
        pendingSnap.current = msg
      } else if (msg.k === 'rematch' && role === 'guest') {
        winnerRef.current = null
        setWinner(null)
      }
    })
    return () => registerHandler(null)
  }, [registerHandler, role])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    // One canvas pixel per device pixel: anything else and the browser
    // resamples the whole arena.
    let ctx = fitScene(canvas, VIEW_W, VIEW_H)
    const refit = new ResizeObserver(() => {
      ctx = fitScene(canvas, VIEW_W, VIEW_H)
    })
    refit.observe(canvas)

    // A guest never simulates; it keeps an engine purely to draw into.
    const eng = new SmashEngine({ ...config, cpu: role ? false : config.cpu })
    engineRef.current = eng

    const kb = new Keyboard()
    const detach = kb.attach((code) => {
      if (code === 'Escape' || code === 'KeyP') {
        if (winnerRef.current === null) setPaused((p) => !p)
      } else if (code === 'F1') {
        setDebug((d) => !d)
      } else if (code === 'KeyR' && winnerRef.current !== null && role !== 'guest') {
        rematch()
      }
    })

    let raf = 0
    let last = performance.now()
    let acc = 0
    let lastSentBits = -1
    let sinceSend = 0

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      let dt = (now - last) / 1000
      last = now
      if (dt > 0.2) dt = 0.2

      if (role === 'guest') {
        // Send our input up, draw whatever the host last told us.
        const bits = packInput(kb.read(0))
        sinceSend++
        if (bits !== lastSentBits || sinceSend > 12) {
          lastSentBits = bits
          sinceSend = 0
          net?.client.send({ k: 'input', frame: eng.frame, bits } satisfies SmashPayload)
        }
        const snap = pendingSnap.current
        if (snap && snap.k === 'snap') {
          pendingSnap.current = null
          eng.applySnapshot(snap.s)
          if (eng.phase === 'over' && eng.winner !== null && winnerRef.current === null) {
            winnerRef.current = eng.winner
            setWinner(eng.winner)
          }
        }
      } else {
        const frozen = pausedRef.current || winnerRef.current !== null
        if (frozen) {
          acc = 0
        } else {
          acc += dt
          let steps = 0
          while (acc >= TICK && steps < 6) {
            eng.setInput(0, kb.read(0))
            if (role === 'host') {
              eng.setInput(1, unpackInput(remoteInput.current))
            } else if (!eng.config.cpu) {
              eng.setInput(1, kb.read(1))
            }
            eng.step()
            acc -= TICK
            steps++
          }
          if (role === 'host' && steps > 0) {
            net?.client.send({ k: 'snap', s: eng.snapshot() } satisfies SmashPayload)
          }
          if (eng.phase === 'over' && eng.winner !== null && winnerRef.current === null) {
            winnerRef.current = eng.winner
            setWinner(eng.winner)
          }
        }
      }

      renderMatch(ctx, eng, { debug: debugRef.current })
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      refit.disconnect()
      detach()
      engineRef.current = null
    }
  }, [config, rematch, net, role])

  const winDef = winner !== null ? charById(config.chars[winner]) : null
  const youAre = role === 'guest' ? 1 : 0
  const fullscreen = useFullscreen<HTMLDivElement>()

  return (
    <div>
      <div className="stage-wrap" ref={fullscreen.ref}>
        <button
          type="button"
          className="btn btn--ghost btn--sm stage-wrap__fullscreen"
          onClick={fullscreen.toggle}
        >
          {fullscreen.active ? 'Exit fullscreen' : 'Fullscreen'}
        </button>
        <canvas ref={canvasRef} style={{ width: '100%', aspectRatio: VIEW_W + ' / ' + VIEW_H }} />

        {paused && winner === null && (
          <div className="overlay">
            <h3>PAUSED</h3>
            <p>{role === 'guest' ? 'The match is still running for the host.' : 'Esc or P to resume'}</p>
            <div className="overlay__row">
              <button className="btn btn--primary btn--sm" onClick={() => setPaused(false)}>
                Resume
              </button>
              {role !== 'guest' && (
                <button className="btn btn--sm" onClick={rematch}>
                  Restart match
                </button>
              )}
              {role ? (
                <button className="btn btn--ghost btn--sm" onClick={onLeave}>
                  Leave room
                </button>
              ) : (
                <button className="btn btn--ghost btn--sm" onClick={onChangeFighters}>
                  Change character
                </button>
              )}
            </div>
          </div>
        )}

        {winner !== null && winDef && (
          <div className="overlay">
            <h3 style={{ color: SmashEngine.playerColor(winner) }}>
              {winDef.name.toUpperCase()} WINS
            </h3>
            <p>
              {winner === youAre
                ? 'That one is yours.'
                : role
                  ? 'Good match - go again?'
                  : config.cpu && winner === 1
                    ? 'The CPU takes it.'
                    : 'Nicely done.'}
            </p>
            <div className="overlay__row">
              {role === 'guest' ? (
                <span className="muted">Waiting for the host to start another…</span>
              ) : (
                <button className="btn btn--primary btn--sm" onClick={rematch}>
                  Rematch (R)
                </button>
              )}
              {role ? (
                <button className="btn btn--ghost btn--sm" onClick={onLeave}>
                  Leave room
                </button>
              ) : (
                <button className="btn btn--ghost btn--sm" onClick={onChangeFighters}>
                  Change character
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="infogrid">
        <div className="panel">
          <div className="panel__title">Controls</div>
          <div style={{ display: 'grid', gap: 14 }}>
            {role ? (
              <div>
                <div
                  className="fighter__title"
                  style={{ color: SmashEngine.playerColor(youAre), marginBottom: 6 }}
                >
                  You are {youAre === 0 ? 'Player 1' : 'Player 2'} - use the left-hand keys
                </div>
                <div className="keys">
                  {[...CONTROL_HINTS[0].rows, ...SMASH_CONTROL_HINTS[youAre]].map(([action, key]) => (
                    <div className="keyrow" key={action}>
                      <span>{action}</span>
                      <kbd>{key}</kbd>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              CONTROL_HINTS.map((group, i) => (
                <div key={group.player}>
                  <div
                    className="fighter__title"
                    style={{ color: SmashEngine.playerColor(i), marginBottom: 6 }}
                  >
                    {i === 1 && config.cpu ? 'Player 2 (CPU is playing)' : group.player}
                  </div>
                  <div className="keys">
                    {[...group.rows, ...SMASH_CONTROL_HINTS[i]].map(([action, key]) => (
                      <div className="keyrow" key={action}>
                        <span>{action}</span>
                        <kbd>{key}</kbd>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
            <div className="keys">
              <div className="keyrow">
                <span>Pause</span>
                <kbd>ESC</kbd>
              </div>
              <div className="keyrow">
                <span>Hitbox view</span>
                <kbd>F1</kbd>
              </div>
            </div>
          </div>
        </div>

        {[0, 1].map((i) => {
          const def = charById(config.chars[i])
          return (
            <div className="panel" key={i}>
              <div className="panel__title" style={{ color: SmashEngine.playerColor(i) }}>
                {def.name} - move list
              </div>
              <MoveTable def={def} />
              <p className="muted" style={{ fontSize: 11, marginBottom: 0 }}>
                Special is your recovery: it throws you upward, then you fall helpless until you
                land.
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// --------------------------------------------------------------- mode screen

function ModeScreen({
  onLocal,
  onHost,
  onJoin,
  name,
  setName,
  serverUrl,
  setServerUrl,
  status,
  detail,
  code,
  peers,
  onCancel,
}: {
  onLocal: () => void
  onHost: () => void
  onJoin: (code: string) => void
  name: string
  setName: (v: string) => void
  serverUrl: string
  setServerUrl: (v: string) => void
  status: string
  detail: string
  code: string
  peers: PeerInfo[]
  onCancel: () => void
}) {
  const [joinCode, setJoinCode] = useState('')
  const waiting = status === 'lobby' && !!code

  return (
    <div className="stack">
      <div className="panel namebar">
        <label className="field" style={{ margin: 0 }}>
          <span>Your camp name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={16} />
        </label>
        <p className="muted" style={{ margin: 0 }}>
          Shown to anyone you play with online.
        </p>
      </div>

      <div className="modegrid">
        <div className="panel">
          <div className="panel__title">Play here</div>
          <SceneCanvas
            width={150}
            height={54}
            fluid
            draw={(ctx, frame) => {
              rect(ctx, 0, 0, 150, 54, '#cfdfd8')
              rect(ctx, 0, 38, 150, 16, PAL.grass)
              rect(ctx, 0, 38, 150, 2, PAL.grassLit)
              pine(ctx, 16, 40, 24)
              pine(ctx, 132, 40, 20)
              drawChar(ctx, ROSTER[0], 62, 44, {
                facing: 1,
                scale: 26 / ROSTER[0].height,
                phase: frame,
                shadow: true,
              })
              drawChar(ctx, ROSTER[1], 90, 44, {
                facing: -1,
                scale: 28 / ROSTER[1].height,
                phase: frame + 30,
                shadow: true,
              })
            }}
          />
          <p className="muted" style={{ margin: '10px 0 14px' }}>
            One keyboard. Play the CPU, or hand the arrow keys to whoever is next to you.
          </p>
          <button className="btn btn--primary btn--block" onClick={onLocal}>
            Local match
          </button>
        </div>

        <div className="panel">
          <div className="panel__title">Host a game</div>
          {waiting ? (
            <div>
              <div className="roomcode">{code}</div>
              <p className="muted" style={{ marginTop: 8 }}>
                Friends open this page on your network and enter the code.
              </p>
              <ul className="peerlist">
                {peers.map((p) => (
                  <li key={p.slot}>
                    <span className="dot" style={{ background: SmashEngine.playerColor(p.slot) }} />
                    {p.name}
                    {p.slot === 0 ? ' (host)' : ''}
                  </li>
                ))}
              </ul>
              <p className="muted">
                {peers.length < 2 ? 'Waiting for someone to join…' : 'Ready - pick your fighters.'}
              </p>
              <button className="btn btn--ghost btn--sm" onClick={onCancel}>
                Cancel
              </button>
            </div>
          ) : (
            <div>
              <p className="muted" style={{ margin: '0 0 14px' }}>
                Creates a room on your machine and hands you a four-letter code.
              </p>
              <button className="btn btn--hot btn--block" onClick={onHost}>
                Host game
              </button>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel__title">Join a game</div>
          <label className="field">
            <span>Room code</span>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(normalizeCode(e.target.value))}
              placeholder="ABCD"
              maxLength={6}
              style={{ letterSpacing: '0.3em' }}
            />
          </label>
          <label className="field">
            <span>Server</span>
            <input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} />
          </label>
          <button
            className="btn btn--block"
            onClick={() => onJoin(joinCode)}
            disabled={joinCode.length < 4}
          >
            Join game
          </button>
        </div>
      </div>

      {detail && (
        <div className={`notice ${status === 'error' ? 'notice--bad' : ''}`}>{detail}</div>
      )}

      <div className="panel">
        <div className="panel__title">How online works</div>
        <p className="muted" style={{ margin: 0 }}>
          Animal Instinct ships its own little relay server. Run <kbd>npm run server</kbd> on the host
          machine, then everyone opens the host&apos;s address in a browser. The host&apos;s
          browser runs the match and sends the state out sixty times a second, so both of you see
          exactly the same fight.
        </p>
      </div>
    </div>
  )
}

// -------------------------------------------------------------------- panel

export function SmashPanel() {
  const [screen, setScreen] = useState<Screen>('mode')
  const [mode, setMode] = useState<Mode>('local')
  const [role, setRole] = useState<Role | null>(null)

  const [p1, setP1] = useState(PLAYABLE[0].id)
  const [p2, setP2] = useState(PLAYABLE[1].id)
  const [cpu, setCpu] = useState(true)
  const [cpuLevel, setCpuLevel] = useState<1 | 2 | 3>(2)
  const [stocks, setStocks] = useState(3)
  const [config, setConfig] = useState<MatchConfig | null>(null)

  const [name, setName] = useState('Camper')
  const [serverUrl, setServerUrl] = useState(defaultServerUrl)
  const [status, setStatus] = useState('idle')
  const [detail, setDetail] = useState('')
  const [code, setCode] = useState('')
  const [peers, setPeers] = useState<PeerInfo[]>([])

  const netRef = useRef<NetClient | null>(null)
  if (!netRef.current) netRef.current = new NetClient()
  const net = netRef.current

  // Sheets are fetched once when the game opens, so a fighter never pops in
  // mid-match. Anyone without art keeps drawing from the procedural rig.
  useEffect(() => {
    void loadSprites()
  }, [])

  const roleRef = useRef<Role | null>(null)
  roleRef.current = role
  const screenRef = useRef<Screen>('mode')
  screenRef.current = screen

  useEffect(() => {
    net.on({
      onStatus: (s, d) => {
        setStatus(s)
        setDetail(d ?? '')
        if (s === 'closed' || s === 'error') {
          setRole(null)
          setCode('')
          setPeers([])
          setScreen('mode')
        }
      },
      onRoom: (roomCode, slot) => {
        setCode(roomCode)
        setRole(slot === 0 ? 'host' : 'guest')
        setMode('online')
        if (slot !== 0) setScreen('select')
      },
      onPeers: (players) => {
        setPeers(players)
        // Once a friend arrives, the host moves on to picking fighters.
        if (roleRef.current === 'host' && players.length >= 2 && screenRef.current === 'mode') {
          setScreen('select')
        }
      },
    })
    return () => {
      net.close()
    }
  }, [net])

  // One socket, one handler: lobby traffic is dealt with here and anything
  // that belongs to a running match is passed down to the arena.
  const arenaHandler = useRef<((msg: SmashPayload) => void) | null>(null)
  const registerArenaHandler = useCallback((fn: ((msg: SmashPayload) => void) | null) => {
    arenaHandler.current = fn
  }, [])

  useEffect(() => {
    net.on({
      onPayload: (payload) => {
        const msg = payload as SmashPayload
        if (!msg || typeof msg !== 'object') return
        switch (msg.k) {
          case 'pick':
            if (msg.slot === 0) setP1(msg.charId)
            else setP2(msg.charId)
            break
          case 'rules':
            setStocks(msg.stocks)
            break
          case 'start':
            setP1(playableId(msg.chars[0]))
            setP2(playableId(msg.chars[1]))
            setStocks(msg.stocks)
            setConfig({
              chars: [playableId(msg.chars[0]), playableId(msg.chars[1])],
              stocks: msg.stocks,
              cpu: false,
              cpuLevel: 2,
            })
            setScreen('play')
            break
          case 'toLobby':
            setScreen('select')
            break
          default:
            arenaHandler.current?.(msg)
        }
      },
    })
  }, [net])

  const pick = (slot: 0 | 1, charId: string) => {
    if (slot === 0) setP1(charId)
    else setP2(charId)
    if (role) net.send({ k: 'pick', slot, charId } satisfies SmashPayload)
  }

  const changeStocks = (n: number) => {
    setStocks(n)
    if (role === 'host') net.send({ k: 'rules', stocks: n } satisfies SmashPayload)
  }

  const start = () => {
    // A locked fighter can arrive from an older saved pick or a remote peer.
    const chars: [string, string] = [playableId(p1), playableId(p2)]
    if (role === 'host') {
      net.send({ k: 'start', chars, stocks } satisfies SmashPayload)
      setConfig({ chars, stocks, cpu: false, cpuLevel })
    } else {
      setConfig({ chars, stocks, cpu, cpuLevel })
    }
    setScreen('play')
  }

  const backToSelect = () => {
    if (role === 'host') net.send({ k: 'toLobby' } satisfies SmashPayload)
    setScreen('select')
  }

  const leaveRoom = () => {
    net.close()
    setRole(null)
    setCode('')
    setPeers([])
    setMode('local')
    setScreen('mode')
  }

  const online = mode === 'online' && !!role
  const guest = role === 'guest'
  const arenaNet = useMemo(
    () => (online && role ? { client: net, role } : undefined),
    [online, role, net],
  )

  const headerBits = online
    ? `${role === 'host' ? 'Hosting' : 'Joined'} room ${code}`
    : cpu
      ? '1P vs CPU'
      : '2P on one keyboard'

  return (
    <div>
      <div className="gamehead">
        <h2>KNOCKOUT!</h2>
        <span className="chip chip--live">
          <span className="dot" /> Playable
        </span>
        <span className="chip">Map: {LAKESIDE_BLUFF.name}</span>
        <span className="chip">{headerBits}</span>
        <div className="spacer" />
        {screen === 'play' && !guest && (
          <button className="btn btn--ghost btn--sm" onClick={backToSelect}>
            Character select
          </button>
        )}
        {screen !== 'mode' && (
          <button className="btn btn--ghost btn--sm" onClick={online ? leaveRoom : () => setScreen('mode')}>
            {online ? 'Leave room' : 'Change mode'}
          </button>
        )}
      </div>

      {screen === 'mode' && (
        <ModeScreen
          name={name}
          setName={setName}
          serverUrl={serverUrl}
          setServerUrl={setServerUrl}
          status={status}
          detail={detail}
          code={code}
          peers={peers}
          onLocal={() => {
            setMode('local')
            setRole(null)
            setScreen('select')
          }}
          onHost={() => net.host(serverUrl, name || 'Host', 'smash', 2)}
          onJoin={(c) => net.join(serverUrl, c, name || 'Camper')}
          onCancel={leaveRoom}
        />
      )}

      {screen === 'select' && (
        <div className="stack">
          {online && (
            <div className="notice">
              {guest
                ? `Joined room ${code}. Pick your fighter - the host starts the match.`
                : peers.length >= 2
                  ? `Room ${code}: ${peers.map((p) => p.name).join(' and ')} are here.`
                  : `Room ${code}: waiting for a friend to join.`}
            </div>
          )}
          <div className="select">
            <Slot
              label={online ? (guest ? 'PLAYER 1 (HOST)' : 'PLAYER 1 (YOU)') : 'PLAYER 1'}
              color={SmashEngine.playerColor(0)}
              picked={p1}
              onPick={guest ? undefined : (id) => pick(0, id)}
              locked={guest}
              subtitle="WASD + F / G"
            />
            <Slot
              label={online ? (guest ? 'PLAYER 2 (YOU)' : 'PLAYER 2 (GUEST)') : 'PLAYER 2'}
              color={SmashEngine.playerColor(1)}
              picked={p2}
              onPick={online && !guest ? undefined : (id) => pick(1, id)}
              locked={online && !guest}
              subtitle={online ? 'WASD + F / G' : cpu ? `CPU lvl ${cpuLevel}` : 'Arrows + . / /'}
            />
          </div>

          <div className="panel">
            <div className="panel__title">Match rules</div>
            <div className="options">
              {!online && (
                <div className="optgroup">
                  <span className="optgroup__label">Opponent</span>
                  <div className="segbtns">
                    <button
                      className={`btn btn--sm ${cpu ? 'btn--on' : ''}`}
                      onClick={() => setCpu(true)}
                    >
                      CPU
                    </button>
                    <button
                      className={`btn btn--sm ${!cpu ? 'btn--on' : ''}`}
                      onClick={() => setCpu(false)}
                    >
                      Friend
                    </button>
                  </div>
                </div>
              )}

              {!online && cpu && (
                <div className="optgroup">
                  <span className="optgroup__label">CPU</span>
                  <div className="segbtns">
                    {CPU_LEVELS.map((l) => (
                      <button
                        key={l.value}
                        className={`btn btn--sm ${cpuLevel === l.value ? 'btn--on' : ''}`}
                        onClick={() => setCpuLevel(l.value)}
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="optgroup">
                <span className="optgroup__label">Stocks</span>
                <div className="segbtns">
                  {STOCK_CHOICES.map((s) => (
                    <button
                      key={s}
                      className={`btn btn--sm ${stocks === s ? 'btn--on' : ''}`}
                      onClick={() => changeStocks(s)}
                      disabled={guest}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="spacer" />
              {guest ? (
                <span className="muted">Waiting for the host to start…</span>
              ) : (
                <button
                  className="btn btn--hot"
                  onClick={start}
                  disabled={online && peers.length < 2}
                >
                  Start match
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {screen === 'play' && config && (
        <Arena
          config={config}
          net={arenaNet}
          registerHandler={registerArenaHandler}
          onChangeFighters={() => setScreen('select')}
          onLeave={leaveRoom}
        />
      )}
    </div>
  )
}
