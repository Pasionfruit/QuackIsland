/**
 * Everything that stands on the lawn: forty-nine animals and plants that
 * defend it, and twenty-five pests that come for it.
 *
 * Two halves, deliberately kept apart:
 *
 * - **Species** are data. Frozen catalogues of what a Pea Shooter *is* - what
 *   it costs, how much it can take, what it does, what shape it is. Nothing in
 *   a catalogue changes while a round runs, and the shelf reads them.
 * - **Pieces** are the live things. One duck, in one square, with the health it
 *   has left. `GardenPiece` is the base: everything on the lawn is one, has a
 *   species, sits somewhere, and can be hurt. `Defender` and `Pest` are the two
 *   sides of it.
 *
 * **The roster is a table on purpose.** Seventy-four species and not one
 * branch anywhere that switches on an id: adding the seventy-fifth is a line
 * here and nothing else in the build. Balancing is editing numbers in a column
 * rather than hunting through code, which is the only way a roster this size
 * is ever going to be balanced at all.
 *
 * **The defenders are exactly forty-nine, on purpose.** The picking shelf is
 * laid out as a 7x7 grid - one screen, no scrolling, every square filled - so
 * the roster is sized to fit it exactly rather than the grid being sized to
 * fit the roster.
 *
 * The numbers are **first numbers**. They are ordered sensibly against each
 * other - a Watermelon Mortar costs more and hits harder than a Pea Shooter -
 * and not one of them has been played with yet.
 */

/** What every species has, defender and pest alike. */
export interface Species {
  id: string
  /** What the shelf calls it. */
  name: string
  /** One line, under the name. */
  blurb: string
  /** How much it can take before it is gone. */
  health: number
  /**
   * The colour of its pill.
   *
   * Every creature is a pill until the art is done, so this is most of what
   * tells a Sunflower from a Turtle. It is on the species rather than in the
   * view because it is part of what the thing *is* to a player.
   */
  colour: string
  /**
   * Its shape, roughly.
   *
   * The other half of telling them apart before there is any art: the
   * placeholder is drawn in these proportions, so a Bamboo is a tall thin
   * thing and a Pumpkin Shield is a wide low one **now**, rather than after
   * somebody models seventy-five animals.
   *
   * It is also the brief. Whoever builds the real assets is being told what
   * silhouette this one has to read as from across a lawn.
   */
  shape: Shape
}

/**
 * The silhouettes a species can have.
 *
 * Deliberately few and deliberately unalike. Their whole job is to be told
 * apart at a glance at the size of one square, so "tall" and "quite tall" are
 * not two entries.
 */
export type Shape = 'tall' | 'round' | 'squat' | 'wide' | 'spiky' | 'long' | 'winged'

/** How to draw a placeholder of that shape, as fractions of a square. */
export function silhouette(shape: Shape): { width: number; height: number; radius: number } {
  switch (shape) {
    case 'tall':
      return { width: 0.3, height: 0.86, radius: 0.5 }
    case 'round':
      return { width: 0.62, height: 0.62, radius: 0.5 }
    case 'squat':
      return { width: 0.6, height: 0.44, radius: 0.35 }
    case 'wide':
      return { width: 0.86, height: 0.4, radius: 0.22 }
    case 'spiky':
      return { width: 0.62, height: 0.7, radius: 0.12 }
    case 'long':
      return { width: 0.9, height: 0.26, radius: 0.5 }
    case 'winged':
      return { width: 0.8, height: 0.54, radius: 0.5 }
  }
}

/**
 * What a defender is for.
 *
 * Four jobs, and the shelf is grouped by them - which is what stops fifty
 * animals being a scroll instead of a choice.
 */
export type Role = 'shoots' | 'guards' | 'grows' | 'eats'

/** An animal or plant that holds the lawn, or feeds it. */
export interface DefenderSpecies extends Species {
  id: DefenderId
  /** Seeds to plant one, out of the shared pot. */
  cost: number
  /** Seconds before another of the same kind may be planted. */
  recharge: number
  role: Role
  /**
   * How many squares along its lane it reaches.
   *
   * Zero for anything that only matters in its own square. `GRID.cols` or more
   * means the whole lane, which is what a shooter does.
   */
  reach: number
}

