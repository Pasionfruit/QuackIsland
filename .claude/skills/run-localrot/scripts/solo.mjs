/**
 * One player, alone: open a minigame, play it, and screenshot it.
 *
 *   node .claude/skills/run-localrot/scripts/solo.mjs --game messy-maze --out <dir> [--steer] [--software]
 *
 * --game      messy-maze (default), zombie-tag, probable-stop, duck-hunt or punch-buggy
 * --app       dev server URL (default http://localhost:5199/)
 * --out       where screenshots go (default <temp>/localrot-run/solo)
 * --steer     Messy Maze: drive your racer to the middle with the stand-ins'
 *             route-finding, pressing whatever letters your binding says, and
 *             wait for the results. Zombie Tag: hold D for two seconds.
 *             Probable Stop: play all six rounds - a different path each
 *             round, confirmed - screenshotting a reveal, then the results.
 *             Duck Hunt: shoot one of your own balloons whenever the cooldown
 *             allows, for the whole minute, then the results.
 *             Punch Buggy: walk at the nearest fighter, punch when facing them
 *             within reach, pull back, repeat - screenshotting a punch in flight
 *             and the results.
 * --software  render with SwiftShader instead of the GPU (slow; see cdp.mjs)
 *
 * Needs the dev server running; not the relay - alone you are your own host.
 */
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GAMES, args, duckHuntShot, gameState, launch, say, sleep } from './cdp.mjs'

const opt = args({ game: 'messy-maze', app: 'http://localhost:5199/', out: join(tmpdir(), 'localrot-run', 'solo'), port: '9400' })
const game = GAMES[opt.game]
if (!game) throw new Error(`--game must be one of ${Object.keys(GAMES).join(', ')}`)

