import { useCallback, useEffect, useRef, useState } from 'react'
import { PixelCanvas } from '../../components/PixelCanvas'
import { px } from '../../lib/pixel'
import { ROSTER, charById } from './engine/characters'
import { SmashEngine, TICK, type MatchConfig } from './engine/engine'
import { CONTROL_HINTS, Keyboard } from './engine/input'
import { drawBody, renderMatch } from './engine/render'
import { PRISM_POINT, VIEW_H, VIEW_W } from './engine/stage'
import type { CharDef, MoveId } from './engine/types'

const MOVE_INPUT: Record<MoveId, string> = {
  jab: 'ATTACK',
  side: '< or > + ATTACK',
  up: 'UP + ATTACK',
  down: 'DOWN + ATTACK',
  special: 'SPECIAL',
}

const STOCK_CHOICES = [1, 2, 3, 5]
const CPU_LEVELS: { value: 1 | 2 | 3; label: string }[] = [
  { value: 1, label: 'Easy' },
  { value: 2, label: 'Normal' },
  { value: 3, label: 'Hard' },
]

function Portrait({ def, size = 52, scale = 1 }: { def: CharDef; size?: number; scale?: number }) {
  return (
    <PixelCanvas
      width={size}
      height={size}
      scale={scale}
      draw={(ctx, frame) => {
        px(ctx, 0, 0, size, size, '#0a0920')
        for (let i = 0; i < 10; i++) {
          px(ctx, (i * 17) % size, (i * 11) % (size - 12), 1, 1, '#2a2560')
        }
        const bob = Math.sin(frame * 0.07) * 1.4
        drawBody(ctx, def, size / 2, size - 8 + bob, { facing: 1, scale: size / 52 })
        px(ctx, 6, size - 6, size - 12, 2, '#161238')
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
  const ids: MoveId[] = ['jab', 'side', 'up', 'down', 'special']
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
}: {
  label: string
  color: string
  picked: string
  onPick: (id: string) => void
  subtitle: string
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
            className={`pick ${c.id === picked ? 'pick--on' : ''}`}
            style={c.id === picked ? { color: c.colors.body } : undefined}
            onClick={() => onPick(c.id)}
          >
            <Portrait def={c} size={52} />
            <span className="pick__name">{c.name}</span>
            <span style={{ fontSize: 9, letterSpacing: '0.12em' }}>{c.title.toUpperCase()}</span>
          </button>
        ))}
      </div>
      <StatBars def={def} />
      <p className="blurb">{def.blurb}</p>
    </div>
  )
}

interface ArenaProps {
  config: MatchConfig
  onChangeFighters: () => void
}

