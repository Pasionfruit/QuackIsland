/**
 * One player, alone: open a minigame, play it, and screenshot it.
 *
 *   node .claude/skills/run-localrot/scripts/solo.mjs --game messy-maze --out <dir> [--steer] [--software]
 *
 * --game      messy-maze (default), zombie-tag or probable-stop
 * --app       dev server URL (default http://localhost:5199/)
 * --out       where screenshots go (default <temp>/localrot-run/solo)
 * --steer     Messy Maze: drive your racer to the middle with the stand-ins'
 *             route-finding, pressing whatever letters your binding says, and
 *             wait for the results. Zombie Tag: hold D for two seconds.
 *             Probable Stop: play all six rounds - a different path each
 *             round, confirmed - screenshotting a reveal, then the results.
 * --software  render with SwiftShader instead of the GPU (slow; see cdp.mjs)
 *
 * Needs the dev server running; not the relay - alone you are your own host.
 */
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GAMES, args, gameState, launch, say, sleep } from './cdp.mjs'

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
