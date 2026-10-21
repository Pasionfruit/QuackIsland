import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createLobby, getNet, getPeers, isHost, joinLobby, leaveLobby, makeCode, sendToRoom, subscribeRoom, useNet, usePeers } from '../09-net'
import { chooseTheOne, CountOver, useTheOne, type RunPhase } from '../15-minigames'
import { isCount, myId } from '../68-minigame-kit'
import { DuckSznPanel } from './internal/DuckSznPanel'
import { gameRoster, nextSeed } from './internal/setup'
import { TAG } from './internal/wire'
import './internal/preview.css'

interface Session { id: number; phase: RunPhase; paused: boolean; go: number }
function Preview() {
  const net = useNet(), peers = usePeers(), chosen = useTheOne()
  const [name, setName] = useState('player'), [code, setCode] = useState('')
  const [session, setSession] = useState<Session | null>(null)
  const [clock, setClock] = useState(Date.now()), [notice, setNotice] = useState('')
  const originalHost = useRef<string | null>(null)
  const online = net.status === 'joined', controller = !online || net.host
  const roster = gameRoster().filter((p) => !p.bot)
  useEffect(() => { const interval = window.setInterval(() => setClock(Date.now()), 100); return () => window.clearInterval(interval) }, [])
  useEffect(() => subscribeRoom((from, raw) => {
    if (raw.tag !== TAG || raw.kind !== 'preview' || !isHost(from, [myId(), ...getPeers().map((p) => p.id)])) return
    if (raw.action === 'start' && isCount(raw.id) && typeof raw.go === 'number' && Number.isFinite(raw.go) && Math.abs(raw.go - Date.now()) < 10000 && typeof raw.hunter === 'string') {
      originalHost.current = from; chooseTheOne(raw.hunter); setNotice('')
      setSession({ id: raw.id as number, phase: 'counting', paused: false, go: raw.go })
    } else if (raw.action === 'pause' && typeof raw.paused === 'boolean') setSession((s) => s && s.id === raw.id ? { ...s, paused: raw.paused as boolean } : s)
  }), [])
  useEffect(() => { if (session?.phase === 'counting' && clock >= session.go) setSession((s) => s && { ...s, phase: 'playing' }) }, [clock, session])
  useEffect(() => {
    if (originalHost.current && originalHost.current !== myId() && !peers.some((p) => p.id === originalHost.current)) {
      originalHost.current = null; setSession(null); setNotice('The host left. Start a fresh hunt with the new host.')
    }
  }, [peers])
  function start() {
    if (!controller) return
    const hunter = roster.find((p) => p.id === chosen)?.id ?? myId()
    const next: Session = { id: nextSeed(), phase: 'counting', paused: false, go: Date.now() + 3500 }
    chooseTheOne(hunter); originalHost.current = myId(); setSession(next); setNotice('')
    if (online) sendToRoom({ tag: TAG, kind: 'preview', action: 'start', ...next, hunter })
  }
  function pause() {
    if (!controller || !session || session.phase !== 'playing') return
    setSession({ ...session, paused: !session.paused })
    if (online) sendToRoom({ tag: TAG, kind: 'preview', action: 'pause', id: session.id, paused: !session.paused })
  }
  return <main className="duck-preview" data-run-phase={session?.phase ?? 'lobby'} data-paused={String(session?.paused ?? false)}>
    <nav className="duck-preview-nav"><a href="./preview.html">DUCK SZN <small>PLAYABLE PREVIEW</small></a><div>
      {online ? <><span>{net.room} · {peers.length + 1} players · {net.host ? 'host' : 'guest'}</span><button onClick={() => { setSession(null); leaveLobby() }}>Leave</button></> : <><input aria-label="Player name" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} /><button onClick={() => { setSession(null); createLobby(makeCode(), name) }}>Create lobby</button><input aria-label="Lobby code" value={code} maxLength={5} placeholder="CODE" onChange={(e) => setCode(e.target.value.toUpperCase())} /><button disabled={code.length !== 5} onClick={() => { setSession(null); joinLobby(code, name) }}>Join</button></>}
      {controller && <><select aria-label="Hunter" data-hunter-select value={chosen ?? myId()} onChange={(e) => chooseTheOne(e.target.value)}>{roster.map((p) => <option key={p.id} value={p.id}>{p.id === myId() ? 'you' : peers.find((peer) => peer.id === p.id)?.name ?? p.id} as hunter</option>)}</select><button className="duck-preview-start" data-preview-start onClick={start}>{session ? 'New hunt' : 'Start hunt'}</button></>}
      {controller && session && <button data-preview-pause disabled={session.phase !== 'playing'} onClick={pause}>{session.paused ? 'Resume' : 'Pause'}</button>}
    </div></nav>
    {(notice || net.why) && <div className="duck-preview-notice" role="status">{notice || net.why}</div>}
    <div className="duck-preview-content">{session ? <><DuckSznPanel key={session.id} run={session} standalone />{session.phase === 'counting' && <div className="duck-countdown"><CountOver left={Math.max(0, (session.go - clock) / 1000)} /></div>}{session.paused && <div className="duck-preview-pause"><span>HUNT ON HOLD</span><h2>Take cover.<br/>Take a breath.</h2><p>The clock is paused for everyone.</p></div>}</> : <div className="duck-welcome"><span className="duck-welcome-kicker">A MINUTE IN THE MARSH</span><h1>Duck szn<span>.</span></h1><p>One hunter. The rest of you? Sitting ducks.<br/>Well, preferably running ducks.</p><div className="duck-welcome-score"><strong>60</strong><span>SECONDS TO FIND THEM ALL.<br/>OR ONE MINUTE TO DISAPPEAR.</span></div><div className="duck-welcome-rules"><article><span>01 / THE HUNTER</span><h2>Find. Aim. Tag.</h2><p>WASD to move. Mouse to aim.<br/>Left click to shoot. Tag every duck to win.</p></article><article><span>02 / THE FLOCK</span><h2>Make yourself scarce.</h2><p>WASD to run. Mouse to look.<br/>Hold Space to crouch behind low cover.</p></article></div><p className="duck-welcome-tip">If even one duck survives the minute, the whole flock wins.</p>{controller ? <button onClick={start}>Open season ↗</button> : <p>Waiting for the host to start…</p>}</div>}</div>
  </main>
}
Object.assign(window, { __duckPreview: { createLobby, joinLobby, getNet, getPeers, chooseTheOne, makeCode } })
createRoot(document.getElementById('root')!).render(<Preview />)
