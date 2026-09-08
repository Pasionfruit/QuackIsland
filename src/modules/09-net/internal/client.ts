/**
 * The connection to a lobby.
 *
 * Owns one WebSocket, the list of peers, and the snapshot history for each.
 * Everything decidable without a socket is in `protocol.ts` and
 * `interpolate.ts`; this is the part that genuinely needs one.
 *
 * Peer positions are **not** React state. They arrive fifteen times a second
 * per player and are read every frame by the renderer; putting them through
 * React would re-render the tree sixty times a second for nothing. What React
 * does see is the connection status and who is in the room, which changes
 * rarely.
 */
import {
  WEATHER_KINDS,
  createStore,
  getDayTime,
  getTimeScale,
  getWeather,
  isCycleRunning,
  setCycleRunning,
  setDayTime,
  setTimeScale,
  setWeather,
  useStore,
  type WeatherKind,
} from '../../00-core'
import { createTrack, record, sampleTrack, stale, type Track } from './interpolate'
import {
  NET,
  cleanName,
  dayCorrection,
  decodeMessage,
  decodeWorld,
  encodeState,
  encodeWorld,
  isHost,
  normaliseCode,
  type DuckState,
  type WorldState,
} from './protocol'

export type NetStatus = 'offline' | 'connecting' | 'joined' | 'error'

export interface NetInfo {
  status: NetStatus
  /** The room you are in, or the last one tried. */
  room: string | null
  /** Your own id, once the relay has given you one. */
  id: string | null
  /** How many other people are here. */
  peers: number
  /**
   * Whether you are the one driving the clock and the weather.
   *
   * The lowest id in the room, worked out locally - see `isHost`. Alone in a
   * lobby you are the host, so nothing is taken away by joining.
   */
  host: boolean
  /** Set when the status is 'error'. */
  why: string | null
}

const info = createStore<NetInfo>({
  status: 'offline',
  room: null,
  id: null,
  peers: 0,
  host: true,
  why: null,
})

export function useNet(): NetInfo {
  return useStore(info)
}

export function getNet(): NetInfo {
  return info.get()
}

/** Live peer tracks, read by the renderer every frame. Never in React state. */
const tracks = new Map<string, Track>()

export function peerTracks(): ReadonlyMap<string, Track> {
  return tracks
}

/** Where a peer should be drawn right now, or null if they have never spoken. */
export function peerAt(id: string, now: number): DuckState | null {
  const track = tracks.get(id)
  return track ? sampleTrack(track, now) : null
}

let socket: WebSocket | null = null
let sending: ReturnType<typeof setInterval> | null = null
let worldTimer: ReturnType<typeof setInterval> | null = null
let myName = 'duck'
/** What to send. Set by the player each frame; read by the send timer. */
let outgoing: DuckState | null = null
/** The host's clock and weather, as last heard. Null when you are the host. */
let world: WorldState | null = null

/** Recomputed whenever the room changes; nobody has to be told who is host. */
function electHost(): void {
  const me = info.get().id
  const host = isHost(me, [me ?? '', ...tracks.keys()].filter(Boolean))
  if (host !== info.get().host) set({ host })
  // Stepping up means your own clock is the clock again.
  if (host) world = null
}

/**
 * Where the relay is.
 *
 * In development Vite serves the game and the relay is a separate process, so
 * this points at it explicitly. In production one process serves both, so the
 * relay is wherever the page came from and no configuration is needed at all -
 * which is the thing that makes deploying this a single service.
 */
export function relayUrl(): string {
  const configured = import.meta.env?.VITE_RELAY_URL
  if (configured) return configured
  if (typeof window === 'undefined') return 'ws://localhost:8791'
  const secure = window.location.protocol === 'https:'
  const scheme = secure ? 'wss:' : 'ws:'
  // Vite's dev server does not relay, so in dev assume the relay's own port.
  const host = import.meta.env?.DEV ? `${window.location.hostname}:8791` : window.location.host
  return `${scheme}//${host}`
}

function set(patch: Partial<NetInfo>): void {
  info.set({ ...info.get(), ...patch })
}

