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
  'youre-the-bomb': {
    title: "You're The Bomb",
    screen: 'RoomScreen',
    anchor: `document.querySelector('[data-board]')`,
    people: 'players',
  },
  'binary-bs': {
    title: 'Binary BS',
    screen: 'GearScreen',
    anchor: `document.querySelector('[data-board]')`,
    people: 'players',
  },
  'color-coded': {
    title: 'Color Coded',
    screen: 'ColorScreen',
    anchor: `document.querySelector('[data-board]')`,
    people: 'players',
  },
  'highest-in-the-room': {
    title: 'Highest In The Room',
    screen: 'TowerScreen',
    anchor: `document.querySelector('[data-board]')`,
    people: 'players',
  },
  'i-just-work-here': {
    title: 'I Just Work Here',
    screen: 'OfficeScreen',
    anchor: `document.querySelector('[data-board]')`,
    people: 'players',
  },
  'one-piece': {
    title: 'One Piece?!',
    screen: 'OnePieceScreen',
    anchor: `document.querySelector('[data-board]')`,
    people: 'players',
  },
  'whats-your-rpm': {
    title: "What's Your RPM?",
    screen: 'RpmScreen',
    anchor: `document.querySelector('[data-board]')`,
    people: 'players',
  },
  'ill-just-wait': {
    title: "I'll Just Wait",
    screen: 'IllJustWaitScreen',
    anchor: `document.querySelector('[data-board]')`,
    people: 'players',
  },
  'pet-race': {
    title: 'Pet Race',
    screen: 'PetRaceScreen',
    anchor: `document.querySelector('[data-board]')`,
    people: 'racers',
  },
  'musical-mayhem': {
    title: 'Musical Mayhem',
    screen: 'MusicalMayhemScreen',
    anchor: `document.querySelector('[data-board]')`,
    people: 'players',
  },
  'wheres-midnight': {
    title: "Where's Midnight?",
    screen: 'WheresMidnightScreen',
    anchor: `document.querySelector('[data-board]')`,
    people: 'players',
  },
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
  'time-it': {
    title: 'Time It',
    screen: 'TimeItScreen',
    anchor: `document.querySelector('[data-board]')`,
    people: 'players',
  },
  'feeding-time': {
    title: 'Feeding Time',
    screen: 'FeedingTimeScreen',
    anchor: `document.querySelector('[data-board]')`,
    people: 'players',
  },
  'find-yourself': {
    title: 'Find Yourself',
    screen: 'FindYourselfScreen',
    anchor: `document.querySelector('[data-board]')`,
    people: 'players',
  },
  'sprint-triathlon': {
    title: 'Sprint Triathlon',
    screen: 'TriathlonScreen',
    anchor: `document.querySelector('[data-board]')`,
    people: 'racers',
  },
  'wack-attack': {
    title: 'Wack-Attack',
    screen: 'WackAttackScreen',
    anchor: `document.querySelector('[data-board]')`,
    people: 'players',
  },
  'make-the-cut': {
    title: 'Make The Cut',
    screen: 'MakeTheCutScreen',
    anchor: `document.querySelector('[data-board]')`,
    people: 'players',
  },
  'lady-luck': {
    title: 'Lady Luck',
    screen: 'LadyLuckScreen',
    anchor: `document.querySelector('[data-board]')`,
    people: 'players',
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
  'synchronize-steps': {
    title: 'Synchronize Steps',
    screen: 'SynchronizeStepsScreen',
    anchor: `document.querySelector('[data-board]')`,
    people: 'players',
  },
  'helping-dad': {
    title: 'Helping Dad',
    screen: 'HelpingDadScreen',
    anchor: `document.querySelector('[data-board]')`,
    people: 'players',
  },
  'hes-one-shot': {
    title: "He's One Shot",
    screen: 'HesOneShotScreen',
    anchor: `document.querySelector('[data-board]')`,
    people: 'players',
  },
  'keyboard-warrior': {
    title: 'Keyboard Warrior',
    screen: 'KeyboardWarriorScreen',
    anchor: `document.querySelector('[data-board]')`,
    people: 'players',
  },
  'chef-caricature': {
    title: 'Chef Caricature',
    screen: 'ChefCaricatureScreen',
    anchor: `document.querySelector('[data-board]')`,
    people: 'players',
  },
}

