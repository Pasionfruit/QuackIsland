/**
 * A full lobby: N separate headless browsers, one player each, in one lobby
 * through the relay, playing minigames together.
 *
 *   node .claude/skills/run-localrot/scripts/lobby.mjs --players 8 --out <dir>
 *
 * --players   how many (default 8, the most the games are built for)
 * --games     comma list, in order (default: every built game, synchronize-steps last)
 * --app       dev server URL (default http://localhost:5199/)
 * --out       where screenshots go (default <temp>/localrot-run/lobby)
 * --software  render with SwiftShader instead of the GPU
 *
 * For each game it checks, in every browser: the same round or race (same
 * seed and maze), everybody in it, exactly one body marked as this browser's
 * own; then that a guest holding a key moves on the host's screen. Needs the
 * dev server and the relay (`npm run relay`, port 8791) both running.
 *
 * **One browser per player, never one browser with N tabs.** Chrome caps live
 * WebGL contexts at about sixteen across the whole browser, each player's page
 * has two (the world and the game), and eight tabs freeze at 0.1 s.
 */
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GAMES, args, chefTrace, cloverClick, cookPick, cupPick, cutterMove, duckHuntShot, feedFlick, gameState, launch, lightMove, oneShotPlay, say, sleep, stepsPick, timeItStop, torchMove, triathlonMove, typeLetter, whackMove } from './cdp.mjs'

const opt = args({ players: '8', games: 'zombie-tag,messy-maze,probable-stop,duck-hunt,feeding-time,sprint-triathlon,punch-buggy,time-it,wack-attack,lady-luck,find-yourself,make-the-cut,let-him-cook,i-see-the-light,helping-dad,synchronize-steps,hes-one-shot,keyboard-warrior,chef-caricature', app: 'http://localhost:5199/', out: join(tmpdir(), 'localrot-run', 'lobby'), port: '9410' })
const count = Number(opt.players)
const games = String(opt.games).split(',')
const pages = []
let ok = false