/** How a pest gets about. */
export type Gait = 'walks' | 'flies' | 'hops'

/** Something that came to ruin it. */
export interface PestSpecies extends Species {
  id: PestId
  /** Squares a second, up the lane towards the house. */
  speed: number
  /** How hard it chews, per second. */
  bite: number
  /**
   * `walks` is the ordinary case and the only one a wall stops. `flies` goes
   * over anything on the ground, and `hops` clears exactly one thing in its
   * way - the difference matters enough to be a field rather than a note.
   */
  moves: Gait
}

/**
 * The fifty.
 *
 * In four groups of the same four roles the shelf uses, and in a sensible
 * order within each: cheap and simple first, expensive and strange last.
 *
 * `as const` so the ids below are a type rather than a list somebody has to
 * keep in step with this one by hand.
 */
const DEFENDER_LIST = [
  // --- shooters: they clear the lane in front of them ----------------------
  { id: 'pea-shooter', name: 'Pea Shooter', role: 'shoots', cost: 25, recharge: 5, health: 100, reach: 99, shape: 'tall', colour: '#7cb342', blurb: 'Spits peas down its lane, all day, for almost nothing.' },
  { id: 'acorn-cannon', name: 'Acorn Cannon', role: 'shoots', cost: 50, recharge: 7, health: 110, reach: 99, shape: 'tall', colour: '#a1724a', blurb: 'Harder acorns, slower. The first upgrade anybody buys.' },
  { id: 'carrot-cannon', name: 'Carrot Cannon', role: 'shoots', cost: 75, recharge: 8, health: 100, reach: 99, shape: 'tall', colour: '#f2801f', blurb: 'Fires a whole carrot. Undignified, and it works.' },
  { id: 'corn-popper', name: 'Corn Popper', role: 'shoots', cost: 100, recharge: 10, health: 90, reach: 4, shape: 'tall', colour: '#f6d743', blurb: 'Pops a burst of kernels over the squares just ahead.' },
  { id: 'tomato-tosser', name: 'Tomato Tosser', role: 'shoots', cost: 125, recharge: 12, health: 90, reach: 99, shape: 'round', colour: '#e34b3a', blurb: 'Lobs one that splatters, and everything nearby wears it.' },
  { id: 'berry-blaster', name: 'Berry Blaster', role: 'shoots', cost: 150, recharge: 12, health: 90, reach: 99, shape: 'round', colour: '#8e4bd0', blurb: 'Three berries where anything else fires one.' },
  { id: 'pepper-popper', name: 'Pepper Popper', role: 'shoots', cost: 150, recharge: 20, health: 80, reach: 3, shape: 'tall', colour: '#d4342a', blurb: 'Goes off in a puff of heat and is gone. Once only.' },
  { id: 'cucumber-catapult', name: 'Cucumber Catapult', role: 'shoots', cost: 175, recharge: 15, health: 100, reach: 99, shape: 'wide', colour: '#5e9c3f', blurb: 'Arcs one clean over whatever is standing in the way.' },
  { id: 'pumpkin-launcher', name: 'Pumpkin Launcher', role: 'shoots', cost: 200, recharge: 18, health: 120, reach: 99, shape: 'squat', colour: '#e8801c', blurb: 'One pumpkin. It is enough for most of what it hits.' },
  { id: 'watermelon-mortar', name: 'Watermelon Mortar', role: 'shoots', cost: 300, recharge: 30, health: 110, reach: 99, shape: 'squat', colour: '#3f8f4a', blurb: 'Drops a melon anywhere on the lawn. The last word in fruit.' },

  // --- guards: they stand in the way ---------------------------------------
  { id: 'lily-pad', name: 'Lily Pad', role: 'guards', cost: 25, recharge: 8, health: 100, reach: 0, shape: 'wide', colour: '#4fa86a', blurb: 'Something to stand on where the ground is not.' },
  { id: 'potato-pal', name: 'Potato Pal', role: 'guards', cost: 25, recharge: 20, health: 350, reach: 0, shape: 'squat', colour: '#b98a55', blurb: 'Sits there. Takes it. Says nothing about it.' },
  { id: 'moss-mat', name: 'Moss Mat', role: 'guards', cost: 50, recharge: 10, health: 180, reach: 0, shape: 'wide', colour: '#6f9c46', blurb: 'Soft going. Anything crossing it slows right down.' },
  { id: 'sticky-flower', name: 'Sticky Flower', role: 'guards', cost: 75, recharge: 12, health: 90, reach: 1, shape: 'tall', colour: '#e9a1c8', blurb: 'Gums up the feet of whatever steps next to it.' },
  { id: 'mushroom-bouncer', name: 'Mushroom Bouncer', role: 'guards', cost: 75, recharge: 14, health: 150, reach: 1, shape: 'round', colour: '#d96a6a', blurb: 'Springy. Sends whatever walks into it back a square.' },
  { id: 'vine-trap', name: 'Vine Trap', role: 'guards', cost: 75, recharge: 15, health: 120, reach: 1, shape: 'long', colour: '#3f7d38', blurb: 'Grabs an ankle and holds on until somebody deals with it.' },
  { id: 'thorn-bush', name: 'Thorn Bush', role: 'guards', cost: 100, recharge: 12, health: 200, reach: 1, shape: 'spiky', colour: '#4a6b39', blurb: 'Chewing on it is a bad idea, and they try anyway.' },
  { id: 'cactus-guard', name: 'Cactus Guard', role: 'guards', cost: 125, recharge: 16, health: 250, reach: 1, shape: 'spiky', colour: '#4c8c5a', blurb: 'All spines, no manners. Even the ones that fly think twice.' },
  { id: 'pumpkin-shield', name: 'Pumpkin Shield', role: 'guards', cost: 125, recharge: 25, health: 600, reach: 0, shape: 'round', colour: '#d9741a', blurb: 'A pumpkin around whatever you put it on. Nothing gets through it quickly.' },

  // --- growers: they pay for everything else -------------------------------
  { id: 'sunflower', name: 'Sunflower', role: 'grows', cost: 25, recharge: 6, health: 60, reach: 0, shape: 'tall', colour: '#f5c518', blurb: 'Turns sunshine into seeds. Plant these first, always.' },
  { id: 'daisy', name: 'Daisy', role: 'grows', cost: 50, recharge: 9, health: 60, reach: 0, shape: 'tall', colour: '#f7f3e3', blurb: 'Cheerful, and cheaper than it looks. Drops the odd seed.' },
  { id: 'water-lily', name: 'Water Lily', role: 'grows', cost: 50, recharge: 10, health: 70, reach: 0, shape: 'wide', colour: '#e8b4d8', blurb: 'Floats, and pays for itself twice over if you leave it alone.' },
  { id: 'berry-bush', name: 'Berry Bush', role: 'grows', cost: 75, recharge: 12, health: 100, reach: 0, shape: 'round', colour: '#7c3f8e', blurb: 'Fruits in bunches. Tougher than the other growers.' },
  { id: 'mint-plant', name: 'Mint Plant', role: 'grows', cost: 75, recharge: 15, health: 70, reach: 0, shape: 'tall', colour: '#6fd1a0', blurb: 'Spreads on its own, and the smell puts some pests off entirely.' },
  { id: 'lucky-clover', name: 'Lucky Clover', role: 'grows', cost: 100, recharge: 20, health: 60, reach: 0, shape: 'round', colour: '#57b04f', blurb: 'Sometimes nothing. Sometimes a great many seeds at once.' },
  { id: 'lavender', name: 'Lavender', role: 'grows', cost: 100, recharge: 18, health: 70, reach: 0, shape: 'tall', colour: '#9b8bd4', blurb: 'Calms the lawn. Everything nearby takes its time.' },
  { id: 'rose-bush', name: 'Rose Bush', role: 'grows', cost: 125, recharge: 16, health: 120, reach: 0, shape: 'spiky', colour: '#e0506b', blurb: 'Pays well and defends itself, which is more than the daisy does.' },
  { id: 'bamboo', name: 'Bamboo', role: 'grows', cost: 150, recharge: 22, health: 200, reach: 0, shape: 'tall', colour: '#8fbf5a', blurb: 'Grows while you watch. Hard to chew and harder to stop.' },
  { id: 'magic-mushroom', name: 'Magic Mushroom', role: 'grows', cost: 200, recharge: 30, health: 80, reach: 0, shape: 'round', colour: '#b45ad0', blurb: 'Nobody is sure how it works. The seeds are real.' },

  // --- the animals ---------------------------------------------------------
  { id: 'ladybug', name: 'Ladybug', role: 'eats', cost: 50, recharge: 8, health: 70, reach: 3, shape: 'round', colour: '#e03b3b', blurb: 'Lives on aphids and is delighted about it.' },
  { id: 'rabbit', name: 'Rabbit', role: 'grows', cost: 50, recharge: 10, health: 90, reach: 0, shape: 'squat', colour: '#d8c9a4', blurb: 'Digs. Turns up seeds for everybody, and cannot defend itself.' },
  { id: 'earthworm', name: 'Earthworm', role: 'grows', cost: 50, recharge: 10, health: 80, reach: 0, shape: 'long', colour: '#d78fa0', blurb: 'Works the soil underneath. Everything above it does better.' },
  { id: 'garden-snail', name: 'Garden Snail', role: 'guards', cost: 50, recharge: 12, health: 200, reach: 0, shape: 'round', colour: '#c2a06a', blurb: 'A shell that goes where it likes, eventually. Not the other kind.' },
  { id: 'duck', name: 'Duck', role: 'eats', cost: 75, recharge: 10, health: 130, reach: 4, shape: 'squat', colour: '#e0563f', blurb: 'Snaps up whatever wanders into its lane. The one you always bring.' },
  { id: 'squirrel', name: 'Squirrel', role: 'grows', cost: 75, recharge: 12, health: 90, reach: 0, shape: 'squat', colour: '#b5703a', blurb: 'Buries seeds, then finds most of them again.' },
  { id: 'butterfly', name: 'Butterfly', role: 'grows', cost: 75, recharge: 12, health: 50, reach: 0, shape: 'winged', colour: '#f2a0c9', blurb: 'Pollinates whatever is next to it. Blows away if you look at it.' },
  { id: 'frog', name: 'Frog', role: 'eats', cost: 100, recharge: 12, health: 110, reach: 3, shape: 'squat', colour: '#5d9145', blurb: 'Sits still and takes anything within a few squares, either side.' },
  { id: 'chicken', name: 'Chicken', role: 'eats', cost: 100, recharge: 12, health: 120, reach: 2, shape: 'squat', colour: '#f0e4d0', blurb: 'Pecks anything that gets close. Loud about all of it.' },
  { id: 'bee', name: 'Bee', role: 'grows', cost: 100, recharge: 14, health: 60, reach: 0, shape: 'winged', colour: '#f0c34a', blurb: 'Pollinates the whole row and doubles what it grows.' },
  { id: 'turtle', name: 'Turtle', role: 'guards', cost: 100, recharge: 20, health: 500, reach: 0, shape: 'wide', colour: '#6d8f5a', blurb: 'A shell in the way. Slow to chew through, and that is the whole job.' },
  { id: 'crab', name: 'Crab', role: 'guards', cost: 100, recharge: 14, health: 220, reach: 1, shape: 'wide', colour: '#e2603c', blurb: 'Armoured, sideways, and unreasonably quick with those claws.' },
  { id: 'hedgehog', name: 'Hedgehog', role: 'eats', cost: 125, recharge: 14, health: 180, reach: 1, shape: 'spiky', colour: '#8a6b4f', blurb: 'Eats slugs, and rolls up when anything argues.' },
  { id: 'mole', name: 'Mole', role: 'guards', cost: 125, recharge: 16, health: 150, reach: 0, shape: 'squat', colour: '#5a4b46', blurb: 'Underground until it is not. Whatever was standing there is not either.' },
  { id: 'garden-spider', name: 'Garden Spider', role: 'eats', cost: 125, recharge: 15, health: 90, reach: 2, shape: 'spiky', colour: '#6b5f7a', blurb: 'Strings a web across the lane and waits. Catches the ones that fly.' },
  { id: 'bird', name: 'Bird', role: 'eats', cost: 150, recharge: 16, health: 90, reach: 99, shape: 'winged', colour: '#4aa3d0', blurb: 'Picks things off the whole lane from a perch.' },
  { id: 'otter', name: 'Otter', role: 'eats', cost: 150, recharge: 18, health: 160, reach: 3, shape: 'long', colour: '#8a6a4a', blurb: 'Fast, playful, and completely merciless about snails.' },
  { id: 'goat', name: 'Goat', role: 'eats', cost: 175, recharge: 20, health: 250, reach: 1, shape: 'squat', colour: '#d8d2c4', blurb: 'Eats absolutely anything. The trick is pointing it the right way.' },
  { id: 'penguin', name: 'Penguin', role: 'eats', cost: 175, recharge: 20, health: 180, reach: 2, shape: 'tall', colour: '#2f3a46', blurb: 'Slides in, clears two squares, waddles back. No idea why it is here.' },
  { id: 'garden-gnome', name: 'Garden Gnome', role: 'guards', cost: 250, recharge: 30, health: 400, reach: 1, shape: 'tall', colour: '#c8443c', blurb: 'Has stood in gardens for a hundred years. Now it is helping.' },
] as const

