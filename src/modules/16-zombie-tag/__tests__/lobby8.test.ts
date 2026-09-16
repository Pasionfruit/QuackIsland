/**
 * A full lobby: eight people in one round of Zombie Tag.
 *
 * The largest game this is built for, played out between a host and seven
 * guests. Every message goes through JSON and back, the way the relay hands it
 * over, and each guest keeps its own copy of the round - so what this checks
 * is that eight browsers see one game, and that each guest's keys move their
 * own body and nobody else's.
 */
import { describe, expect, it } from 'vitest'
import { NET } from '../../09-net'
import { crowdIntents } from '../internal/ai'
import { ARENA, inObstacle } from '../internal/arena'
import { stepRound, type Intent, type Round } from '../internal/round'
import { emptyRound, newRound } from '../internal/setup'
import {
  applySnapshot,
  decodeIntent,
  decodeSnapshot,
  encodeIntent,
  encodeSnapshot,
  hearIntent,
} from '../internal/wire'

const IDS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']
const HOST = IDS[0]
const GUESTS = IDS.slice(1)
/** The relay's limit on messages a second from one client, in `server/relay.mjs`. */
const RELAY_RATE = 60
const RELAY_BYTES = 4096

const relay = (message: Record<string, unknown>) =>
  JSON.parse(JSON.stringify(message)) as Record<string, unknown>

/** Which way each guest runs: straight out from the middle, from where it spawned. */
function outward(round: Round, id: string): Intent {
  const body = round.bodies.find((b) => b.id === id)!
  const length = Math.hypot(body.x, body.y)
  return { x: body.x / length, y: body.y / length, push: false }
}

describe('eight people in one round', () => {
  it('deals all eight in, in the middle, clear of each other and of the crates', () => {
    const round = newRound({ ids: IDS, me: HOST })
    const players = round.bodies.filter((b) => b.side === 'player')
    expect(players.map((b) => b.id)).toEqual(IDS)
    expect(round.bodies.filter((b) => b.side === 'zombie')).toHaveLength(ARENA.zombies)
    for (const a of players) {
      expect(inObstacle(a, ARENA.radius)).toBe(false)
      for (const b of players) {
        if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(ARENA.radius * 2)
      }
    }
  })

  it('leaves a ninth person out rather than squeezing them in', () => {
    const round = newRound({ ids: [...IDS, 'p9'], me: HOST })
    expect(round.bodies.filter((b) => b.side === 'player')).toHaveLength(8)
    expect(round.bodies.some((b) => b.id === 'p9')).toBe(false)
  })

  it('shows every guest the same round, with their own body and everybody else in it', () => {
    const host = newRound({ ids: IDS, me: HOST })
    const guests = new Map(GUESTS.map((id) => [id, emptyRound()]))
    const heard = new Map<string, Intent>()
    const starts = new Map(host.bodies.map((b) => [b.id, { x: b.x, y: b.y }]))
    const wants = new Map(GUESTS.map((id) => [id, outward(host, id)]))

    // Half a second at sixty frames, a snapshot every third frame.
    for (let frame = 0; frame < 30; frame++) {
      for (const id of GUESTS) {
        const intent = decodeIntent(relay(encodeIntent(wants.get(id)!)))!
        heard.set(id, hearIntent(heard.get(id), intent))
      }
      const intents = crowdIntents(host)
      for (const [id, intent] of heard) intents.set(id, intent)
      intents.set(HOST, { x: 0, y: 0, push: false })
      stepRound(host, intents, 1 / 60)

      if (frame % 3 === 2) {
        const wire = relay(encodeSnapshot(host))
        expect(JSON.stringify(wire).length).toBeLessThan(RELAY_BYTES)
        for (const [id, copy] of guests) applySnapshot(copy, decodeSnapshot(wire)!, id)
      }
    }

    for (const [id, copy] of guests) {
      expect(copy.bodies).toHaveLength(host.bodies.length)
      expect(copy.bodies.filter((b) => b.mine).map((b) => b.id)).toEqual([id])
      for (const body of host.bodies) {
        const seen = copy.bodies.find((b) => b.id === body.id)!
        expect(seen.x).toBeCloseTo(body.x, 1)
        expect(seen.y).toBeCloseTo(body.y, 1)
        expect(seen.side).toBe(body.side)
      }
    }

    // Every guest went the way it was pressing, and the host - pressing
    // nothing - stayed where it was.
    for (const id of GUESTS) {
      const body = host.bodies.find((b) => b.id === id)!
      const start = starts.get(id)!
      const want = wants.get(id)!
      expect((body.x - start.x) * want.x + (body.y - start.y) * want.y, id).toBeGreaterThan(1)
    }
    const me = host.bodies.find((b) => b.id === HOST)!
    expect(Math.hypot(me.x - starts.get(HOST)!.x, me.y - starts.get(HOST)!.y)).toBeLessThan(0.5)
  })

  it('keeps the host inside the relay rate limit with seven others to answer', () => {
    // The host sends its duck, the round, the world, its own pings, and a pong
    // to each of the seven others' pings. The relay drops anything over its
    // limit without saying so, which would look like a stuttering round.
    const snapshots = 1000 / 50
    const pongs = GUESTS.length * NET.pingRate
    const host = NET.sendRate + snapshots + NET.worldRate + NET.pingRate + pongs
    expect(host).toBeLessThan(RELAY_RATE)

    // A guest: its duck, its keys four times a second plus a few changes, its
    // pings and pongs.
    const guest = NET.sendRate + 4 + 10 + NET.pingRate + pongs
    expect(guest).toBeLessThan(RELAY_RATE)
  })
})
