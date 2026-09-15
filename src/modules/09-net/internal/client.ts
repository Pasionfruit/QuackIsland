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
  smoothPing,
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

/**
 * What a socket closing means, given what the status already was.
 *
 * A connection that never opened fires `error` and then `close`, one after the
 * other. Writing `offline` over the top of the error throws away the only
 * explanation the player gets - and `offline` is exactly what the panel said
 * before they pressed anything, so the whole attempt looks like a button that
 * does nothing. That is what "I cannot join" looked like: the relay was not
 * running, the game knew, and it said nothing.
 *
 * So an error survives the close that follows it. Anything else is a
 * connection that was up and is not any more, which is plainly offline.
 */
export function statusAfterClose(status: NetStatus): NetStatus {
  return status === 'error' ? 'error' : 'offline'
}

/**
 * Why a connection could not be made, in words a player can act on.
 *
 * In development the relay is a second process that people forget to start -
 * it is the first thing to check and the fix is one command, so the message is
 * the command. In production the relay is whatever served the page, so there
 * is nothing the player could start and the message only says what happened.
 */
export function relayProblem(): string {
  const where = relayUrl()
  return import.meta.env?.DEV
    ? `no relay at ${where} - run: npm run relay`
    : `the relay at ${where} is not answering`
}

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

/** One other person in the lobby, for a scoreboard. */
export interface PeerInfo {
  id: string
  name: string
  /** Round trip in milliseconds, or null until one has come back. */
  ping: number | null
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

/**
 * Everyone in the room, for the DOM.
 *
 * Separate from `tracks` on purpose: that is read sixty times a second by the
 * renderer and must never touch React, while this changes when somebody joins,
 * leaves, or a ping comes back, and is what a scoreboard renders.
 */
const roster = createStore<PeerInfo[]>([])

export function usePeers(): PeerInfo[] {
  return useStore(roster)
}

export function getPeers(): PeerInfo[] {
  return roster.get()
}

/** Rebuilt whenever the room changes, so React sees a new array. */
function publishRoster(): void {
  const list: PeerInfo[] = []
  for (const [id, track] of tracks) {
    list.push({ id, name: track.name, ping: pings.get(id) ?? null })
  }
  list.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }))
  roster.set(list)
}

const pings = new Map<string, number>()
/** When each outstanding ping went out, keyed by the token it carried. */
const sentAt = new Map<number, number>()
let pingToken = 1

/**
 * Anything the transport does not understand itself.
 *
 * `10-party` uses this rather than this module learning what a board game is:
 * the relay passes opaque messages, so the only thing that has to be shared is
 * how to send one and how to hear one.
 */
type RoomHandler = (from: string, message: Record<string, unknown>) => void
const roomHandlers = new Set<RoomHandler>()

export function subscribeRoom(handler: RoomHandler): () => void {
  roomHandlers.add(handler)
  return () => roomHandlers.delete(handler)
}

/** Sends an arbitrary object to everyone else in the room. */
export function sendToRoom(payload: Record<string, unknown>): void {
  const ws = socket
  if (!ws || ws.readyState !== WebSocket.OPEN) return
  ws.send(JSON.stringify(payload))
}

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
let pinging: ReturnType<typeof setInterval> | null = null
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

/**
 * Starts a lobby of your own, under a code you chose.
 *
 * **Not the same call as joining one**, and the difference is on the wire. The
 * relay used to make a room if there was not one and put you in it either way,
 * which meant typing somebody else's code into your own box and pressing
 * create walked you into their party. Now it is refused, with words.
 */
export function createLobby(rawCode: string, rawName: string): void {
  open(rawCode, rawName, true)
}

/**
 * Joins somebody else's, under the code they gave you.
 *
 * A code nobody is using is refused rather than made. Mistyping one used to
 * land you alone in a room nobody else would ever be in - host of it, with
 * everything looking like it had worked, waiting.
 */
export function joinLobby(rawCode: string, rawName: string): void {
  open(rawCode, rawName, false)
}

function open(rawCode: string, rawName: string, make: boolean): void {
  const room = normaliseCode(rawCode)
  if (!room) {
    set({ status: 'error', why: 'that is not a lobby code', room: null, id: null, peers: 0 })
    return
  }

  leaveLobby()
  myName = cleanName(rawName)
  // Not host until the relay says who is in the room. Leaving set it true -
  // alone you are your own host - and carrying that through a connection would
  // flash a start button at somebody who is about to be a guest.
  set({ status: 'connecting', room, id: null, peers: 0, why: null, host: false })

  let ws: WebSocket
  try {
    ws = new WebSocket(relayUrl())
  } catch (error) {
    console.error('[09-net] could not open a connection', error)
    set({ status: 'error', why: relayProblem() })
    return
  }
  socket = ws

  ws.onopen = () => {
    ws.send(JSON.stringify({ t: 'join', room, name: myName, make }))
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
      publishRoster()
      return
    }

    if (message.t === 'peer' && typeof message.id === 'string') {
      if (!tracks.has(message.id)) {
        tracks.set(message.id, createTrack(typeof message.name === 'string' ? message.name : 'duck'))
      }
      set({ peers: tracks.size })
      electHost()
      publishRoster()
      return
    }

    if (message.t === 'gone' && typeof message.id === 'string') {
      tracks.delete(message.id)
      pings.delete(message.id)
      set({ peers: tracks.size })
      electHost()
      publishRoster()
      return
    }

    // A round trip. Anybody who hears a ping answers it; the sender times it.
    if (message.t === 'ping' && typeof message.n === 'number') {
      sendToRoom({ t: 'pong', n: message.n, to: message.from })
      return
    }
    if (message.t === 'pong' && typeof message.n === 'number' && message.to === info.get().id) {
      const out = sentAt.get(message.n)
      const from = typeof message.from === 'string' ? message.from : null
      if (out !== undefined && from) {
        pings.set(from, smoothPing(pings.get(from) ?? null, performance.now() - out))
        publishRoster()
      }
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
    if (!duck) {
      // Not a duck, so it belongs to whoever asked for it - the party module,
      // or anything else that grows later.
      for (const handler of roomHandlers) handler(from, message)
      return
    }

    let track = tracks.get(from)
    if (!track) {
      track = createTrack(duck.name)
      tracks.set(from, track)
      set({ peers: tracks.size })
      electHost()
    }
    const renamed = track.name !== duck.name
    track.name = duck.name
    record(track, performance.now() / 1000, duck.state)
    if (renamed) publishRoster()
  }

  ws.onclose = () => {
    if (socket !== ws) return
    tracks.clear()
    pings.clear()
    roster.set([])
    // Alone again, so the clock is yours. The status is whatever the close
    // actually means - see `statusAfterClose`; a refused connection has
    // already said why and must not be talked over.
    set({ status: statusAfterClose(info.get().status), id: null, peers: 0, host: true })
  }

  ws.onerror = () => {
    set({ status: 'error', why: relayProblem() })
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

  pinging = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN || tracks.size === 0) return
    const token = pingToken++
    sentAt.set(token, performance.now())
    // Anything still outstanding after a few seconds is never coming back.
    for (const [old, when] of sentAt) {
      if (performance.now() - when > 6000) sentAt.delete(old)
    }
    ws.send(JSON.stringify({ t: 'ping', n: token }))
  }, 1000 / NET.pingRate)
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
  if (pinging) {
    clearInterval(pinging)
    pinging = null
  }
  world = null
  pings.clear()
  sentAt.clear()
  roster.set([])
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
  for (const id of gone) {
    tracks.delete(id)
    pings.delete(id)
  }
  set({ peers: tracks.size })
  electHost()
  publishRoster()
}
