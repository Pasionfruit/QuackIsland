import { useThree } from '@react-three/fiber'
import { createRoot } from 'react-dom/client'
import { useEffect, useRef, useState } from 'react'
import { Group } from 'three'
import { PRIORITY, useGameFrame } from '../../00-core'
import { EMOTE_LABELS, FACE_EMOTES, getViewMode, setFaceEmote, type FaceEmote, useViewMode } from '../../02-player'
import { getPeers, peerAt, useNet } from '../../09-net'
import { getParty, useParty } from '../../10-party'
import { getMinigameScreen, useMinigameScreen } from '../../15-minigames'
import { aimedLobbyTarget, LOBBY_PISTOL } from './rules'
import { listenForLobbyPistols, shootLobbyPlayer, syncLobbyPistolRoom, useLobbyPistols } from './state'
import './lobby-pistols.css'

/** The pistol is available only while the shared world is functioning as a lobby. */
export function isLobbyPistolActive(): boolean {
  return getParty().phase !== 'playing' && getMinigameScreen().at === 'closed'
}

export function LobbyPistols(): React.JSX.Element {
  const domElement = useThree((state) => state.gl.domElement)
  const camera = useThree((state) => state.camera)
  const net = useNet()
  const party = useParty()
  const screen = useMinigameScreen()
  const active = useRef(false)
  const lastShot = useRef(-Infinity)

  active.current = party.phase !== 'playing' && screen.at === 'closed'

  useEffect(() => listenForLobbyPistols(), [])
  useEffect(() => syncLobbyPistolRoom(net.room), [net.room])

  useEffect(() => {
    let down: { x: number; y: number } | null = null
    const onDown = (event: MouseEvent) => {
      // The first click enters lobby mouse look. Only a click made after the
      // pointer is locked is a pistol trigger, so entering the lobby never
      // fires a surprise shot.
      if (event.button === 0 && active.current && document.pointerLockElement === domElement) {
        down = { x: event.clientX, y: event.clientY }
      }
    }
    const onUp = (event: MouseEvent) => {
      const press = down
      down = null
      if (!press || event.button !== 0 || !active.current || getViewMode() !== 'first') return
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 6) return
      const now = performance.now() / 1000
      if (now - lastShot.current < LOBBY_PISTOL.cooldownSeconds) return
      const origin = camera.getWorldPosition(camera.position.clone())
      const direction = camera.getWorldDirection(camera.position.clone())
      const targets = getPeers().flatMap((peer) => {
        const state = peerAt(peer.id, now)
        return state ? [{ id: peer.id, x: state.x, y: state.y, z: state.z }] : []
      })
      const targetId = aimedLobbyTarget(origin, direction, targets)
      if (!targetId) return
      lastShot.current = now
      shootLobbyPlayer(targetId)
    }
    domElement.addEventListener('mousedown', onDown)
    window.addEventListener('mouseup', onUp)
    return () => {
      domElement.removeEventListener('mousedown', onDown)
      window.removeEventListener('mouseup', onUp)
    }
  }, [camera, domElement])

  return (
    <>
      <ViewPistol active={active} />
      <LobbyPistolHudMount />
      <LobbyEmoteWheelMount />
    </>
  )
}

function PistolShape(): React.JSX.Element {
  const material = <meshBasicMaterial color="#242a35" depthTest={false} />
  const accent = <meshBasicMaterial color="#f2bd42" depthTest={false} />
  return <>
    <mesh renderOrder={120}>{/* slide */}<boxGeometry args={[0.1, 0.12, 0.42]} />{material}</mesh>
    <mesh renderOrder={121} position={[0, 0.045, -0.08]}><boxGeometry args={[0.106, 0.036, 0.34]} />{accent}</mesh>
    <mesh renderOrder={120} position={[0, -0.11, 0.09]} rotation={[0.32, 0, 0]}><boxGeometry args={[0.075, 0.15, 0.1]} />{material}</mesh>
    <mesh renderOrder={122} position={[0, 0.005, -0.23]} rotation={[Math.PI / 2, 0, 0]}>{/* muzzle */}<cylinderGeometry args={[0.036, 0.036, 0.034, 8]} />{accent}</mesh>
  </>
}