const page = await launch({ port: Number(opt.port), out: opt.out, name: 'solo', software: !!opt.software })
let ok = false
try {
  await page.goto(opt.app)
  await page.waitFor(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes('minigames'))`, 90000)
  await page.clickText('minigames')
  await page.waitFor(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes(${JSON.stringify(game.title)}))`)
  await page.clickText(game.title)
  await page.waitFor(`!!document.querySelector('[data-play]')`)
  say('briefing', await page.shot('1-briefing.png'))

  await page.eval(`document.querySelector('[data-play]').click()`)
  await page.waitFor(`!!${gameState(opt.game)}`, 30000)
  await sleep(1500)
  const state = await page.eval(`(() => { const s = ${gameState(opt.game)}; return { people: s.${game.people}.length, layout: s.layout, seed: s.seed } })()`)
  say('playing', JSON.stringify(state), await page.shot('2-playing.png'))

  if (opt.steer && opt.game === 'messy-maze') {
    const log = await page.eval(`(async () => {
      const ai = await import('/src/modules/17-messy-maze/internal/ai.ts')
      const held = new Set()
      const press = (letter, down) => {
        if (down === held.has(letter)) return
        down ? held.add(letter) : held.delete(letter)
        window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key: letter.toLowerCase() }))
      }
      const log = []
      let spins = 0
      const start = performance.now()
      while (performance.now() - start < 240000) {
        const race = ${gameState('messy-maze')}
        const me = race.racers.find((r) => r.mine)
        if (me.spins !== spins) { spins = me.spins; log.push({ t: +race.elapsed.toFixed(1), spins, binding: me.binding }) }
        if (me.place !== null || race.over) { log.push({ place: me.place, t: +race.elapsed.toFixed(1) }); break }
        const d = ai.botDirection(race, me)
        const want = { [me.binding[0]]: d.y < -0.3, [me.binding[1]]: d.x < -0.3, [me.binding[2]]: d.y > 0.3, [me.binding[3]]: d.x > 0.3 }
        for (const l of [...held]) if (!want[l]) press(l, false)
        for (const [l, on] of Object.entries(want)) press(l, on)
        await new Promise((r) => setTimeout(r, 30))
      }
      for (const l of [...held]) press(l, false)
      return log
    })()`)
    say('steered', JSON.stringify(log), await page.shot('3-in.png'))
    await page.waitFor(`!!document.querySelector('[data-again]')`, 120000)
    say('results', await page.shot('4-results.png'))
  } else if (opt.steer && opt.game === 'punch-buggy') {
    const board = await page.eval(`(() => { const r = document.querySelector('[data-board]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
    const held = new Set()
    const key = async (code, down) => {
      if (down === held.has(code)) return
      down ? held.add(code) : held.delete(code)
      await page.eval(`window.dispatchEvent(new KeyboardEvent('${down ? 'keydown' : 'keyup'}', { code: '${code}', key: '${code.slice(3).toLowerCase()}' }))`)
    }
    const clickBoard = () => page.eval(`document.querySelector('[data-board]').dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: ${board.x}, clientY: ${board.y}, bubbles: true }))`)
    let clicks = 0
    let shotPunch = false
    for (let i = 0; i < 1000; i++) {
      const s = await page.eval(`(() => {
        const r = ${gameState('punch-buggy')}
        const me = r.fighters.find((f) => f.mine)
        const others = r.fighters.filter((f) => !f.mine && f.alive)
        others.sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))
        const t = others[0]
        return { over: r.over, elapsed: r.elapsed, alive: me.alive, how: me.how, by: me.by, out: r.fighters.filter((f) => !f.alive).map((f) => f.id + ":" + f.how + ":" + f.by + "@" + (f.outAt ?? 0).toFixed(2)), punch: me.punch, x: me.x, y: me.y, facing: me.facing, target: t ? { x: t.x, y: t.y } : null, standing: r.fighters.filter((f) => f.alive).length }
      })()`)
      if (s.over || !s.alive) {
        for (const code of [...held]) await key(code, false)
        say('ended', JSON.stringify(s))
        break
      }
      if (s.target) {
        const dx = s.target.x - s.x
        const dy = s.target.y - s.y
        const distance = Math.hypot(dx, dy)
        // Keep off the edge first.
        const edge = Math.hypot(s.x, s.y) > 8
        const wx = edge ? -s.x : dx
        const wy = edge ? -s.y : dy
        await key('KeyD', wx > 0.3 * Math.hypot(wx, wy))
        await key('KeyA', wx < -0.3 * Math.hypot(wx, wy))
        await key('KeyS', wy > 0.3 * Math.hypot(wx, wy))
        await key('KeyW', wy < -0.3 * Math.hypot(wx, wy))
        const off = Math.abs(Math.atan2(Math.sin(Math.atan2(dy, dx) - s.facing), Math.cos(Math.atan2(dy, dx) - s.facing)))
        if (s.punch === 'in' && distance < 6.5 && off < 0.45) {
          await clickBoard()
          clicks += 1
          if (!shotPunch) {
            shotPunch = true
            await sleep(90)
            say('punch', JSON.stringify(s), await page.shot('3-punch.png'))
          }
        } else if (s.punch === 'held') {
          await clickBoard()
          clicks += 1
        }
      }
      await sleep(60)
    }
    say('clicked', clicks, 'times')
    await page.waitFor(`!!document.querySelector('[data-again]')`, 60000)
    say('results', await page.shot('4-results.png'))
  } else if (opt.steer && opt.game === 'duck-hunt') {
    let fired = 0
    let shotMid = false
    for (let i = 0; i < 2000; i++) {
      const s = await page.eval(`(() => { const g = ${gameState('duck-hunt')}; const me = g.players.find((p) => p.mine); return { over: g.over, elapsed: g.elapsed, score: me.score, shots: me.shots } })()`)
      if (s.over) break
      if (await page.eval(duckHuntShot())) fired += 1
      if (!shotMid && s.elapsed > 20) {
        shotMid = true
        await sleep(60)
        say('mid-game', JSON.stringify(s), await page.shot('3-shooting.png'))
      }
      await sleep(80)
    }
    const end = await page.eval(`(() => { const g = ${gameState('duck-hunt')}; return g.players.map((p) => ({ id: p.id, score: p.score, shots: p.shots, mine: p.mine })) })()`)
    say('clicked', fired, 'times; scores', JSON.stringify(end))
    await page.waitFor(`!!document.querySelector('[data-again]')`, 30000)
    say('results', await page.shot('4-results.png'))
  } else if (opt.steer && opt.game === 'probable-stop') {
    const state = () => page.eval(`(() => { const g = ${gameState('probable-stop')}; const me = g.players.find((p) => p.mine); return { round: g.round, phase: g.phase, clock: g.clock, safe: g.safe, pick: me.pick, confirmed: me.confirmed, alive: me.alive, outIn: me.outIn, left: g.players.filter((p) => p.alive).length } })()`)
    const log = []
    let shotReveal = false
    let played = -1
    for (let i = 0; i < 1200; i++) {
      const s = await state()
      if (s.phase === 'over') break
      if (s.phase === 'choosing' && s.alive && s.round !== played) {
        played = s.round
        // A path per round, walked to with the keys, then confirmed with Space.
        const target = s.round % 3
        const key = target < s.pick ? { code: 'KeyA', key: 'a' } : { code: 'KeyD', key: 'd' }
        for (let n = 0; n < Math.abs(target - s.pick); n++) {
          await page.eval(`window.dispatchEvent(new KeyboardEvent('keydown', ${JSON.stringify(key)}))`)
          await sleep(120)
        }
        await page.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }))`)
        await sleep(200)
        const after = await state()
        log.push({ round: s.round + 1, wanted: target, pick: after.pick, confirmed: after.confirmed })
      }
      if (s.phase === 'reveal' && !shotReveal && s.clock < 2.2) {
        shotReveal = true
        say('reveal', JSON.stringify(s), await page.shot('3-reveal.png'))
      }
      if (s.phase === 'reveal' && log.length && log[log.length - 1].result === undefined && s.round + 1 === log[log.length - 1].round) {
        log[log.length - 1].result = s.alive ? 'held' : 'fell'
        log[log.length - 1].safe = s.safe
      }
      await sleep(100)
    }
    say('rounds', JSON.stringify(log))
    await page.waitFor(`!!document.querySelector('[data-again]')`, 120000)
    say('results', await page.shot('4-results.png'))
  } else if (opt.steer) {
    await page.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', key: 'd' }))`)
    await sleep(2000)
    await page.eval(`window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD', key: 'd' }))`)
    say('moved', await page.shot('3-moved.png'))
  }

  say('console errors:', page.errors.length ? JSON.stringify(page.errors.slice(0, 5)) : 'none')
  ok = true
} catch (e) {
  say('FAILED', e.message.slice(0, 300), await page.shot('failure.png').catch(() => ''))
} finally {
  page.close()
  process.exit(ok ? 0 : 1)
}
