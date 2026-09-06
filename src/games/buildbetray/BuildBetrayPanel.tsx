import { useEffect, useRef, useState } from 'react'
import { ControlsSettings } from '../../components/ControlsSettings'
import { codeFor } from '../../lib/controls'
import { fitScene } from '../../lib/draw'
import { useFullscreen } from '../../lib/fullscreen'
import { NetClient, defaultServerUrl } from '../../net/client'
import { normalizeCode, type BuildBetrayPayload, type PeerInfo } from '../../net/protocol'
import {
  BuildBetrayEngine,
  defaultConfig,
  PLAYER_COLORS,
  VIEW_H,
  VIEW_W,
  type MatchConfig,
  type Mode,
  type Phase,
} from './engine/engine'
import { BUILD_COLS, BUILD_ROWS, canPlace, countByPiece, hazardCount, MAX_HAZARDS_ON_BOARD, pieceAt, reachable } from './engine/level'
import { CELL_H, CELL_W, pieceById } from './engine/pieces'
import { drawBanner, drawGhost, drawLevel, drawRunner, drawTimer } from './render'

/**
 * Build & Betray: everyone builds one shared, dangerous level, then everyone
 * has to survive it. Host-authoritative like every other game here - see
 * engine/engine.ts's header for the one thing this game does differently
 * (the level itself, and who caused what death, all live on the host).
 *
 * There is no client-side movement prediction: a guest sends input and
 * renders whatever snapshot last arrived, the same trade-off Hide & Seek and
 * Duck szn already make at up to eight players. It reads fine for a casual
 * party platformer; smoother guest movement is a good follow-up, not a
 * blocker for a first playable version.
 */

const net = new NetClient()
type Screen = 'lobby' | 'play'
type Role = 'solo' | 'host' | 'guest'

const PHASE_LABEL: Record<Phase, string> = {
  intro: 'Get Ready',
  build: 'Build',
  preview: 'Preview',
  run: 'Run',
  results: 'Results',
  matchOver: 'Match Over',
}