/**
 * The twenty-five.
 *
 * Cheap and quick at the top, slow and enormous at the bottom. None of them is
 * frightening: they are here to be a nuisance, and the difference between a
 * nuisance and a monster is most of what makes this game what it is.
 */
const PEST_LIST = [
  { id: 'mite', name: 'Mite', health: 20, speed: 0.55, bite: 4, moves: 'walks', shape: 'round', colour: '#c98d9b', blurb: 'Barely there. Arrives in absurd numbers anyway.' },
  { id: 'aphid', name: 'Aphid', health: 25, speed: 0.4, bite: 5, moves: 'walks', shape: 'round', colour: '#9cd06a', blurb: 'Sits on a stem and drinks. Multiplies while you are busy.' },
  { id: 'ant', name: 'Ant', health: 30, speed: 0.45, bite: 6, moves: 'walks', shape: 'long', colour: '#8b5a2b', blurb: 'Quick and weak, and there is never one ant.' },
  { id: 'flea', name: 'Flea', health: 35, speed: 0.6, bite: 6, moves: 'hops', shape: 'round', colour: '#7a5c44', blurb: 'Hops the first thing in its way and keeps going.' },
  { id: 'mosquito', name: 'Mosquito', health: 40, speed: 0.5, bite: 9, moves: 'flies', shape: 'winged', colour: '#8e9aa8', blurb: 'Whines. Flies over everything. Universally disliked.' },
  { id: 'fly', name: 'Fly', health: 45, speed: 0.55, bite: 7, moves: 'flies', shape: 'winged', colour: '#5c6570', blurb: 'Loops about being annoying, then lands on something important.' },
  { id: 'moth', name: 'Moth', health: 50, speed: 0.34, bite: 7, moves: 'flies', shape: 'winged', colour: '#cfc3a8', blurb: 'Flies, and goes for the leaves rather than whatever is guarding them.' },
  { id: 'worm', name: 'Worm', health: 60, speed: 0.16, bite: 8, moves: 'walks', shape: 'long', colour: '#d98fa0', blurb: 'Slow and soft. Turns up first, and never alone for long.' },
  { id: 'locust', name: 'Locust', health: 80, speed: 0.5, bite: 13, moves: 'flies', shape: 'winged', colour: '#b6a04a', blurb: 'One is a grasshopper in a hurry. Forty is a problem.' },
  { id: 'grasshopper', name: 'Grasshopper', health: 90, speed: 0.3, bite: 10, moves: 'hops', shape: 'long', colour: '#7cb342', blurb: 'Hops the first thing in its way, then walks like anything else.' },
  { id: 'termite', name: 'Termite', health: 90, speed: 0.24, bite: 18, moves: 'walks', shape: 'long', colour: '#d8c9a4', blurb: 'Ignores the leaves entirely and eats what is holding them up.' },
  { id: 'earwig', name: 'Earwig', health: 100, speed: 0.3, bite: 12, moves: 'walks', shape: 'long', colour: '#6b4a32', blurb: 'Pincers at the back, opinions at the front.' },
  { id: 'spider', name: 'Spider', health: 110, speed: 0.26, bite: 14, moves: 'walks', shape: 'spiky', colour: '#3d3d46', blurb: 'Drops in on a thread, so it can start anywhere down the lane.' },
  { id: 'weevil', name: 'Weevil', health: 110, speed: 0.22, bite: 11, moves: 'walks', shape: 'round', colour: '#6a5a3c', blurb: 'A beetle with a long silly snout, entirely full of itself.' },
  { id: 'caterpillar', name: 'Caterpillar', health: 120, speed: 0.18, bite: 10, moves: 'walks', shape: 'long', colour: '#8fd16a', blurb: 'Eats its own weight before lunch. Concertinas along, pleased.' },
  { id: 'cicada', name: 'Cicada', health: 130, speed: 0.28, bite: 12, moves: 'flies', shape: 'winged', colour: '#6fa3a0', blurb: 'Seventeen years underground and it wants something to show for it.' },
  { id: 'slug', name: 'Slug', health: 150, speed: 0.12, bite: 14, moves: 'walks', shape: 'long', colour: '#a08fa0', blurb: 'A snail that lost the shell and got on with it.' },
  { id: 'centipede', name: 'Centipede', health: 160, speed: 0.35, bite: 15, moves: 'walks', shape: 'long', colour: '#c46a3a', blurb: 'More legs than the situation calls for, all of them moving.' },
  { id: 'snail', name: 'Snail', health: 180, speed: 0.1, bite: 16, moves: 'walks', shape: 'round', colour: '#b08968', blurb: 'Barely moves. Gets there anyway, and eats every leaf on the way.' },
  { id: 'squirrel-thief', name: 'Squirrel Thief', health: 180, speed: 0.55, bite: 15, moves: 'hops', shape: 'squat', colour: '#a05a2c', blurb: 'Not after the lawn. After the seeds, which is worse.' },
  { id: 'crow', name: 'Crow', health: 200, speed: 0.45, bite: 18, moves: 'flies', shape: 'winged', colour: '#2f333a', blurb: 'Watches for a while first. That is the unsettling part.' },
  { id: 'beetle', name: 'Beetle', health: 220, speed: 0.2, bite: 12, moves: 'walks', shape: 'round', colour: '#4a5568', blurb: 'Armoured. Takes a while to shift and does not care what you throw.' },
  { id: 'gopher', name: 'Gopher', health: 260, speed: 0.2, bite: 20, moves: 'walks', shape: 'squat', colour: '#8a6a4a', blurb: 'Comes up under the lawn, so the front row never sees it coming.' },
  { id: 'raccoon', name: 'Raccoon', health: 400, speed: 0.22, bite: 25, moves: 'walks', shape: 'squat', colour: '#6b6f76', blurb: 'Tips everything over looking for something better. Finds it.' },
  { id: 'garden-gremlin', name: 'Garden Gremlin', health: 600, speed: 0.18, bite: 30, moves: 'walks', shape: 'tall', colour: '#7a4fa0', blurb: 'Nobody planted it and nobody invited it. It is having a marvellous time.' },
] as const

