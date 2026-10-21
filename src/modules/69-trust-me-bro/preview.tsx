import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createLobby, getNet, getPeers, isHost, joinLobby, leaveLobby, makeCode, sendToRoom, subscribeRoom, useNet, usePeers } from '../09-net'
import { chooseTheOne, CountOver, useTheOne, type RunPhase } from '../15-minigames'
import { myId } from '../68-minigame-kit'
import { TrustMeBroPanel } from './internal/TrustMeBroPanel'
import { gameRoster, nextSeed } from './internal/setup'
import { TAG } from './internal/wire'
import './internal/preview.css'

interface Session { id: number; at: number; phase: RunPhase; paused: boolean }
function Preview() {
  const net = useNet()
  const peers = usePeers()
  const chosen = useTheOne()
  const [code, setCode] = useState('')
  const [name, setName] = useState('player')
  const [session, setSession] = useState<Session | null>(null)
  const [clock, setClock] = useState(Date.now())
  const [notice, setNotice] = useState('')
  const originalHost = useRef<string | null>(null)
  const online = net.status === 'joined'
  const mayControl = !online || net.host
  const seats = gameRoster()
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 100)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => subscribeRoom((from, raw) => {
    if (raw.tag !== TAG || raw.kind !== 'preview' || !isHost(from, [myId(), ...getPeers().map((p) => p.id)])) return
    if (raw.action === 'start' && typeof raw.id === 'number' && Number.isInteger(raw.id) && typeof raw.at === 'number' && Number.isFinite(raw.at) && typeof raw.chosen === 'string') {
      originalHost.current = from
      chooseTheOne(raw.chosen)
      setNotice('')
      setSession({ id: raw.id, at: raw.at, phase: 'counting', paused: false })
    } else if (raw.action === 'pause' && typeof raw.paused === 'boolean') {
      setSession((s) => s && s.id === raw.id ? { ...s, paused: raw.paused as boolean } : s)
    }
  }), [])
  useEffect(() => {
    if (session?.phase === 'counting' && clock >= session.at) setSession((s) => s ? { ...s, phase: 'playing' } : s)
  }, [clock, session])
  useEffect(() => {
    if (originalHost.current && originalHost.current !== myId() && !peers.some((p) => p.id === originalHost.current)) {
      originalHost.current = null
      setSession(null)
      setNotice('The host left. Start a new game with a fresh deal.')
    }
  }, [peers])
  function start() {
    if (!mayControl) return
    const picked = seats.find((p) => !p.bot && p.id === chosen)?.id ?? myId()
    chooseTheOne(picked)
    const next = { id: nextSeed(), at: Date.now() + 3500, phase: 'counting' as const, paused: false }
    originalHost.current = myId()
    setNotice('')
    setSession(next)
    if (online) sendToRoom({ tag: TAG, kind: 'preview', action: 'start', ...next, chosen: picked })
  }
  function pause() {
    if (!session || !mayControl || session.phase !== 'playing') return
    const paused = !session.paused
    setSession({ ...session, paused })
    if (online) sendToRoom({ tag: TAG, kind: 'preview', action: 'pause', id: session.id, paused })
  }
  return <main className="trust-preview">
    <nav className="trust-preview-bar">
      <a href="./preview.html">TRUST ME BRO <span>GAME PREVIEW</span></a>
      <div className="trust-lobby-controls">
        {!online ? <><input aria-label="Player name" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} /><button onClick={() => { setSession(null); createLobby(makeCode(), name) }}>Create lobby</button><input aria-label="Lobby code" placeholder="CODE" maxLength={5} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} /><button disabled={code.length !== 5} onClick={() => { setSession(null); joinLobby(code, name) }}>Join</button></> : <><span className="trust-room">{net.room} · {peers.length + 1} players · {net.host ? 'host' : 'guest'}</span><button onClick={() => { setSession(null); leaveLobby() }}>Leave</button></>}
        {mayControl && <><select aria-label="Solo player" disabled={!!session && session.phase !== 'over'} value={chosen ?? myId()} onChange={(e) => chooseTheOne(e.target.value)}>{seats.filter((p) => !p.bot).map((p) => <option key={p.id} value={p.id}>{p.id === myId() ? 'you' : peers.find((peer) => peer.id === p.id)?.name ?? p.id} as solo</option>)}</select><button className="trust-start" data-start onClick={start}>{session ? 'New game' : 'Play'}</button></>}
        {session && mayControl && <button onClick={pause} disabled={session.phase !== 'playing'}>{session.paused ? 'Resume' : 'Pause'}</button>}
      </div>
    </nav>
    {notice && <div className="trust-preview-notice" role="status">{notice}</div>}
    {net.why && <div className="trust-preview-notice" role="alert">{net.why}</div>}
    <div className="trust-preview-content">
      {session ? <><TrustMeBroPanel key={session.id} run={session} standalone />{session.phase === 'counting' && <div className="trust-preview-overlay"><CountOver left={Math.max(0, (session.at - clock) / 1000)} /></div>}{session.paused && <div className="trust-preview-overlay trust-preview-paused"><strong>Take a breath.</strong><p>The round is paused for everyone.</p></div>}</> : <div className="trust-welcome"><span>ONE VS EVERYONE</span><h1>Trust me,<br/>bro<span>.</span></h1><p>One safe trapdoor. A room full of very confident opinions.</p><div className="trust-welcome-odds">1/5 <i>→</i> 1/4 <i>→</i> 1/3 <i>→</i> 1/2</div><p>Four rounds. Find solid ground twice to win.<br/>A fall won’t stop you from trying the next round.</p><div className="trust-welcome-controls"><div><b>THE SOLO PLAYER</b><p>A / W — previous door<br/>D / S — next door<br/>Space — choose</p></div><div><b>THE ADVISERS</b><p>Mouse — point at a door<br/>Keyboard — type encouragement<br/>Tell the truth. Or don’t.</p></div></div>{mayControl ? <button onClick={start}>Let’s hear them out ↗</button> : <p className="trust-host-wait">Waiting for the host to start…</p>}</div>}
    </div>
  </main>
}

// Exposed public APIs help the repo's CDP browser-review skill join a lobby.
Object.assign(window, { __trustPreview: { createLobby, joinLobby, getNet, getPeers, chooseTheOne } })
createRoot(document.getElementById('root')!).render(<Preview />)