/**
 * An expression that, in a page showing Chef Caricature, waits in the page
 * until it is this browser's turn to draw with the pen free, then draws on the
 * board with real pointer events - `pointerdown`, a `pointermove` every few
 * milliseconds, `pointerup` - at the board position projected with the game's
 * own camera fit. By default it traces the outline on the board from a random
 * point, `share` of the way round, at `speed` board units a second; with
 * `scribble` it zigzags over the whole board instead. It lets go at the end, or
 * as soon as the duck takes the drawing. Evaluates to what happened: whether it
 * was accepted, the most coverage it reached, whether it was wiped, and the
 * dishes it added - or null if the turn never came.
 */
export function chefTrace({ share = 1.2, speed = 2.5, scribble = false, wait = 200000 } = {}) {
  return `(async () => {
    const outlines = await import('/src/modules/35-chef-caricature/internal/outlines.ts')
    const cam = await import('/src/modules/35-chef-caricature/internal/camera.ts')
    const rules = await import('/src/modules/35-chef-caricature/internal/rules.ts')
    const state = () => ${gameState('chef-caricature')}
    const frame = () => new Promise((r) => requestAnimationFrame(r))
    const started = performance.now()
    for (;;) {
      const g = state()
      if (!g || g.over) return null
      if (rules.phase(g) === 'drawing' && g.players[rules.drawer(g)]?.mine && !g.stroke && !g.lift) break
      if (performance.now() - started > ${wait}) return null
      await frame()
    }
    const board = document.querySelector('[data-board]')
    const g0 = state()
    const me = rules.drawer(g0)
    const before = { score: g0.players[me].score, outline: g0.outline, erasedAt: g0.erasedAt }
    const outline = outlines.outlineFor(g0.seed, g0.outline)
    const r = board.getBoundingClientRect()
    const aspect = r.width / r.height
    const fire = (type, p) => {
      const s = cam.boardToScreen(p, aspect)
      board.dispatchEvent(new PointerEvent(type, { clientX: r.left + ((s.x + 1) / 2) * r.width, clientY: r.top + ((1 - s.y) / 2) * r.height, button: 0, buttons: type === 'pointerup' ? 0 : 1, pointerId: 1, pointerType: 'mouse', bubbles: true }))
    }
    const path = []
    if (${scribble}) {
      for (let row = 0; row <= 24; row++) {
        const y = -0.95 + row * (1.9 / 24)
        for (let i = 0; i <= 40; i++) path.push({ x: (row % 2 ? 1 : -1) * (-0.95 + i * (1.9 / 40)), y })
      }
    } else {
      const from = Math.random() * outline.length
      for (let d = 0; d <= outline.length * ${share}; d += 0.02) path.push(outlines.pointAlong(outline, from + d))
    }
    fire('pointerdown', path[0])
    let peak = 0
    let accepted = false
    for (const p of path.slice(1)) {
      fire('pointermove', p)
      const g = state()
      peak = Math.max(peak, rules.coverage(g.stroke))
      if (g.outline !== before.outline) {
        accepted = true
        break
      }
      await new Promise((resolve) => setTimeout(resolve, ${Math.round((1000 * 0.02) / speed)}))
    }
    const last = state()
    const tidy = +rules.tidiness(last.stroke).toFixed(2)
    fire('pointerup', path[path.length - 1])
    await frame()
    await frame()
    const g1 = state()
    return { name: outline.name, accepted, peak: +peak.toFixed(2), tidy, wiped: g1.erasedAt !== before.erasedAt, dishes: g1.players[me].score - before.score, outline: g1.outline }
  })()`
}

/**
 * An expression that, in a page showing Keyboard Warrior, waits in the page for
 * the next letter to be up on the screen (the arena's `data-letter`), waits
 * `delay` ms more - a reaction - and types it with a real `keydown`: the letter
 * itself, or with `wrong` some other letter. With `twice` it then types the
 * right letter as well, which must not count. Evaluates to what it saw and did,
 * and the banner after, or null if no letter came up within ten seconds.
 */
