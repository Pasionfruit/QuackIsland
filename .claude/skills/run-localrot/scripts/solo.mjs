/**
 * One player, alone: open a minigame, play it, and screenshot it.
 *
 *   node .claude/skills/run-localrot/scripts/solo.mjs --game messy-maze --out <dir> [--steer] [--software]
 *
 * --game      messy-maze (default), zombie-tag, probable-stop, duck-hunt, punch-buggy
 *             time-it, feeding-time, find-yourself, sprint-triathlon, wack-attack, lady-luck, make-the-cut, let-him-cook
 *             i-see-the-light, synchronize-steps, helping-dad, hes-one-shot, keyboard-warrior, chef-caricature,
 *             musical-mayhem, wheres-midnight or pet-race (the last three open and screenshot only - no --steer yet)
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
 *             Time It: a click in the countdown (must not stop), then a click on
 *             the target by the page's own clock, failing unless the stop is
 *             within 0.15 s of it; screenshots countdown, running, covered and
 *             results.
 *             Feeding Time: pointing without pressing first (must not throw),
 *             then throws at the nearest hungry duck for the minute - point,
 *             hold for the power, let go - every fourth one spoiled - failing
 *             unless crackers are thrown and ducks fed.
 *             Find Yourself: pick the right cup in stages 1 and 3 and the wrong
 *             one in stage 2, failing unless that scores 4; screenshots the
 *             faces, a shuffle, a hovered cup, a result and the results.
 *             Sprint Triathlon: click to swim, press Space to bike and type the
 *             sentence to run, about fourteen times a second, to the finish,
 *             screenshotting the countdown and each leg. With --slip, type a
 *             wrong key on the run and check the next right key is ignored.
 *             Wack-Attack: walk with WASD to the nearest mole up and click to
 *             swing once over it, for the whole minute, failing if nothing was
 *             whacked; screenshots a swing, the field and the results.
 *             Make The Cut: on each of your turns, walk with WASD to the nearest
 *             string and click it, failing if a cut in reach does not count,
 *             screenshotting the draw, walking, a cut, a launch and the results.
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
 *             Synchronize Steps: every round, press a number key - or click
 *             its button, or pick one and change its mind - except round 3,
 *             which it sits out; presses a key in each reveal too. Fails if a
 *             pick is not the one counted, if the sat-out round is not picked
 *             for it, or if a key in the reveal carries into the next round.
 *             Screenshots a pick, a reveal and the results.
 *             Helping Dad: pick the torch up and lead it along the way out with
 *             the mouse; once, a few seconds in, fling the mouse two cells
 *             across a closed side of the cell it is in, through the wall. Fails unless that is a wall touched and
 *             a stun - not a torch through a wall - the torch stays put while
 *             stunned and is down after, and the torch reaches the finish.
 *             Screenshots the countdown, the dark, Dad yelling and the results.
 *             He's One Shot: stands in for the pointer lock (see oneShotPlay), then
 *             checks the controls one at a time - a click in the countdown
 *             shoots nothing, the mouse turns you by exactly what it moved, W
 *             walks you the way you look, a click shoots and a second click
 *             straight after does not - and then hunts for the rest of the game,
 *             turning with the mouse and shooting whoever it has a clear line
 *             to. Fails unless every control does what it says and the game
 *             ends. Screenshots the countdown, a shot, a hit, being a hunter
 *             and the results.
 *             Keyboard Warrior: presses a key in the pause before the first
 *             letter and fails if that counts; then types each letter 0.35 s
 *             after it is on the screen, with real keydowns - except the second,
 *             where it types a wrong letter then the right one and fails unless
 *             that stays a wrong attempt, and the fourth, which it sits out.
 *             Fails if a right letter is not taken as right, if the reaction
 *             the screen timed is not about 0.35 s, or if it never wins one.
 *             Screenshots the countdown, a letter typed, a wrong key, a letter
 *             decided and the results.
 *             Chef Caricature: watches whoever draws before you, then on your
 *             turn, with real pointer events at the board positions the game's
 *             camera fit gives - lets go of an outline part way and fails unless
 *             it is wiped, scribbles over the whole board and fails if that is
 *             accepted, then traces outlines for the rest of the turn and fails
 *             unless at least four are accepted, a dish each. Screenshots a
 *             stand-in drawing, a wiped attempt, drawing, the duck fed and the
 *             results. Takes the length of every turn: a few minutes.
 * --software  render with SwiftShader instead of the GPU (slow; see cdp.mjs)
 *
 * Needs the dev server running; not the relay - alone you are your own host.
 */
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GAMES, args, chefTrace, cloverClick, cookPick, cupPick, cutterMove, duckHuntShot, feedFlick, gameState, launch, lightMove, oneShotPlay, say, sleep, stepsPick, timeItStop, torchMove, triathlonMove, typeLetter, whackMove } from './cdp.mjs'

const opt = args({ game: 'messy-maze', app: 'http://localhost:5199/', out: join(tmpdir(), 'localrot-run', 'solo'), port: '9400' })
const game = GAMES[opt.game]
if (!game) throw new Error(`--game must be one of ${Object.keys(GAMES).join(', ')}`)

