/**
 * Just enough Chrome DevTools Protocol to drive LocalRot headless.
 *
 * No Playwright: Chrome is launched directly and spoken to over its debugging
 * WebSocket, using the `ws` package the relay already depends on.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

const require = createRequire(resolve('package.json'))
const WebSocket = require('ws')

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
export const say = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

/** `--name value` and bare `--flag` arguments. */
export function args(defaults) {
  const out = { ...defaults }
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue
    const name = argv[i].slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) out[name] = true
    else out[name] = argv[++i]
  }
  return out
}

function chromePath() {
  const candidates = [
    process.env.CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean)
  const found = candidates.find((p) => existsSync(p))
  if (!found) throw new Error('Chrome not found. Set CHROME to its path.')
  return found
}

/**
 * One headless Chrome with one page.
 *
 * `software: true` renders with SwiftShader - it works anywhere, but at a few
 * frames a second, and the games clamp each frame to 50 ms of game time, so a
 * 15 second race takes minutes. The default uses the real GPU through ANGLE.
 */
export async function launch({ port, out, name = 'page', width = 1440, height = 900, software = false }) {
  mkdirSync(out, { recursive: true })
  const gl = software
    ? ['--enable-unsafe-swiftshader', '--use-angle=swiftshader']
    : [process.platform === 'win32' ? '--use-angle=d3d11' : '--use-angle=default', '--ignore-gpu-blocklist', '--enable-gpu']
  const chrome = spawn(
    chromePath(),
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${join(out, `profile-${name}`)}`,
      `--window-size=${width},${height}`,
      ...gl,
      '--no-first-run',
      '--mute-audio',
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      'about:blank',
    ],
    { stdio: 'ignore' },
  )
  let list
  for (let i = 0; i < 100 && !list; i++) {
    await sleep(200)
    try {
      list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
    } catch {}
  }
  if (!list) throw new Error(`Chrome on ${port} never answered`)
  const page = new Page(name, list.find((t) => t.type === 'page').webSocketDebuggerUrl, out, chrome)
  await page.open(width, height)
  return page
}

export class Page {
  constructor(name, url, out, chrome) {
    Object.assign(this, { name, url, out, chrome, id: 0, pending: new Map(), errors: [] })
  }

  async open(width, height) {
    this.ws = new WebSocket(this.url)
    await new Promise((r) => this.ws.on('open', r))
    this.ws.on('message', (raw) => {
      const m = JSON.parse(raw)
      if (m.id && this.pending.has(m.id)) {
        this.pending.get(m.id)(m)
        this.pending.delete(m.id)
      }
      if (m.method === 'Runtime.exceptionThrown') {
        this.errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text)
      }
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        this.errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '))
      }
    })
    await this.send('Page.enable')
    await this.send('Runtime.enable')
    await this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
  }

  send(method, params = {}) {
    return new Promise((r) => {
      const n = ++this.id
      this.pending.set(n, r)
      this.ws.send(JSON.stringify({ id: n, method, params }))
    })
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    const failed = res.result?.exceptionDetails
    if (failed) throw new Error(`${this.name}: ${failed.exception?.description ?? JSON.stringify(failed)}`)
    return res.result?.result?.value
  }

  async waitFor(expression, ms = 60000) {
    const end = Date.now() + ms
    while (Date.now() < end) {
      if (await this.eval(expression)) return
      await sleep(250)
    }
    throw new Error(`${this.name}: timed out after ${ms} ms waiting for ${expression.slice(0, 120)}`)
  }

  goto(url) {
    return this.send('Page.navigate', { url })
  }

  async clickText(text) {
    const clicked = await this.eval(`(() => {
      const b = [...document.querySelectorAll('button')].find((b) => b.textContent.includes(${JSON.stringify(text)}))
      if (!b) return false
      b.click()
      return true
    })()`)
    if (!clicked) throw new Error(`${this.name}: no button with "${text}"`)
  }

  async shot(file) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' })
    const path = join(this.out, file)
    writeFileSync(path, Buffer.from(res.result.data, 'base64'))
    return path
  }

  close() {
    try {
      this.ws.close()
    } catch {}
    this.chrome.kill()
  }
}

/** Each game's screen component, and an element inside it to start the search from. */
export const GAMES = {
  'zombie-tag': {
    title: 'Zombie Tag',
    screen: 'ZombieTagScreen',
    anchor: `[...document.querySelectorAll('span')].find((s) => s.textContent === 'Zombie Tag')`,
    people: 'bodies',
  },
  'messy-maze': {
    title: 'Messy Maze',
    screen: 'MessyMazeScreen',
    anchor: `document.querySelector('[data-binding]')`,
    people: 'racers',
  },
  'probable-stop': {
    title: 'Probable Stop',
    screen: 'ProbableStopScreen',
    anchor: `document.querySelector('[data-path]')`,
    people: 'players',
  },
  'duck-hunt': {
    title: 'Duck Hunt',
    screen: 'DuckHuntScreen',
    anchor: `document.querySelector('[data-time-left]')`,
    people: 'players',
  },
  'punch-buggy': {
    title: 'Punch Buggy',
    screen: 'PunchBuggyScreen',
    anchor: `document.querySelector('[data-board]')`,
    people: 'fighters',
  },
  'let-him-cook': {
    title: 'Let Him Cook',
    screen: 'LetHimCookScreen',
    anchor: `document.querySelector('[data-board]')`,
    people: 'players',
  },
  'i-see-the-light': {
    title: 'I See The Light',
    screen: 'ISeeTheLightScreen',
    anchor: `document.querySelector('[data-board]')`,
    people: 'racers',
  },
}

/**
 * An expression that, in a page showing Let Him Cook on this player's turn,
 * picks an item the way a player does - a pointer move and a pointerdown on the
 * canvas at the item's spot on screen, projected with the game's own camera fit
 * - and evaluates to what it picked, or null when it is not this player's turn.
 *
 * `choose` is what kind of item, judged only from what this browser was shown
 * of the chef's cooking: 'safe' (a copy it saw go in and nobody has claimed),
 * 'wrong' (an ingredient it never saw go in) or 'gone' (every copy it saw go in
 * is claimed). `hoverOnly` moves the pointer there without clicking.
 */
export function cookPick(choose = 'safe', { hoverOnly = false } = {}) {
  return `(async () => {
    const cam = await import('/src/modules/22-let-him-cook/internal/camera.ts')
    const g = ${gameState('let-him-cook')}
    if (!g || g.phase !== 'turns' || !g.players[g.queue[0]]?.mine) return null
    const used = [0, 0, 0, 0, 0, 0]
    for (const s of g.picks) used[g.counter[s]] += 1
    const taken = (kind) => g.served.filter((k, s) => k === kind && g.claimed[s] !== null).length
    const open = g.served.map((_, s) => s).filter((s) => g.claimed[s] === null)
    const lists = {
      safe: open.filter((s) => used[g.served[s]] > taken(g.served[s])),
      wrong: open.filter((s) => used[g.served[s]] === 0),
      gone: open.filter((s) => used[g.served[s]] > 0 && used[g.served[s]] <= taken(g.served[s])),
    }
    const list = lists[${JSON.stringify(choose)}]
    if (list.length === 0) return { none: ${JSON.stringify(choose)}, seen: g.picks.length }
    const slot = list[0]
    const canvas = document.querySelector('[data-board] canvas')
    const rect = canvas.getBoundingClientRect()
    const aspect = rect.width / rect.height
    const shot = cam.frameScene(aspect)
    const at = cam.slotAt(slot)
    const sub = (p, q) => ({ x: p.x - q.x, y: p.y - q.y, z: p.z - q.z })
    const dot = (p, q) => p.x * q.x + p.y * q.y + p.z * q.z
    const norm = (p) => { const l = Math.hypot(p.x, p.y, p.z); return { x: p.x / l, y: p.y / l, z: p.z / l } }
    const cross = (p, q) => ({ x: p.y * q.z - p.z * q.y, y: p.z * q.x - p.x * q.z, z: p.x * q.y - p.y * q.x })
    const eye = { x: shot.x, y: shot.y, z: shot.z }
    const forward = norm(sub(shot.target, eye))
    const right = norm(cross(forward, { x: 0, y: 1, z: 0 }))
    const up = cross(right, forward)
    const rel = sub(at, eye)
    const depth = dot(rel, forward)
    const half = Math.tan((cam.FOV * Math.PI) / 360)
    const clientX = rect.left + ((dot(rel, right) / (depth * half * aspect) + 1) / 2) * rect.width
    const clientY = rect.top + ((1 - dot(rel, up) / (depth * half)) / 2) * rect.height
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX, clientY, bubbles: true }))
    if (!${hoverOnly}) canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX, clientY, bubbles: true }))
    return { slot, kind: g.served[slot], choose: ${JSON.stringify(choose)}, turn: g.turn, x: Math.round(clientX), y: Math.round(clientY) }
  })()`
}

/**
 * An expression that, in a page showing I See The Light, does what a careful
 * player does this moment: on green, one press of space; on red, the pointer to
 * the middle of the circle. Evaluates to what it did and the light it saw.
 */
export function lightMove({ press = true } = {}) {
  return `(() => {
    const board = document.querySelector('[data-board]')
    if (!board) return null
    const r = board.getBoundingClientRect()
    const light = document.querySelector('[data-light]')?.dataset.light ?? null
    const circle = board.querySelector('[data-circle]')?.dataset.circle
    let at = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    if (circle) {
      const [x, y] = circle.split(',').map(Number)
      at = { x: r.left + x * r.width, y: r.top + y * r.height }
    }
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: at.x, clientY: at.y, bubbles: true }))
    const pressed = light === 'green' && ${press}
    if (pressed) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }))
    return { light, pressed, circle: circle ?? null }
  })()`
}

/**
 * An expression that, in a page showing Duck Hunt, clicks on one of this
 * player's own balloons - a real pointer event on the canvas, at the balloon's
 * spot on screen - and evaluates to what it aimed at, or null if there was
 * nothing of theirs up or the cooldown was running.
 *
 * The balloon is put on screen with the game's own camera fit (`frameScene`)
 * and plain perspective arithmetic, so the click goes through the game's real
 * aiming: its ray, its `pickBalloon`.
 */
export function duckHuntShot() {
  return `(async () => {
    const arena = await import('/src/modules/19-duck-hunt/internal/arena.ts')
    const cam = await import('/src/modules/19-duck-hunt/internal/camera.ts')
    const g = ${gameState('duck-hunt')}
    if (!g || g.over) return null
    const me = g.players.findIndex((p) => p.mine)
    if (me < 0 || g.players[me].cooldown > 0) return null
    const canvas = [...document.querySelectorAll('canvas')].pop()
    const rect = canvas.getBoundingClientRect()
    const aspect = rect.width / rect.height
    const shot = cam.frameScene(aspect)
    const mine = g.balloons
      .filter((b) => b.owner === me && !g.popped.has(b.id))
      .map((b) => ({ b, at: arena.balloonAt(b, g.elapsed + 0.05) }))
      .filter((x) => x.at && x.at.y > 2 && x.at.y < arena.ARENA.ceiling - 3)
    if (mine.length === 0) return null
    const { b, at } = mine[0]
    const sub = (p, q) => ({ x: p.x - q.x, y: p.y - q.y, z: p.z - q.z })
    const dot = (p, q) => p.x * q.x + p.y * q.y + p.z * q.z
    const norm = (p) => { const l = Math.hypot(p.x, p.y, p.z); return { x: p.x / l, y: p.y / l, z: p.z / l } }
    const cross = (p, q) => ({ x: p.y * q.z - p.z * q.y, y: p.z * q.x - p.x * q.z, z: p.x * q.y - p.y * q.x })
    const eye = { x: shot.x, y: shot.y, z: shot.z }
    const forward = norm(sub(shot.target, eye))
    const right = norm(cross(forward, { x: 0, y: 1, z: 0 }))
    const up = cross(right, forward)
    const rel = sub(at, eye)
    const depth = dot(rel, forward)
    const half = Math.tan((cam.FOV * Math.PI) / 360)
    const nx = dot(rel, right) / (depth * half * aspect)
    const ny = dot(rel, up) / (depth * half)
    const clientX = rect.left + ((nx + 1) / 2) * rect.width
    const clientY = rect.top + ((1 - ny) / 2) * rect.height
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX, clientY, bubbles: true }))
    return { balloon: b.id, x: Math.round(clientX), y: Math.round(clientY) }
  })()`
}

/**
 * An expression that evaluates to a game screen's state - its round or race -
 * or null when that screen is not up.
 *
 * Read through React's dev-build fiber: from an element inside the screen, up
 * `.return` to the component with that name, whose first hook is the state.
 * Dev server only; a production build has no component names.
 */
export function gameState(game) {
  const { screen, anchor } = GAMES[game]
  return `(() => {
    const el = ${anchor}
    if (!el) return null
    const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'))
    let f = el[key]
    while (f && f.type?.name !== '${screen}') f = f.return
    return f ? f.memoizedState.memoizedState : null
  })()`
}
