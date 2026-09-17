/**
 * A full lobby: N separate headless browsers, one player each, in one lobby
 * through the relay, playing minigames together.
 *
 *   node .claude/skills/run-localrot/scripts/lobby.mjs --players 8 --out <dir>
 *
 * --players   how many (default 8, the most the games are built for)
 * --games     comma list, in order (default zombie-tag,messy-maze,probable-stop,duck-hunt,punch-buggy,i-see-the-light)
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
import { GAMES, args, cloverClick, cookPick, duckHuntShot, gameState, launch, lightMove, say, sleep } from './cdp.mjs'

const opt = args({ players: '8', games: 'zombie-tag,messy-maze,probable-stop,duck-hunt,punch-buggy,lady-luck,let-him-cook,i-see-the-light', app: 'http://localhost:5199/', out: join(tmpdir(), 'localrot-run', 'lobby'), port: '9410' })
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