export function typeLetter({ delay = 350, wrong = false, twice = false } = {}) {
  return `(async () => {
    const board = () => document.querySelector('[data-board]')
    const frame = () => new Promise((r) => requestAnimationFrame(r))
    const press = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k.toLowerCase(), code: 'Key' + k }))
    const start = performance.now()
    while (!board()?.dataset.letter) {
      if (performance.now() - start > 10000 || board()?.dataset.phase === 'over') return null
      await frame()
    }
    const letter = board().dataset.letter
    const round = +(document.querySelector('[data-round]')?.dataset.round ?? 0)
    await new Promise((r) => setTimeout(r, ${delay}))
    const key = ${wrong} ? (letter === 'Q' ? 'Z' : 'Q') : letter
    press(key)
    if (${twice}) {
      await new Promise((r) => setTimeout(r, 60))
      press(letter)
    }
    await new Promise((r) => setTimeout(r, 90))
    return { letter, key, round, banner: document.querySelector('[data-banner]')?.dataset.banner ?? null }
  })()`
}

/**
 * An expression that, in a page showing He's One Shot, plays a moment of it
 * through the real controls, and evaluates to your player as it was.
 *
 * Headless Chrome will not lock the pointer, so the first call stands in for
 * the lock: `document.pointerLockElement` is made to answer with the arena and
 * a `pointerlockchange` is sent - the screen then reads the mouse exactly as it
 * does under a real lock. After that, everything goes through real events:
 * `mousemove` with `movementX`/`movementY` to turn, `keydown`/`keyup` on W to
 * walk, `pointerdown` on the arena to shoot.
 *
 * `mode: 'lock'` only takes the mouse and lets go of the keys. `mode: 'play'`
 * turns to the nearest player still standing that it has a clear line to - no
 * faster than a hand turns - and shoots when on them and the gun is ready; with
 * nobody in sight it walks towards somewhere open, somewhere new every few
 * seconds. With `fire: false` it never pulls the trigger.
 */
export function oneShotPlay({ mode = 'play', fire = true } = {}) {
  return `(async () => {
    const arena = await import('/src/modules/32-hes-one-shot/internal/arena.ts')
    const rules = await import('/src/modules/32-hes-one-shot/internal/rules.ts')
    const screen = await import('/src/modules/32-hes-one-shot/internal/HesOneShotScreen.tsx')
    const w = (window.__hos ??= { goal: null, goalAt: 0, held: new Set() })
    const press = (code, down) => {
      if (down === w.held.has(code)) return
      down ? w.held.add(code) : w.held.delete(code)
      window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code.slice(3).toLowerCase() }))
    }
    if (!w.locked) {
      Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => document.querySelector('[data-board]') })
      document.dispatchEvent(new Event('pointerlockchange'))
      w.locked = true
    }
    const g = ${gameState('hes-one-shot')}
    if (!g || g.players.length === 0) return null
    const me = g.players.find((p) => p.mine)
    const state = { clock: +g.elapsed.toFixed(2), over: g.over, x: +me.x.toFixed(3), z: +me.z.toFixed(3), yaw: +me.yaw.toFixed(4), pitch: +me.pitch.toFixed(4), out: me.out, kills: me.kills, shotAt: me.shotAt, fired: false, target: null }
    if (${JSON.stringify(mode)} === 'lock' || g.over || g.elapsed <= 0) {
      for (const code of [...w.held]) press(code, false)
      return state
    }
    const A = arena.arenaFor(g.seed)
    const eye = rules.eyeOf(me)
    let target = null
    let best = Infinity
    for (const p of g.players) {
      if (p === me || !rules.isStanding(p)) continue
      const d = Math.hypot(p.x - me.x, p.z - me.z)
      if (d < best && arena.lineClear(A, eye, { x: p.x, y: 1.2, z: p.z })) { best = d; target = p }
    }
    let wantYaw
    let wantPitch = 0
    if (target) {
      wantYaw = Math.atan2(-(target.x - me.x), -(target.z - me.z))
      wantPitch = Math.atan2(1.2 - rules.BODY.eye, best)
      state.target = target.id
    } else {
      if (!w.goal || performance.now() - w.goalAt > 3000) { w.goal = arena.openPoint(A, Math.random, 0.5); w.goalAt = performance.now() }
      wantYaw = Math.atan2(-(w.goal.x - me.x), -(w.goal.z - me.z))
    }
    const turn = Math.max(-0.35, Math.min(0.35, rules.wrapAngle(wantYaw - me.yaw)))
    const mx = Math.round(-turn / screen.SENSITIVITY)
    const my = Math.round((me.pitch - wantPitch) / screen.SENSITIVITY)
    if (mx || my) document.dispatchEvent(new MouseEvent('mousemove', { movementX: mx, movementY: my, bubbles: true }))
    press('KeyW', !target)
    const board = document.querySelector('[data-board]')
    if (target && ${fire} && Math.abs(rules.wrapAngle(wantYaw - me.yaw)) < 0.025 && rules.cooldownLeft(g, me) <= 0) {
      board.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }))
      board.dispatchEvent(new PointerEvent('pointerup', { button: 0, bubbles: true }))
      state.fired = true
    }
    return state
  })()`
}