export type DefenderId = (typeof DEFENDER_LIST)[number]['id']
export type PestId = (typeof PEST_LIST)[number]['id']

/** Every animal and plant you can plant. Frozen: the shelf reads it constantly. */
export const DEFENDERS: readonly DefenderSpecies[] = Object.freeze(
  DEFENDER_LIST.map((entry) => Object.freeze({ ...entry })),
)

/** Everything that comes for the lawn. */
export const PESTS: readonly PestSpecies[] = Object.freeze(
  PEST_LIST.map((entry) => Object.freeze({ ...entry })),
)

export function isDefenderId(value: unknown): value is DefenderId {
  return DEFENDERS.some((d) => d.id === value)
}

export function isPestId(value: unknown): value is PestId {
  return PESTS.some((p) => p.id === value)
}

/**
 * The entry for an id. Total on the id types.
 *
 * A linear search over fifty, called while drawing - which is fine, and would
 * not be if it were called per pest per frame. The day something does that, it
 * builds a map once instead of this growing a cache nobody can see.
 */
export function defenderById(id: DefenderId): DefenderSpecies {
  return DEFENDERS.find((d) => d.id === id) ?? DEFENDERS[0]
}

export function pestById(id: PestId): PestSpecies {
  return PESTS.find((p) => p.id === id) ?? PESTS[0]
}

