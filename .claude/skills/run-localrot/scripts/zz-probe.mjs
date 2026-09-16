import { duckHuntShot, gameState, launch, say, sleep } from './cdp.mjs'
const out = process.argv[2]
const pages = [await launch({ port: 9480, out, name: 'h', width: 640, height: 400 }), await launch({ port: 9481, out, name: 'g', width: 640, height: 400 })]
try {
  for (const p of pages) await p.goto('http://localhost:5199/')
  for (const p of pages) await p.waitFor(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes('LOBBY'))`, 60000)
  const [host, guest] = pages
  const code = await host.eval(`(async () => { window.__net = await import('/src/modules/09-net/index.ts'); const c = window.__net.makeCode(); window.__net.createLobby(c, 'h'); return c })()`)
  await guest.eval(`(async () => { window.__net = await import('/src/modules/09-net/index.ts'); window.__net.joinLobby(${JSON.stringify(code)}, 'g') })()`)
  for (const p of pages) await p.waitFor(`window.__net.getNet().peers === 1`, 30000)
  for (const p of pages) await p.eval(`(async () => { window.__mg = await import('/src/modules/15-minigames/index.ts') })()`)
  await host.eval(`window.__mg.openMinigame('duck-hunt')`)
  await guest.waitFor(`window.__mg.getMinigameScreen().at === 'game'`)
  say('after open, guest errors', guest.errors.length)
  await host.eval('window.__mg.playMinigame()')
  for (let i = 0; i < 30; i++) {
    const phase = await guest.eval(`(() => { const s = window.__mg.getMinigameScreen(); return s.at === 'game' ? s.run.phase : s.at })()`)
    const canvases = await guest.eval(`document.querySelectorAll('canvas').length`)
    if (i % 3 === 0 || guest.errors.length) say(`t${i}`, phase, 'canvases', canvases, 'errors', guest.errors.length)
    if (guest.errors.length) break
    await sleep(250)
  }
  let aimed = null
  if (process.argv[3] === 'shoot') for (let i = 0; i < 40 && !aimed; i++) { aimed = await guest.eval(duckHuntShot()); if (!aimed) await sleep(150) }
  const size = () => guest.eval(`(() => { const c = [...document.querySelectorAll('canvas')].pop(); const r = c.parentElement.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)] })()`)
  say('board size before close', JSON.stringify(await size()))
  await sleep(1000)
  say('after guest shot', JSON.stringify(aimed), 'errors', guest.errors.length)
  await host.eval('window.__mg.backOut()')
  await sleep(1500)
  say('after backOut, errors', guest.errors.length, 'canvases', await guest.eval(`document.querySelectorAll('canvas').length`))
  say(JSON.stringify(guest.errors.map((e) => String(e).slice(0, 1500))))
} finally {
  for (const p of pages) p.close()
  process.exit(0)
}