/**
 * An expression that, in a page showing Helping Dad, moves the mouse the way a
 * careful player does: onto your torch if it is down, and otherwise a little
 * ahead of it along the way to the finish - the middle of this cell, then the
 * middle of the next - with a real pointermove at that spot on the screen,
 * projected with the game's own camera fit. With `at` it moves the mouse to that
 * point in the maze instead, wherever it is. Evaluates to your torch as it was.
 */
export function torchMove({ ahead = 0.25, at = null } = {}) {
  return `(async () => {
    const cam = await import('/src/modules/31-helping-dad/internal/camera.ts')
    const mz = await import('/src/modules/31-helping-dad/internal/maze.ts')
    const g = ${gameState('helping-dad')}
    if (!g || g.players.length === 0) return null
    const me = g.players.find((p) => p.mine)
    const state = { x: +me.x.toFixed(3), z: +me.z.toFixed(3), held: me.held, stunned: +me.stunned.toFixed(2), hits: me.hits, finished: me.finished, over: g.over, clock: +g.elapsed.toFixed(2) }
    if (g.over || me.finished !== null) return state
    let target = ${JSON.stringify(at)}
    if (!target) {
      if (!me.held) target = { x: me.x, z: me.z }
      else {
        const goal = mz.routeTarget(mz.mazeFor(g.seed), me)
        const d = Math.hypot(goal.x - me.x, goal.z - me.z)
        const go = Math.min(d, ${ahead})
        target = d < 1e-6 ? goal : { x: me.x + ((goal.x - me.x) / d) * go, z: me.z + ((goal.z - me.z) / d) * go }
      }
    }
    const canvas = document.querySelector('[data-board] canvas')
    const rect = canvas.getBoundingClientRect()
    const aspect = rect.width / rect.height
    const shot = cam.frameScene(aspect)
    const point = { x: target.x, y: cam.HOLD, z: target.z }
    const sub = (p, q) => ({ x: p.x - q.x, y: p.y - q.y, z: p.z - q.z })
    const dot = (p, q) => p.x * q.x + p.y * q.y + p.z * q.z
    const norm = (p) => { const l = Math.hypot(p.x, p.y, p.z); return { x: p.x / l, y: p.y / l, z: p.z / l } }
    const cross = (p, q) => ({ x: p.y * q.z - p.z * q.y, y: p.z * q.x - p.x * q.z, z: p.x * q.y - p.y * q.x })
    const eye = { x: shot.x, y: shot.y, z: shot.z }
    const forward = norm(sub(shot.target, eye))
    const right = norm(cross(forward, { x: 0, y: 1, z: 0 }))
    const up = cross(right, forward)
    const rel = sub(point, eye)
    const depth = dot(rel, forward)
    const half = Math.tan((cam.FOV * Math.PI) / 360)
    const clientX = rect.left + ((dot(rel, right) / (depth * half * aspect) + 1) / 2) * rect.width
    const clientY = rect.top + ((1 - dot(rel, up) / (depth * half)) / 2) * rect.height
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX, clientY, bubbles: true }))
    return state
  })()`
}

/**
 * An expression that, in a page showing Synchronize Steps, picks `pick` the way
 * a player does: pressing its number key, or with `mouse` a real pointerdown on
 * its button. Evaluates to the round and phase it picked in, and the pick the
 * page shows as its own straight after.
 */
