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