export function joinLobby(rawCode: string, rawName: string): void {
  const room = normaliseCode(rawCode)
  if (!room) {
    set({ status: 'error', why: 'that is not a lobby code', room: null, id: null, peers: 0 })
    return
  }

  leaveLobby()
  myName = cleanName(rawName)
  set({ status: 'connecting', room, id: null, peers: 0, why: null })

  let ws: WebSocket
  try {
    ws = new WebSocket(relayUrl())
  } catch (error) {
    console.error('[09-net] could not open a connection', error)
    set({ status: 'error', why: 'could not reach the relay' })
    return
  }
  socket = ws

  ws.onopen = () => {
    ws.send(JSON.stringify({ t: 'join', room, name: myName }))
  }

  ws.onmessage = (event) => {
    let message: Record<string, unknown>
    try {
      message = JSON.parse(String(event.data))
    } catch {
      return
    }

    if (message.t === 'joined') {
      const peers = Array.isArray(message.peers) ? message.peers : []
      for (const id of peers) {
        if (typeof id === 'string') tracks.set(id, createTrack('duck'))
      }
      set({
        status: 'joined',
        id: typeof message.id === 'string' ? message.id : null,
        peers: tracks.size,
        why: null,
      })
      electHost()
      return
    }

    if (message.t === 'peer' && typeof message.id === 'string') {
      if (!tracks.has(message.id)) tracks.set(message.id, createTrack('duck'))
      set({ peers: tracks.size })
      electHost()
      return
    }

    if (message.t === 'gone' && typeof message.id === 'string') {
      tracks.delete(message.id)
      set({ peers: tracks.size })
      electHost()
      return
    }

    if (message.t === 'world') {
      // Only from the host, and only when you are not it. Two clients both
      // believing they are host would otherwise fight over the sun.
      if (info.get().host) return
      const heard = decodeWorld(String(event.data), WEATHER_KINDS)
      if (heard) world = heard
      return
    }

    if (message.t === 'error') {
      set({ status: 'error', why: typeof message.why === 'string' ? message.why : 'refused' })
      return
    }

    // Anything else is a relayed game message, stamped with who sent it.
    const from = typeof message.from === 'string' ? message.from : null
    if (!from) return
    const duck = decodeMessage(String(event.data))
    if (!duck) return

    let track = tracks.get(from)
    if (!track) {
      track = createTrack(duck.name)
      tracks.set(from, track)
      set({ peers: tracks.size })
    }
    track.name = duck.name
    record(track, performance.now() / 1000, duck.state)
  }

  ws.onclose = () => {
    if (socket === ws) {
      tracks.clear()
      set({ status: 'offline', id: null, peers: 0 })
    }
  }

  ws.onerror = () => {
    set({ status: 'error', why: 'the relay is not answering' })
  }

  sending = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN || !outgoing) return
    ws.send(encodeState(myName, outgoing))
  }, 1000 / NET.sendRate)

  // The host publishes the world. Once a second is plenty: guests run the same
  // clock at the same speed and only need correcting for drift.
  worldTimer = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN || !info.get().host) return
    ws.send(
      encodeWorld({
        day: getDayTime(),
        scale: getTimeScale(),
        running: isCycleRunning(),
        weather: getWeather(),
      }),
    )
  }, 1000 / NET.worldRate)
}

export function leaveLobby(): void {
  if (sending) {
    clearInterval(sending)
    sending = null
  }
  if (worldTimer) {
    clearInterval(worldTimer)
    worldTimer = null
  }
  world = null
  const ws = socket
  socket = null
  tracks.clear()
  if (ws) {
    ws.onclose = null
    ws.onerror = null
    ws.close()
  }
  // Alone again, so the clock is yours.
  set({ status: 'offline', id: null, peers: 0, host: true, why: null })
}

/**
 * Brings this client's clock and weather towards the host's.
 *
 * Called every frame. The host does nothing here; a guest adopts the host's
 * speed and weather outright - those are not worth easing - and eases the time
 * of day, because a snap is visible as a jump in the light.
 */
export function followWorld(dt: number): void {
  if (!world || info.get().host) return

  if (getTimeScale() !== world.scale) setTimeScale(world.scale)
  if (isCycleRunning() !== world.running) setCycleRunning(world.running)
  if (getWeather() !== world.weather) setWeather(world.weather as WeatherKind)

  const correction = dayCorrection(getDayTime(), world.day, dt)
  if (correction !== 0) setDayTime(getDayTime() + correction)
  // The host's own clock keeps running between updates, so move the target on
  // with it rather than pulling the guest back to a second ago.
  if (world.running) world.day += (dt * world.scale) / 3600
}

/** Called by the renderer each frame with the local duck's state. */
export function publish(state: DuckState): void {
  outgoing = state
}

/** Drops peers that have gone quiet. Called from the frame loop. */
export function sweep(now: number): void {
  const gone = stale(tracks, now)
  if (gone.length === 0) return
  for (const id of gone) tracks.delete(id)
  set({ peers: tracks.size })
  electHost()
}
