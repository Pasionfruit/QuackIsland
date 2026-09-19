/**
 * Finding places in a seeded office for a test to stand people: furniture can
 * be anywhere, so nothing can be assumed open.
 */
import { DESKS, blocked, lineClear, officeFor, type Point } from '../internal/office'
import { PLACED, piecesOf, type Game } from '../internal/rules'

/** The west end of a straight line twelve metres long, running east, with room either side for a rocket and a body. */
export function lane(seed: number): Point {
  const office = officeFor(seed)
  for (let z = -10; z <= 10; z += 0.25) {
    for (let x = -16; x <= 4; x += 0.5) if (lineClear(office, { x, z }, { x: x + 12, z }, 0.6)) return { x, z }
  }
  throw new Error(`no open lane in office ${seed}`)
}

/** The middle of the widest open space: nothing within 3.4 metres of it. */
export function clearing(seed: number): Point {
  const office = officeFor(seed)
  for (let x = -16; x <= 16; x += 0.25) {
    for (let z = -11; z <= 11; z += 0.25) if (!blocked(office, { x, z }, 3.4)) return { x, z }
  }
  throw new Error(`no clearing in office ${seed}`)
}

/** Everybody listed has all four pieces on their desk. */
export function arm(game: Game, ...players: number[]): Game {
  for (const p of players) for (const i of piecesOf(game, p)) game.pieces[i].state = PLACED
  return game
}

/** Stands a player somewhere, aiming a way. */
export function stand(game: Game, player: number, x: number, z: number, yaw = 0): void {
  Object.assign(game.players[player], { x, z, yaw })
}

/** Stands a player at whichever desk is furthest from everywhere listed: out of harm's way. */
export function away(game: Game, player: number, ...from: Point[]): void {
  const far = (p: Point) => Math.min(...from.map((q) => Math.hypot(p.x - q.x, p.z - q.z)))
  const spot = DESKS.map((d) => d.spot).sort((a, b) => far(b) - far(a))[0]
  stand(game, player, spot.x, spot.z)
}

/** Aiming east and west. */
export const EAST = -Math.PI / 2
export const WEST = Math.PI / 2
