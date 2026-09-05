/**
 * Polyland: the relay, and - so this is one thing a free host can run - the
 * built site too.
 *
 * The relay itself is deliberately dumb: it hands out room codes and forwards
 * payloads between the people in a room. It never simulates a game, so every
 * future Polyland game can use it as-is - the host's browser is always the
 * authority.
 *
 * Locally, `npm run dev:all` keeps this and Vite's dev server separate on
 * their own ports, which is what you want while editing. A real deployment
 * has no such luxury - a free web-service host gives you exactly one port -
 * so in production this process also serves `dist/`, the output of
 * `npm run build`. One process, one port, one URL to hand to a friend.
 *
 *   npm start        # after `npm run build`, serves the site and the relay
 *   npm run server   # relay only, for local dev alongside `npm run dev`
 */
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'

const PORT = Number(process.env.PORT ?? 8787)
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const ROOM_IDLE_MS = 1000 * 60 * 60 // reap rooms nobody has touched in an hour
const DIST = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist')

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

/**
 * Serves the built site. Every route is one page (the app routes itself with
 * a `#/...` hash, which the server never sees), so anything that is not a
 * real file under `dist/` falls back to `index.html` rather than 404ing.
 */
function serveStatic(req, res) {
  if (!existsSync(DIST)) {
    res.writeHead(503, { 'Content-Type': 'text/plain' })
    res.end('Run `npm run build` first - there is no dist/ to serve yet.')
    return
  }
  const url = new URL(req.url ?? '/', 'http://localhost')
  // Reject any attempt to climb out of dist/ before it ever touches the disk.
  const safePath = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '')
  let filePath = join(DIST, safePath)
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(DIST, 'index.html')
  }
  const type = MIME_TYPES[extname(filePath)] ?? 'application/octet-stream'
  res.writeHead(200, { 'Content-Type': type })
  createReadStream(filePath).pipe(res)
}

/** code -> { game, members: Map<slot, ws>, createdAt, touchedAt, max } */
const rooms = new Map()

function makeCode() {
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = ''
    for (let i = 0; i < 4; i++) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
    }
    if (!rooms.has(code)) return code
  }
  return null
}

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg))
}

function peerList(room) {
  return [...room.members.entries()]
    .map(([slot, ws]) => ({ slot, name: ws.polyName ?? `Player ${slot + 1}` }))
    .sort((a, b) => a.slot - b.slot)
}

function broadcastPeers(room) {
  const players = peerList(room)
  for (const ws of room.members.values()) send(ws, { t: 'peers', players })
}

function leaveRoom(ws) {
  const room = rooms.get(ws.polyRoom)
  if (!room) return
  room.members.delete(ws.polySlot)
  ws.polyRoom = null

  if (ws.polySlot === 0 || room.members.size === 0) {
    // The host owns the match, so the room goes with them.
    for (const other of room.members.values()) {
      send(other, { t: 'closed', reason: 'The host left the game.' })
      other.polyRoom = null
    }
    rooms.delete(room.code)
    log(`room ${room.code} closed`)
  } else {
    broadcastPeers(room)
  }
}

function log(...args) {
  console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...args)
}

const httpServer = createServer(serveStatic)
const wss = new WebSocketServer({ server: httpServer })

wss.on('connection', (ws, req) => {
  ws.polyRoom = null
  ws.polySlot = -1
  ws.isAlive = true
  ws.on('pong', () => {
    ws.isAlive = true
  })

  ws.on('message', (data) => {
    let msg
    try {
      msg = JSON.parse(String(data))
    } catch {
      return send(ws, { t: 'error', message: 'Bad message' })
    }

    switch (msg.t) {
      case 'host': {
        leaveRoom(ws)
        const code = makeCode()
        if (!code) return send(ws, { t: 'error', message: 'Server is full of rooms, try again.' })
        const room = {
          code,
          game: String(msg.game ?? 'unknown').slice(0, 32),
          max: Math.min(Math.max(Number(msg.max) || 4, 2), 8),
          members: new Map(),
          touchedAt: Date.now(),
        }
        rooms.set(code, room)
        ws.polyRoom = code
        ws.polySlot = 0
        ws.polyName = String(msg.name ?? 'Host').slice(0, 24)
        room.members.set(0, ws)
        send(ws, { t: 'hosted', code, slot: 0 })
        broadcastPeers(room)
        log(`room ${code} hosted (${room.game}) by ${ws.polyName}`)
        break
      }

      case 'join': {
        leaveRoom(ws)
        const code = String(msg.code ?? '').toUpperCase()
        const room = rooms.get(code)
        if (!room) return send(ws, { t: 'error', message: `No room called ${code}.` })
        if (room.members.size >= room.max) {
          return send(ws, { t: 'error', message: 'That room is full.' })
        }
        let slot = 0
        while (room.members.has(slot)) slot++
        ws.polyRoom = code
        ws.polySlot = slot
        ws.polyName = String(msg.name ?? `Player ${slot + 1}`).slice(0, 24)
        room.members.set(slot, ws)
        room.touchedAt = Date.now()
        send(ws, { t: 'joined', code, slot })
        broadcastPeers(room)
        log(`${ws.polyName} joined ${code} as slot ${slot}`)
        break
      }

      case 'relay': {
        const room = rooms.get(ws.polyRoom)
        if (!room) return
        room.touchedAt = Date.now()
        const out = JSON.stringify({ t: 'relay', from: ws.polySlot, payload: msg.payload })
        for (const [slot, peer] of room.members) {
          if (slot !== ws.polySlot && peer.readyState === peer.OPEN) peer.send(out)
        }
        break
      }

      case 'leave':
        leaveRoom(ws)
        break

      case 'ping':
        send(ws, { t: 'pong' })
        break

      default:
        send(ws, { t: 'error', message: `Unknown message ${msg.t}` })
    }
  })

  ws.on('close', () => leaveRoom(ws))
  ws.on('error', () => leaveRoom(ws))

  log(`connection from ${req.socket.remoteAddress}`)
})

// Drop dead sockets and stale rooms.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate()
      continue
    }
    ws.isAlive = false
    ws.ping()
  }
  const now = Date.now()
  for (const [code, room] of rooms) {
    if (now - room.touchedAt > ROOM_IDLE_MS) {
      for (const peer of room.members.values()) {
        send(peer, { t: 'closed', reason: 'Room timed out.' })
      }
      rooms.delete(code)
      log(`room ${code} timed out`)
    }
  }
}, 15000)

httpServer.listen(PORT, () => {
  log(`Polyland listening on http://0.0.0.0:${PORT}`)
  log(existsSync(DIST) ? 'Serving dist/ - open the URL above to play.' : 'No dist/ yet: run `npm run build`, or use `npm run dev:all` for local editing.')
})