function Arena({ config, onChangeFighters }: ArenaProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const engineRef = useRef<SmashEngine | null>(null)
  const [paused, setPaused] = useState(false)
  const [winner, setWinner] = useState<number | null>(null)
  const [debug, setDebug] = useState(false)

  const pausedRef = useRef(false)
  const winnerRef = useRef<number | null>(null)
  const debugRef = useRef(false)
  pausedRef.current = paused
  winnerRef.current = winner
  debugRef.current = debug

  const rematch = useCallback(() => {
    engineRef.current?.reset()
    setWinner(null)
    setPaused(false)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false

    const eng = new SmashEngine(config)
    engineRef.current = eng

    const kb = new Keyboard()
    const detach = kb.attach((code) => {
      if (code === 'Escape' || code === 'KeyP') {
        if (winnerRef.current === null) setPaused((p) => !p)
      } else if (code === 'F1') {
        setDebug((d) => !d)
      } else if (code === 'KeyR' && winnerRef.current !== null) {
        rematch()
      }
    })

    let raf = 0
    let last = performance.now()
    let acc = 0

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      let dt = (now - last) / 1000
      last = now
      if (dt > 0.2) dt = 0.2

      const frozen = pausedRef.current || winnerRef.current !== null
      if (frozen) {
        acc = 0
      } else {
        acc += dt
        let steps = 0
        while (acc >= TICK && steps < 6) {
          eng.setInput(0, kb.read(0))
          if (!eng.config.cpu) eng.setInput(1, kb.read(1))
          eng.step()
          acc -= TICK
          steps++
        }
        if (eng.phase === 'over' && eng.winner !== null && winnerRef.current === null) {
          winnerRef.current = eng.winner
          setWinner(eng.winner)
        }
      }

      renderMatch(ctx, eng, { debug: debugRef.current })
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      detach()
      engineRef.current = null
    }
  }, [config, rematch])

  const winDef = winner !== null ? charById(config.chars[winner]) : null

  return (
    <div>
      <div className="stage-wrap">
        <canvas ref={canvasRef} width={VIEW_W} height={VIEW_H} />

        {paused && winner === null && (
          <div className="overlay">
            <h3>PAUSED</h3>
            <p>Esc or P to resume</p>
            <div className="overlay__row">
              <button className="btn btn--primary btn--sm" onClick={() => setPaused(false)}>
                Resume
              </button>
              <button className="btn btn--sm" onClick={rematch}>
                Restart match
              </button>
              <button className="btn btn--ghost btn--sm" onClick={onChangeFighters}>
                Change fighters
              </button>
            </div>
          </div>
        )}

        {winner !== null && winDef && (
          <div className="overlay">
            <h3 style={{ color: SmashEngine.playerColor(winner) }}>
              {winDef.name.toUpperCase()} WINS
            </h3>
            <p>
              {winner === 0 ? 'Player 1' : config.cpu ? 'The CPU' : 'Player 2'} takes the set.
            </p>
            <div className="overlay__row">
              <button className="btn btn--primary btn--sm" onClick={rematch}>
                Rematch (R)
              </button>
              <button className="btn btn--ghost btn--sm" onClick={onChangeFighters}>
                Change fighters
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="infogrid">
        <div className="panel">
          <div className="panel__title">Controls</div>
          <div style={{ display: 'grid', gap: 14 }}>
            {CONTROL_HINTS.map((group, i) => (
              <div key={group.player}>
                <div
                  className="fighter__title"
                  style={{ color: SmashEngine.playerColor(i), marginBottom: 6 }}
                >
                  {i === 1 && config.cpu ? 'Player 2 (CPU is driving)' : group.player}
                </div>
                <div className="keys">
                  {group.rows.map(([action, key]) => (
                    <div className="keyrow" key={action}>
                      <span>{action}</span>
                      <kbd>{key}</kbd>
                    </div>
                  ))}
                </div>
              </div>
            ))}
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
                Special is your recovery: it launches you upward, then you fall helpless until you
                land.
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function SmashPanel() {
  const [screen, setScreen] = useState<'select' | 'play'>('select')
  const [p1, setP1] = useState('vex')
  const [p2, setP2] = useState('grum')
  const [cpu, setCpu] = useState(true)
  const [cpuLevel, setCpuLevel] = useState<1 | 2 | 3>(2)
  const [stocks, setStocks] = useState(3)
  const [config, setConfig] = useState<MatchConfig | null>(null)

  const start = () => {
    setConfig({ chars: [p1, p2], stocks, cpu, cpuLevel })
    setScreen('play')
  }

  return (
    <div>
      <div className="gamehead">
        <h2>POLYLAND SMASH</h2>
        <span className="chip chip--live">
          <span className="dot" /> Playable
        </span>
        <span className="chip">Stage: {PRISM_POINT.name}</span>
        <span className="chip">{cpu ? '1P vs CPU' : '2P local'}</span>
        <div className="spacer" />
        {screen === 'play' && (
          <button className="btn btn--ghost btn--sm" onClick={() => setScreen('select')}>
            Fighter select
          </button>
        )}
      </div>

      {screen === 'select' ? (
        <div className="stack">
          <div className="select">
            <Slot
              label="PLAYER 1"
              color={SmashEngine.playerColor(0)}
              picked={p1}
              onPick={setP1}
              subtitle="WASD + F / G"
            />
            <Slot
              label="PLAYER 2"
              color={SmashEngine.playerColor(1)}
              picked={p2}
              onPick={setP2}
              subtitle={cpu ? `CPU lvl ${cpuLevel}` : 'Arrows + . / /'}
            />
          </div>

          <div className="panel">
            <div className="panel__title">Match rules</div>
            <div className="options">
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
                    Human
                  </button>
                </div>
              </div>

              {cpu && (
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
                      onClick={() => setStocks(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="spacer" />
              <button className="btn btn--hot" onClick={start}>
                Start match
              </button>
            </div>
          </div>
        </div>
      ) : (
        config && <Arena config={config} onChangeFighters={() => setScreen('select')} />
      )}
    </div>
  )
}