export function stepsPick({ pick, mouse = false }) {
  return `(async () => {
    if (${mouse}) {
      const b = document.querySelector('[data-option="${pick}"]')
      if (!b) return null
      const r = b.getBoundingClientRect()
      b.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true }))
    } else {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit${pick}', key: '${pick}', bubbles: true }))
    }
    await new Promise((res) => setTimeout(res, 60))
    const g = ${gameState('synchronize-steps')}
    if (!g) return null
    const me = g.players.find((p) => p.mine)
    return { round: g.round, phase: g.phase, clock: +g.clock.toFixed(2), shown: me ? me.pick : null }
  })()`
}

/**
 * An expression that, in a page showing Time It, waits in the page until its own
 * stopwatch reads `at` seconds past the target - watching the game's clock, as
 * a player with a perfect sense of time would - and then clicks the stage.
 * Evaluates to the reading it clicked at, or null if the round ended first.
 */
export function timeItStop({ at = 0 } = {}) {
  return `(async () => {
    const rules = await import('/src/modules/29-time-it/internal/rules.ts')
    for (let i = 0; i < 4000; i++) {
      const g = ${gameState('time-it')}
      if (!g || g.over) return null
      const reading = rules.stopwatch(g)
      const aim = rules.targetFor(g.seed) + ${at}
      if (reading >= aim) {
        const board = document.querySelector('[data-board]')
        const r = board.getBoundingClientRect()
        board.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true }))
        return { reading: +reading.toFixed(3), target: rules.targetFor(g.seed) }
      }
      await new Promise((res) => setTimeout(res, Math.max(1, Math.min(50, (aim - reading) * 1000 - 5))))
    }
    return null
  })()`
}

/**
 * An expression that, in a page showing Feeding Time, throws a cracker at a duck
 * the way a player does: works out where the nearest duck that is not eating
 * will be - leading it by the hold and the flight - points at that spot on the
 * board, holds the button for the power that reaches it and lets go. `off`
 * spoils the aim by that many radians. Evaluates to the throw it meant, or null
 * with nothing to throw at.
 */
export function feedFlick({ off = 0 } = {}) {
  return `(async () => {
    const rules = await import('/src/modules/28-feeding-time/internal/rules.ts')
    const cam = await import('/src/modules/28-feeding-time/internal/camera.ts')
    const g = ${gameState('feeding-time')}
    if (!g || g.over) return null
    const me = g.players.findIndex((p) => p.mine)
    if (me < 0 || !rules.canThrow(g, me)) return null
    const from = rules.spotOf(me, g.players.length)
    const ducks = rules.ducksFor(g.seed, g.eating.length)
    const hungry = ducks.map((d, i) => ({ d, i })).filter(({ i }) => g.eating[i] <= g.elapsed + 1.5)
    if (hungry.length === 0) return null
    const hold = (distance) => rules.distancePower(distance) * rules.CHARGE.fill
    const lead = (d) => {
      let at = rules.duckAt(d, g.elapsed)
      for (let n = 0; n < 6; n++) {
        const distance = Math.hypot(at.x - from.x, at.z - from.z)
        at = rules.duckAt(d, g.elapsed + 0.05 + hold(distance) + rules.flightTime(distance))
      }
      return at
    }
    hungry.sort((a, b) => { const pa = lead(a.d); const pb = lead(b.d); return Math.hypot(pa.x - from.x, pa.z - from.z) - Math.hypot(pb.x - from.x, pb.z - from.z) })
    const duck = lead(hungry[0].d)
    const distance = Math.hypot(duck.x - from.x, duck.z - from.z)
    const angle = Math.atan2(duck.x - from.x, from.z - duck.z) + ${off}
    const target = rules.landing(from, { angle, distance })
    // The point on the board over that spot: walk the pointer until the ground under it is the target.
    const board = document.querySelector('[data-board]')
    const rect = board.getBoundingClientRect()
    const aspect = rect.width / rect.height
    let across = 0.5
    let down = 0.5
    for (let n = 0; n < 60; n++) {
      const here = cam.groundAt(across, down, aspect)
      const right = cam.groundAt(across + 0.001, down, aspect)
      const lower = cam.groundAt(across, down + 0.001, aspect)
      across += ((target.x - here.x) / (right.x - here.x)) * 0.001
      down += ((target.z - here.z) / (lower.z - here.z)) * 0.001
      across = Math.min(1, Math.max(0, across))
      down = Math.min(1, Math.max(0, down))
    }
    const at = (x, y) => ({ clientX: rect.left + x * rect.width, clientY: rect.top + y * rect.height, bubbles: true, pointerId: 1, button: 0 })
    const seconds = hold(distance)
    board.dispatchEvent(new PointerEvent('pointermove', at(across, down)))
    board.dispatchEvent(new PointerEvent('pointerdown', at(across, down)))
    const started = performance.now()
    await new Promise((r) => setTimeout(r, Math.max(0, seconds * 1000 - 12)))
    while (performance.now() - started < seconds * 1000) await new Promise((r) => setTimeout(r, 0))
    board.dispatchEvent(new PointerEvent('pointerup', at(across, down)))
    return { duck: hungry[0].i, angle: +angle.toFixed(3), distance: +distance.toFixed(2), seconds: +seconds.toFixed(3), across: +across.toFixed(3), down: +down.toFixed(3) }
  })()`
}

