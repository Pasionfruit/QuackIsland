/**
 * The five Hide & Seek maps.
 *
 * Every map is the same skeleton: a 17x17 grid, a fully open corridor down
 * row 8 and column 8, and four 8x8 rooms - one per quadrant - hung off it.
 * That corridor is what guarantees every room can reach every other room
 * without a case-by-case connectivity check, which matters more here than
 * clever layouts: authoring five of these by hand, a sealed-off pocket is an
 * easy mistake to make and an annoying one to hit mid-chase.
 *
 * A quadrant is written as eight 8-character rows:
 *   '.' floor   '#' wall   'B' boost pad   'T'/'U' a paired teleporter
 *   '1'-'8' a spawn point
 * `buildRows` stitches the four quadrants around the corridor into the full
 * 17x17 map `HideMap.rows` expects.
 */
import type { HideMap, Section } from './types'

export const MAP_SIZE = 17
const MID = 8

type Quad = string[]

function buildRows(tl: Quad, tr: Quad, bl: Quad, br: Quad): string[] {
  const rows: string[] = []
  for (let y = 0; y < MAP_SIZE; y++) {
    if (y === MID) {
      rows.push('.'.repeat(MAP_SIZE))
      continue
    }
    const top = y < MID
    const i = top ? y : y - MID - 1
    const left = top ? tl[i] : bl[i]
    const right = top ? tr[i] : br[i]
    if (left.length !== 8 || right.length !== 8) {
      throw new Error(`quadrant row ${i} is not 8 characters: "${left}" / "${right}"`)
    }
    rows.push(left + '.' + right)
  }
  return rows
}

/**
 * Each quadrant only has room for seven spawn digits (two per room, minus
 * one), so the eighth goes on the corridor itself - always open, by
 * construction - rather than squeezed into an already-drawn room.
 */
function withEighthSpawn(rows: string[]): string[] {
  const y = 2
  const x = MID
  return rows.map((r, i) => (i === y ? r.slice(0, x) + '8' + r.slice(x + 1) : r))
}

function quadrant(name: string, wall: string, wallDark: string, floor: string, ceiling: string, x0: number, y0: number): Section {
  return { name, wall, wallDark, floor, ceiling, x0, y0, x1: x0 + 7, y1: y0 + 7 }
}

// ------------------------------------------------------------------ Office

const office = buildRows(
  ['........', '.####1..', '.#..#...', '.#..#.##', '....#.#.', '.####.#.', '2......#', '........'],
  ['........', '..T#####', '..#....#', '..#.##.#', '..#.#3.#', '..#.#..#', '....#..#', '..B.....'],
  ['........', '.4..####', '.#....#.', '.#.##.#.', '.#.#..#.', '.#.#B##.', '.......5', '........'],
  ['........', '####U...', '#....#..', '#.##.#..', '#.6#....', '#..#.##.', '#......7', '........'],
)

// -------------------------------------------------------------------- Cave

const cave = buildRows(
  ['........', '.#.#.#..', '.#.#.#.1', '.#...#..', '.###.##.', '2....B..', '.#####.#', '........'],
  ['........', '..#.T...', '.##.#.#.', '.#..#.#.', '.#.##.#3', '.#.....#', '.#####.#', '........'],
  ['........', '4.####..', '.#....#.', '.#.##.#.', '.#.#..#.', '.B.#.##.', '...#...5', '........'],
  ['........', '...U..#.', '.###.#.#', '.6..#...', '.#.##.##', '.#......', '.#####.7', '........'],
)

// --------------------------------------------------------------- Warehouse

const warehouse = buildRows(
  ['........', '.##.##..', '.##.##.1', '........', '.##B##..', '.##.##..', '2.......', '........'],
  ['........', '..##.##.', '3.##.##.', '........', '..T##...', '..##.##.', '.....##.', '........'],
  ['........', '.##.##..', '4##.##..', '........', '.##.##B.', '.##.##..', '.......5', '........'],
  ['........', '..##.##.', '..##.##6', '........', '..##U##.', '..##.##.', '7.......', '........'],
)

// -------------------------------------------------------------------- City

const city = buildRows(
  ['........', '.##.###.', '.##.###1', '.##.....', '........', '.###.##.', '2##.##..', '........'],
  ['........', '.###.##.', '3###.##.', '.....##.', '........', '.##.###.', '..##.###', '....B...'],
  ['........', '4##.###.', '.##.....', '.##.###.', '........', '.###.##.', '5##.##..', '........'],
  ['........', '.T##.##.', '.....##.', 'U##.###.', '........', '.##.###6', '.##.....', '.......7'],
)

// ------------------------------------------------------------- Theme Park

