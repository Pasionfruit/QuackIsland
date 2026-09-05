import { useCallback, useEffect, useRef, useState } from 'react'
import { useFullscreen } from '../../lib/fullscreen'
import { NetClient, defaultServerUrl } from '../../net/client'
import { normalizeCode, type PeerInfo, type SketchPayload } from '../../net/protocol'
import { CollabEngine, type CollabConfig } from './engine/collab'
import { PhoneEngine, type PhoneEntry } from './engine/phone'
import { ScribbleEngine, type ScribbleConfig } from './engine/scribble'
import { BRUSH_SIZES, LocalDrawer, PALETTE, renderStrokes, saveCanvasPng, toUnit, type Pt, type Stroke } from './draw'
import { WORD_PACKETS } from './words'

/**
 * Sketch: three modes sharing one canvas.
 *
 * Strokes never go through the host - the relay already broadcasts a
 * sender's message to everyone else in the room, so whoever is drawing sends
 * straight to every viewer. Only the game state (turns, timers, words,
 * scores) is host-authoritative, the same split as every other Polyland game.
 * Phone is the exception: nobody watches a Phone drawing happen live, so its
 * strokes ride a single `submit` message instead of a live stream.
 */

const net = new NetClient()
type Screen = 'lobby' | 'play'
type Role = 'solo' | 'host' | 'guest'
type Mode = 'phone' | 'scribble' | 'collab'
type AnyEngine = PhoneEngine | ScribbleEngine | CollabEngine

function StrokeThumb({ strokes, w = 220, h = 150 }: { strokes: Stroke[]; w?: number; h?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = w * dpr
    canvas.height = h * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    renderStrokes(ctx, strokes, w, h)
  }, [strokes, w, h])
  return <canvas ref={ref} style={{ width: w, height: h, borderRadius: 8, border: '1px solid var(--line)' }} />
}