/**
 * An expression that, in a page showing Find Yourself while picking, clicks a
 * cup the way a player does - a pointer move and a pointerdown on the canvas at
 * the cup, projected with the game's own camera fit - and evaluates to what it
 * picked, or null when there is nothing to pick. `right` picks the cup this
 * player's face is really under (worked out from the seed, as the page's own
 * shuffle is); otherwise the cup next to it.
 */
export function cupPick({ right = true, hoverOnly = false } = {}) {
  return `(async () => {
    const rules = await import('/src/modules/27-find-yourself/internal/rules.ts')
    const cam = await import('/src/modules/27-find-yourself/internal/camera.ts')
    const g = ${gameState('find-yourself')}
    if (!g || g.phase !== 'pick') return null
    const me = g.players.findIndex((p) => p.mine)
    if (me < 0 || g.players[me].picks[g.stage] !== null) return null
    const cups = rules.cupCount(g.players.length)
    const own = rules.facesBySlot(rules.currentStage(g)).indexOf(me)
    const slot = ${right} ? own : (own + 1) % cups
    const canvas = document.querySelector('[data-board] canvas')
    const rect = canvas.getBoundingClientRect()
    const aspect = rect.width / rect.height
    const shot = cam.frameScene(aspect, cups)
    const at = { x: rules.slotX(slot, cups), y: cam.TOP + 0.5, z: 0 }
    const sub = (p, q) => ({ x: p.x - q.x, y: p.y - q.y, z: p.z - q.z })
    const dot = (p, q) => p.x * q.x + p.y * q.y + p.z * q.z
    const norm = (p) => { const l = Math.hypot(p.x, p.y, p.z); return { x: p.x / l, y: p.y / l, z: p.z / l } }
    const cross = (p, q) => ({ x: p.y * q.z - p.z * q.y, y: p.z * q.x - p.x * q.z, z: p.x * q.y - p.y * q.x })
    const eye = { x: shot.x, y: shot.y, z: shot.z }
    const forward = norm(sub(shot.target, eye))
    const rightAxis = norm(cross(forward, { x: 0, y: 1, z: 0 }))
    const up = cross(rightAxis, forward)
    const rel = sub(at, eye)
    const depth = dot(rel, forward)
    const half = Math.tan((cam.FOV * Math.PI) / 360)
    const clientX = rect.left + ((dot(rel, rightAxis) / (depth * half * aspect) + 1) / 2) * rect.width
    const clientY = rect.top + ((1 - dot(rel, up) / (depth * half)) / 2) * rect.height
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX, clientY, bubbles: true }))
    if (!${hoverOnly}) canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX, clientY, bubbles: true }))
    return { stage: g.stage, slot, own, right: ${right} }
  })()`
}

/**
 * An expression that, in a page showing Sprint Triathlon, does one thing the leg
 * on screen asks for, the way a player does: a left click on the field to swim,
 * a press of Space to bike, the next character of the sentence to run - or, with
 * `wrong`, a key that is not it. Reads the leg and sentence from the page's
 * `data-task`, `data-sentence` and `data-typed`. Evaluates to what it did, or
 * null when there is nothing to do.
 */
