/**
 * Case Closed's board: nine rooms in a 3x3 grid, connected by a hallway
 * space between each orthogonal pair, plus a secret passage between each
 * pair of opposite corners - the classic Clue layout, camp-themed.
 *
 * Movement is a graph walk rather than a literal tile grid: a hallway space
 * is a single shared node (only one suspect can stand in it at a time), and
 * entering a room always ends a move even with steps left over, the same as
 * the real board.
 */

export type RoomId =
  | 'greenhouse'
  | 'diningPavilion'
  | 'readingNook'
  | 'boathouse'
  | 'campfireCircle'
  | 'counselorsCabin'
  | 'tradingPost'
  | 'messHall'
  | 'hammockLounge'

export const ROOM_NAMES: Record<RoomId, string> = {
  greenhouse: 'Greenhouse',
  diningPavilion: 'Dining Pavilion',
  readingNook: 'Reading Nook',
  boathouse: 'Boathouse',
  campfireCircle: 'Campfire Circle',
  counselorsCabin: "Counselor's Cabin",
  tradingPost: 'Trading Post',
  messHall: 'Mess Hall',
  hammockLounge: 'Hammock Lounge',
}

export const ROOM_GRID: RoomId[][] = [
  ['greenhouse', 'diningPavilion', 'readingNook'],
  ['boathouse', 'campfireCircle', 'counselorsCabin'],
  ['tradingPost', 'messHall', 'hammockLounge'],
]

export const ROOMS = Object.keys(ROOM_NAMES) as RoomId[]

/** Opposite corners only - the classic four secret-passage rooms. */
export const SECRET_PASSAGES: Partial<Record<RoomId, RoomId>> = {
  greenhouse: 'hammockLounge',
  hammockLounge: 'greenhouse',
  readingNook: 'tradingPost',
  tradingPost: 'readingNook',
}

export const WEAPONS = [
  'Marshmallow Skewer',
  'Canoe Paddle',
  'Fishing Rod',
  'Flashlight',
  'Guitar String',
  'Cast-Iron Skillet',
] as const
export type Weapon = (typeof WEAPONS)[number]

/** Suspects reuse the original Smash roster - shared art, colours and names. */
export const SUSPECTS = ['contrlzee', 'ninjapenguin', 'teninchtoenail', 'diva', 'mrpasionfruit', 'nightshift'] as const
export type Suspect = (typeof SUSPECTS)[number]

/** Where each suspect starts, spread one to a room around the board. */
export const SUSPECT_HOME: Record<Suspect, RoomId> = {
  contrlzee: 'greenhouse',
  ninjapenguin: 'diningPavilion',
  teninchtoenail: 'readingNook',
  diva: 'boathouse',
  mrpasionfruit: 'counselorsCabin',
  nightshift: 'tradingPost',
}

/** A room, or the single shared hallway space between two adjacent rooms. */
export type NodeId = RoomId | `hall:${string}`

function hallKey(a: RoomId, b: RoomId): NodeId {
  return `hall:${[a, b].sort().join('-')}` as NodeId
}

/** The shared hallway space between two orthogonally adjacent rooms. */
export function hallBetween(a: RoomId, b: RoomId): NodeId {
  return hallKey(a, b)
}

function buildAdjacency(): Map<NodeId, NodeId[]> {
  const adj = new Map<NodeId, Set<NodeId>>()
  const link = (a: NodeId, b: NodeId) => {
    if (!adj.has(a)) adj.set(a, new Set())
    if (!adj.has(b)) adj.set(b, new Set())
    adj.get(a)!.add(b)
    adj.get(b)!.add(a)
  }
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const room = ROOM_GRID[r][c]
      if (c < 2) {
        const hall = hallKey(room, ROOM_GRID[r][c + 1])
        link(room, hall)
        link(hall, ROOM_GRID[r][c + 1])
      }
      if (r < 2) {
        const hall = hallKey(room, ROOM_GRID[r + 1][c])
        link(room, hall)
        link(hall, ROOM_GRID[r + 1][c])
      }
    }
  }
  const out = new Map<NodeId, NodeId[]>()
  for (const [k, v] of adj) out.set(k, [...v])
  return out
}

export const ADJACENCY = buildAdjacency()

export function isRoom(node: NodeId): node is RoomId {
  return (ROOMS as string[]).includes(node)
}

/** Every room's starting hallway space - where a suspect who has never moved stands. */
export const START_NODE: Record<RoomId, NodeId> = {
  greenhouse: hallKey('greenhouse', 'diningPavilion'),
  diningPavilion: hallKey('diningPavilion', 'readingNook'),
  readingNook: hallKey('readingNook', 'counselorsCabin'),
  boathouse: hallKey('boathouse', 'tradingPost'),
  campfireCircle: hallKey('campfireCircle', 'messHall'),
  counselorsCabin: hallKey('counselorsCabin', 'hammockLounge'),
  tradingPost: hallKey('tradingPost', 'messHall'),
  messHall: hallKey('messHall', 'hammockLounge'),
  hammockLounge: hallKey('hammockLounge', 'counselorsCabin'),
}

/**
 * Every node reachable with exactly `steps` movement points spent - a room
 * can be entered (and the move ended) with steps to spare, but a hallway
 * space has to be reached with none left over, and an occupied hallway space
 * can't be entered or passed through at all.
 */
export function reachableNodes(start: NodeId, steps: number, occupied: Set<NodeId>): NodeId[] {
  const results = new Set<NodeId>()
  const walk = (node: NodeId, remaining: number, visited: Set<NodeId>) => {
    for (const next of ADJACENCY.get(node) ?? []) {
      if (visited.has(next)) continue
      if (!isRoom(next) && occupied.has(next)) continue
      if (isRoom(next)) {
        results.add(next)
        if (remaining > 1) walk(next, remaining - 1, new Set([...visited, next]))
      } else if (remaining === 1) {
        results.add(next)
      } else {
        walk(next, remaining - 1, new Set([...visited, next]))
      }
    }
  }
  walk(start, steps, new Set([start]))
  return [...results]
}
