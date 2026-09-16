/**
 * A full lobby: N separate headless browsers, one player each, in one lobby
 * through the relay, playing minigames together.
 *
 *   node .claude/skills/run-localrot/scripts/lobby.mjs --players 8 --out <dir>
 *
 * --players   how many (default 8, the most the games are built for)
 * --games     comma list, in order (default zombie-tag,messy-maze)
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
import { GAMES, args, gameState, launch, say, sleep } from './cdp.mjs'

const opt = args({ players: '8', games: 'zombie-tag,messy-maze', app: 'http://localhost:5199/', out: join(tmpdir(), 'localrot-run', 'lobby'), port: '9410' })
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
          return { seed: s.seed ?? null, layout: s.layout ?? null, people: s.${people}.length, mine: s.${people}.filter((b) => b.mine).map((b) => b.id).join(), me: window.__net.getNet().id }
        })()`),
      ),
    )
    const same = new Set(seen.map((s) => `${s.seed}:${s.layout}:${s.people}`)).size === 1
    const ownBody = seen.every((s) => s.mine === s.me)
    say(`${game}: same in every browser ${same}; each browser's own body right ${ownBody}`, JSON.stringify(seen[0]))
    if (!same || !ownBody) throw new Error(`${game}: browsers disagree - ${JSON.stringify(seen)}`)

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