export function triathlonMove({ wrong = false } = {}) {
  return `(() => {
    const task = document.querySelector('[data-task]')
    if (!task) return null
    const leg = task.dataset.task
    if (leg === 'swim') {
      const board = document.querySelector('[data-board]')
      const rect = board.getBoundingClientRect()
      board.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 3, bubbles: true }))
      return { leg }
    }
    if (leg === 'bike') {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }))
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ', bubbles: true }))
      return { leg }
    }
    if (leg === 'run') {
      const box = task.querySelector('[data-sentence]')
      const sentence = box.dataset.sentence
      const typed = Number(box.dataset.typed)
      const key = ${wrong} ? '#' : sentence[typed]
      window.dispatchEvent(new KeyboardEvent('keydown', { key, code: key === ' ' ? 'Space' : '', bubbles: true }))
      return { leg, key, typed }
    }
    return { leg }
  })()`
}

/**
 * An expression that, in a page showing Wack-Attack, plays one moment the way a
 * player does: holds the WASD keys towards the nearest mole that is up and not
 * whacked until the hammer will land on it, then lets go and clicks the field to
 * swing. Evaluates to what it did, or null with nothing to go for.
 */
export function whackMove() {
  return `(async () => {
    const rules = await import('/src/modules/25-wack-attack/internal/rules.ts')
    const g = ${gameState('wack-attack')}
    const held = (window.__waKeys ??= new Set())
    const press = (code, down) => {
      if (down === held.has(code)) return
      down ? held.add(code) : held.delete(code)
      window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code.slice(3).toLowerCase() }))
    }
    const letGo = () => ['KeyW', 'KeyA', 'KeyS', 'KeyD'].forEach((c) => press(c, false))
    if (!g || g.over) { letGo(); return null }
    const me = g.players.find((p) => p.mine)
    if (!me) return null
    const up = rules.molesFor(g.seed).filter((m) => rules.isUp(m, g.elapsed) && m.at + m.up - g.elapsed > 0.25 && !rules.whackOf(g, m.id))
    if (up.length === 0) { letGo(); return null }
    const far = (m) => { const h = rules.holeAt(m.hole); return Math.hypot(h.x - me.x, h.y - me.y) }
    up.sort((a, b) => far(a) - far(b))
    const target = up[0]
    const hole = rules.holeAt(target.hole)
    const dx = hole.x - me.x
    const dy = hole.y - me.y
    const distance = Math.hypot(dx, dy)
    if (distance > rules.FIELD.strike * 0.9) {
      press('KeyD', dx > distance * 0.3); press('KeyA', dx < -distance * 0.3)
      press('KeyS', dy > distance * 0.3); press('KeyW', dy < -distance * 0.3)
      return { walking: target.id, far: +distance.toFixed(2) }
    }
    letGo()
    const board = document.querySelector('[data-board]')
    const rect = board.getBoundingClientRect()
    board.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, bubbles: true }))
    return { swing: target.id, golden: target.golden, score: me.score }
  })()`
}

/**
 * An expression that, in a page showing Make The Cut, plays one moment of this
 * player's turn the way a player does: holds the WASD keys towards the nearest
 * whole string until it is well in reach, then lets go, moves the pointer onto
 * the string - projected with the game's own camera fit - and clicks. Evaluates
 * to what it did, or null when it is not this player's turn. Off its turn it
 * lets go of every key.
 */