export function BuildBetrayPanel() {
  const [screen, setScreen] = useState<Screen>('lobby')
  const [role, setRole] = useState<Role>('solo')
  const [status, setStatus] = useState('idle')
  const [detail, setDetail] = useState('')
  const [code, setCode] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [name, setName] = useState('Player')
  const [mode, setMode] = useState<Mode>('classic')
  const [targetScore, setTargetScore] = useState(10)
  const [totalRounds, setTotalRounds] = useState(5)
  const [peers, setPeers] = useState<PeerInfo[]>([])
  const [slot, setSlot] = useState(0)
  const [selectedPiece, setSelectedPiece] = useState<string | null>(null)
  const [dir, setDir] = useState<1 | -1>(1)
  const [, setTick] = useState(0)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const engineRef = useRef<BuildBetrayEngine | null>(null)
  const roleRef = useRef<Role>('solo')
  roleRef.current = role
  const slotRef = useRef(0)
  slotRef.current = slot
  const selectedRef = useRef<string | null>(null)
  selectedRef.current = selectedPiece
  const dirRef = useRef<1 | -1>(1)
  dirRef.current = dir
  const hoverRef = useRef<{ gx: number; gy: number } | null>(null)
  const keysRef = useRef({ left: false, right: false, jump: false })
  const prevPhase = useRef<Phase>('intro')
  const fullscreen = useFullscreen<HTMLDivElement>()

  function currentConfig(): MatchConfig {
    const base = defaultConfig(mode)
    if (mode === 'quick') return { ...base, totalRounds }
    return { ...base, targetScore }
  }

  function broadcastSnap(): void {
    const eng = engineRef.current
    if (eng && roleRef.current === 'host') net.send({ k: 'snap', s: eng.snapshot() } satisfies BuildBetrayPayload)
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
      },
      onPeers: (players) => setPeers(players),
      onPayload: (payload, from) => {
        const msg = payload as BuildBetrayPayload
        if (!msg) return
        if (roleRef.current === 'host') {
          const eng = engineRef.current
          if (!eng) return
          switch (msg.k) {
            case 'place':
              eng.requestPlace(from, msg.pieceId, msg.gx, msg.gy, msg.dir)
              broadcastSnap()
              break
            case 'remove':
              eng.requestRemove(from, msg.uid)
              broadcastSnap()
              break
            case 'ready':
              eng.setReady(from, msg.on)
              broadcastSnap()
              break
            case 'vote':
              eng.castVote(from, msg.category, msg.choice)
              break
            case 'input':
              eng.setInput(from, msg.i)
              break
            default:
              break
          }
          return
        }
        if (msg.k === 'start') {
          const eng = new BuildBetrayEngine({
            mode: msg.config.mode,
            targetScore: msg.config.targetScore,
            totalRounds: msg.config.totalRounds,
            buildSeconds: msg.config.buildSeconds,
            runSeconds: msg.config.runSeconds,
          })
          engineRef.current = eng
          setScreen('play')
        } else if (msg.k === 'snap') {
          engineRef.current?.applySnapshot(msg.s as ReturnType<BuildBetrayEngine['snapshot']>)
        }
      },
    })
    return () => net.close()
  }, [])

  function beginMatch(): void {
    const config = currentConfig()
    const eng = new BuildBetrayEngine(config)
    if (role === 'solo') eng.addPlayer(0, name || 'You')
    else for (const p of peers) eng.addPlayer(p.slot, p.name)
    eng.startMatch()
    engineRef.current = eng
    setScreen('play')
    if (role === 'host') {
      net.send({
        k: 'start',
        config: { mode: config.mode, targetScore: config.targetScore, totalRounds: config.totalRounds, buildSeconds: config.buildSeconds, runSeconds: config.runSeconds },
      } satisfies BuildBetrayPayload)
    }
  }

  function attemptPlace(pieceId: string, gx: number, gy: number, d: 1 | -1): void {
    if (roleRef.current === 'guest') {
      net.send({ k: 'place', pieceId, gx, gy, dir: d } satisfies BuildBetrayPayload)
      return
    }
    const eng = engineRef.current
    if (!eng) return
    eng.requestPlace(slotRef.current, pieceId, gx, gy, d)
    broadcastSnap()
  }

  function attemptRemove(uid: number): void {
    if (roleRef.current === 'guest') {
      net.send({ k: 'remove', uid } satisfies BuildBetrayPayload)
      return
    }
    const eng = engineRef.current
    if (!eng) return
    eng.requestRemove(slotRef.current, uid)
    broadcastSnap()
  }

  function toggleReady(): void {
    const eng = engineRef.current
    if (!eng) return
    const mine = eng.runners.find((r) => r.slot === slotRef.current)
    const next = !mine?.ready
    if (roleRef.current === 'guest') net.send({ k: 'ready', on: next } satisfies BuildBetrayPayload)
    else {
      eng.setReady(slotRef.current, next)
      broadcastSnap()
    }
    setTick((t) => t + 1)
  }

  function vote(category: 'difficulty' | 'creative' | 'devious', choice: number): void {
    const eng = engineRef.current
    if (!eng) return
    if (roleRef.current === 'guest') net.send({ k: 'vote', category, choice } satisfies BuildBetrayPayload)
    else eng.castVote(slotRef.current, category, choice)
    setTick((t) => t + 1)
  }

  // ----------------------------------------------------------------- input

  useEffect(() => {
    if (screen !== 'play') return
    const codes = {
      left: codeFor('buildbetray.left', 'KeyA'),
      right: codeFor('buildbetray.right', 'KeyD'),
      jump: codeFor('buildbetray.jump', 'KeyW'),
    }
    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      const k = keysRef.current
      if (e.code === codes.left) k.left = down
      else if (e.code === codes.right) k.right = down
      else if (e.code === codes.jump) k.jump = down
      else if (e.code === 'ArrowLeft') k.left = down
      else if (e.code === 'ArrowRight') k.right = down
      else if (e.code === 'ArrowUp' || e.code === 'Space') k.jump = down
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
    let sinceSend = 0
    const observer = new ResizeObserver(() => {
      ctx = fitScene(canvas, VIEW_W, VIEW_H)
    })
    observer.observe(canvas)

    const frame = () => {
      raf = requestAnimationFrame(frame)
      const eng = engineRef.current
      if (!eng) return

      const k = keysRef.current
      const input = { left: k.left, right: k.right, jump: k.jump }

      if (roleRef.current === 'guest') {
        eng.frame++
      } else {
        eng.setInput(slotRef.current, input)
        eng.step()
      }

      sinceSend++
      if (roleRef.current === 'host') {
        const rate = eng.phase === 'run' ? 2 : 6
        if (sinceSend >= rate) {
          sinceSend = 0
          net.send({ k: 'snap', s: eng.snapshot() } satisfies BuildBetrayPayload)
        }
      } else if (roleRef.current === 'guest' && eng.phase === 'run') {
        if (sinceSend >= 2) {
          sinceSend = 0
          net.send({ k: 'input', i: input } satisfies BuildBetrayPayload)
        }
      }

      if (prevPhase.current !== eng.phase) {
        prevPhase.current = eng.phase
        setTick((t) => t + 1)
      }

      render(ctx, eng)
    }

    function render(c: CanvasRenderingContext2D, eng: BuildBetrayEngine): void {
      const mySlot = slotRef.current
      drawLevel(c, eng.level, eng.frame, mySlot)

      if (eng.phase !== 'build') {
        const order = [...eng.runners].sort((a, b) => a.y - b.y)
        for (const r of order) drawRunner(c, r, eng.frame, r.slot === mySlot)
      }

      if (eng.phase === 'build') {
        const hov = hoverRef.current
        const pieceId = selectedRef.current
        if (hov && pieceId) {
          const ok = canPlace(eng.level, pieceId, hov.gx, hov.gy, countByPiece(eng.level, mySlot, pieceId)).ok
          drawGhost(c, pieceId, hov.gx, hov.gy, dirRef.current, ok)
        }
        drawTimer(c, 'BUILD TIME', eng.phaseTimer / 60, eng.phaseTimer < 5 * 60)
      } else if (eng.phase === 'intro') {
        drawBanner(c, `Round ${eng.round}`, 'Get ready to build')
      } else if (eng.phase === 'preview') {
        drawTimer(c, 'PREVIEW', eng.phaseTimer / 60, false)
      } else if (eng.phase === 'run') {
        drawTimer(c, 'RUN', eng.runTimer / 60, eng.runTimer < 5 * 60)
      } else if (eng.phase === 'results') {
        drawBanner(c, 'Round Results')
      } else if (eng.phase === 'matchOver') {
        const winner = eng.runners.find((r) => r.slot === eng.winner)
        drawBanner(c, 'Match Over', winner ? `${winner.name} wins!` : undefined)
      }
    }

    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [screen])

  const eng = engineRef.current
  const myHand = eng?.hands[slot] ?? []
  const myPieceCounts: Record<string, number> = {}
  if (eng) for (const id of myHand) myPieceCounts[id] = countByPiece(eng.level, slot, id)
  const pathOk = eng ? reachable(eng.level) : true
  const hazardsUsed = eng ? hazardCount(eng.level) : 0

  function onCanvasMove(e: React.MouseEvent<HTMLCanvasElement>): void {
    const pieceId = selectedRef.current
    const rect = e.currentTarget.getBoundingClientRect()
    const wx = ((e.clientX - rect.left) / rect.width) * VIEW_W
    const wy = ((e.clientY - rect.top) / rect.height) * VIEW_H
    const w = pieceId ? pieceById(pieceId).w : 1
    const h = pieceId ? pieceById(pieceId).h : 1
    const gx = Math.max(BUILD_COLS[0] - 2, Math.min(BUILD_COLS[1] + 2, Math.round(wx / CELL_W - w / 2)))
    const gy = Math.max(BUILD_ROWS[0] - 2, Math.min(BUILD_ROWS[1] + 2, Math.round(wy / CELL_H - h / 2)))
    hoverRef.current = { gx, gy }
  }

  function onCanvasClick(): void {
    const hov = hoverRef.current
    if (!hov || !eng || eng.phase !== 'build') return
    const pieceId = selectedRef.current
    if (pieceId) {
      attemptPlace(pieceId, hov.gx, hov.gy, dirRef.current)
      return
    }
    const existing = pieceAt(eng.level, hov.gx, hov.gy)
    if (existing && existing.ownerSlot === slot) attemptRemove(existing.uid)
  }

  // ------------------------------------------------------------------ lobby

  if (screen === 'lobby') {
    const roster: { slot: number; name: string }[] = role === 'solo' ? [{ slot: 0, name: 'You' }] : peers
    return (
      <div>
        <div className="gamehead">
          <h2>Build &amp; Betray</h2>
          <span className="chip chip--live">
            <span className="dot" /> Playable
          </span>
          <span className="chip">Build-a-course platformer</span>
          <span className="chip">2-8 players</span>
        </div>

        <div className="infogrid">
          <div className="panel">
            <div className="panel__title">Place a trap. Then run the course you just ruined.</div>
            <p className="muted" style={{ marginTop: 0 }}>
              Everyone builds onto one shared level, then everyone has to reach the goal across it. Build
              yourself a route you know works - make it just risky enough for everyone else.
            </p>
            <div className="chiprow" style={{ marginTop: 10 }}>
              {(['classic', 'quick', 'chaos'] as Mode[]).map((m) => (
                <button key={m} type="button" className={`btn btn--sm ${mode === m ? '' : 'btn--ghost'}`} onClick={() => setMode(m)}>
                  {m === 'classic' ? 'Classic' : m === 'quick' ? 'Quick Play' : 'Chaos'}
                </button>
              ))}
            </div>
            {mode === 'quick' ? (
              <label className="fighter__title" style={{ display: 'block', marginTop: 10 }}>
                Rounds
                <input
                  className="input"
                  type="number"
                  min={2}
                  max={12}
                  value={totalRounds}
                  onChange={(e) => setTotalRounds(Math.max(2, Math.min(12, Number(e.target.value) || 5)))}
                  style={{ width: 70, marginLeft: 8 }}
                />
              </label>
            ) : (
              <label className="fighter__title" style={{ display: 'block', marginTop: 10 }}>
                Points to win
                <input
                  className="input"
                  type="number"
                  min={3}
                  max={30}
                  value={targetScore}
                  onChange={(e) => setTargetScore(Math.max(3, Math.min(30, Number(e.target.value) || 10)))}
                  style={{ width: 70, marginLeft: 8 }}
                />
              </label>
            )}
            <div className="chiprow" style={{ marginTop: 12 }}>
              <button className="btn" onClick={beginMatch}>
                Play solo (practice)
              </button>
              <button className="btn btn--ghost" onClick={() => net.host(defaultServerUrl(), name, 'build-and-betray', 8)}>
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
                <button className="btn btn--ghost btn--sm" onClick={() => net.join(defaultServerUrl(), normalizeCode(joinCode), name)}>
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
            <div className="panel__title">The lobby</div>
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
                    </div>
                  ))}
                </div>
                {role === 'host' && (
                  <button className="btn" style={{ marginTop: 12 }} onClick={beginMatch}>
                    Start the match ({peers.length || 1})
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
                Host to get a four-letter code, or join one somebody read out to you. Two to eight
                builders - more players means more chaos to build around.
              </p>
            )}
          </div>

          <div className="panel">
            <div className="panel__title">How a round works</div>
            <ol className="muted" style={{ marginTop: 0, paddingLeft: 18 }}>
              <li>Build: everyone places pieces on the shared course at once, on a timer.</li>
              <li>Preview: the finished course holds still for a look before it locks.</li>
              <li>Run: everyone spawns together and races for the goal.</li>
              <li>Score: points for finishing, finishing first, surviving clean, and for anyone your build took out.</li>
            </ol>
          </div>
        </div>
      </div>
    )
  }

  // ------------------------------------------------------------------- play

  const phase = eng?.phase ?? 'intro'
  const mine = eng?.runners.find((r) => r.slot === slot)

  return (
    <div>
      <div className="gamehead">
        <h2>Build &amp; Betray</h2>
        <span className="chip">Round {eng?.round ?? 1}</span>
        <span className="chip chip--gold">{PHASE_LABEL[phase]}</span>
        <div className="spacer" />
        <button className="btn btn--ghost btn--sm" onClick={() => setScreen('lobby')}>
          Leave the match
        </button>
      </div>

      <div className="stage-wrap" ref={fullscreen.ref}>
        <button type="button" className="btn btn--ghost btn--sm stage-wrap__fullscreen" onClick={fullscreen.toggle}>
          {fullscreen.active ? 'Exit fullscreen' : 'Fullscreen'}
        </button>
        <canvas
          ref={canvasRef}
          className="stage"
          style={{ width: '100%', height: 'auto', aspectRatio: `${VIEW_W} / ${VIEW_H}`, cursor: phase === 'build' ? 'crosshair' : 'default' }}
          onMouseMove={onCanvasMove}
          onClick={onCanvasClick}
        />
      </div>

      {phase === 'build' && (
        <div className="infogrid">
          <div className="panel">
            <div className="panel__title">Your pieces</div>
            <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
              Pick a piece, hover the course to preview it, click to place. Click one of your own pieces
              with nothing selected to take it back.
              {!pathOk && ' Nobody can reach the goal yet - keep building.'}
            </p>
            <div className="picks">
              {myHand.map((id) => {
                const def = pieceById(id)
                const used = myPieceCounts[id] ?? 0
                const full = used >= def.maxPerPlayer
                return (
                  <button
                    key={id}
                    type="button"
                    className={`pick ${selectedPiece === id ? 'pick--on' : ''} ${full ? 'pick--locked' : ''}`}
                    disabled={full}
                    onClick={() => setSelectedPiece(selectedPiece === id ? null : id)}
                    title={def.description}
                  >
                    <span style={{ width: 34, height: 20, borderRadius: 4, background: def.color, display: 'block' }} />
                    <span className="pick__name">{def.name}</span>
                    <span className="pick__lock">
                      {used}/{def.maxPerPlayer}
                    </span>
                  </button>
                )
              })}
            </div>
            <div className="chiprow" style={{ marginTop: 10 }}>
              {selectedPiece && pieceById(selectedPiece).rotatable && (
                <button className="btn btn--ghost btn--sm" onClick={() => setDir(dir === 1 ? -1 : 1)}>
                  Flip {dir === 1 ? 'left' : 'right'}
                </button>
              )}
              {selectedPiece && (
                <button className="btn btn--ghost btn--sm" onClick={() => setSelectedPiece(null)}>
                  Cancel
                </button>
              )}
              <button className={`btn btn--sm ${mine?.ready ? 'btn--on' : 'btn--ghost'}`} onClick={toggleReady}>
                {mine?.ready ? 'Ready!' : 'Ready up'}
              </button>
              <span className="muted" style={{ fontSize: 12 }}>
                Hazards on the course: {hazardsUsed}/{MAX_HAZARDS_ON_BOARD}
              </span>
            </div>
          </div>
          <ControlsSettings
            title="Controls"
            resetPrefix="buildbetray"
            groups={[
              {
                title: 'Movement',
                rows: [
                  { key: 'buildbetray.left', label: 'Move left', fallback: 'KeyA' },
                  { key: 'buildbetray.right', label: 'Move right', fallback: 'KeyD' },
                  { key: 'buildbetray.jump', label: 'Jump (double jump in the air)', fallback: 'KeyW' },
                ],
              },
            ]}
          />
        </div>
      )}

      {phase === 'preview' && eng && (
        <div className="infogrid">
          <div className="panel">
            <div className="panel__title">Vote before it locks in</div>
            <div style={{ display: 'grid', gap: 10 }}>
              <div>
                <div className="fighter__title">How difficult is this course?</div>
                <div className="chiprow" style={{ marginTop: 6 }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} className="btn btn--sm btn--ghost" onClick={() => vote('difficulty', n)}>
                      {n}
                    </button>
                  ))}
                  <span className="muted" style={{ fontSize: 12 }}>
                    {Object.values(eng.votes.difficulty).length} vote(s)
                  </span>
                </div>
              </div>
              {(['creative', 'devious'] as const).map((cat) => (
                <div key={cat}>
                  <div className="fighter__title">Who built the most {cat} thing?</div>
                  <div className="chiprow" style={{ marginTop: 6 }}>
                    {eng.runners
                      .filter((r) => r.slot !== slot)
                      .map((r) => (
                        <button key={r.slot} className="btn btn--sm btn--ghost" onClick={() => vote(cat, r.slot)}>
                          {r.name}
                        </button>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {(phase === 'results' || phase === 'matchOver') && eng?.lastResult && (
        <div className="infogrid">
          <div className="panel">
            <div className="panel__title">{phase === 'matchOver' ? 'Final standings' : `Round ${eng.lastResult.round} scores`}</div>
            <div style={{ display: 'grid', gap: 6 }}>
              {[...eng.lastResult.scores]
                .sort((a, b) => b.total - a.total)
                .map((s) => (
                  <div className="keyrow" key={s.slot}>
                    <span style={{ color: s.color }}>
                      {s.name} {s.finished ? '✓' : ''}
                    </span>
                    <span>
                      +{s.roundScore} this round - {s.total} total
                    </span>
                  </div>
                ))}
            </div>
            {phase === 'matchOver' && role !== 'guest' && (
              <button className="btn" style={{ marginTop: 12 }} onClick={beginMatch}>
                Play again
              </button>
            )}
            {phase === 'matchOver' && role === 'guest' && (
              <p className="muted" style={{ marginTop: 12 }}>
                Waiting for the host to start a new match.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