const themePark = buildRows(
  ['........', '.####...', '.#..#.1.', '.#..#.#.', '....#.#.', '.####.#.', '2.......', '..B.....'],
  ['........', '..####..', '.3..#.#.', '.#..#.#.', '.#....#.', '.#####.#', '.......T', '........'],
  ['........', '4...####', '.#.#....', '.#.#.##.', '.#.#.#..', '.#...#B.', '.....#.5', '........'],
  ['........', '####...6', '#....#..', '#.##.#..', '#.U..#..', '#.####..', '#......7', '........'],
)

const HIDE_TILE = '#7d7264'
const HIDE_TILE_DARK = '#5f574c'

export const HIDE_MAPS: HideMap[] = [
  {
    id: 'office',
    name: 'The Office',
    theme: 'Fluorescent lights, one very long TPS report.',
    rows: withEighthSpawn(office),
    interactiveName: 'waxed floor',
    sections: [
      quadrant('Lobby', '#c9bfae', '#a89e8e', '#d8cfc0', '#e8e2d6', 0, 0),
      quadrant('Cubicles', '#8fa0ad', '#6f7f8a', '#c3ccd2', '#dbe2e6', 9, 0),
      quadrant('Break Room', '#c9a24a', '#a3813a', '#e0d2ac', '#efe6d0', 0, 9),
      quadrant('Server Room', '#4f5a66', '#3a424c', '#a8b3bd', '#c7ced6', 9, 9),
    ],
  },
  {
    id: 'cave',
    name: 'The Cave',
    theme: 'Drip. Drip. Something with too many legs.',
    rows: withEighthSpawn(cave),
    interactiveName: 'slick slope',
    sections: [
      quadrant('Entrance', '#8a7a63', '#6b5d4a', '#a89878', '#3a342c', 0, 0),
      quadrant('Crystal Hollow', '#5a7a8a', '#3f5866', '#7fa8b8', '#2a3238', 9, 0),
      quadrant('Deep Tunnels', '#4a4238', '#332e26', '#6b6152', '#1c1a16', 0, 9),
      quadrant('Underground Lake', '#3a5a68', '#28404c', '#5f8a98', '#20282c', 9, 9),
    ],
  },
  {
    id: 'warehouse',
    name: 'The Warehouse',
    theme: 'Forklifts, pallets, and a suspicious lack of fire exits.',
    rows: withEighthSpawn(warehouse),
    interactiveName: 'conveyor belt',
    sections: [
      quadrant('Loading Dock', '#a89060', '#867248', '#c9b98a', '#d8cba8', 0, 0),
      quadrant('High Shelving', '#8a8a8a', '#6b6b6b', '#b8b8b8', '#d0d0d0', 9, 0),
      quadrant('Cold Storage', '#5a7a90', '#425c70', '#8fb0c4', '#c0d4e0', 0, 9),
      quadrant('Sorting Floor', '#b8722f', '#8f5a24', '#dba867', '#ecd4b0', 9, 9),
    ],
  },
  {
    id: 'city',
    name: 'The City',
    theme: 'Rooftops and back alleys, four blocks of it.',
    rows: withEighthSpawn(city),
    interactiveName: 'skate ramp',
    sections: [
      quadrant('Main Street', '#a8a29a', '#847f78', '#cfc9c0', '#e4dfd4', 0, 0),
      quadrant('Back Alleys', '#5c5850', '#403d38', '#8a857a', '#b8b3a6', 9, 0),
      quadrant('Rooftops', '#6f8fa8', '#546f84', '#a4c0d4', '#dceaf2', 0, 9),
      quadrant('Subway', '#3a3a42', '#26262c', '#6a6a76', '#9a9aa6', 9, 9),
    ],
  },
  {
    id: 'theme-park',
    name: 'The Theme Park',
    theme: 'Somewhere a mascot is having a very long day.',
    rows: withEighthSpawn(themePark),
    interactiveName: 'log flume slide',
    sections: [
      quadrant('Midway', '#d94f4f', '#a83a3a', '#f0a8a8', '#fbe0c8', 0, 0),
      quadrant("Kiddie Land", '#e8c05f', '#c9982f', '#f6e2a8', '#fdf0d0', 9, 0),
      quadrant('Haunted Manor', '#4a3a52', '#332638', '#7a6a84', '#1a1620', 0, 9),
      quadrant('Coaster Yard', '#4f8fa0', '#376878', '#8fc4d4', '#d8f0f6', 9, 9),
    ],
  },
]

export function hideMapById(id: string): HideMap {
  return HIDE_MAPS.find((m) => m.id === id) ?? HIDE_MAPS[0]
}

export const HIDE_TILE_COLORS = { wall: HIDE_TILE, wallDark: HIDE_TILE_DARK }