try {
  for (let i = 0; i < count; i++) {
    pages.push(await launch({ port: Number(opt.port) + i, out: opt.out, name: `p${i}`, width: 480, height: 300, software: !!opt.software }))
  }
  for (const p of pages) await p.goto(opt.app)
  for (const p of pages) await p.waitFor(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes('LOBBY'))`, 120000)
  say(`${count} browsers loaded`)

  // The same module the app uses, as long as the dev server has not hot-
  // reloaded it: after an edit, restart the dev server or these imports get a
  // second copy of the module with its own, empty, store.
  const [host, ...guests] = pages
  const code = await host.eval(`(async () => {
    window.__net = await import('/src/modules/09-net/index.ts')
    const code = window.__net.makeCode()
    window.__net.createLobby(code, 'host')
    return code
  })()`)
  await host.waitFor(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes(${JSON.stringify(code)}))`, 30000)
  for (const [i, g] of guests.entries()) {
    await g.eval(`(async () => {
      window.__net = await import('/src/modules/09-net/index.ts')
      window.__net.joinLobby(${JSON.stringify(code)}, 'guest${i + 1}')
    })()`)
  }
  for (const p of pages) await p.waitFor(`window.__net.getNet().status === 'joined' && window.__net.getNet().peers === ${count - 1}`, 60000)
  const ids = await Promise.all(pages.map((p) => p.eval('window.__net.getNet().id')))
  const hosts = await Promise.all(pages.map((p) => p.eval('window.__net.getNet().host')))
  say(`lobby ${code}: ${ids.join(', ')}; hosts ${hosts.map((h) => (h ? 'H' : '-')).join('')}`)
  if (hosts.filter(Boolean).length !== 1) throw new Error('not exactly one host')

  for (const p of pages) await p.eval(`(async () => { window.__mg = await import('/src/modules/15-minigames/index.ts') })()`)

  const mover = guests[guests.length - 1]
  const moverId = ids[ids.length - 1]
  for (const game of games) {
    const { people } = GAMES[game]
    await host.eval(`window.__mg.openMinigame(${JSON.stringify(game)})`)
    for (const g of guests) await g.waitFor(`window.__mg.getMinigameScreen().at === 'game'`, 30000)
    await host.eval('window.__mg.playMinigame()')
    for (const p of pages) {
      await p.waitFor(`(() => { const s = ${gameState(game)}; return !!s && s.${people}.length >= ${Math.min(count, 8)} })()`, 120000)
    }
    const seen = await Promise.all(
      pages.map((p) =>
        p.eval(`(() => {
          const s = ${gameState(game)}
          // Probable Stop keeps its seed on the host - it decides the answers -
          // and Let Him Cook's, and Punch Buggy never sends one; there the id is what every browser
          // should share.
          const which = ['probable-stop', 'punch-buggy', 'let-him-cook'].includes(${JSON.stringify(game)}) ? s.id : (s.seed ?? null)
          return { game: which, layout: s.layout ?? null, people: s.${people}.length, mine: s.${people}.filter((b) => b.mine).map((b) => b.id).join(), me: window.__net.getNet().id }
        })()`),
      ),
    )
    const same = new Set(seen.map((s) => `${s.game}:${s.layout}:${s.people}`)).size === 1
    const ownBody = seen.every((s) => s.mine === s.me)
    say(`${game}: same in every browser ${same}; each browser's own body right ${ownBody}`, JSON.stringify(seen[0]))
    if (!same || !ownBody) throw new Error(`${game}: browsers disagree - ${JSON.stringify(seen)}`)

    if (game === 'punch-buggy') {
      // A guest walks and throws a punch; the host should see both.
      const guestOnHost = () => host.eval(`(() => { const r = ${gameState(game)}; const f = r.fighters.find((f) => f.id === ${JSON.stringify(moverId)}); return { x: +f.x.toFixed(2), y: +f.y.toFixed(2), clicks: f.clicks, punch: f.punch } })()`)
      const before = await guestOnHost()
      // Towards the middle of the platform, whichever way that is from its spot.
      const code = before.x > 0 ? 'KeyA' : 'KeyD'
      await mover.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { code: '${code}', key: '${code.slice(3).toLowerCase()}' }))`)
      await sleep(600)
      await mover.eval(`window.dispatchEvent(new KeyboardEvent('keyup', { code: '${code}', key: '${code.slice(3).toLowerCase()}' }))`)
      await mover.eval(`document.querySelector('[data-board]').dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }))`)
      await sleep(800)
      const after = await guestOnHost()
      say(`${game}: guest ${moverId} walked and punched; host saw ${JSON.stringify(before)} -> ${JSON.stringify(after)}`)
      await host.shot(`${game}-host.png`)
      await mover.shot(`${game}-guest.png`)
      if (Math.hypot(after.x - before.x, after.y - before.y) < 0.5 || after.clicks !== before.clicks + 1) {
        throw new Error(`${game}: the host did not see the guest walk and punch`)
      }
      await host.eval('window.__mg.backOut()')
      for (const g of guests) await g.waitFor(`window.__mg.getMinigameScreen().at === 'closed'`, 30000)
      continue
    }

    if (game === 'time-it') {
      // Every browser stops a little after the target by its own clock - a
      // different amount each - and once the round is over every browser should
      // agree on everybody's stop, each close to what that browser meant.
      const meant = pages.map((_, i) => 0.1 * i)
      const did = await Promise.all(pages.map((p, i) => p.eval(timeItStop({ at: meant[i] }))))
      await host.waitFor(`(() => { const g = ${gameState(game)}; return g && g.over })()`, 40000)
      await sleep(800)
      const views = await Promise.all(pages.map((p) => p.eval(`(() => { const g = ${gameState(game)}; return JSON.stringify(g.players.map((x) => [x.id, x.stopped])) })()`)))
      const agree = new Set(views).size === 1
      const stops = JSON.parse(views[0]).map((x) => x[1])
      say(`${game}: clicked at ${JSON.stringify(did.map((d) => d && d.reading))}; host has ${JSON.stringify(stops)}; every browser agrees ${agree}`)
      await host.shot(`${game}-host.png`)
      await mover.shot(`${game}-guest.png`)
      if (!agree) throw new Error(`${game}: browsers disagree - ${views.join(' | ')}`)
      stops.forEach((s, i) => {
        if (s === null || !did[i] || Math.abs(s - did[i].reading) > 0.03) throw new Error(`${game}: ${ids[i]} stopped at ${did[i] && did[i].reading} but the host has ${s}`)
      })
      await host.eval('window.__mg.backOut()')
      for (const g of guests) await g.waitFor(`window.__mg.getMinigameScreen().at === 'closed'`, 30000)
      continue
    }

    if (game === 'feeding-time') {
      // Everybody flicks at ducks for a while; the host should count guests'
      // throws, and once hands stop every browser should agree on the scores.
      const scoresOn = (p) => p.eval(`(() => { const g = ${gameState(game)}; return JSON.stringify(g.players.map((x) => [x.id, x.score, x.throws])) })()`)
      const until = Date.now() + 12000
      while (Date.now() < until) {
        await Promise.all(pages.map((p) => p.eval(feedFlick())))
        await sleep(150)
      }
      await sleep(2500)
      const onHost = JSON.parse(await scoresOn(host))
      const guestThrows = onHost.slice(1).reduce((n, [, , t]) => n + t, 0)
      say(`${game}: host has ${JSON.stringify(onHost)}`)
      if (guestThrows === 0) throw new Error(`${game}: no guest's throw reached the host`)
      const views = await Promise.all(pages.map(scoresOn))
      const agree = new Set(views).size === 1
      say(`${game}: guests threw ${guestThrows}; every browser agrees on the scores ${agree}`)
      await host.shot(`${game}-host.png`)
      await mover.shot(`${game}-guest.png`)
      if (!agree) throw new Error(`${game}: browsers disagree - ${views.join(' | ')}`)
      await host.eval('window.__mg.backOut()')
      for (const g of guests) await g.waitFor(`window.__mg.getMinigameScreen().at === 'closed'`, 30000)
      continue
    }

    if (game === 'find-yourself') {
      // The first stage: every browser picks the cup its own face is under;
      // once the cups come up, every browser should agree on the picks and
      // scores, and everybody should have a point.
      await host.waitFor(`(() => { const g = ${gameState(game)}; return g && g.phase === 'pick' })()`, 60000)
      await sleep(400)
      const picked = await Promise.all(pages.map((p) => p.eval(cupPick())))
      say(`${game}: picks ${JSON.stringify(picked.map((d) => d && d.slot))}`)
      await host.waitFor(`(() => { const g = ${gameState(game)}; return g && g.phase === 'result' })()`, 30000)
      await sleep(800)
      const views = await Promise.all(pages.map((p) => p.eval(`(() => { const g = ${gameState(game)}; return JSON.stringify(g.players.map((x) => [x.id, x.score, x.picks[0]])) })()`)))
      const agree = new Set(views).size === 1
      const scores = JSON.parse(views[0]).map((x) => x[1])
      say(`${game}: every browser agrees on picks and scores ${agree}; scores ${JSON.stringify(scores)}`)
      await host.shot(`${game}-host.png`)
      await mover.shot(`${game}-guest.png`)
      if (!agree) throw new Error(`${game}: browsers disagree - ${views.join(' | ')}`)
      if (!scores.every((s) => s === 1)) throw new Error(`${game}: somebody who picked their own cup did not score`)
      await host.eval('window.__mg.backOut()')
      for (const g of guests) await g.waitFor(`window.__mg.getMinigameScreen().at === 'closed'`, 30000)
      continue
    }

    if (game === 'sprint-triathlon') {
      // Everybody races for a while; the host should see guests' progress, and
      // once hands stop every browser should agree on where everybody got to.
      // Splits are compared as a snapshot carries them: to the hundredth.
      const where = (p) => p.eval(`(() => { const r = ${gameState(game)}; const t = (v) => (v === null ? null : Math.round(v * 100) / 100); return JSON.stringify(r.racers.map((x) => [x.id, x.strokes, x.pedals, x.typed, t(x.swimAt), t(x.bikeAt)])) })()`)
      await host.waitFor(`!document.querySelector('[data-countdown]')`, 10000)
      const until = Date.now() + 12000
      while (Date.now() < until) {
        await Promise.all(pages.map((p) => p.eval(triathlonMove())))
        await sleep(90)
      }
      await sleep(1200)
      const onHost = JSON.parse(await where(host))
      const guestWork = onHost.slice(1).reduce((n, [, s, b, t]) => n + s + b + t, 0)
      say(`${game}: host has ${JSON.stringify(onHost)}`)
      if (guestWork === 0) throw new Error(`${game}: no guest's race reached the host`)
      const views = await Promise.all(pages.map(where))
      const agree = new Set(views).size === 1
      say(`${game}: every browser agrees on where everybody got to ${agree}`)
      await host.shot(`${game}-host.png`)
      await mover.shot(`${game}-guest.png`)
      if (!agree) throw new Error(`${game}: browsers disagree - ${views.join(' | ')}`)
      await host.eval('window.__mg.backOut()')
      for (const g of guests) await g.waitFor(`window.__mg.getMinigameScreen().at === 'closed'`, 30000)
      continue
    }

    if (game === 'wack-attack') {
      // Everybody walks and swings for a while; the host should see guests'
      // whacks, and every browser should agree on the scores.
      const scoresOn = (p) => p.eval(`(() => { const g = ${gameState(game)}; return JSON.stringify(g.players.map((p) => [p.id, p.score, p.whacks])) })()`)
      const until = Date.now() + 15000
      while (Date.now() < until) {
        await Promise.all(pages.map((p) => p.eval(whackMove())))
        await sleep(40)
      }
      for (const p of pages) await p.eval(`['KeyW', 'KeyA', 'KeyS', 'KeyD'].forEach((code) => window.dispatchEvent(new KeyboardEvent('keyup', { code })))`)
      await sleep(800)
      const onHost = JSON.parse(await scoresOn(host))
      const guestWhacks = onHost.slice(1).reduce((n, [, , w]) => n + w, 0)
      say(`${game}: host has ${JSON.stringify(onHost)}`)
      if (guestWhacks === 0) throw new Error(`${game}: no guest's whack landed on the host`)
      const views = await Promise.all(pages.map(scoresOn))
      const agree = new Set(views).size === 1
      say(`${game}: guests whacked ${guestWhacks} moles; every browser agrees on the scores ${agree}`)
      await host.shot(`${game}-host.png`)
      await mover.shot(`${game}-guest.png`)
      if (!agree) throw new Error(`${game}: browsers disagree - ${views.join(' | ')}`)
      await host.eval('window.__mg.backOut()')
      for (const g of guests) await g.waitFor(`window.__mg.getMinigameScreen().at === 'closed'`, 30000)
      continue
    }

    if (game === 'make-the-cut') {
      // Everybody plays their own turns - walking with the keys to the nearest
      // string and clicking it - until a guest's cut has landed on the host;
      // then every browser should agree on the cuts and who is out.
      const onHost = () => host.eval(`(() => { const g = ${gameState(game)}; return { phase: g.phase, turns: g.turns, last: g.last, players: g.players.map((p) => ({ id: p.id, x: +p.x.toFixed(2), y: +p.y.toFixed(2) })) } })()`)
      let landed = null
      let walked = 0
      for (let i = 0; i < 4000 && !landed; i++) {
        const before = await onHost()
        if (before.phase === 'over') break
        const results = await Promise.all(pages.map((p) => p.eval(cutterMove())))
        const cutter = results.findIndex((r) => r && r.cut !== undefined)
        const walker = results.findIndex((r) => r && r.walking !== undefined)
        if (walker > 0) walked = Math.max(walked, 1)
        if (cutter >= 0) {
          await sleep(700)
          const after = await onHost()
          say(`${game}: ${ids[cutter]} cut string ${results[cutter].cut}; host's last cut ${JSON.stringify(after.last)}`)
          if (!after.last || after.last.string !== results[cutter].cut || after.last.player !== cutter) throw new Error(`${game}: ${ids[cutter]}'s cut did not land on the host`)
          if (cutter > 0) landed = { id: ids[cutter], string: results[cutter].cut }
        }
        await sleep(80)
      }
      for (const p of pages) await p.eval(`['KeyW', 'KeyA', 'KeyS', 'KeyD'].forEach((code) => window.dispatchEvent(new KeyboardEvent('keyup', { code })))`)
      if (!landed) throw new Error(`${game}: no guest's cut landed on the host`)
      await sleep(500)
      const views = await Promise.all(pages.map((p) => p.eval(`(() => { const g = ${gameState(game)}; return JSON.stringify([g.cut.map((c) => (c ? [c.player, c.deadly] : null)), g.players.map((p) => p.out ? p.out.order : 0), g.turns]) })()`)))
      const agree = new Set(views).size === 1
      say(`${game}: a guest walked to its string (${walked > 0}); every browser agrees on the cuts and who is out ${agree}`)
      await host.shot(`${game}-host.png`)
      await pages[ids.indexOf(landed.id)].shot(`${game}-guest.png`)
      if (!agree) throw new Error(`${game}: browsers disagree - ${views.join(' | ')}`)
      await host.eval('window.__mg.backOut()')
      for (const g of guests) await g.waitFor(`window.__mg.getMinigameScreen().at === 'closed'`, 30000)
      continue
    }

    if (game === 'lady-luck') {
      // A guest claims a four-leaf clover; then two guests click the same one at
      // once. Every browser should agree on the claims, and a clover is only ever
      // claimed once.
      const claimsOn = (p) => p.eval(`(() => { const g = ${gameState(game)}; return JSON.stringify(g.claims.map((c) => [c.clover, c.player])) })()`)
      const other = guests.length > 1 ? guests[0] : null
      await sleep(600)
      const did = await mover.eval(cloverClick('lucky'))
      await sleep(900)
      const after = JSON.parse(await claimsOn(host))
      const moverIndex = ids.indexOf(moverId)
      say(`${game}: guest ${moverId} clicked clover ${did?.clover}; host has claims ${JSON.stringify(after)}`)
      if (!did || !after.some(([c, p]) => c === did.clover && p === moverIndex)) throw new Error(`${game}: the guest's claim did not land on the host`)
      if (other) {
        const [a, b] = await Promise.all([mover.eval(cloverClick('lucky', { force: true })), other.eval(cloverClick('lucky', { force: true }))])
        await sleep(1200)
        const both = JSON.parse(await claimsOn(host))
        const onIt = both.filter(([c]) => c === a?.clover)
        say(`${game}: two guests clicked clover ${a?.clover} / ${b?.clover} at once; claimed by ${JSON.stringify(onIt)}`)
        if (a && b && a.clover === b.clover && onIt.length !== 1) throw new Error(`${game}: a clover was claimed ${onIt.length} times`)
      }
      await sleep(400)
      const views = await Promise.all(pages.map(claimsOn))
      const agree = new Set(views).size === 1
      say(`${game}: every browser agrees on the claims ${agree}`)
      await host.shot(`${game}-host.png`)
      await mover.shot(`${game}-guest.png`)
      if (!agree) throw new Error(`${game}: browsers disagree - ${views.join(' | ')}`)
      await host.eval('window.__mg.backOut()')
      for (const g of guests) await g.waitFor(`window.__mg.getMinigameScreen().at === 'closed'`, 30000)
      continue
    }

    if (game === 'let-him-cook') {
      // Everybody plays their turns, picking what their own browser saw go in,
      // until a guest's pick has landed on the host - then every browser should
      // agree on the plates and the line.
      const onHost = () => host.eval(`(() => { const g = ${gameState(game)}; return { phase: g.phase, up: g.players[g.queue[0]]?.id ?? null, claimed: g.claimed } })()`)
      let landed = null
      for (let i = 0; i < 1500 && !landed; i++) {
        const h = await onHost()
        if (h.phase === 'over') break
        if (h.phase === 'turns' && h.up) {
          const page = pages[ids.indexOf(h.up)]
          const did = await page.eval(cookPick('safe'))
          if (did && did.slot !== undefined) {
            await sleep(900)
            const after = await onHost()
            say(`${game}: ${h.up} picked slot ${did.slot} on turn ${did.turn}; host has it claimed by ${after.claimed[did.slot]}`)
            if (after.claimed[did.slot] === null) throw new Error(`${game}: a copy ${h.up} saw go in was not claimed on the host`)
            if (page !== host) landed = { id: h.up, slot: did.slot }
          }
        }
        await sleep(150)
      }
      if (!landed) throw new Error(`${game}: no guest's pick landed on the host`)
      await sleep(400)
      const views = await Promise.all(pages.map((p) => p.eval(`(() => { const g = ${gameState(game)}; return JSON.stringify([g.claimed, g.queue, g.turn]) })()`)))
      const agree = new Set(views).size === 1
      say(`${game}: every browser agrees on the plates and the line ${agree}`)
      await host.shot(`${game}-host.png`)
      await pages[ids.indexOf(landed.id)].shot(`${game}-guest.png`)
      if (!agree) throw new Error(`${game}: browsers disagree - ${views.join(' | ')}`)
      await host.eval('window.__mg.backOut()')
      for (const g of guests) await g.waitFor(`window.__mg.getMinigameScreen().at === 'closed'`, 30000)
      continue
    }

    if (game === 'helping-dad') {
      // Every browser leads its torch along the way out until it is four metres
      // from the start - short of the finish in any maze, which is further than
      // that as the crow flies, so a torch is still inside to touch a wall - or
      // for ten seconds; then the last guest flings its mouse into a wall. The
      // host should have every guest's torch where that guest's own screen has
      // it, and the wall.
      await host.waitFor(`(() => { const g = ${gameState(game)}; return g && g.elapsed > 0.2 })()`, 30000)
      const start = await host.eval(`(async () => { const r = await import('/src/modules/31-helping-dad/internal/rules.ts'); return r.startPoint(${gameState(game)}.seed) })()`)
      const until = Date.now() + 10000
      const far = pages.map(() => false)
      while (Date.now() < until && far.some((f) => !f)) {
        await Promise.all(
          pages.map(async (p, i) => {
            if (far[i]) return
            const s = await p.eval(torchMove())
            if (s && Math.hypot(s.x - start.x, s.z - start.z) >= 4) far[i] = true
          }),
        )
        await sleep(40)
      }
      await sleep(600)
      const own = await Promise.all(pages.map((p) => p.eval(`(() => { const g = ${gameState(game)}; const me = g.players.find((x) => x.mine); return [me.id, me.x, me.z, me.hits] })()`)))
      const onHost = JSON.parse(await host.eval(`(() => { const g = ${gameState(game)}; return JSON.stringify(g.players.map((x) => [x.id, x.x, x.z, x.hits])) })()`))
      own.forEach(([id, x, z]) => {
        const h = onHost.find((t) => t[0] === id)
        const off = Math.hypot(h[1] - x, h[2] - z)
        const went = Math.hypot(x - start.x, z - start.z)
        say(`${game}: ${id} own screen (${x.toFixed(2)}, ${z.toFixed(2)}) host (${h[1].toFixed(2)}, ${h[2].toFixed(2)}), ${off.toFixed(3)} apart, ${went.toFixed(1)} m from the start`)
        if (went < 2) throw new Error(`${game}: ${id} never got going`)
        if (off > 0.05) throw new Error(`${game}: the host has ${id}'s torch somewhere else`)
      })
      const end = await host.eval(`(async () => { const r = await import('/src/modules/31-helping-dad/internal/rules.ts'); return r.finishPoint(${gameState(game)}.seed) })()`)
      const before = own[own.length - 1][3]
      for (let i = 0; i < 20; i++) {
        await mover.eval(torchMove({ at: end }))
        await sleep(40)
      }
      await sleep(600)
      const views = await Promise.all(pages.map((p) => p.eval(`(() => { const g = ${gameState(game)}; return g.players.find((x) => x.id === ${JSON.stringify(moverId)}).hits })()`)))
      say(`${game}: guest ${moverId} flung into a wall: hits ${before} -> ${JSON.stringify(views)}`)
      await host.shot(`${game}-host.png`)
      await mover.shot(`${game}-guest.png`)
      if (views.some((h) => h !== before + 1)) throw new Error(`${game}: not every browser saw the wall touched once`)
      await host.eval('window.__mg.backOut()')
      for (const g of guests) await g.waitFor(`window.__mg.getMinigameScreen().at === 'closed'`, 30000)
      continue
    }

    if (game === 'chef-caricature') {
      // Whoever draws first traces three outlines with real pointer events while
      // everybody else watches; every browser should see the ink as it is drawn
      // and agree on the dishes, the host's among them.
      await host.waitFor(`(() => { const g = ${gameState(game)}; return g && g.elapsed > g.startsAt + 0.2 })()`, 30000)
      const drawerId = await host.eval(`(() => { const g = ${gameState(game)}; return g.players[g.order[g.turn]].id })()`)
      const drawerPage = pages[ids.indexOf(drawerId)]
      const watcher = pages.find((p) => p !== drawerPage)
      let traced = 0
      let sawInk = false
      for (let n = 0; n < 3; n++) {
        const going = drawerPage.eval(chefTrace({ wait: 5000, speed: 1.6 }))
        await sleep(700)
        const ink = await watcher.eval(`(() => { const g = ${gameState(game)}; return g.stroke ? g.stroke.points.length / 2 : 0 })()`)
        if (ink > 3) sawInk = true
        if (n === 0) {
          await watcher.shot(`${game}-watcher.png`)
          await drawerPage.shot(`${game}-drawer.png`)
        }
        const did = await going
        if (did && did.accepted) traced += 1
        say(`${game}: ${drawerId} traced ${did && did.name}: ${JSON.stringify(did)}; a watcher saw ${ink} points of ink mid-stroke`)
      }
      await sleep(800)
      const views = await Promise.all(pages.map((p) => p.eval(`(() => { const g = ${gameState(game)}; return JSON.stringify([g.turn, g.outline, g.players.map((x) => x.score)]) })()`)))
      const agree = new Set(views).size === 1
      say(`${game}: ${traced} accepted; every browser ${agree ? 'agrees' : 'disagrees'}: ${views[0]}`)
      if (!sawInk) throw new Error(`${game}: no watcher saw the drawing as it was made`)
      if (traced < 2) throw new Error(`${game}: careful tracing fed the duck only ${traced}`)
      if (!agree) throw new Error(`${game}: browsers disagree - ${views.join(' | ')}`)
      if (JSON.parse(views[0])[2][ids.indexOf(drawerId)] !== traced) throw new Error(`${game}: the drawer traced ${traced} but the score is ${views[0]}`)
      await host.eval('window.__mg.backOut()')
      for (const g of guests) await g.waitFor(`window.__mg.getMinigameScreen().at === 'closed'`, 30000)
      continue
    }

    if (game === 'keyboard-warrior') {
      // For five letters every browser types the letter after its own delay -
      // the last guest quickest, the host slowest - and the last guest should get
      // every one: reactions are timed on each screen, so who is nearer the host
      // does not matter. Every browser should agree on the scores.
      const letters = 5
      for (let n = 0; n < letters; n++) {
        const did = await Promise.all(pages.map((p, i) => p.eval(typeLetter({ delay: 300 + (count - 1 - i) * 70 }))))
        if (did.some((d) => !d)) throw new Error(`${game}: a letter never came up in some browser`)
        await host.waitFor(`(() => { const g = ${gameState(game)}; return g.over || g.letter.closedAt !== null })()`, 10000)
        const winner = await host.eval(`(() => { const g = ${gameState(game)}; return g.letter.winner === null ? null : g.players[g.letter.winner].id })()`)
        say(`${game}: letter ${did[0].round} ${did[0].letter}: typed ${JSON.stringify(did.map((d) => d.banner))}; point to ${winner}`)
        if (n === 1) {
          await host.shot(`${game}-host.png`)
          await mover.shot(`${game}-guest.png`)
        }
        await host.waitFor(`(() => { const g = ${gameState(game)}; return g.over || g.letter.closedAt === null })()`, 10000)
      }
      let views = []
      for (let tries = 0; tries < 6; tries++) {
        await sleep(300)
        views = await Promise.all(pages.map((p) => p.eval(`(() => { const g = ${gameState(game)}; return JSON.stringify(g.players.map((x) => [x.id, x.score])) })()`)))
        if (new Set(views).size === 1) break
      }
      const agree = new Set(views).size === 1
      const scores = JSON.parse(views[0])
      const moverScore = scores.find((s) => s[0] === moverId)[1]
      say(`${game}: scores ${views[0]}; every browser agrees ${agree}`)
      if (!agree) throw new Error(`${game}: browsers disagree - ${views.join(' | ')}`)
      if (moverScore < letters - 1) throw new Error(`${game}: the quickest browser, ${moverId}, won only ${moverScore} of ${letters}`)
      await host.eval('window.__mg.backOut()')
      for (const g of guests) await g.waitFor(`window.__mg.getMinigameScreen().at === 'closed'`, 30000)
      continue
    }

    if (game === 'hes-one-shot') {
      // Every browser takes the mouse; a guest walks and the host should see it.
      // Then everybody hunts for twenty seconds, with the real controls, and
      // every browser should agree on who is out, by whom, and on the kills -
      // with guests' own shots among the hits the host counted.
      await host.waitFor(`(() => { const g = ${gameState(game)}; return g && g.elapsed > 0.2 })()`, 30000)
      await Promise.all(pages.map((p) => p.eval(oneShotPlay({ mode: 'lock' }))))
      const where = () => host.eval(`(() => { const g = ${gameState(game)}; const p = g.players.find((x) => x.id === ${JSON.stringify(moverId)}); return { x: p.x, z: p.z } })()`)
      const before = await where()
      await mover.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w' }))`)
      await sleep(1500)
      await mover.eval(`window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w' }))`)
      await sleep(400)
      const after = await where()
      const moved = Math.hypot(after.x - before.x, after.z - before.z)
      say(`${game}: guest ${moverId} held W; host saw it move ${moved.toFixed(2)} m`)
      if (moved < 1) throw new Error(`${game}: the host never saw the guest walk`)

      const until = Date.now() + 20000
      let fired = 0
      while (Date.now() < until) {
        const states = await Promise.all(pages.map((p) => p.eval(oneShotPlay())))
        fired += states.filter((s) => s && s.fired).length
        if (states[0] && states[0].over) break
        await sleep(40)
      }
      await Promise.all(pages.map((p) => p.eval(oneShotPlay({ mode: 'lock' }))))
      let views = []
      for (let tries = 0; tries < 6; tries++) {
        await sleep(600)
        views = await Promise.all(pages.map((p) => p.eval(`(() => { const g = ${gameState(game)}; return JSON.stringify(g.players.map((x) => [x.id, x.out, x.by, x.kills])) })()`)))
        if (new Set(views).size === 1) break
      }
      const agree = new Set(views).size === 1
      const table = JSON.parse(views[0])
      const out = table.filter((r) => r[1] !== null)
      const byGuests = out.filter((r) => r[2] !== null && r[2] > 0)
      say(`${game}: ${fired} shots fired; ${out.length} eliminated, ${byGuests.length} by guests; every browser agrees ${agree}`, views[0])
      await host.shot(`${game}-host.png`)
      await mover.shot(`${game}-guest.png`)
      if (!agree) throw new Error(`${game}: browsers disagree - ${views.join(' | ')}`)
      if (out.length === 0) throw new Error(`${game}: nobody was eliminated`)
      if (byGuests.length === 0) throw new Error(`${game}: no guest's shot ever counted on the host`)
      await host.eval('window.__mg.backOut()')
      for (const g of guests) await g.waitFor(`window.__mg.getMinigameScreen().at === 'closed'`, 30000)
      continue
    }

    if (game === 'synchronize-steps') {
      // Three rounds: every browser picks - a key or a button, some changing
      // their minds - and at each reveal every browser should agree on every
      // pick and step, each the pick its own browser meant.
      const waitAll = (phase, round) => Promise.all(pages.map((p) => p.waitFor(`(() => { const g = ${gameState(game)}; return g && (g.phase === 'over' || (g.phase === ${JSON.stringify(phase)} && g.round === ${round})) })()`, 20000)))
      for (let round = 0; round < 3; round++) {
        await waitAll('choose', round)
        if (await host.eval(`${gameState(game)}.phase === 'over'`)) break
        const options = [1, 4, 6]
        // Browsers in twos on a number, so there are pairs - and, with enough browsers, crowds.
        const meant = pages.map((_, i) => options[(Math.floor(i / 2) + round) % 3])
        const standing = JSON.parse(await host.eval(`JSON.stringify(${gameState(game)}.players.map((p) => !p.out))`))
        await Promise.all(
          pages.map(async (p, i) => {
            if (!standing[i]) return
            if (i % 3 === 2) {
              await p.eval(stepsPick({ pick: options[(i + round + 1) % 3], mouse: true }))
              await sleep(250)
            }
            await p.eval(stepsPick({ pick: meant[i], mouse: i % 2 === 1 }))
          }),
        )
        await waitAll('reveal', round)
        await sleep(300)
        const views = await Promise.all(pages.map((p) => p.eval(`(() => { const g = ${gameState(game)}; return JSON.stringify(g.players.map((x) => [x.id, x.step, x.out, x.last])) })()`)))
        const agree = new Set(views).size === 1
        const moves = JSON.parse(views[0])
        say(`${game}: round ${round + 1} picks ${JSON.stringify(moves.map((m) => m[3] && m[3].pick))} steps ${JSON.stringify(moves.map((m) => m[1]))}; every browser agrees ${agree}`)
        if (round === 0) {
          await host.shot(`${game}-host.png`)
          await mover.shot(`${game}-guest.png`)
        }
        if (!agree) throw new Error(`${game}: browsers disagree - ${views.join(' | ')}`)
        moves.forEach((m, i) => {
          if (!standing[i]) return
          if (!m[3] || m[3].pick !== meant[i] || m[3].auto) throw new Error(`${game}: ${ids[i]} meant ${meant[i]} but the host counted ${JSON.stringify(m[3])}`)
        })
      }
      await host.eval('window.__mg.backOut()')
      for (const g of guests) await g.waitFor(`window.__mg.getMinigameScreen().at === 'closed'`, 30000)
      continue
    }

    if (game === 'i-see-the-light') {
      // A guest runs on green and follows the circle on red; the host should
      // see its steps go up, and it still in, through a red.
      const guestOnHost = () => host.eval(`(() => { const r = ${gameState(game)}; const x = r.racers.find((x) => x.id === ${JSON.stringify(moverId)}); return { steps: x.steps, out: x.out, elapsed: +r.elapsed.toFixed(2) } })()`)
      const before = await guestOnHost()
      let sawRed = false
      for (let i = 0; i < 400; i++) {
        const did = await mover.eval(lightMove())
        if (did?.light === 'red') sawRed = true
        if (sawRed && did?.light === 'green') break
        await sleep(did?.light === 'red' ? 25 : 110)
      }
      await sleep(800)
      const after = await guestOnHost()
      say(`${game}: guest ${moverId} ran through a red (${sawRed}); host saw ${JSON.stringify(before)} -> ${JSON.stringify(after)}`)
      await host.shot(`${game}-host.png`)
      await mover.shot(`${game}-guest.png`)
      if (after.steps <= before.steps || after.out) throw new Error(`${game}: the host did not see the guest run, or saw it out`)
      await host.eval('window.__mg.backOut()')
      for (const g of guests) await g.waitFor(`window.__mg.getMinigameScreen().at === 'closed'`, 30000)
      continue
    }

    if (game === 'duck-hunt') {
      // A guest shoots one of its own balloons; the host should see the shot and the pop.
      const guestOnHost = () => host.eval(`(() => { const g = ${gameState(game)}; const p = g.players.find((p) => p.id === ${JSON.stringify(moverId)}); return { shots: p.shots, score: p.score } })()`)
      const before = await guestOnHost()
      let aimed = null
      for (let i = 0; i < 80 && !aimed; i++) {
        aimed = await mover.eval(duckHuntShot())
        if (!aimed) await sleep(150)
      }
      await sleep(1200)
      const after = await guestOnHost()
      say(`${game}: guest ${moverId} shot balloon ${aimed?.balloon}; host saw ${JSON.stringify(before)} -> ${JSON.stringify(after)}`)
      await host.shot(`${game}-host.png`)
      await mover.shot(`${game}-guest.png`)
      if (!aimed || after.shots !== before.shots + 1 || after.score !== before.score + 1) {
        throw new Error(`${game}: the host did not see the guest's shot land`)
      }
      await host.eval('window.__mg.backOut()')
      for (const g of guests) await g.waitFor(`window.__mg.getMinigameScreen().at === 'closed'`, 30000)
      continue
    }

    if (game === 'probable-stop') {
      // A guest steps to another path and confirms; the host should see both.
      const guestAt = (p) => p.eval(`(() => { const g = ${gameState(game)}; const b = g.players.find((b) => b.id === ${JSON.stringify(moverId)}); return { pick: b.pick, confirmed: b.confirmed } })()`)
      const before = await guestAt(host)
      const key = before.pick < 2 ? { code: 'KeyD', key: 'd' } : { code: 'KeyA', key: 'a' }
      await mover.eval(`window.dispatchEvent(new KeyboardEvent('keydown', ${JSON.stringify(key)}))`)
      await mover.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }))`)
      await sleep(1500)
      const after = await guestAt(host)
      say(`${game}: guest ${moverId} moved and confirmed; host saw ${JSON.stringify(before)} -> ${JSON.stringify(after)}`)
      await host.shot(`${game}-host.png`)
      await mover.shot(`${game}-guest.png`)
      if (after.pick === before.pick || !after.confirmed) throw new Error(`${game}: the host never saw the guest choose`)
      await host.eval('window.__mg.backOut()')
      for (const g of guests) await g.waitFor(`window.__mg.getMinigameScreen().at === 'closed'`, 30000)
      continue
    }

    // A guest holds a key that walks it somewhere, and the host watches.
    const where = (p) => p.eval(`(() => { const s = ${gameState(game)}; const b = s.${people}.find((b) => b.id === ${JSON.stringify(moverId)}); return { x: +b.x.toFixed(2), y: +b.y.toFixed(2) } })()`)
    const key = game === 'messy-maze'
      ? await mover.eval(`(async () => {
          const maze = await import('/src/modules/17-messy-maze/internal/maze.ts')
          const race = ${gameState(game)}
          const me = race.racers.find((r) => r.mine)
          const here = maze.cellAt(me)
          const next = maze.exits(maze.mazeFor(race.layout), here)[0]
          const i = next.y < here.y ? 0 : next.x < here.x ? 1 : next.y > here.y ? 2 : 3
          return { key: me.binding[i].toLowerCase(), code: 'Key' + me.binding[i] }
        })()`)
      : { key: 'd', code: 'KeyD' }
    const before = await where(host)
    await mover.eval(`window.dispatchEvent(new KeyboardEvent('keydown', ${JSON.stringify(key)}))`)
    await sleep(3000)
    const after = await where(host)
    await mover.eval(`window.dispatchEvent(new KeyboardEvent('keyup', ${JSON.stringify(key)}))`)
    const moved = Math.hypot(after.x - before.x, after.y - before.y)
    say(`${game}: guest ${moverId} held ${key.key}; host saw it move ${moved.toFixed(2)}`)
    await host.shot(`${game}-host.png`)
    await mover.shot(`${game}-guest.png`)
    if (moved < 0.5) throw new Error(`${game}: the host never saw the guest move`)

    await host.eval('window.__mg.backOut()')
    for (const g of guests) await g.waitFor(`window.__mg.getMinigameScreen().at === 'closed'`, 30000)
  }

  const errors = pages.flatMap((p) => p.errors.map((e) => `${p.name}: ${String(e).slice(0, 160)}`))
  say('console errors:', errors.length ? JSON.stringify(errors.slice(0, 10)) : 'none')
  ok = true
} catch (e) {
  say('FAILED', e.message.slice(0, 300))
  for (const p of pages) await p.shot(`failure-${p.name}.png`).catch(() => {})
} finally {
  for (const p of pages) p.close()
  process.exit(ok ? 0 : 1)
}
