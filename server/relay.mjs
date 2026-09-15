/**
 * The lobby relay, and the web server for the built game.
 *
 * One process serves both, which is the whole reason this is deployable to a
 * free host in one click: a static site and a WebSocket service on separate
 * providers is two accounts, two URLs, and a cross-origin problem.
 *
 * The relay is deliberately **dumb**. It knows about rooms, and it knows how
 * to hand a message to everyone else in one. It does not know what a duck is,
 * has never heard of a position, and will not need changing when the game
 * grows a chat box or a scoreboard. All of that lives in `09-net`.
 *
 *   node server/relay.mjs            # serve dist/ and relay on :8791
 *   PORT=3000 node server/relay.mjs
 *
 * In development, Vite serves the game on :5173 and this only relays.
 */
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { WebSocketServer } from 'ws'

const PORT = Number(process.env.PORT ?? 8791)
const ROOT = resolve(process.env.STATIC_DIR ?? 'dist')

/** Rooms are made by the first person to ask for one and vanish when empty. */
const rooms = new Map()

/** Never let one room, or one client, take the server down. */
const LIMITS = {
  perRoom: 16,
  rooms: 500,
  /** Bytes. A duck update is about 150. */
  message: 4096,
  /** Messages a second before a client is being unreasonable. */
  rate: 60,
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

const server = createServer((request, response) => {
  // A health check that does not depend on the build existing, so a host can
  // tell the difference between "starting" and "broken".
  if (request.url === '/healthz') {
    response.writeHead(200, { 'content-type': 'text/plain' })
    response.end(`ok rooms=${rooms.size}\n`)
    return
  }

  const path = decodeURIComponent((request.url ?? '/').split('?')[0])
  // Normalising first is what stops `/../../etc/passwd` reaching the file
  // system; without it this is a directory traversal.
  const wanted = normalize(join(ROOT, path === '/' ? 'index.html' : path))
  if (!wanted.startsWith(ROOT)) {
    response.writeHead(403).end('no')
    return
  }

  // Anything that is not a file is the app: this is a single-page app and
  // deep links have to reach it.
  const file = existsSync(wanted) && statSync(wanted).isFile() ? wanted : join(ROOT, 'index.html')

  if (!existsSync(file)) {
    response.writeHead(503, { 'content-type': 'text/plain' })
    response.end('No build here yet. Run: npm run build\n')
    return
  }

  response.writeHead(200, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    // The build hashes its filenames, so everything but the entry page can be
    // cached hard.
    'cache-control': file.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
  })
  createReadStream(file).pipe(response)
})

const sockets = new WebSocketServer({ server, maxPayload: LIMITS.message })

let nextId = 1

sockets.on('connection', (socket) => {
  const client = {
    id: `p${nextId++}`,
    room: null,
    name: 'duck',
    seen: 0,
    window: Date.now(),
  }

  socket.on('message', (raw) => {
    // Rate limit before parsing: a client flooding the server should cost it
    // nothing to ignore.
    const now = Date.now()
    if (now - client.window > 1000) {
      client.window = now
      client.seen = 0
    }
    if (++client.seen > LIMITS.rate) return

    let message
    try {
      message = JSON.parse(raw.toString())
    } catch {
      return
    }
    if (!message || typeof message !== 'object') return

    if (message.t === 'join') {
      joinRoom(client, socket, message)
      return
    }

    // Everything else is opaque. Stamp who it came from and pass it on.
    if (!client.room) return
    const peers = rooms.get(client.room)
    if (!peers) return
    const relayed = JSON.stringify({ ...message, from: client.id })
    for (const [id, peer] of peers) {
      if (id === client.id) continue
      if (peer.socket.readyState === peer.socket.OPEN) peer.socket.send(relayed)
    }
  })

  socket.on('close', () => leave(client))
  socket.on('error', () => leave(client))
})

/**
 * Making a lobby and joining one are different things.
 *
 * The relay used to treat them as one - it made a room if there was not one
 * and put you in it either way - and that is two bugs rather than a shortcut:
 *
 * - Type somebody else's code into your own box, press **create**, and you
 *   walk into their party instead of starting yours.
 * - Mistype a code, press **join**, and you land alone in a room nobody else
 *   will ever be in. You are its host, everything looks like it worked, and
 *   you wait there.
 *
 * So the client says which it meant, and being wrong is an error with words on
 * it rather than a room. A message with no `make` at all still gets the old
 * make-or-join, because that is what anything else talking to this relay
 * expects.
 */
function roomRefusal(room, make) {
  const exists = rooms.has(room)
  if (make === true && exists) return 'that code is taken - press new for another'
  if (make === false && !exists) return 'no lobby with that code'
  if (!exists && rooms.size >= LIMITS.rooms) return 'server full'
  return null
}

function joinRoom(client, socket, message) {
  const room = String(message.room ?? '').toUpperCase().slice(0, 12)
  if (!/^[A-Z0-9]{3,12}$/.test(room)) {
    socket.send(JSON.stringify({ t: 'error', why: 'bad room code' }))
    return
  }

  const make = typeof message.make === 'boolean' ? message.make : null
  const refusal = roomRefusal(room, make)
  if (refusal) {
    socket.send(JSON.stringify({ t: 'error', why: refusal }))
    return
  }

  leave(client)

  const peers = rooms.get(room) ?? new Map()
  if (peers.size >= LIMITS.perRoom) {
    socket.send(JSON.stringify({ t: 'error', why: 'lobby full' }))
    return
  }

  client.room = room
  client.name = String(message.name ?? 'duck').slice(0, 16)
  peers.set(client.id, { socket, name: client.name })
  rooms.set(room, peers)

  socket.send(
    JSON.stringify({
      t: 'joined',
      id: client.id,
      room,
      peers: [...peers.keys()].filter((id) => id !== client.id),
    }),
  )
  broadcast(room, client.id, { t: 'peer', id: client.id, name: client.name })
  console.log(`[relay] ${client.id} joined ${room} (${peers.size} here, ${rooms.size} rooms)`)
}

function leave(client) {
  if (!client.room) return
  const peers = rooms.get(client.room)
  const room = client.room
  client.room = null
  if (!peers) return
  peers.delete(client.id)
  if (peers.size === 0) rooms.delete(room)
  else broadcast(room, client.id, { t: 'gone', id: client.id })
  console.log(`[relay] ${client.id} left ${room} (${rooms.size} rooms)`)
}

function broadcast(room, exceptId, message) {
  const peers = rooms.get(room)
  if (!peers) return
  const payload = JSON.stringify(message)
  for (const [id, peer] of peers) {
    if (id === exceptId) continue
    if (peer.socket.readyState === peer.socket.OPEN) peer.socket.send(payload)
  }
}

server.listen(PORT, () => {
  console.log(`[relay] listening on :${PORT}`)
  console.log(`[relay] serving ${existsSync(ROOT) ? ROOT : `${ROOT} (no build yet)`}`)
})