const page = await launch({ port: Number(opt.port), out: opt.out, name: 'solo', software: !!opt.software })
let ok = false
try {
  await page.goto(opt.app)
  await page.waitFor(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes('minigames'))`, 90000)
  await page.clickText('minigames')
  await page.waitFor(`!!document.querySelector('[data-minigame]')`)
  await page.pickMinigame(opt.game)
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
    await page.waitFor(`!!document.querySelector('[data-again], [data-podium]')`, 120000)
    say('results', await page.shot('4-results.png'))
  } else if (opt.steer && opt.game === 'time-it') {
    const state = () => page.eval(`(() => { const g = ${gameState('time-it')}; const me = g.players.find((p) => p.mine); return { over: g.over, elapsed: +g.elapsed.toFixed(2), stopped: me.stopped, all: g.players.map((p) => p.stopped) } })()`)
    // A click during the screen's three-two-one does nothing: the game is held.
    await page.eval(`(() => { const b = document.querySelector('[data-board]'); const r = b.getBoundingClientRect(); b.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: r.left + 10, clientY: r.top + 10, bubbles: true })) })()`)
    await sleep(150)
    const early = await state()
    say('clicked in the countdown', JSON.stringify({ elapsed: early.elapsed, stopped: early.stopped }), await page.shot('3-countdown.png'))
    if (early.stopped !== null) throw new Error('a click in the countdown stopped the timer')
    await page.waitFor(`(() => { const g = ${gameState('time-it')}; return g.elapsed > 1 })()`, 10000)
    say('running', await page.shot('4-running.png'))
    await page.waitFor(`(() => { const g = ${gameState('time-it')}; return g.elapsed > 3.2 })()`, 10000)
    say('covered', await page.shot('5-covered.png'))
    const did = await page.eval(timeItStop())
    await sleep(200)
    const after = await state()
    say('stopped', JSON.stringify(did), JSON.stringify(after))
    if (!did || after.stopped === null || Math.abs(after.stopped - did.target) > 0.15) throw new Error('the stop did not land on the target: ' + JSON.stringify({ did, after }))
    await page.waitFor(`!!document.querySelector('[data-again], [data-podium]')`, 40000)
    await sleep(600)
    // The podium takes the game down with it, so there is no round left to read.
    say('results', await page.shot('6-results.png'))
  } else if (opt.steer && opt.game === 'feeding-time') {
    const state = () => page.eval(`(() => { const g = ${gameState('feeding-time')}; const me = g.players.find((p) => p.mine); return { over: g.over, elapsed: +g.elapsed.toFixed(2), score: me.score, throws: me.throws, scores: g.players.map((p) => p.score), crackers: g.crackers.length } })()`)
    let flicks = 0
    let shotThrow = false
    let shotMid = false
    // Pointing without pressing first: not a throw.
    const before = await state()
    await page.eval(`(async () => { const b = document.querySelector('[data-board]'); const r = b.getBoundingClientRect(); for (const y of [0.8, 0.5, 0.2]) { b.dispatchEvent(new PointerEvent('pointermove', { clientX: r.left + r.width / 2, clientY: r.top + y * r.height, bubbles: true, pointerId: 1 })); await new Promise((res) => setTimeout(res, 200)) } })()`)
    await sleep(200)
    const afterSlow = await state()
    say('pointing only', JSON.stringify({ throwsBefore: before.throws, throwsAfter: afterSlow.throws }), await page.shot('2b-aim.png'))
    if (afterSlow.throws !== before.throws) throw new Error('pointing without pressing threw a cracker')
    // Held part way: the meter fills and the landing is marked, and nothing is thrown until letting go.
    await page.waitFor(`(() => { const g = ${gameState('feeding-time')}; return g.elapsed > 0.5 })()`, 10000)
    await page.eval(`(() => { const b = document.querySelector('[data-board]'); const r = b.getBoundingClientRect(); b.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + r.width * 0.55, clientY: r.top + r.height * 0.35, bubbles: true, pointerId: 1, button: 0 })) })()`)
    await sleep(600)
    const held = await state()
    say('charging', JSON.stringify({ throws: held.throws, meter: await page.eval(`document.querySelector('[data-meter] div').style.width`) }), await page.shot('2c-charging.png'))
    if (held.throws !== before.throws) throw new Error('holding the button threw a cracker before letting go')
    await page.eval(`(() => { const b = document.querySelector('[data-board]'); const r = b.getBoundingClientRect(); b.dispatchEvent(new PointerEvent('pointerup', { clientX: r.left + r.width * 0.55, clientY: r.top + r.height * 0.35, bubbles: true, pointerId: 1, button: 0 })) })()`)
    await sleep(100)
    if ((await state()).throws !== before.throws + 1) throw new Error('letting go did not throw')
    for (let i = 0; i < 3000; i++) {
      const s = await state()
      if (s.over) break
      // Every few throws, spoil the aim.
      const did = await page.eval(feedFlick({ off: flicks % 4 === 3 ? 0.35 : 0 }))
      if (did && did.duck !== undefined) {
        flicks += 1
        if (!shotThrow) {
          shotThrow = true
          await sleep(250)
          say('throw', JSON.stringify(did), await page.shot('3-throw.png'))
        }
      }
      if (!shotMid && s.elapsed > 30) {
        shotMid = true
        say('mid-round', JSON.stringify(s), await page.shot('4-pond.png'))
      }
      await sleep(120)
    }
    const end = await state()
    say('flicked', flicks, 'times;', JSON.stringify(end))
    if (end.throws === 0) throw new Error('no flick threw a cracker')
    if (end.score === 0) throw new Error('never fed a duck')
    await page.waitFor(`!!document.querySelector('[data-again], [data-podium]')`, 90000)
    say('results', await page.shot('5-results.png'))
  } else if (opt.steer && opt.game === 'find-yourself') {
    const state = () => page.eval(`(() => { const g = ${gameState('find-yourself')}; const me = g.players.find((p) => p.mine); return { stage: g.stage, phase: g.phase, clock: +g.clock.toFixed(2), score: me.score, picks: me.picks, scores: g.players.map((p) => p.score) } })()`)
    const shots = new Set()
    const log = []
    for (let i = 0; i < 4000; i++) {
      const s = await state()
      if (s.phase === 'over') break
      const key = `${s.stage}:${s.phase}`
      if (s.phase === 'show' && s.stage === 0 && s.clock > 1 && !shots.has(key)) {
        shots.add(key)
        say('faces', JSON.stringify(s), await page.shot('3-faces.png'))
      }
      if (s.phase === 'shuffle' && s.stage === 2 && s.clock > 1.5 && !shots.has(key)) {
        shots.add(key)
        say('shuffling', JSON.stringify(s), await page.shot('4-shuffle.png'))
      }
      if (s.phase === 'pick' && s.clock > 0.5 && !shots.has(key)) {
        shots.add(key)
        // Stage 2 (worth 2) deliberately wrong; stages 1 and 3 right.
        const right = s.stage !== 1
        if (s.stage === 0) {
          await page.eval(cupPick({ hoverOnly: true }))
          await sleep(150)
          say('hovering', await page.shot('5-hover.png'))
        }
        const did = await page.eval(cupPick({ right }))
        log.push(did)
        say('picked', JSON.stringify(did))
      }
      if (s.phase === 'result' && s.clock > 1 && !shots.has(key)) {
        shots.add(key)
        say('result', JSON.stringify(s), s.stage === 0 ? await page.shot('6-result.png') : '')
      }
      await sleep(80)
    }
    const end = await state()
    say('picks', JSON.stringify(log), 'final', JSON.stringify(end))
    if (end.score !== 1 + 3) throw new Error(`expected 4 points for stages 1 and 3 right and 2 wrong, got ${end.score}`)
    await page.waitFor(`!!document.querySelector('[data-again], [data-podium]')`, 30000)
    say('results', await page.shot('7-results.png'))
  } else if (opt.steer && opt.game === 'sprint-triathlon') {
    const state = () => page.eval(`(() => { const r = ${gameState('sprint-triathlon')}; const me = r.racers.find((x) => x.mine); return { over: r.over, elapsed: +r.elapsed.toFixed(2), strokes: me.strokes, pedals: me.pedals, typed: me.typed, mistakes: me.mistakes, swimAt: me.swimAt, bikeAt: me.bikeAt, finishAt: me.finishAt, place: me.place, others: r.racers.filter((x) => !x.mine).map((x) => x.id + ':' + [x.strokes, x.pedals, x.typed].join('/')) } })()`)
    await page.waitFor(`!!document.querySelector('[data-countdown]')`, 10000)
    say('countdown', await page.shot('3-countdown.png'))
    const shots = new Set()
    let slipped = false
    for (let i = 0; i < 4000; i++) {
      const did = await page.eval(triathlonMove())
      const leg = did?.leg
      if (leg && !shots.has(leg) && leg !== 'done') {
        shots.add(leg)
        await sleep(leg === 'run' ? 1500 : 800)
        say(leg, JSON.stringify(await state()), await page.shot(`4-${leg}.png`))
      }
      if (opt.slip && leg === 'run' && !slipped && did.typed > 10) {
        // A wrong key: a mistake, and the next right key straight after does nothing.
        slipped = true
        const before = await state()
        await page.eval(triathlonMove({ wrong: true }))
        await page.eval(triathlonMove())
        await sleep(100)
        const after = await page.eval(`document.querySelector('[data-sentence]')?.dataset.typed`)
        say('typed a wrong key', JSON.stringify({ typedBefore: before.typed, typedAfter: Number(after), mistakes: (await state()).mistakes }))
        if (Number(after) !== did.typed + 1) throw new Error('a right key straight after a mistake still counted')
        await sleep(450)
      }
      if (leg === 'done') {
        await sleep(300)
        say('finished', JSON.stringify(await state()), await page.shot('5-finished.png'))
        break
      }
      if (!did) {
        const s = await state()
        if (s.over) break
      }
      await sleep(70)
    }
    const end = await state()
    if (end.finishAt === null) throw new Error('never finished: ' + JSON.stringify(end))
    await page.waitFor(`!!document.querySelector('[data-again], [data-podium]')`, 120000)
    say('results', await page.shot('6-results.png'))
  } else if (opt.steer && opt.game === 'wack-attack') {
    const state = () => page.eval(`(() => { const g = ${gameState('wack-attack')}; const me = g.players.find((p) => p.mine); return { over: g.over, elapsed: +g.elapsed.toFixed(2), score: me.score, whacks: me.whacks, golden: me.golden, swings: me.swings, scores: g.players.map((p) => p.score) } })()`)
    let swings = 0
    let shotWhack = false
    let shotMid = false
    for (let i = 0; i < 4000; i++) {
      const s = await state()
      if (s.over) break
      const did = await page.eval(whackMove())
      if (did?.swing !== undefined) {
        swings += 1
        if (!shotWhack) {
          shotWhack = true
          await sleep(60)
          say('swing', JSON.stringify(did), await page.shot('3-swing.png'))
        }
      }
      if (!shotMid && s.elapsed > 30) {
        shotMid = true
        say('mid-round', JSON.stringify(s), await page.shot('4-field.png'))
      }
      await sleep(40)
    }
    await page.eval(`['KeyW', 'KeyA', 'KeyS', 'KeyD'].forEach((code) => window.dispatchEvent(new KeyboardEvent('keyup', { code })))`)
    const end = await state()
    say('swung', swings, 'times;', JSON.stringify(end))
    if (end.whacks === 0) throw new Error('never whacked a mole')
    await page.waitFor(`!!document.querySelector('[data-again], [data-podium]')`, 90000)
    say('results', await page.shot('5-results.png'))
  } else if (opt.steer && opt.game === 'make-the-cut') {
    const state = () => page.eval(`(() => { const g = ${gameState('make-the-cut')}; const me = g.players.findIndex((p) => p.mine); return { phase: g.phase, clock: +g.clock.toFixed(2), turn: g.turn, turns: g.turns, me, out: g.players[me].out, cuts: g.players[me].cuts, last: g.last, pending: g.pending, standing: g.players.filter((p) => !p.out).length, cut: g.cut.map((c) => (c ? c.player + (c.deadly ? '!' : '') : '.')).join(' ') } })()`)
    const shots = new Set()
    const log = []
    for (let i = 0; i < 8000; i++) {
      const s = await state()
      if (s.phase === 'over') break
      if (s.phase === 'draw' && s.clock > 1.9 && !shots.has('draw')) {
        shots.add('draw')
        say('draw', JSON.stringify({ first: s.turn, me: s.me }), await page.shot('3-draw.png'))
      }
      const did = await page.eval(cutterMove())
      if (did?.walking !== undefined && !shots.has('walking')) {
        shots.add('walking')
        say('walking to a string', JSON.stringify(did), await page.shot('4-walking.png'))
      }
      if (did?.cut !== undefined) {
        await sleep(150)
        // A cut waits out the suspense - straining, nothing known - before it snaps.
        const held = await state()
        const pendingOk = held.phase === 'suspense' && held.pending?.player === s.me && held.pending?.string === did.cut && held.cut.split(' ')[did.cut] === '.'
        if (!shots.has('suspense')) {
          await sleep(1400)
          say('suspense', JSON.stringify(held.pending), await page.shot('5a-suspense.png'))
          shots.add('suspense')
        }
        let after = await state()
        for (let w = 0; w < 100 && after.phase === 'suspense'; w++) {
          await sleep(60)
          after = await state()
        }
        log.push({ string: did.cut, suspense: pendingOk, landed: pendingOk && after.last?.player === s.me && after.last?.string === did.cut, deadly: after.last?.deadly })
        say('cut', JSON.stringify(log[log.length - 1]), shots.has('cut') ? '' : await page.shot('5-cut.png'))
        shots.add('cut')
        if (!log[log.length - 1].landed) throw new Error('a cut in reach did not count, or did not wait out the suspense')
      }
      if (s.phase === 'result' && s.last?.deadly && !shots.has('launch')) {
        shots.add('launch')
        await sleep(500)
        say('launched', JSON.stringify(s.last), await page.shot('6-launch.png'))
      }
      await sleep(60)
    }
    say('my cuts', JSON.stringify(log))
    if (log.length === 0) throw new Error('never got to cut')
    await page.waitFor(`!!document.querySelector('[data-again], [data-podium]')`, 240000)
    say('results', await page.shot('7-results.png'))
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
    await page.waitFor(`!!document.querySelector('[data-again], [data-podium]')`, 90000)
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
        // Nothing on the counter was never in the pot: something in it but not
        // due is just as wrong, and just as out.
        if (did?.none === 'wrong') did = await page.eval(cookPick('muddled'))
        await sleep(400)
        const after = await state()
        log.push({ choose, did, ok: after.last?.ok, why: after.last?.why })
        say('picked', JSON.stringify(log[log.length - 1]))
        if (choose === 'safe' && did?.slot !== undefined && after.last?.ok !== true) throw new Error('the ingredient due next was not accepted')
        if (choose === 'wrong' && did?.slot !== undefined && after.last?.ok !== false) throw new Error('a wrong pick was not out')
      }
      await sleep(80)
    }
    say('my turns', JSON.stringify(log))
    await page.waitFor(`!!document.querySelector('[data-again], [data-podium]')`, 300000)
    say('results', await page.shot('7-results.png'))
  } else if (opt.steer && opt.game === 'hes-one-shot') {
    const S = await page.eval(`(async () => (await import('/src/modules/32-hes-one-shot/internal/HesOneShotScreen.tsx')).SENSITIVITY)()`)
    const state = () =>
      page.eval(`(() => { const g = ${gameState('hes-one-shot')}; const me = g.players.find((p) => p.mine); return { clock: +g.elapsed.toFixed(2), over: g.over, x: me.x, z: me.z, yaw: me.yaw, pitch: me.pitch, out: me.out, kills: me.kills, shotAt: me.shotAt, shots: g.shots.length, cooldown: +(document.querySelector('[data-cooldown]')?.dataset.cooldown ?? -1) } })()`)
    const click = () => page.eval(`(() => { const b = document.querySelector('[data-board]'); b.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true })); b.dispatchEvent(new PointerEvent('pointerup', { button: 0, bubbles: true })) })()`)
    const walkKey = (down) => page.eval(`window.dispatchEvent(new KeyboardEvent('${down ? 'keydown' : 'keyup'}', { code: 'KeyW', key: 'w' }))`)
    await page.eval(oneShotPlay({ mode: 'lock' }))
    await sleep(500)
    await click()
    say('countdown', await page.shot('3-countdown.png'))
    await page.waitFor(`(() => { const g = ${gameState('hes-one-shot')}; return g.elapsed > 0.3 })()`, 10000)
    const s0 = await state()
    if (s0.shotAt >= 0) throw new Error('a click in the countdown fired a shot')

    await page.eval(`document.dispatchEvent(new MouseEvent('mousemove', { movementX: 150, movementY: -40, bubbles: true }))`)
    await sleep(150)
    const s1 = await state()
    const turned = Math.atan2(Math.sin(s0.yaw - s1.yaw), Math.cos(s0.yaw - s1.yaw))
    say('mouse 150 right, 40 up: turned', turned.toFixed(4), 'rad right, pitch', s1.pitch.toFixed(4))
    if (Math.abs(turned - 150 * S) > 0.002 || Math.abs(s1.pitch - 40 * S) > 0.002) throw new Error(`the mouse did not turn the view by what it moved: ${JSON.stringify({ s0, s1 })}`)

    await walkKey(true)
    await sleep(700)
    await walkKey(false)
    await sleep(100)
    const s2 = await state()
    const moved = { x: s2.x - s1.x, z: s2.z - s1.z }
    const along = moved.x * -Math.sin(s1.yaw) + moved.z * -Math.cos(s1.yaw)
    say('held W 0.7 s: moved', Math.hypot(moved.x, moved.z).toFixed(2), 'm,', along.toFixed(2), 'of it forward')
    if (Math.hypot(moved.x, moved.z) < 0.8 || along < 0.5 * Math.hypot(moved.x, moved.z)) throw new Error('W did not walk the way the view looks')

    await click()
    const shotFile = await page.shot('4-shot.png')
    await sleep(100)
    const s3 = await state()
    await click()
    await sleep(100)
    const s4 = await state()
    say('clicked twice', JSON.stringify({ first: s3.shotAt > s2.shotAt, cooldown: s3.cooldown, second: s4.shotAt !== s3.shotAt }), shotFile)
    if (!(s3.shotAt > s2.shotAt) || s3.cooldown <= 0) throw new Error('a click did not fire')
    if (s4.shotAt !== s3.shotAt) throw new Error('a second click inside the cooldown fired again')

    let fired = 0
    let firedAsHunter = 0
    let kills = 0
    let outAt = null
    let last = null
    for (let i = 0; i < 4000; i++) {
      const s = await page.eval(oneShotPlay())
      if (!s) break
      last = s
      if (s.over) break
      if (s.fired) {
        fired += 1
        if (s.out !== null) firedAsHunter += 1
      }
      if (s.kills > kills) {
        kills = s.kills
        if (kills === 1) {
          await sleep(60)
          say('got somebody', JSON.stringify(s), await page.shot('5-hit.png'))
        }
      }
      if (s.out !== null && outAt === null) {
        outAt = s.out
        await sleep(400)
        say('shot down', JSON.stringify(s), await page.shot('6-hunter.png'))
      }
      await sleep(30)
    }
    await page.eval(oneShotPlay({ mode: 'lock' }))
    say('hunted', JSON.stringify({ fired, firedAsHunter, kills, outAt, end: last && last.clock }))
    await page.waitFor(`!!document.querySelector('[data-again], [data-podium]')`, 100000)
    await sleep(400)
    // Null once the podium is up: it takes the game down with it.
    const places = await page.eval(`(() => { const g = ${gameState('hes-one-shot')}; return g ? JSON.stringify(g.players.map((p) => [p.id, p.out, p.by, p.kills])) : null })()`)
    say('results [id, out, by, kills]', places, await page.shot('7-results.png'))
    if (fired === 0) throw new Error('never got a shot off while hunting')
  } else if (opt.steer && opt.game === 'chef-caricature') {
    const state = () =>
      page.eval(`(async () => { const rules = await import('/src/modules/35-chef-caricature/internal/rules.ts'); const g = ${gameState('chef-caricature')}; return { over: g.over, phase: rules.phase(g), turn: g.turn, drawer: g.players[rules.drawer(g)].id, mine: g.players[rules.drawer(g)].mine, outline: g.outline, scores: g.players.map((p) => p.score) } })()`)
    let s = await state()
    say('order', JSON.stringify(s))
    // Watch whoever goes before us, and take a picture of a stand-in at work.
    let shotWatching = false
    while (!s.over && !(s.mine && s.phase === 'drawing')) {
      if (!shotWatching && !s.mine && s.phase === 'drawing') {
        await sleep(6000)
        shotWatching = true
        say('watching a stand-in', JSON.stringify(await state()), await page.shot('3-watching.png'))
      }
      await sleep(250)
      s = await state()
    }
    // Let go part way: wiped, and nothing scored.
    const slipped = await page.eval(chefTrace({ share: 0.4, wait: 5000 }))
    say('let go part way', JSON.stringify(slipped), await page.shot('4-wiped.png'))
    if (!slipped || slipped.accepted || !slipped.wiped || slipped.dishes !== 0) throw new Error(`letting go part way was not a wiped attempt: ${JSON.stringify(slipped)}`)
    // Scribble over the whole board: it covers the outline but is not accepted.
    const scribble = await page.eval(chefTrace({ scribble: true, speed: 12, wait: 5000 }))
    say('scribbled over the board', JSON.stringify(scribble))
    if (!scribble || scribble.accepted || scribble.dishes !== 0 || scribble.peak < 0.75) throw new Error(`a scribble over the whole board was accepted, or did not cover it: ${JSON.stringify(scribble)}`)
    // Then trace for the rest of the turn.
    const log = []
    let shotDrawing = false
    for (let i = 0; i < 40; i++) {
      const phaseNow = await page.eval(`document.querySelector('[data-board]')?.dataset.myTurn`)
      if (phaseNow !== '1') break
      if (!shotDrawing) {
        shotDrawing = true
        const going = page.eval(chefTrace({ wait: 3000, speed: 1.5 }))
        await sleep(900)
        say('drawing', await page.shot('5-drawing.png'))
        const did = await going
        if (did) log.push([did.name, did.accepted, did.peak, did.dishes])
        await sleep(250)
        say('fed the duck', await page.shot('6-fed.png'))
        continue
      }
      const did = await page.eval(chefTrace({ wait: 3000 }))
      if (!did) break
      log.push([did.name, did.accepted, did.peak, did.dishes])
    }
    say('traced [outline, accepted, coverage, dishes]', JSON.stringify(log))
    const accepted = log.filter((l) => l[1]).length
    if (accepted < 4) throw new Error(`careful tracing fed the duck only ${accepted} dishes`)
    if (log.some((l) => l[1] && l[3] !== 1)) throw new Error('an accepted drawing did not score exactly one')
    const mine = (await state()).scores
    say('scores after my turn', JSON.stringify(mine))
    await page.waitFor(`!!document.querySelector('[data-again], [data-podium]')`, 200000)
    await sleep(400)
    // The podium takes the game down with it, so the scores are the last ones read.
    say('results', JSON.stringify(mine), await page.shot('7-results.png'))
  } else if (opt.steer && opt.game === 'keyboard-warrior') {
    const state = () =>
      page.eval(`(() => { const g = ${gameState('keyboard-warrior')}; const me = g.players.findIndex((p) => p.mine); const l = g.letter; const own = l.attempts.find((a) => a.player === me); return { over: g.over, index: l.index, char: l.char, closed: l.closedAt !== null, winner: l.winner, mine: own ? { key: own.key, reaction: +own.reaction.toFixed(3) } : null, scores: g.players.map((p) => p.score) } })()`)
    const phaseNow = () => page.eval(`document.querySelector('[data-board]')?.dataset.phase ?? null`)
    await sleep(600)
    say('countdown', await page.shot('3-countdown.png'))
    // A key in the pause before a letter is not an attempt.
    await page.waitFor(`document.querySelector('[data-board]')?.dataset.phase === 'waiting'`, 10000)
    await page.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', code: 'KeyQ' }))`)
    await page.waitFor(`document.querySelector('[data-board]')?.dataset.phase === 'up'`, 10000)
    const early = await state()
    say('pressed Q in the pause', JSON.stringify(early.mine))
    if (early.mine) throw new Error('a key pressed before the letter appeared counted as an attempt')

    const log = []
    let shotUp = false
    for (let n = 0; n < 20; n++) {
      // Letter 2: wrong, then right - the right one must not count. Letter 4: sit it out. Otherwise type it in 0.35 s.
      const which = (await state()).index
      if (which === 3) {
        await page.waitFor(`(() => { const g = ${gameState('keyboard-warrior')}; return g.over || g.letter.index !== 3 })()`, 15000)
        log.push([which, 'sat out'])
        continue
      }
      const did = await page.eval(typeLetter({ delay: 350, wrong: which === 1, twice: which === 1 }))
      if (!did) break
      const s = await state()
      if (!shotUp) {
        shotUp = true
        say('typed', JSON.stringify(did), await page.shot('4-typed.png'))
      }
      if (which === 1) {
        say('wrong then right', JSON.stringify({ did, mine: s.mine }), await page.shot('5-wrong.png'))
        if (did.banner !== 'wrong' || !s.mine || s.mine.key === s.char) throw new Error(`a wrong key then the right one was not a wrong attempt: ${JSON.stringify(s.mine)}`)
      } else {
        if (!s.mine || s.mine.key !== did.letter || did.banner !== 'right') throw new Error(`typing ${did.letter} was not a right attempt: ${JSON.stringify({ did, s })}`)
        if (s.mine.reaction < 0.33 || s.mine.reaction > 0.6) throw new Error(`typed 0.35 s after seeing it, but the reaction was ${s.mine.reaction}`)
      }
      await page.waitFor(`(() => { const g = ${gameState('keyboard-warrior')}; return g.over || g.letter.closedAt !== null })()`, 10000)
      const after = await state()
      if (which === 2) say('decided', JSON.stringify(after), await page.shot('6-decided.png'))
      log.push([which, did.letter, did.key, after.mine && after.mine.reaction, after.winner])
      if (after.over) break
      await page.waitFor(`(() => { const g = ${gameState('keyboard-warrior')}; return g.over || g.letter.closedAt === null })()`, 10000)
      if ((await phaseNow()) === 'over') break
    }
    say('letters [index, letter, typed, reaction, winner]', JSON.stringify(log))
    await page.waitFor(`!!document.querySelector('[data-again], [data-podium]')`, 60000)
    await sleep(400)
    const end = await state()
    say('results', JSON.stringify(end.scores), await page.shot('7-results.png'))
    if (end.scores[0] === 0) throw new Error('typing every letter in 0.35 s never won one')
  } else if (opt.steer && opt.game === 'helping-dad') {
    let end = null
    await sleep(800)
    say('countdown', await page.shot('3-countdown.png'))
    let flung = false
    let shotDark = false
    for (let i = 0; i < 6000; i++) {
      const s = await page.eval(torchMove())
      if (!s || s.over || s.finished !== null) {
        say('ended', JSON.stringify(s))
        break
      }
      if (!shotDark && s.clock > 3 && s.held) {
        shotDark = true
        say('in the dark', JSON.stringify(s), await page.shot('4-dark.png'))
      }
      if (!flung && s.clock > 5 && s.held && s.stunned === 0) {
        flung = true
        const before = s
        // Two cells across a closed side of the cell the torch is in: straight through a wall.
        const wall = await page.eval(`(async () => {
          const mz = await import('/src/modules/31-helping-dad/internal/maze.ts')
          const g = ${gameState('helping-dad')}
          const me = g.players.find((p) => p.mine)
          const maze = mz.mazeFor(g.seed)
          const cell = mz.cellAt(me)
          const side = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dc, dr]) => !mz.isOpen(maze, cell, dc, dr))
          return { x: me.x + side[0] * 2 * mz.GRID.cell, z: me.z + side[1] * 2 * mz.GRID.cell }
        })()`)
        end = wall
        await page.eval(torchMove({ at: end }))
        await sleep(700)
        const hitWall = await page.eval(torchMove({ at: end }))
        const banner = await page.eval(`document.querySelector('[data-banner]')?.dataset.banner ?? null`)
        say('flung through a wall', JSON.stringify({ before, after: hitWall, banner }), await page.shot('5-dad-yells.png'))
        if (hitWall.hits !== before.hits + 1 || hitWall.stunned <= 0 || banner !== 'yell') throw new Error('flinging the mouse through the walls was not a wall touched')
        if (Math.hypot(hitWall.x - end.x, hitWall.z - end.z) < 1) throw new Error('the torch went through the walls')
        await sleep(300)
        const still = await page.eval(torchMove({ at: end }))
        if (Math.hypot(still.x - hitWall.x, still.z - hitWall.z) > 1e-3) throw new Error('the torch moved while stunned')
        await page.waitFor(`(() => { const g = ${gameState('helping-dad')}; return g.players.find((p) => p.mine).stunned === 0 })()`, 4000)
        const after = await page.eval(torchMove({ at: end }))
        await sleep(200)
        const down = await page.eval(torchMove({ at: end }))
        say('after the stun', JSON.stringify(down))
        if (down.held || Math.hypot(down.x - after.x, down.z - after.z) > 1e-3) throw new Error('the torch was not left down after the stun')
      }
      await sleep(25)
    }
    // Read once as it ends and again at the card: a quick round goes straight on
    // to the shared podium, and by then the panel - and its state - is gone.
    const read = () => page.eval(`(() => { const g = ${gameState('helping-dad')}; return g ? g.players.map((p) => [p.id, p.finished, p.hits]) : null })()`)
    const atEnd = await read()
    await page.waitFor(`!!document.querySelector('[data-again], [data-podium]')`, 150000)
    await sleep(500)
    const places = (await read()) ?? atEnd
    say('results', JSON.stringify(places), await page.shot('6-results.png'))
    if (!places || places[0][1] === null) throw new Error('never reached the finish')
  } else if (opt.steer && opt.game === 'synchronize-steps') {
    const state = () => page.eval(`(() => { const g = ${gameState('synchronize-steps')}; const me = g.players.find((p) => p.mine); return { round: g.round, phase: g.phase, clock: +g.clock.toFixed(2), step: me.step, pick: me.pick, last: me.last, out: me.out, all: g.players.map((p) => p.step) } })()`)
    const waitPhase = (phase, round) => page.waitFor(`(() => { const g = ${gameState('synchronize-steps')}; return g.phase === 'over' || (g.phase === ${JSON.stringify(phase)} && g.round === ${round}) })()`, 15000)
    const log = []
    let shotPick = false
    let shotReveal = false
    for (let round = 0; round < 30; round++) {
      await waitPhase('choose', round)
      let s = await state()
      if (s.phase === 'over' || s.out) break
      if (s.pick !== null) throw new Error(`round ${round}: a pick carried over from the reveal: ${s.pick}`)
      const options = [1, 4, 6]
      let meant = null
      if (round === 2) {
        // Sitting this one out: late in it, everybody else has picked and it should say so, but not what.
        await page.waitFor(`(() => { const g = ${gameState('synchronize-steps')}; return g.phase !== 'choose' || g.clock > 1.55 })()`, 5000)
        say('others picked', await page.shot('3-others-picked.png'))
      } else {
        await sleep(300)
        if (round % 3 === 1) {
          // Change of mind: one button, then another.
          await page.eval(stepsPick({ pick: options[round % 3], mouse: true }))
          await sleep(200)
          meant = options[(round + 1) % 3]
          const did = await page.eval(stepsPick({ pick: meant, mouse: true }))
          if (did?.shown !== meant) throw new Error(`round ${round}: clicked ${meant} but the page shows ${did?.shown}`)
        } else {
          meant = options[round % 3]
          const did = await page.eval(stepsPick({ pick: meant }))
          if (did?.shown !== meant) throw new Error(`round ${round}: pressed ${meant} but the page shows ${did?.shown}`)
        }
        if (!shotPick) {
          shotPick = true
          say('picked', meant, await page.shot('3-pick.png'))
        }
      }
      await waitPhase('reveal', round)
      await sleep(round === 0 ? 700 : 150)
      s = await state()
      if (s.phase === 'over') break
      if (!shotReveal && round === 0) {
        shotReveal = true
        say('reveal', JSON.stringify(s), await page.shot('4-reveal.png'))
      }
      if (!s.last) throw new Error(`round ${round}: no move recorded`)
      if (meant !== null && (s.last.pick !== meant || s.last.auto)) throw new Error(`round ${round}: meant ${meant}, counted ${JSON.stringify(s.last)}`)
      if (meant === null && !s.last.auto) throw new Error(`round ${round}: sat out but not picked for: ${JSON.stringify(s.last)}`)
      log.push([round, meant, s.last.with, s.last.moved, s.step])
      // A key in the reveal must not count for the next round.
      await page.eval(stepsPick({ pick: 6 }))
      if (s.out) break
    }
    say('rounds [round, meant, with, moved, step]', JSON.stringify(log))
    await page.waitFor(`!!document.querySelector('[data-again], [data-podium]')`, 150000)
    await sleep(500)
    // The podium takes the game down with it, so there is no round left to read.
    say('results', await page.shot('5-results.png'))
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
    await page.waitFor(`!!document.querySelector('[data-again], [data-podium]')`, 150000)
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
    // Aim: a real pointermove on the canvas at the target's spot on screen, put
    // there with the game's own camera fit, so it goes through the game's ray.
    const aimAt = (x, z) => page.eval(`(async () => {
      const cam = await import('/src/modules/20-punch-buggy/internal/camera.ts')
      const canvas = [...document.querySelectorAll('[data-board] canvas')].pop()
      const rect = canvas.getBoundingClientRect()
      const aspect = rect.width / rect.height
      const shot = cam.frameScene(aspect)
      const at = { x: ${x}, y: 0.85, z: ${z} }
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
      return true
    })()`)
    let clicks = 0
    let shotPunch = false
    let shotShrink = false
    let shotOutro = false
    for (let i = 0; i < 1000; i++) {
      const s = await page.eval(`(() => {
        const r = ${gameState('punch-buggy')}
        const me = r.fighters.find((f) => f.mine)
        const others = r.fighters.filter((f) => !f.mine && f.alive)
        others.sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))
        const t = others[0]
        return { over: r.over, decidedAt: r.decidedAt, elapsed: r.elapsed, alive: me.alive, how: me.how, by: me.by, out: r.fighters.filter((f) => !f.alive).map((f) => f.id + ":" + f.how + ":" + f.by + "@" + (f.outAt ?? 0).toFixed(2)), punch: me.punch, x: me.x, y: me.y, facing: me.facing, target: t ? { x: t.x, y: t.y, facing: t.facing } : null, standing: r.fighters.filter((f) => f.alive).length }
      })()`)
      if (!shotOutro && s.decidedAt != null && !s.over) {
        shotOutro = true
        await sleep(250)
        say('outro - the last one out, before Finish', JSON.stringify(s), await page.shot('5-outro.png'))
      }
      if (!shotShrink && s.elapsed > 18) {
        shotShrink = true
        say('shrinking', JSON.stringify(s), await page.shot('6-shrink.png'))
      }
      if (s.over) {
        for (const code of [...held]) await key(code, false)
        say('ended', JSON.stringify(s))
        break
      }
      if (!s.alive) {
        for (const code of [...held]) await key(code, false)
        await sleep(60)
        continue
      }
      if (s.target) {
        await aimAt(s.target.x, s.target.y)
        const dx = s.target.x - s.x
        const dy = s.target.y - s.y
        const distance = Math.hypot(dx, dy)
        // Keep off the edge first - it closes in after ten seconds. A target
        // facing us blocks, so circle round to its side.
        const edge = Math.hypot(s.x, s.y) > (s.elapsed < 10 ? 8 : Math.max(2.5, 8 - (s.elapsed - 10) * 0.33))
        const back = Math.atan2(-dy, -dx) - s.target.facing
        const facingUs = Math.abs(Math.atan2(Math.sin(back), Math.cos(back))) < 1.1
        const wx = edge ? -s.x : facingUs ? -dy + dx * 0.2 : dx
        const wy = edge ? -s.y : facingUs ? dx + dy * 0.2 : dy
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
    await page.waitFor(`!!document.querySelector('[data-again], [data-podium]')`, 60000)
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
    await page.waitFor(`!!document.querySelector('[data-again], [data-podium]')`, 30000)
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
    await page.waitFor(`!!document.querySelector('[data-again], [data-podium]')`, 120000)
    say('results', await page.shot('4-results.png'))
  } else if (opt.steer && opt.game === 'perfect-game') {
    // On your turn: D held moves you, the mouse swept across the sand swings the aim both ways
    // (real pointer events through the scene's own raycast), then a click rolls it; then the others' turns to the podium.
    const read = `(() => { const s = ${gameState(opt.game)}; const who = s.order[s.turn]; return { e: s.elapsed, over: s.over, turn: s.turn, mine: !!s.players[who]?.mine, startsAt: s.startsAt, rolledAt: s.rolledAt, aim: s.aim, scores: s.players.map((p) => p.score), phase: document.querySelector('[data-board]')?.dataset.phase } })()`
    const key = (code, down) => page.eval(`window.dispatchEvent(new KeyboardEvent('${down ? 'keydown' : 'keyup'}', { code: '${code}', key: '${code.slice(3).toLowerCase()}' }))`)
    const pointAt = (fx, fy, type = 'pointermove') => page.eval(`(() => { const c = document.querySelector('[data-board] canvas'); const r = c.getBoundingClientRect(); const init = { bubbles: true, clientX: r.left + r.width * ${fx}, clientY: r.top + r.height * ${fy}, pointerId: 1, pointerType: 'mouse', button: 0 }; c.dispatchEvent(new PointerEvent('${type}', init)) })()`)
    const click = () => page.eval(`(() => { const b = document.querySelector('[data-board]'); const r = b.getBoundingClientRect(); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })) })()`)
    let s = await page.eval(read)
    for (let k = 0; k < 800 && !(s.mine && s.phase === 'aim' && s.e - s.startsAt > 0.3); k++) {
      await sleep(100)
      s = await page.eval(read)
      if (s.over) throw new Error('never got a turn')
      if (s.phase === 'aim' && !s.mine && k % 30 === 0) say('watching', JSON.stringify({ turn: s.turn, aim: s.aim }))
    }
    say('my turn', JSON.stringify(s), await page.shot('3-my-turn.png'))
    const x0 = s.aim.x
    await key('KeyD', true)
    await sleep(600)
    await key('KeyD', false)
    s = await page.eval(read)
    if (!(s.aim.x > x0 + 1)) throw new Error(`D did not move me: ${x0} -> ${s.aim.x}`)
    await pointAt(0.2, 0.35)
    await sleep(150)
    const west = (await page.eval(read)).aim.angle
    await pointAt(0.8, 0.35)
    await sleep(150)
    const east = (await page.eval(read)).aim.angle
    say('mouse aims', JSON.stringify({ west, east }))
    if (!(west > 0.05 && east < -0.05)) throw new Error('the mouse did not swing the aim both ways')
    await pointAt(0.55, 0.3)
    await page.waitFor(`(${read}).e - (${read}).startsAt >= 6`, 15000)
    say('aiming', JSON.stringify((await page.eval(read)).aim), await page.shot('4-aim.png'))
    await click()
    await sleep(150)
    s = await page.eval(read)
    if (s.rolledAt === null) throw new Error('the click did not roll it')
    await sleep(600)
    say('rolling', JSON.stringify({ rolledAt: s.rolledAt }), await page.shot('5-rolling.png'))
    await page.waitFor(`(${read}).phase === 'result'`, 15000)
    s = await page.eval(read)
    say('result', JSON.stringify(s.scores), await page.shot('6-result.png'))
    await page.waitFor(`!!document.querySelector('[data-podium]')`, 120000)
    say('results', JSON.stringify((await page.eval(`(() => { try { return (${read}).scores } catch { return null } })()`))), await page.shot('7-results.png'))
  } else if (opt.steer && opt.game === 'milf-fishing') {
    // Watch the rod through the game's own bend; first pull once on a straight rod (it must land nothing),
    // then pull on anything bass-sized or bigger once it has bent right over, with a real click.
    const read = `(async () => { const s = ${gameState(opt.game)}; const pond = await import('/src/modules/50-milf-fishing/internal/pond.ts'); const i = s.players.findIndex((p) => p.mine); const me = s.players[i]; const b = pond.bendAt(pond.bitesFor(s.seed, i), me.pulls, s.elapsed); const played = pond.playBack(pond.bitesFor(s.seed, i), me.pulls); return { e: s.elapsed, over: s.over, bend: b.bend, bite: b.bite, casting: b.casting, pulls: me.pulls.length, landed: played.landed.map((x) => x ? pond.FISH[x.size].name + ' ' + x.weight : 'nothing'), banner: document.querySelector('[data-banner]')?.textContent ?? '' } })()`
    const click = () => page.eval(`(() => { const b = document.querySelector('[data-board]'); const r = b.getBoundingClientRect(); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })) })()`)
    const shots = new Set()
    let s = await page.eval(read)
    let bentSince = null
    while (!s.over) {
      await sleep(40)
      s = await page.eval(read)
      if (s.over) break
      if (!shots.has('empty') && s.e > 0.5 && s.bend === 0 && !s.casting) {
        shots.add('empty')
        await click()
        await sleep(120)
        const after = await page.eval(read)
        say('pulled on nothing', JSON.stringify({ landed: after.landed, banner: after.banner }), await page.shot('3-nothing.png'))
        if (after.landed[0] !== 'nothing') throw new Error('a pull on a straight rod landed something')
        continue
      }
      if (s.bend > 0.42 && !s.casting) {
        if (s.bend > 0.9 && !shots.has('big')) { shots.add('big'); say('bent right over', JSON.stringify({ bend: s.bend }), await page.shot('4b-big.png')) }
        bentSince ??= s.e
        if (!shots.has('bent')) { shots.add('bent'); say('bent', JSON.stringify({ bend: s.bend }), await page.shot('4-bent.png')) }
        if (s.e - bentSince > 0.3) {
          await click()
          await sleep(300)
          const after = await page.eval(read)
          say('pulled', JSON.stringify({ landed: after.landed.at(-1), banner: after.banner }), shots.has('catch') ? '' : await page.shot('5-catch.png'))
          shots.add('catch')
          if (after.landed.at(-1) === 'nothing') throw new Error('a pull on a bent rod landed nothing')
          bentSince = null
        }
      } else bentSince = null
    }
    say('end', JSON.stringify(s))
    if (!shots.has('catch')) throw new Error('never landed a fish')
    await page.waitFor(`!!document.querySelector('[data-podium]')`, 30000)
    say('results', await page.shot('6-results.png'))
  } else if (opt.steer && opt.game === 'needs-a-walmart') {
    // Shop with the stand-ins' own route-finding, pressed as real WASD keys; a real click on the board to grab, Space to ram.
    const read = `(() => { const s = ${gameState(opt.game)}; const i = s.players.findIndex((p) => p.mine); const me = s.players[i]; return { e: s.elapsed, over: s.over, x: me.x, z: me.z, cart: me.cart.length, list: me.list, done: me.doneAt, ramAt: me.ramAt, got: me.cart.filter((k) => me.list.includes(s.items[k].kind)).length } })()`
    await page.eval(`(async () => {
      const ai = await import('/src/modules/49-needs-a-walmart/internal/ai.ts')
      const rules = await import('/src/modules/49-needs-a-walmart/internal/rules.ts')
      const store = await import('/src/modules/49-needs-a-walmart/internal/store.ts')
      const codes = { KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0] }
      const held = new Set()
      const press = (code, down) => {
        if (down === held.has(code)) return
        down ? held.add(code) : held.delete(code)
        window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code.slice(3).toLowerCase() }))
      }
      const board = document.querySelector('[data-board]')
      let goal = null
      let thought = -1
      window.__nwLog = { grabs: 0, rams: 0 }
      window.__nwSteer = setInterval(() => {
        const s = ${gameState(opt.game)}
        if (!s || s.over) return
        const i = s.players.findIndex((p) => p.mine)
        const me = s.players[i]
        if (me.doneAt !== null) { for (const c of Object.keys(codes)) press(c, false); return }
        const near = rules.reachable(s, i)
        const needs = rules.stillNeeds(s, me)
        if (near >= 0 && needs.includes(s.items[near].kind) && me.cart.length < 3) {
          for (const c of Object.keys(codes)) press(c, false)
          const r = board.getBoundingClientRect()
          board.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }))
          window.__nwLog.grabs++
          thought = -1
          return
        }
        if (s.elapsed - thought > 0.4) { thought = s.elapsed; goal = ai.goalFor(s, i) }
        if (!goal) return
        const d = Math.hypot(goal.x - me.x, goal.z - me.z)
        let way = d < 1.2 ? { x: (goal.x - me.x) / d, z: (goal.z - me.z) / d } : store.downhill(ai.fieldTo(store.freeCell(goal.x, goal.z, 0.55)), store.freeCell(me.x, me.z, 0.55))
        if (!way) way = { x: 0, z: 0 }
        for (const [c, [dx, dz]] of Object.entries(codes)) press(c, dx * way.x + dz * way.z > 0.38)
        // Held keys repeat, as a real keyboard's do: one pressed while the three-two-one was up is ignored by the screen.
        for (const c of held) window.dispatchEvent(new KeyboardEvent('keydown', { code: c, key: c.slice(3).toLowerCase(), repeat: true }))
      }, 60)
    })()`)
    const shots = new Set()
    let s = await page.eval(read)
    while (!s.over) {
      await sleep(200)
      s = await page.eval(read)
      if (!shots.has('aisle') && s.e > 4) { shots.add('aisle'); say('shopping', JSON.stringify(s), await page.shot('3-aisle.png')) }
      if (!shots.has('grab') && s.cart > 0) { shots.add('grab'); say('first grab', JSON.stringify(s), await page.shot('4-grab.png')) }
      if (!shots.has('ram') && s.e > 8) {
        shots.add('ram')
        const before = s.ramAt
        await page.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ' }))`)
        await sleep(150)
        const after = await page.eval(read)
        if (!(after.ramAt > before)) throw new Error('Space did not ram')
        say('rammed', JSON.stringify({ before, after: after.ramAt }), await page.shot('5-ram.png'))
      }
      if (!shots.has('done') && s.done !== null) { shots.add('done'); say('through', JSON.stringify(s), await page.shot('6-through.png')) }
    }
    await page.eval(`clearInterval(window.__nwSteer)`)
    const log = await page.eval(`window.__nwLog`)
    say('end', JSON.stringify({ ...s, ...log }))
    if (s.got < 1) throw new Error('never got anything on the list')
    await page.waitFor(`!!document.querySelector('[data-podium]')`, 40000)
    say('results', await page.shot('7-results.png'))
  } else if (opt.steer && opt.game === 'spidey-senses') {
    // Round one: hold W, let go at 1.8 metres, click 0.2 s after the spring. Round two: stand still and never click - the jump scare.
    const read = `(async () => { const s = ${gameState(opt.game)}; const n = await import('/src/modules/48-spidey-senses/internal/nest.ts'); const w = n.when(s.seed, s.elapsed); const me = s.players.find((p) => p.mine); return { e: s.elapsed, over: s.over, round: w.round.round, phase: w.phase, springs: w.round.springs, judged: w.round.judged, d: Math.hypot(me.x, me.z), stoppedAt: me.stoppedAt, out: me.out, how: me.how, left: s.players.filter((p) => p.out === null && !p.left).length } })()`
    const key = (code, down) => page.eval(`window.dispatchEvent(new KeyboardEvent('${down ? 'keydown' : 'keyup'}', { code: '${code}', key: '${code.slice(3).toLowerCase()}' }))`)
    const click = () => page.eval(`(() => { const b = document.querySelector('[data-board]'); const r = b.getBoundingClientRect(); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })) })()`)
    let s = await page.eval(read)
    const log = []
    const shots = new Set()
    let walking = false
    while (!s.over) {
      await sleep(40)
      s = await page.eval(read)
      if (s.over) break
      if (s.out !== null) {
        if (!shots.has('out')) {
          shots.add('out')
          log.push({ round: s.out, how: s.how })
          if (s.how === 'eaten') {
            await sleep(450)
            const scare = await page.eval(`document.querySelector('[data-scare]')?.dataset.scare ?? 'none'`)
            say('jump scare', scare, await page.shot('5-scare.png'))
            if (scare !== 'film') throw new Error(`the jump scare showed ${scare}, not the film`)
          }
        }
        continue
      }
      const creep = s.phase === 'creep'
      if (s.round === 1 && creep && s.stoppedAt === null) {
        if (s.d > 1.8 && !walking) { await key('KeyW', true); walking = true }
        if (s.d <= 1.8 && walking) { await key('KeyW', false); walking = false }
        if (s.e > s.springs + 0.05 && !shots.has('spring')) { shots.add('spring'); say('sprung', JSON.stringify(s), await page.shot('3-sprung.png')) }
        if (s.e > s.springs + 0.2) {
          await click()
          await sleep(60)
          const after = await page.eval(read)
          if (after.stoppedAt === null) throw new Error('a click in the window did not stop us')
          if (walking) { await key('KeyW', false); walking = false }
          log.push({ round: 1, stoppedAfter: +(after.stoppedAt - after.springs).toFixed(2), at: +after.d.toFixed(2) })
        }
      }
      if (s.round === 1 && s.phase === 'reveal' && s.e - s.judged > 0.5 && !shots.has('reveal')) { shots.add('reveal'); say('reveal', JSON.stringify(s), await page.shot('4-reveal.png')) }
    }
    if (walking) await key('KeyW', false)
    say('rounds', JSON.stringify(log))
    if (!log.some((l) => l.stoppedAfter !== undefined)) throw new Error('never reacted to the spring')
    await page.waitFor(`!!document.querySelector('[data-podium]')`, 60000)
    say('results', await page.shot('6-results.png'))
  } else if (opt.steer && opt.game === 'shanty-matrix') {
    // Dodge with the stand-ins' own look ahead, pressed as real WASD keys; shove with Space now and then.
    const read = `(() => { const s = ${gameState(opt.game)}; const i = s.players.findIndex((p) => p.mine); const me = s.players[i]; return { t: s.elapsed, over: s.over, i, x: me.x, z: me.z, out: me.out, pushedAt: me.pushedAt, aboard: s.players.filter((p) => p.out === null && !p.left).length } })()`
    await page.eval(`(async () => {
      const ai = await import('/src/modules/47-shanty-matrix/internal/ai.ts')
      const codes = { KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0] }
      const held = new Set()
      const press = (code, down) => {
        if (down === held.has(code)) return
        down ? held.add(code) : held.delete(code)
        window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code.slice(3).toLowerCase() }))
      }
      window.__smSteer = setInterval(() => {
        const s = ${gameState(opt.game)}
        if (!s || s.over) return
        const i = s.players.findIndex((p) => p.mine)
        if (i < 0 || s.players[i].out !== null) { for (const c of Object.keys(codes)) press(c, false); return }
        const way = ai.bestWay(s, i, s.elapsed - 0.25)
        const want = { x: way.threat ? way.x : -s.players[i].x * 0.2, z: way.threat ? way.z : -s.players[i].z * 0.2 }
        for (const [c, [dx, dz]] of Object.entries(codes)) press(c, dx * want.x + dz * want.z > 0.38)
      }, 80)
    })()`)
    let shotLane = false
    let shoved = false
    let last = await page.eval(read)
    for (let n = 0; n < 1500 && !last.over; n++) {
      await sleep(100)
      last = await page.eval(read)
      if (!shotLane && last.t > 6 && (await page.eval(`!!document.querySelector('[data-danger]')`))) {
        shotLane = true
        say('in a lane', JSON.stringify(last), await page.shot('3-lane.png'))
      }
      if (n % 25 === 10 && last.out === null && !last.over) {
        const before = last.pushedAt
        await page.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ' }))`)
        await sleep(120)
        const after = await page.eval(read)
        if (after.pushedAt > before) shoved = true
      }
      if (n === 200) say('twenty seconds in', JSON.stringify(last), await page.shot('4-barrage.png'))
    }
    await page.eval(`clearInterval(window.__smSteer)`)
    say('end', JSON.stringify({ ...last, shoved, shotLane }))
    if (!shoved) throw new Error('Space never shoved')
    await page.waitFor(`!!document.querySelector('[data-podium]')`, 30000)
    say('results', await page.shot('5-results.png'))
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
