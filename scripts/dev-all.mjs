/**
 * Runs the Vite dev server and the Polyland relay together, which is what you
 * want whenever anyone else is going to join your game.
 *
 *   npm run dev:all
 */
import { spawn } from 'node:child_process'
import { networkInterfaces } from 'node:os'

const isWindows = process.platform === 'win32'
const npx = isWindows ? 'npx.cmd' : 'npx'

function lanAddress() {
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) return a.address
    }
  }
  return 'localhost'
}

const children = [
  spawn(process.execPath, ['server/index.mjs'], { stdio: 'inherit' }),
  spawn(npx, ['vite'], { stdio: 'inherit', shell: isWindows }),
]

const ip = lanAddress()
console.log('')
console.log('  Polyland is up.')
console.log(`  You:     http://localhost:5173`)
console.log(`  Friends: http://${ip}:5173`)
console.log('')

const stop = () => {
  for (const c of children) c.kill()
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
for (const c of children) {
  c.on('exit', (code) => {
    if (code !== 0 && code !== null) stop()
  })
}