/**
 * One creature on the lawn.
 *
 * The base of both sides. It knows what it is, where it is, and how much of it
 * is left - and nothing else, because that is the whole of what a Pea Shooter
 * and a Raccoon have in common.
 *
 * `col` is deliberately a number rather than an integer: a defender sits in a
 * square and a pest walks between them, so a pest's column is 6.4 for most of
 * its life. `square` is the one it is standing in.
 */
export abstract class GardenPiece {
  /** Which side it is on. Set by the subclass; the base never asks. */
  abstract readonly side: 'defence' | 'pest'

  health: number

  constructor(
    readonly species: Species,
    public row: number,
    public col: number,
  ) {
    this.health = species.health
  }

  get id(): string {
    return this.species.id
  }

  get name(): string {
    return this.species.name
  }

  get colour(): string {
    return this.species.colour
  }

  get shape(): Shape {
    return this.species.shape
  }

  /** The square it is standing in, whatever fraction of one it has crossed. */
  get square(): { row: number; col: number } {
    return { row: Math.round(this.row), col: Math.floor(this.col) }
  }

  get alive(): boolean {
    return this.health > 0
  }

  /**
   * Takes a hit.
   *
   * Clamped at zero rather than going negative: nothing is deader than dead,
   * and a health of -40 is a number that leaks into anything that later wants
   * to draw a health bar.
   */
  hurt(amount: number): void {
    if (!(amount > 0)) return
    this.health = Math.max(0, this.health - amount)
  }

  /** How much of it is left, 0 to 1. For a health bar, when there is one. */
  get condition(): number {
    return this.species.health > 0 ? this.health / this.species.health : 0
  }
}

/** Something you planted. It stays in the square you put it in. */
export class Defender extends GardenPiece {
  readonly side = 'defence' as const

  constructor(
    readonly kind: DefenderSpecies,
    row: number,
    col: number,
    /** Who planted it. The lawn is shared, so this is worth keeping. */
    readonly planter: string | null = null,
  ) {
    super(kind, row, col)
  }

  get cost(): number {
    return this.kind.cost
  }

  /** Whether it is the kind that turns up seeds for the shared pot. */
  get enriches(): boolean {
    return this.kind.role === 'grows'
  }
}

/** Something that came for the lawn. It walks the lane it arrived in. */
export class Pest extends GardenPiece {
  readonly side = 'pest' as const

  constructor(
    readonly kind: PestSpecies,
    row: number,
    col: number,
  ) {
    super(kind, row, col)
  }

  /** Whether anything on the ground can stop it. */
  get flies(): boolean {
    return this.kind.moves === 'flies'
  }
}
