import { DEFAULT_PORT, type ClientMessage, type PeerInfo, type ServerMessage, type Slot } from './protocol'

export type NetStatus = 'idle' | 'connecting' | 'lobby' | 'closed' | 'error'

export interface NetEvents {
  onStatus?: (status: NetStatus, detail?: string) => void
  onRoom?: (code: string, slot: Slot) => void
  onPeers?: (players: PeerInfo[]) => void
  onPayload?: (payload: unknown, from: Slot) => void
}

/**
 * Where the relay lives by default.
 *
 * In dev, `npm run dev:all` runs Vite and the relay as two separate
 * processes on two different ports, so this points at the relay's own port
 * on whatever host served the page - that is what lets a friend on the LAN
 * join a game running on your machine while you are editing it.
 *
 * A production build is different: `server/index.mjs` serves the built site
 * *and* the relay from the same process on the same port (see that file for
 * why - a free host only gives you the one), so the site and the socket
 * share an origin. Same host, same port, just a different scheme - which
 * also happens to be what a browser requires anyway, since a page served
 * over `https:` refuses to open a plain `ws:` socket as mixed content.
 */
export function defaultServerUrl(): string {
  if (typeof window === 'undefined') return `ws://localhost:${DEFAULT_PORT}`
  if (import.meta.env.DEV) {
    return `ws://${window.location.hostname || 'localhost'}:${DEFAULT_PORT}`
  }
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${scheme}://${window.location.host}`
}

/**
 * A thin wrapper over one WebSocket. It knows about rooms and slots; anything
 * game-specific rides along inside `send`.
 */
export class NetClient {
  private ws: WebSocket | null = null
  private events: NetEvents = {}
  private queue: ClientMessage[] = []

  status: NetStatus = 'idle'
  code = ''
  slot: Slot = -1
  peers: PeerInfo[] = []
  url = ''

  get isHost(): boolean {
    return this.slot === 0
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  /** The name the server has for this client, for payloads that name a player. */
  get displayName(): string {
    return this.peers.find((p) => p.slot === this.slot)?.name ?? 'Somebody'
  }

  on(events: NetEvents): void {
    this.events = { ...this.events, ...events }
  }

  private setStatus(status: NetStatus, detail?: string): void {
    this.status = status
    this.events.onStatus?.(status, detail)
  }

  private connect(url: string, first: ClientMessage): void {
    this.close()
    this.url = url
    this.setStatus('connecting')
    let ws: WebSocket
    try {
      ws = new WebSocket(url)
    } catch {
      this.setStatus('error', `Could not open ${url}`)
      return
    }
    this.ws = ws
    this.queue = [first]

    ws.onopen = () => {
      for (const m of this.queue) ws.send(JSON.stringify(m))
      this.queue = []
    }
    ws.onmessage = (ev) => {
      let msg: ServerMessage
      try {
        msg = JSON.parse(String(ev.data)) as ServerMessage
      } catch {
        return
      }
      this.handle(msg)
    }
    ws.onerror = () => {
      this.setStatus('error', 'Could not reach the Polyland server. Is `npm run server` running?')
    }
    ws.onclose = () => {
      if (this.status !== 'error') this.setStatus('closed', 'Connection closed')
      this.ws = null
    }
  }

  private handle(msg: ServerMessage): void {
    switch (msg.t) {
      case 'hosted':
      case 'joined':
        this.code = msg.code
        this.slot = msg.slot
        this.setStatus('lobby')
        this.events.onRoom?.(msg.code, msg.slot)
        break
      case 'peers':
        this.peers = msg.players
        this.events.onPeers?.(msg.players)
        break
      case 'relay':
        this.events.onPayload?.(msg.payload, msg.from)
        break
      case 'closed':
        this.setStatus('closed', msg.reason)
        break
      case 'error':
        this.setStatus('error', msg.message)
        break
      default:
        break
    }
  }

  host(url: string, name: string, game = 'smash', max = 4): void {
    this.connect(url, { t: 'host', game, name, max })
  }

  join(url: string, code: string, name: string): void {
    this.connect(url, { t: 'join', code, name })
  }

  /** Sends a game payload to everyone else in the room, or just the given slots if `to` is set. */
  send(payload: unknown, to?: Slot[]): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(to ? { t: 'relay', payload, to } : { t: 'relay', payload }))
    }
  }

  /** An escape hatch for a top-level message the server itself answers (Case Closed's `deal`/`accuse`), not a `relay`. */
  sendRaw(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg))
  }

  close(): void {
    const ws = this.ws
    this.ws = null
    if (ws) {
      ws.onclose = null
      ws.onerror = null
      ws.onmessage = null
      try {
        ws.close()
      } catch {
        /* already gone */
      }
    }
    this.code = ''
    this.slot = -1
    this.peers = []
    if (this.status !== 'idle') this.setStatus('idle')
  }
}