function ViewPistol({ active }: { active: React.MutableRefObject<boolean> }): React.JSX.Element {
  const camera = useThree((state) => state.camera)
  const gun = useRef<Group>(null)
  useGameFrame(() => {
    const root = gun.current
    if (!root) return
    root.visible = active.current && getViewMode() === 'first'
    if (!root.visible) return
    root.position.copy(camera.position)
    root.quaternion.copy(camera.quaternion)
    root.translateX(0.22)
    root.translateY(-0.2)
    root.translateZ(-0.55)
  }, PRIORITY.post)
  return <group ref={gun} scale={0.72}><PistolShape /></group>
}

function LobbyPistolHudMount(): null {
  useEffect(() => {
    const mount = document.createElement('div')
    mount.dataset.lobbyPistolHud = ''
    document.body.append(mount)
    const root = createRoot(mount)
    root.render(<LobbyPistolHud />)
    return () => {
      root.unmount()
      mount.remove()
    }
  }, [])
  return null
}

function LobbyPistolHud(): React.JSX.Element | null {
  const net = useNet()
  const party = useParty()
  const screen = useMinigameScreen()
  const view = useViewMode()
  const state = useLobbyPistols()
  if (!net.id || party.phase === 'playing' || screen.at !== 'closed') return null
  const score = state.scores[net.id] ?? { kills: 0, deaths: 0 }
  return <>
    {view === 'first' && <i className="lobby-pistol-crosshair" aria-hidden="true" />}
    <aside className="lobby-pistol-hud" aria-label="Lobby K/D">
      <strong>K/D</strong>
      <span><b>{score.kills}</b> / <b>{score.deaths}</b></span>
    </aside>
  </>
}

/** A DOM wheel because choosing a face needs normal mouse hover, not a 3D ray. */
function LobbyEmoteWheelMount(): null {
  useEffect(() => {
    const mount = document.createElement('div')
    mount.dataset.lobbyEmoteWheel = ''
    document.body.append(mount)
    const root = createRoot(mount)
    root.render(<LobbyEmoteWheel />)
    return () => {
      root.unmount()
      mount.remove()
    }
  }, [])
  return null
}

function LobbyEmoteWheel(): React.JSX.Element | null {
  const party = useParty()
  const screen = useMinigameScreen()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<FaceEmote>('smile')
  const wheelOpen = useRef(false)
  const choice = useRef<FaceEmote>('smile')
  const reset = useRef<ReturnType<typeof setTimeout> | null>(null)
  const active = party.phase !== 'playing' && screen.at === 'closed'

  const choose = (emote: FaceEmote) => {
    choice.current = emote
    setSelected(emote)
    setFaceEmote(emote)
  }

  useEffect(() => {
    const clearReset = () => {
      if (reset.current !== null) clearTimeout(reset.current)
      reset.current = null
    }
    const onDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (!active || event.code !== 'KeyE' || event.repeat || target?.matches('input, textarea, [contenteditable=true]')) return
      clearReset()
      choice.current = 'smile'
      setSelected('smile')
      setFaceEmote('smile')
      // Leave free look so the selector can follow the real cursor.
      if (document.pointerLockElement) document.exitPointerLock()
      wheelOpen.current = true
      setOpen(true)
      event.preventDefault()
    }
    const onUp = (event: KeyboardEvent) => {
      if (event.code !== 'KeyE' || !wheelOpen.current) return
      wheelOpen.current = false
      setOpen(false)
      setFaceEmote(choice.current)
      reset.current = setTimeout(() => setFaceEmote('smile'), 3000)
      event.preventDefault()
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      clearReset()
    }
  }, [active])

  useEffect(() => {
    if (active) return
    wheelOpen.current = false
    setOpen(false)
    setFaceEmote('smile')
  }, [active])

  if (!open || !active) return null
  return <aside className="lobby-emote-wheel" aria-label="Face emotes">
    <strong>FACE EMOTES</strong>
    <span>hold E · hover a face · release E</span>
    <div>
      {FACE_EMOTES.filter((emote) => emote !== 'smile').map((emote) => (
        <button
          key={emote}
          type="button"
          onMouseEnter={() => choose(emote)}
          onMouseDown={(event) => {
            event.preventDefault()
            choose(emote)
          }}
          aria-pressed={selected === emote}
          className={selected === emote ? 'selected' : undefined}
        >
          {EMOTE_LABELS[emote]}
        </button>
      ))}
    </div>
  </aside>
}