export function SketchPanel() {
  const [screen, setScreen] = useState<Screen>('lobby')
  const [role, setRole] = useState<Role>('solo')
  const [status, setStatus] = useState('idle')
  const [detail, setDetail] = useState('')
  const [code, setCode] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [name, setName] = useState('Artist')
  const [mode, setMode] = useState<Mode>('scribble')
  const [peers, setPeers] = useState<PeerInfo[]>([])
  const [slot, setSlot] = useState(0)
  const [, setTick] = useState(0)

  // Mode config, set in the lobby.
  const [packetIds, setPacketIds] = useState<string[]>(['camp', 'animals'])
  const [scribbleRounds, setScribbleRounds] = useState(6)
  const [scribbleSeconds, setScribbleSeconds] = useState(80)
  const [phoneSeconds, setPhoneSeconds] = useState(75)
  const [timedTurns, setTimedTurns] = useState(false)
  const [chaos, setChaos] = useState<CollabConfig['chaos']>('off')

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const engineRef = useRef<AnyEngine | null>(null)
  const modeRef = useRef<Mode>('scribble')
  const roleRef = useRef<Role>('solo')
  roleRef.current = role
  const slotRef = useRef(0)
  slotRef.current = slot
  const drawerRef = useRef<LocalDrawer | null>(null)
  const lastVersionRef = useRef(-1)
  const prevPhase = useRef('')
  const fullscreen = useFullscreen<HTMLDivElement>()

  // Small per-mode UI state that does not belong on the engine.
  const [guessText, setGuessText] = useState('')
  const [customWord, setCustomWord] = useState('')
  const [color, setColor] = useState(PALETTE[0])
  const [brush, setBrush] = useState(BRUSH_SIZES[1])
  const [phoneInput, setPhoneInput] = useState('')
  const [phoneSubmitted, setPhoneSubmitted] = useState<{ text: string; strokes: Stroke[] } | null>(null)

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
          for (const p of players) eng.addPlayer(p.slot, p.name)
        }
      },
      onPayload: (payload, from) => {
        const msg = payload as SketchPayload
        if (!msg) return
        const eng = engineRef.current

        if (msg.k === 'stroke') {
          drawerRef.current?.applyRemote(from, msg)
          return
        }
        if (msg.k === 'start') {
          const built = buildEngine(msg.mode, msg.config)
          modeRef.current = msg.mode
          engineRef.current = built
          drawerRef.current = new LocalDrawer(slotRef.current, sendStroke, () => setTick((t) => t + 1))
          setMode(msg.mode)
          setScreen('play')
          return
        }
        if (roleRef.current !== 'host') {
          if (msg.k === 'snap') eng?.applySnapshot(msg.s as never)
          return
        }
        // Host-only: apply the incoming action to the authoritative engine.
        if (msg.k === 'guess' && eng instanceof ScribbleEngine) eng.submitGuess(from, msg.text)
        else if (msg.k === 'pickWord' && eng instanceof ScribbleEngine) eng.pickWord(from, msg.word)
        else if (msg.k === 'addWord' && eng instanceof ScribbleEngine) eng.addCustomWord(msg.word)
        else if (msg.k === 'submit' && eng instanceof PhoneEngine) {
          eng.submit(from, msg.text, (msg.strokes as Stroke[]) ?? [])
        }
      },
    })
    return () => net.close()
  }, [])

  const sendStroke = useCallback((chunk: { id: number; color: string; width: number; pts: Pt[]; done: boolean }) => {
    net.send({ k: 'stroke', ...chunk } satisfies SketchPayload)
  }, [])

  function buildEngine(m: Mode, config: unknown): AnyEngine {
    if (m === 'phone') return new PhoneEngine({ ...(config as object), players: 0 })
    if (m === 'collab') return new CollabEngine({ ...(config as object), players: 0 })
    return new ScribbleEngine({ ...(config as object), players: 0 })
  }

  const beginMatch = useCallback(() => {
    const config: unknown =
      mode === 'phone'
        ? { roundSeconds: phoneSeconds }
        : mode === 'collab'
          ? { timedTurns, turnSeconds: 30, chaos, chaosSeconds: 20 }
          : ({ packetIds, roundSeconds: scribbleSeconds, totalRounds: scribbleRounds } satisfies Partial<ScribbleConfig>)

    const eng = buildEngine(mode, config)
    modeRef.current = mode
    if (role === 'solo') {
      eng.addPlayer(0, 'You')
    } else {
      for (const p of peers) eng.addPlayer(p.slot, p.name)
    }
    eng.start()
    engineRef.current = eng
    drawerRef.current = new LocalDrawer(slotRef.current, sendStroke, () => setTick((t) => t + 1))
    lastVersionRef.current = -1
    setPhoneSubmitted(null)
    setGuessText('')
    setScreen('play')
    if (role === 'host') net.send({ k: 'start', mode, config } satisfies SketchPayload)
  }, [mode, role, peers, packetIds, scribbleSeconds, scribbleRounds, phoneSeconds, timedTurns, chaos, sendStroke])

  // ------------------------------------------------------------------ loop

  useEffect(() => {
    if (screen !== 'play') return
    let raf = 0
    let last = performance.now()
    let acc = 0
    const TICK = 1 / 60

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      let dt = (now - last) / 1000
      last = now
      if (dt > 0.2) dt = 0.2
      acc += dt

      const eng = engineRef.current
      if (eng && roleRef.current !== 'guest') {
        while (acc >= TICK) {
          acc -= TICK
          eng.step()
        }
        // Only actually send when something changed - Phone's chain history
        // can carry real drawings, and re-sending it dozens of times a
        // second for a round nothing happened in would be wasteful.
        if (eng.version !== lastVersionRef.current) {
          lastVersionRef.current = eng.version
          net.send({ k: 'snap', s: eng.snapshot() } satisfies SketchPayload)
        }
      }

      if (eng && prevPhase.current !== eng.phase) {
        prevPhase.current = eng.phase
        setTick((t) => t + 1)
      }

      const canvas = canvasRef.current
      if (canvas && drawerRef.current) {
        const ctx = canvas.getContext('2d')
        if (ctx) {
          const w = canvas.clientWidth || 480
          const h = canvas.clientHeight || 320
          if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w
            canvas.height = h
          }
          renderStrokes(ctx, visibleStrokes(), w, h)
          if (modeRef.current === 'collab' && (eng as CollabEngine)?.inverted) {
            ctx.save()
            ctx.globalCompositeOperation = 'difference'
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(0, 0, w, h)
            ctx.restore()
          }
        }
      }
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [screen])

  /** Which strokes belong on screen right now, which differs by mode/phase. */
  function visibleStrokes(): Stroke[] {
    const eng = engineRef.current
    if (!eng) return []
    if (eng instanceof PhoneEngine) {
      if (eng.phase !== 'working') return []
      const kind = eng.stepKind(eng.round)
      if (kind === 'draw') return drawerRef.current?.strokes ?? []
      if (kind === 'guess') return eng.handoff(slotRef.current)?.strokes ?? []
      return []
    }
    return drawerRef.current?.strokes ?? []
  }

  // ----------------------------------------------------------------- input

  function canDrawNow(): boolean {
    const eng = engineRef.current
    if (!eng) return false
    if (eng instanceof ScribbleEngine) return eng.phase === 'drawing' && eng.drawer?.slot === slotRef.current
    if (eng instanceof CollabEngine) return eng.canDraw(slotRef.current)
    if (eng instanceof PhoneEngine) {
      return eng.phase === 'working' && eng.stepKind(eng.round) === 'draw' && !eng.hasSubmitted(slotRef.current)
    }
    return false
  }

  const activeColor = (() => {
    const eng = engineRef.current
    if (eng instanceof CollabEngine && eng.forcedColor) return eng.forcedColor
    return color
  })()

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canDrawNow() || !canvasRef.current || !drawerRef.current) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drawerRef.current.begin(activeColor, brush, toUnit(canvasRef.current, e.clientX, e.clientY))
  }
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawerRef.current?.drawing || !canvasRef.current) return
    drawerRef.current.extend(toUnit(canvasRef.current, e.clientX, e.clientY))
  }
  const onPointerUp = () => {
    drawerRef.current?.end()
  }

  const sendSubmit = (text: string) => {
    const eng = engineRef.current
    if (!(eng instanceof PhoneEngine)) return
    const kind = eng.stepKind(eng.round)
    const strokes = kind === 'draw' ? drawerRef.current?.strokes ?? [] : []
    if (roleRef.current === 'host') eng.submit(slotRef.current, text, strokes)
    else net.send({ k: 'submit', text, strokes } satisfies SketchPayload)
    setPhoneSubmitted({ text, strokes })
    setPhoneInput('')
  }

  const sendGuess = () => {
    if (!guessText.trim()) return
    const eng = engineRef.current
    if (eng instanceof ScribbleEngine) {
      if (roleRef.current === 'host') eng.submitGuess(slotRef.current, guessText)
      else net.send({ k: 'guess', text: guessText } satisfies SketchPayload)
    }
    setGuessText('')
  }

  const sendPickWord = (word: string) => {
    const eng = engineRef.current
    if (!(eng instanceof ScribbleEngine)) return
    if (roleRef.current === 'host') eng.pickWord(slotRef.current, word)
    else net.send({ k: 'pickWord', word } satisfies SketchPayload)
  }

  const sendAddWord = () => {
    const w = customWord.trim()
    if (!w) return
    const eng = engineRef.current
    if (eng instanceof ScribbleEngine) {
      if (roleRef.current === 'host') eng.addCustomWord(w)
      else net.send({ k: 'addWord', word: w } satisfies SketchPayload)
    }
    setCustomWord('')
  }

  const togglePacket = (id: string) => {
    setPacketIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  }

  // ------------------------------------------------------------------ lobby

  if (screen === 'lobby') {
    return (
      <div>
        <div className="gamehead">
          <h2>Sketch</h2>
          <span className="chip chip--live">
            <span className="dot" /> Playable
          </span>
          <span className="chip">Three modes</span>
          <span className="chip">2-8 players</span>
        </div>

        <div className="infogrid">
          <div className="panel">
            <div className="panel__title">Pick a mode</div>
            <div className="chiprow" style={{ marginBottom: 10 }}>
              {(['scribble', 'phone', 'collab'] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`btn btn--sm ${mode === m ? '' : 'btn--ghost'}`}
                  onClick={() => setMode(m)}
                >
                  {m === 'scribble' ? 'Scribble' : m === 'phone' ? 'Phone' : 'Collaborative Art'}
                </button>
              ))}
            </div>
            <p className="muted" style={{ marginTop: 0 }}>
              {mode === 'scribble' &&
                'A rotating drawer, a word only they know, and hangman revealing a letter every six seconds. Guess fast for more points.'}
              {mode === 'phone' &&
                'Everyone writes a prompt, then the chain rotates: draw what you are handed, someone else guesses it, someone else draws that guess. The reveal at the end is the whole point.'}
              {mode === 'collab' &&
                'One shared canvas, no scoring. Draw together, save it at the end. Turn on a challenge if casual is too easy.'}
            </p>

            {mode === 'scribble' && (
              <div style={{ display: 'grid', gap: 8 }}>
                <label className="fighter__title">Word packets</label>
                <div className="chiprow">
                  {WORD_PACKETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`chip ${packetIds.includes(p.id) ? 'chip--live' : ''}`}
                      onClick={() => togglePacket(p.id)}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
                <label className="fighter__title">Rounds: {scribbleRounds}</label>
                <input
                  type="range"
                  min={2}
                  max={16}
                  value={scribbleRounds}
                  onChange={(e) => setScribbleRounds(Number(e.target.value))}
                />
                <label className="fighter__title">Seconds per round: {scribbleSeconds}</label>
                <input
                  type="range"
                  min={30}
                  max={150}
                  step={10}
                  value={scribbleSeconds}
                  onChange={(e) => setScribbleSeconds(Number(e.target.value))}
                />
                <div className="chiprow">
                  <input
                    className="input"
                    placeholder="Add a word to the pool"
                    value={customWord}
                    maxLength={24}
                    onChange={(e) => setCustomWord(e.target.value)}
                  />
                  <button className="btn btn--ghost btn--sm" onClick={sendAddWord}>
                    Add
                  </button>
                </div>
              </div>
            )}

            {mode === 'phone' && (
              <div style={{ display: 'grid', gap: 8 }}>
                <label className="fighter__title">Seconds per round: {phoneSeconds}</label>
                <input
                  type="range"
                  min={30}
                  max={150}
                  step={15}
                  value={phoneSeconds}
                  onChange={(e) => setPhoneSeconds(Number(e.target.value))}
                />
                <p className="muted" style={{ fontSize: 12 }}>
                  With N players the game runs N rounds - one prompt round, then alternating draw and
                  guess rounds until every chain has passed through everyone.
                </p>
              </div>
            )}

            {mode === 'collab' && (
              <div style={{ display: 'grid', gap: 8 }}>
                <label className="keyrow">
                  <span>Timed turns (off = draw whenever)</span>
                  <input type="checkbox" checked={timedTurns} onChange={(e) => setTimedTurns(e.target.checked)} />
                </label>
                <label className="fighter__title">Chaos</label>
                <div className="chiprow">
                  {(['off', 'random', 'invert'] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`btn btn--sm ${chaos === c ? '' : 'btn--ghost'}`}
                      onClick={() => setChaos(c)}
                    >
                      {c === 'off' ? 'Off - casual' : c === 'random' ? 'Random colour' : 'Inverted colours'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="chiprow" style={{ marginTop: 14 }}>
              <button className="btn" onClick={beginMatch}>
                Play solo (practice)
              </button>
              <button
                className="btn btn--ghost"
                onClick={() => net.host(defaultServerUrl(), name, 'sketch', 8)}
              >
                Host a table
              </button>
            </div>
            <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
              <label className="fighter__title">Your name</label>
              <input className="input" value={name} maxLength={16} onChange={(e) => setName(e.target.value)} />
              <label className="fighter__title">Join a table</label>
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
            <div className="panel__title">The table</div>
            {code ? (
              <>
                <p style={{ marginTop: 0 }}>
                  Room code <strong style={{ fontSize: 20 }}>{code}</strong>
                </p>
                <div style={{ display: 'grid', gap: 6 }}>
                  {peers.map((p) => (
                    <div key={p.slot} className="keyrow">
                      <span>{p.name}</span>
                      <span className="muted">{p.slot === 0 ? 'host' : `seat ${p.slot + 1}`}</span>
                    </div>
                  ))}
                </div>
                {role === 'host' && (
                  <button className="btn" style={{ marginTop: 12 }} onClick={beginMatch}>
                    Start ({peers.length || 1})
                  </button>
                )}
                {role === 'guest' && (
                  <p className="muted" style={{ marginTop: 12 }}>
                    Waiting for the host to start - mode and settings are their call.
                  </p>
                )}
              </>
            ) : (
              <p className="muted" style={{ marginTop: 0 }}>
                Host a table to get a four-letter code, or join one somebody read out to you. Phone
                wants at least 3; Scribble and Collaborative Art work from 2.
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ------------------------------------------------------------------- play

  const eng = engineRef.current
  const scribble = eng instanceof ScribbleEngine ? eng : null
  const phone = eng instanceof PhoneEngine ? eng : null
  const collab = eng instanceof CollabEngine ? eng : null
  const iAmDrawing = canDrawNow()

  return (
    <div>
      <div className="gamehead">
        <h2>Sketch</h2>
        <span className="chip">{mode === 'scribble' ? 'Scribble' : mode === 'phone' ? 'Phone' : 'Collaborative Art'}</span>
        <div className="spacer" />
        <button className="btn btn--ghost btn--sm" onClick={() => setScreen('lobby')}>
          Leave the table
        </button>
      </div>

      {scribble && (
        <div className="infogrid" style={{ gridTemplateColumns: '2fr 1fr' }}>
          <div>
            <div className="stage-wrap" ref={fullscreen.ref} style={{ background: '#fbf8f0' }}>
              <button type="button" className="btn btn--ghost btn--sm stage-wrap__fullscreen" onClick={fullscreen.toggle}>
                {fullscreen.active ? 'Exit fullscreen' : 'Fullscreen'}
              </button>
              <canvas
                ref={canvasRef}
                style={{ width: '100%', height: 380, display: 'block', touchAction: 'none', cursor: iAmDrawing ? 'crosshair' : 'default' }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              />
            </div>
            <div className="panel" style={{ marginTop: 12 }}>
              <div className="panel__title">
                {scribble.phase === 'choosing' && `${scribble.drawer?.name ?? '...'} is picking a word`}
                {scribble.phase === 'drawing' && (iAmDrawing ? 'Your turn to draw' : `Guess what ${scribble.drawer?.name} is drawing`)}
                {scribble.phase === 'roundEnd' && `The word was "${scribble.word || '?'}"`}
                {scribble.phase === 'over' && 'Final scores'}
              </div>

              {scribble.phase === 'choosing' && scribble.drawer?.slot === slotRef.current && (
                <div className="chiprow">
                  {scribble.choices.map((w) => (
                    <button key={w} className="btn btn--sm" onClick={() => sendPickWord(w)}>
                      {w}
                    </button>
                  ))}
                </div>
              )}

              {scribble.phase === 'drawing' && (
                <>
                  <div style={{ fontSize: 22, letterSpacing: 4, fontWeight: 800, marginBottom: 8 }}>
                    {iAmDrawing ? scribble.word : scribble.maskedWord() || scribble.guestMask}
                  </div>
                  {iAmDrawing && (
                    <div className="chiprow" style={{ marginBottom: 8 }}>
                      {PALETTE.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setColor(c)}
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 999,
                            background: c,
                            border: c === color ? '2px solid var(--ink, #222)' : '1px solid var(--line)',
                          }}
                        />
                      ))}
                      {BRUSH_SIZES.map((b) => (
                        <button
                          key={b}
                          type="button"
                          className={`btn btn--sm ${b === brush ? '' : 'btn--ghost'}`}
                          onClick={() => setBrush(b)}
                        >
                          {b}px
                        </button>
                      ))}
                    </div>
                  )}
                  {!iAmDrawing && (
                    <div className="chiprow">
                      <input
                        className="input"
                        placeholder="Type your guess"
                        value={guessText}
                        onChange={(e) => setGuessText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && sendGuess()}
                      />
                      <button className="btn btn--sm" onClick={sendGuess}>
                        Guess
                      </button>
                    </div>
                  )}
                  <div style={{ marginTop: 10, display: 'grid', gap: 4, maxHeight: 120, overflowY: 'auto' }}>
                    {scribble.feed.map((f, i) => (
                      <div key={i} className="muted" style={{ fontSize: 12 }}>
                        {f.correct ? `${nameFor(peers, role, f.slot)} guessed it!` : `${nameFor(peers, role, f.slot)}: ${f.text}`}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="panel">
            <div className="panel__title">Leaderboard</div>
            <div style={{ display: 'grid', gap: 6 }}>
              {[...scribble.players]
                .sort((a, b) => b.score - a.score)
                .map((p) => (
                  <div className="keyrow" key={p.slot}>
                    <span>{p.name}</span>
                    <span>{p.score}</span>
                  </div>
                ))}
            </div>
            {scribble.phase === 'over' && (
              <button className="btn" style={{ marginTop: 12 }} onClick={beginMatch}>
                Play again
              </button>
            )}
          </div>
        </div>
      )}

      {phone && (
        <div className="infogrid" style={{ gridTemplateColumns: phone.phase === 'reveal' ? '1fr' : '2fr 1fr' }}>
          {phone.phase !== 'reveal' && (
            <div>
              <PhoneWorking
                phone={phone}
                slot={slotRef.current}
                canvasRef={canvasRef}
                iAmDrawing={iAmDrawing}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                color={color}
                setColor={setColor}
                brush={brush}
                setBrush={setBrush}
                phoneInput={phoneInput}
                setPhoneInput={setPhoneInput}
                submitted={phoneSubmitted}
                onSubmit={sendSubmit}
              />
            </div>
          )}
          {phone.phase !== 'reveal' && (
            <div className="panel">
              <div className="panel__title">This round</div>
              <p className="muted">Waiting on {phone.waitingOn()} more.</p>
              <div style={{ display: 'grid', gap: 4 }}>
                {phone.players.map((p) => (
                  <div className="keyrow" key={p.slot}>
                    <span>{p.name}</span>
                    <span>{phone.hasSubmitted(p.slot) ? 'done' : '...'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {phone.phase === 'reveal' && (
            <div className="panel">
              <div className="panel__title">The reveal</div>
              {phone.chains.map((chain, ci) => (
                <div key={ci} style={{ marginBottom: 20 }}>
                  <div className="fighter__title" style={{ marginBottom: 6 }}>
                    Chain started by {nameFor(peers, role, phone.players[ci]?.slot ?? -1) || phone.players[ci]?.name}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    {chain.map((entry, ei) => (
                      <PhoneEntryCard key={ei} entry={entry} authorName={playerName(phone.players, entry.author)} />
                    ))}
                  </div>
                </div>
              ))}
              <button className="btn" onClick={beginMatch}>
                Play again
              </button>
            </div>
          )}
        </div>
      )}

      {collab && (
        <div className="infogrid" style={{ gridTemplateColumns: '2fr 1fr' }}>
          <div>
            <div className="stage-wrap" ref={fullscreen.ref} style={{ background: '#fbf8f0' }}>
              <button type="button" className="btn btn--ghost btn--sm stage-wrap__fullscreen" onClick={fullscreen.toggle}>
                {fullscreen.active ? 'Exit fullscreen' : 'Fullscreen'}
              </button>
              <canvas
                ref={canvasRef}
                style={{ width: '100%', height: 420, display: 'block', touchAction: 'none', cursor: iAmDrawing ? 'crosshair' : 'not-allowed' }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              />
            </div>
            <div className="chiprow" style={{ marginTop: 10 }}>
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  disabled={Boolean(collab.forcedColor)}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    background: collab.forcedColor ?? c,
                    border: c === color ? '2px solid var(--ink, #222)' : '1px solid var(--line)',
                  }}
                />
              ))}
              {BRUSH_SIZES.map((b) => (
                <button key={b} type="button" className={`btn btn--sm ${b === brush ? '' : 'btn--ghost'}`} onClick={() => setBrush(b)}>
                  {b}px
                </button>
              ))}
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => canvasRef.current && saveCanvasPng(canvasRef.current, 'polyland-sketch.png')}
              >
                Save PNG
              </button>
              <button className="btn btn--ghost btn--sm" onClick={() => drawerRef.current?.clear()}>
                Clear
              </button>
            </div>
          </div>
          <div className="panel">
            <div className="panel__title">The table</div>
            {collab.config.timedTurns && (
              <p>
                {collab.currentTurn?.slot === slotRef.current ? 'Your turn' : `${collab.currentTurn?.name}'s turn`} -{' '}
                {Math.ceil(collab.turnTimer / 60)}s
              </p>
            )}
            {!collab.config.timedTurns && <p className="muted">Casual - draw whenever you like.</p>}
            {collab.config.chaos !== 'off' && (
              <p className="muted" style={{ fontSize: 12 }}>
                {collab.config.chaos === 'random' ? 'Colours shuffle' : 'Colours flip'} every{' '}
                {collab.config.chaosSeconds}s.
              </p>
            )}
            <div style={{ display: 'grid', gap: 4, marginTop: 10 }}>
              {collab.players.map((p) => (
                <div className="keyrow" key={p.slot}>
                  <span>{p.name}</span>
                  <span className="muted">{collab.config.timedTurns && collab.currentTurn?.slot === p.slot ? 'drawing' : ''}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function nameFor(peers: PeerInfo[], role: Role, slot: number): string {
  if (role === 'solo') return slot === 0 ? 'You' : `Player ${slot + 1}`
  return peers.find((p) => p.slot === slot)?.name ?? `Player ${slot + 1}`
}

function playerName(players: { slot: number; name: string }[], slot: number): string {
  return players.find((p) => p.slot === slot)?.name ?? `Player ${slot + 1}`
}

function PhoneEntryCard({ entry, authorName }: { entry: PhoneEntry; authorName: string }) {
  return (
    <div style={{ width: 220 }}>
      <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>
        {authorName} {entry.kind === 'prompt' ? 'wrote' : entry.kind === 'guess' ? 'guessed' : 'drew'}
      </div>
      {entry.kind === 'draw' ? (
        <StrokeThumb strokes={entry.strokes} />
      ) : (
        <div
          style={{
            width: 220,
            minHeight: 60,
            border: '1px solid var(--line)',
            borderRadius: 8,
            padding: 10,
            fontWeight: 700,
            background: '#fbf8f0',
          }}
        >
          {entry.text}
        </div>
      )}
    </div>
  )
}

function PhoneWorking(props: {
  phone: PhoneEngine
  slot: number
  canvasRef: React.RefObject<HTMLCanvasElement>
  iAmDrawing: boolean
  onPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => void
  onPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => void
  onPointerUp: () => void
  color: string
  setColor: (c: string) => void
  brush: number
  setBrush: (b: number) => void
  phoneInput: string
  setPhoneInput: (s: string) => void
  submitted: { text: string; strokes: Stroke[] } | null
  onSubmit: (text: string) => void
}) {
  const { phone, slot, submitted } = props
  const kind = phone.stepKind(phone.round)
  const handoff = phone.handoff(slot)
  const done = phone.hasSubmitted(slot)

  return (
    <div>
      <div className="panel" style={{ marginBottom: 12 }}>
        <div className="panel__title">
          Round {phone.round + 1} / {phone.n} -{' '}
          {kind === 'prompt' ? 'Write a starting prompt' : kind === 'draw' ? 'Draw what you were handed' : 'Guess the drawing'}
        </div>
        {kind !== 'draw' && handoff && kind === 'guess' && <StrokeThumb strokes={handoff.strokes} />}
        {kind === 'guess' && !handoff && <p className="muted">Nothing came through - just make something up.</p>}
      </div>

      {kind === 'draw' && (
        <>
          <div className="stage-wrap" style={{ background: '#fbf8f0' }}>
            <canvas
              ref={props.canvasRef}
              style={{ width: '100%', height: 320, display: 'block', touchAction: 'none', cursor: done ? 'default' : 'crosshair' }}
              onPointerDown={props.onPointerDown}
              onPointerMove={props.onPointerMove}
              onPointerUp={props.onPointerUp}
            />
          </div>
          {!done && (
            <div className="chiprow" style={{ marginTop: 10 }}>
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => props.setColor(c)}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    background: c,
                    border: c === props.color ? '2px solid var(--ink, #222)' : '1px solid var(--line)',
                  }}
                />
              ))}
              {BRUSH_SIZES.map((b) => (
                <button key={b} type="button" className={`btn btn--sm ${b === props.brush ? '' : 'btn--ghost'}`} onClick={() => props.setBrush(b)}>
                  {b}px
                </button>
              ))}
              <button className="btn btn--sm" onClick={() => props.onSubmit('')}>
                Done drawing
              </button>
            </div>
          )}
        </>
      )}

      {kind !== 'draw' && !done && (
        <div className="chiprow">
          <input
            className="input"
            placeholder={kind === 'prompt' ? 'Something for someone to draw...' : 'What is this a drawing of?'}
            value={props.phoneInput}
            onChange={(e) => props.setPhoneInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && props.onSubmit(props.phoneInput)}
          />
          <button className="btn btn--sm" onClick={() => props.onSubmit(props.phoneInput)}>
            Submit
          </button>
        </div>
      )}

      {done && <p className="muted">Submitted{submitted?.text ? `: "${submitted.text}"` : ''}. Waiting on everyone else.</p>}
    </div>
  )
}