export function cutterMove() {
  return `(async () => {
    const rules = await import('/src/modules/24-make-the-cut/internal/rules.ts')
    const cam = await import('/src/modules/24-make-the-cut/internal/camera.ts')
    const g = ${gameState('make-the-cut')}
    const held = (window.__mcKeys ??= new Set())
    const press = (code, down) => {
      if (down === held.has(code)) return
      down ? held.add(code) : held.delete(code)
      window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code.slice(3).toLowerCase() }))
    }
    const letGo = () => ['KeyW', 'KeyA', 'KeyS', 'KeyD'].forEach((c) => press(c, false))
    if (!g) return null
    const me = g.players.findIndex((p) => p.mine)
    if (me < 0 || rules.whoseTurn(g) !== me || g.clock < 0.3) { letGo(); return null }
    const string = rules.nearestString(g, me)
    const web = rules.webFor(g.seed, g.count)
    const rim = web[string].rim
    const body = g.players[me]
    const dx = rim.x - body.x
    const dy = rim.z - body.y
    const far = Math.hypot(dx, dy)
    if (far > rules.TOWER.reach * 0.7) {
      press('KeyD', dx > far * 0.3); press('KeyA', dx < -far * 0.3)
      press('KeyS', dy > far * 0.3); press('KeyW', dy < -far * 0.3)
      return { walking: string, far: +far.toFixed(2) }
    }
    letGo()
    const canvas = document.querySelector('[data-board] canvas')
    const rect = canvas.getBoundingClientRect()
    const aspect = rect.width / rect.height
    const shot = cam.frameScene(aspect)
    const s = web[string]
    const at = { x: s.rim.x + (s.end.x - s.rim.x) * 0.2, y: s.rim.y + (s.end.y - s.rim.y) * 0.2 + 0.25, z: s.rim.z + (s.end.z - s.rim.z) * 0.2 }
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
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX, clientY, bubbles: true }))
    return { cut: string, turn: g.turns, x: Math.round(clientX), y: Math.round(clientY) }
  })()`
}

/**
 * An expression that, in a page showing Lady Luck, clicks a clover the way a
 * player does - a pointer move over the board and a pointerdown on the canvas
 * at the clover's spot on screen, projected with the game's own camera fit -
 * and evaluates to what it clicked, or null when there was nothing to click or
 * the cooldown was running.
 *
 * `which` is 'lucky' (the nth hidden four-leaf clover, `n` from 0) or 'plain' (a
 * three-leaf clover). `force` clicks even during the cooldown.
 */
export function cloverClick(which = 'lucky', { n = 0, force = false } = {}) {
  return `(async () => {
    const rules = await import('/src/modules/23-lady-luck/internal/rules.ts')
    const cam = await import('/src/modules/23-lady-luck/internal/camera.ts')
    const g = ${gameState('lady-luck')}
    if (!g || g.over) return null
    const me = g.players.find((p) => p.mine)
    if (!me || (me.cooldown > 0 && !${force})) return null
    const field = rules.fieldFor(g.seed)
    let clover = null
    if (${JSON.stringify(which)} === 'lucky') clover = g.lucky[${n}]?.clover ?? null
    else clover = field.findIndex((_, i) => !rules.fourLeaf(g, i))
    if (clover === null || clover < 0) return null
    const canvas = document.querySelector('[data-board] canvas')
    const rect = canvas.getBoundingClientRect()
    const aspect = rect.width / rect.height
    const shot = cam.frameScene(aspect)
    const at = { x: field[clover].x, y: 0.02, z: field[clover].z }
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
    document.querySelector('[data-board]').dispatchEvent(new PointerEvent('pointermove', { clientX, clientY, bubbles: true }))
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX, clientY, bubbles: true }))
    return { clover, which: ${JSON.stringify(which)}, score: me.score, x: Math.round(clientX), y: Math.round(clientY) }
  })()`
}

/**
 * An expression that, in a page showing Let Him Cook on this player's turn,
 * picks an item the way a player does - a pointer move and a pointerdown on the
 * canvas at its basket's spot on screen, projected with the game's own camera
 * fit - and evaluates to what it picked, or null when it is not this player's
 * turn. A click on a basket takes its last unclaimed item, so that is the slot.
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
    const kind = g.served[list[0]]
    const slot = g.served.map((_, s) => s).filter((s) => g.served[s] === kind && g.claimed[s] === null).pop()
    const canvas = document.querySelector('[data-board] canvas')
    const rect = canvas.getBoundingClientRect()
    const aspect = rect.width / rect.height
    const shot = cam.frameScene(aspect)
    const rules = await import('/src/modules/22-let-him-cook/internal/rules.ts')
    const basket = cam.basketAt(kind, rules.rotation(g))
    const at = { ...basket, y: basket.y + cam.LAYOUT.wall * 0.7 }
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
