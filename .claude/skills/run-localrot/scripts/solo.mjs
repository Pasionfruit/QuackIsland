/**
 * One player, alone: open a minigame, play it, and screenshot it.
 *
 *   node .claude/skills/run-localrot/scripts/solo.mjs --game messy-maze --out <dir> [--steer] [--software]
 *
 * --game      messy-maze (default), zombie-tag, probable-stop, duck-hunt, punch-buggy
 *             lady-luck, let-him-cook or i-see-the-light
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
 *             Lady Luck: click a three-leaf clover once and check it starts
 *             the cooldown and blocks a click during it, then claim a four-leaf
 *             clover every three seconds, screenshotting the field mid-round
 *             and the results.
 *             Let Him Cook: watch the chef, then on each of your turns pick an
 *             item this browser saw go in and nobody has claimed, screenshotting
 *             the cooking, the turn order, a hovered item, a result and the
 *             results. With --slip, pick an ingredient it never saw go in on
 *             your second turn and check it is out for it.
 *             I See The Light: press space every tick on green, follow the
 *             circle with the pointer on red, screenshotting the 3-2-1
 *             countdown, a red, then the
 *             results. With --slip, press space in the second red and check it
 *             is out for it.
 * --software  render with SwiftShader instead of the GPU (slow; see cdp.mjs)
 *
 * Needs the dev server running; not the relay - alone you are your own host.
 */
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GAMES, args, cloverClick, cookPick, duckHuntShot, gameState, launch, lightMove, say, sleep } from './cdp.mjs'

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
  } else if (opt.steer && opt.game === 'lady-luck') {
    const state = () => page.eval(`(() => { const g = ${gameState('lady-luck')}; const me = g.players.find((p) => p.mine); return { over: g.over, elapsed: +g.elapsed.toFixed(2), score: me.score, misses: me.misses, cooldown: +me.cooldown.toFixed(2), claims: g.claims.length, lucky: g.lucky.map((l) => l.clover), scores: g.players.map((p) => p.score) } })()`)
    let claimed = 0
    let tried = 0
    let missed = false
    let shotMid = false
    let nextAt = 2
    for (let i = 0; i < 3000; i++) {
      const s = await state()
      if (s.over) break
      if (!missed && s.elapsed > 1) {
        // One deliberate miss: a three-leaf clover, and the cooldown should start.
        missed = true
        await page.eval(cloverClick('plain'))
        await sleep(120)
        const after = await state()
        say('clicked a three-leaf clover', JSON.stringify({ misses: after.misses, cooldown: after.cooldown }))
        if (after.misses !== s.misses + 1 || after.cooldown <= 0) throw new Error('a three-leaf clover was not a miss')
        const blocked = await page.eval(cloverClick('lucky', { force: true }))
        await sleep(120)
        const still = await state()
        say('clicked a four-leaf clover during the cooldown', JSON.stringify({ blocked, score: still.score }))
        if (still.score !== s.score) throw new Error('a click during the cooldown counted')
      }
      // Find one every few seconds, like a player who is looking.
      if (s.elapsed >= nextAt && s.cooldown <= 0) {
        const did = await page.eval(cloverClick('lucky'))
        if (did) {
          tried += 1
          await sleep(150)
          const after = await state()
          if (after.score === s.score + 1) claimed += 1
          else say('claim not counted', JSON.stringify({ did, before: s, after }))
          nextAt = after.elapsed + 3
        }
      }
      if (!shotMid && s.elapsed > 25) {
        shotMid = true
        say('mid-round', JSON.stringify(s), await page.shot('3-field.png'))
      }
      await sleep(80)
    }
    say('claimed', claimed, 'of', tried, 'clicks on four-leaf clovers')
    if (claimed === 0) throw new Error('never claimed a four-leaf clover')
    await page.waitFor(`!!document.querySelector('[data-again]')`, 90000)
    say('results', await page.shot('4-results.png'))
  } else if (opt.steer && opt.game === 'let-him-cook') {
    const state = () => page.eval(`(() => { const g = ${gameState('let-him-cook')}; const me = g.players.findIndex((p) => p.mine); return { phase: g.phase, clock: +g.clock.toFixed(2), recipe: g.recipe, turn: g.turn, up: g.queue[0], me, out: g.players[me].out, claims: g.players[me].claims, last: g.last, left: g.players.filter((p) => !p.out).length, picks: g.picks.length } })()`)
    const shots = new Set()
    const log = []
    let myTurns = 0
    let lastTurn = -1
    for (let i = 0; i < 6000; i++) {
      const s = await state()
      if (s.phase === 'over') break
      if (s.phase === 'cooking' && s.clock > 4.3 && !shots.has('cooking')) {
        shots.add('cooking')
        say('cooking', JSON.stringify(s), await page.shot('3-cooking.png'))
      }
      if (s.phase === 'order' && !shots.has('order')) {
        shots.add('order')
        say('order', JSON.stringify(s), await page.shot('4-order.png'))
      }
      if (s.phase === 'result' && s.last && !shots.has(`result-${s.last.ok}`)) {
        shots.add(`result-${s.last.ok}`)
        say('result', JSON.stringify(s.last), await page.shot(`6-result-${s.last.ok ? 'right' : 'out'}.png`))
      }
      if (s.phase === 'turns' && s.up === s.me && s.turn !== lastTurn && s.clock > 0.6) {
        lastTurn = s.turn
        myTurns += 1
        const choose = opt.slip && myTurns === 2 ? 'wrong' : 'safe'
        if (!shots.has('hover')) {
          shots.add('hover')
          await page.eval(cookPick('safe', { hoverOnly: true }))
          await sleep(250)
          say('your turn', await page.shot('5-your-turn.png'))
        }
        let did = await page.eval(cookPick(choose))
        if (did?.none === 'wrong') did = await page.eval(cookPick('gone'))
        await sleep(400)
        const after = await state()
        log.push({ choose, did, ok: after.last?.ok, why: after.last?.why })
        say('picked', JSON.stringify(log[log.length - 1]))
        if (choose === 'safe' && did?.slot !== undefined && after.last?.ok !== true) throw new Error('a copy seen going in was not accepted')
        if (choose === 'wrong' && did?.slot !== undefined && after.last?.ok !== false) throw new Error('a wrong pick was not out')
      }
      await sleep(80)
    }
    say('my turns', JSON.stringify(log))
    await page.waitFor(`!!document.querySelector('[data-again]')`, 300000)
    say('results', await page.shot('7-results.png'))
  } else if (opt.steer && opt.game === 'i-see-the-light') {
    const state = () => page.eval(`(() => { const r = ${gameState('i-see-the-light')}; const me = r.racers.find((x) => x.mine); return { over: r.over, elapsed: +r.elapsed.toFixed(2), steps: me.steps, out: me.out, place: me.place, others: r.racers.filter((x) => !x.mine).map((x) => x.id + ':' + x.steps + (x.out ? ':' + x.out.why : '') + (x.place ? ':#' + x.place : '')) } })()`)
    let reds = 0
    let wasRed = false
    let shotRed = false
    let shotCount = false
    let slipped = false
    let presses = 0
    for (let i = 0; i < 4000; i++) {
      const s = await state()
      if (s.over || s.out || s.place) {
        say('ended', JSON.stringify(s))
        break
      }
      const count = await page.eval(`document.querySelector('[data-countdown]')?.dataset.countdown ?? null`)
      if (count !== null && !shotCount) {
        shotCount = true
        say('countdown', count, await page.shot('3-countdown.png'))
      }
      const did = await page.eval(lightMove())
      if (did?.pressed) presses += 1
      const red = did?.light === 'red'
      if (red && !wasRed) reds += 1
      wasRed = red
      if (red && !shotRed && did.circle) {
        shotRed = true
        await sleep(1200)
        await page.eval(lightMove())
        say('red', JSON.stringify(s), await page.shot('3-red.png'))
      }
      if (opt.slip && red && reds === 2 && !slipped) {
        slipped = true
        await sleep(1000)
        await page.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }))`)
        await sleep(100)
        const after = await state()
        say('pressed space on red', JSON.stringify(after.out))
        if (after.out?.why !== 'space') throw new Error('space on red did not put us out')
      }
      await sleep(red ? 25 : 90)
    }
    say('pressed space', presses, 'times across', reds, 'reds')
    await page.waitFor(`!!document.querySelector('[data-again]')`, 150000)
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
