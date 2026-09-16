/**
 * Every minigame Volcano Island is going to have, as data.
 *
 * Forty-one slots: thirty free-for-all, eleven one-vs-all. The numbers are the
 * ones the games were written down with and they do not move - somebody says
 * "let us do fourteen next" and fourteen has to still be `He's One Shot` a
 * month later. That is why a slot nobody has named yet is a **reserved** entry
 * with a number rather than a gap: the count is the plan, and the dashboard
 * draws the plan rather than only the part of it that exists.
 *
 * Pure, and nothing in here plays anything. A minigame becomes playable by
 * registering a build against its id - see `registry.ts` - and until it does,
 * its entry is all there is and the screen draws a template from it.
 *
 * **Every game is built in the same three stages, in the same order** - see
 * `BUILD_STEPS`. A game with none of them done is a name and a pitch; a game
 * with all three is playable. Nothing below has started, which is exactly as
 * far as this pass goes.
 */

/**
 * Who plays at once.
 *
 * `free-for-all` is everybody in the arena together. `one-vs-all` is one
 * player at a time with the rest watching - a turn order, and a score to beat.
 */
export type MinigameKind = 'free-for-all' | 'one-vs-all'

/**
 * The three stages of building a minigame, in the order they get built.
 *
 * - **environment** - the game's own state, and the place it happens in. What
 *   there is, where it is, and what changes over a round.
 * - **controls** - the inputs wired into that state. What a player presses,
 *   and what it does to the thing the first stage built.
 * - **assets** - everything the first two do not need to be correct. Models,
 *   sprites, sound. Last, because a game that is not fun with capsules is not
 *   going to be fun with models.
 *
 * The order matters and the split is the point: forty-one games is too many to
 * build end to end one at a time, and this is what lets a game be half built
 * without being broken.
 */
export type BuildStep = 'environment' | 'controls' | 'assets'

/** The three, in order. Iterate this rather than writing the names out. */
export const BUILD_STEPS: readonly BuildStep[] = Object.freeze([
  'environment',
  'controls',
  'assets',
])

/** One line of the controls list: what you press, and what it does. */
export interface Control {
  input: string
  does: string
}

export interface Minigame {
  /**
   * Stable, kebab-case, and never reused - the key a build registers against.
   *
   * Narrow on purpose: `MinigameId` is derived from the list below, so an id
   * that is not in the catalogue does not typecheck anywhere it is passed.
   */
  id: MinigameId
  /** The number it was written down with. Unique across both kinds. */
  number: number
  title: string
  kind: MinigameKind
  /** One line under the title on a dashboard tile. Empty on a reserved slot. */
  pitch: string
  /** What the player presses. Empty until the controls pass has been done. */
  controls: readonly Control[]
  /**
   * A slot with a number and no game in it yet. Its title and pitch are empty
   * and none of its stages can be started until somebody names it.
   */
  reserved: boolean
  /** Which of the three stages are finished. All three means playable. */
  done: Readonly<Record<BuildStep, boolean>>
}

/**
 * How many of each kind there are meant to be, in the end.
 *
 * Held as a number rather than left implicit in the length of the list,
 * because a reserved slot going missing is exactly the kind of quiet loss a
 * test should catch. There is one that does.
 */
export const MINIGAME_TARGET: Readonly<Record<MinigameKind, number>> = Object.freeze({
  'free-for-all': 30,
  'one-vs-all': 11,
})

const ENTRIES = [
  {
    id: 'zombie-tag',
    number: 1,
    title: 'Zombie Tag',
    kind: 'free-for-all',
    pitch: 'Six zombies, one walled arena. Get caught and you join them.',
    controls: [
      { input: 'WASD', does: 'Move' },
      { input: 'Space', does: 'Push' },
    ],
    reserved: false,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'messy-maze',
    number: 2,
    title: 'Messy Maze',
    kind: 'free-for-all',
    pitch: 'Four corners, one centre, and platforms that rebind your keys on the way.',
    controls: [{ input: 'WASD / assigned keys', does: 'Move' }],
    reserved: false,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'probable-stop',
    number: 3,
    title: 'Probable Stop',
    kind: 'free-for-all',
    pitch: 'Six rounds, three paths, and odds that turn against you at the end.',
    controls: [
      { input: 'WASD', does: 'Move between choices' },
      { input: 'Mouse', does: 'Select or change path' },
      { input: 'Space', does: 'Confirm' },
    ],
    reserved: false,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'duck-hunt',
    number: 4,
    title: 'Duck Hunt',
    kind: 'free-for-all',
    pitch: 'Pop only the balloons wearing your colour. A second and a half between shots.',
    controls: [
      { input: 'Mouse', does: 'Aim' },
      { input: 'Left click', does: 'Shoot' },
    ],
    reserved: false,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'pet-race',
    number: 5,
    title: 'Pet Race',
    kind: 'free-for-all',
    pitch: 'Dog, cat, rabbit, hamster or fish. They do not run the same.',
    controls: [{ input: 'WASD', does: 'Move' }],
    reserved: false,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'feeding-time',
    number: 6,
    title: 'Feeding Time',
    kind: 'free-for-all',
    pitch: 'Fling crackers across the pond. Whoever feeds the most ducks wins.',
    controls: [{ input: 'Left click + drag', does: 'Throw a cracker' }],
    reserved: false,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'sprint-triathlon',
    number: 7,
    title: 'Sprint Triathlon',
    kind: 'free-for-all',
    pitch: 'Swim by clicking, bike by mashing, run by typing. Got any grapes?',
    controls: [
      { input: 'Left click', does: 'Swim' },
      { input: 'Space', does: 'Bike' },
      { input: 'Keyboard', does: 'Type the sentence' },
    ],
    reserved: false,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'punch-buggy',
    number: 8,
    title: 'Punch Buggy',
    kind: 'free-for-all',
    pitch: 'Extendable fists on a floating platform. One clean hit ends somebody.',
    controls: [
      { input: 'WASD', does: 'Move' },
      { input: 'Left click', does: 'Extend or retract the punch' },
    ],
    reserved: false,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'time-it',
    number: 9,
    title: 'Time It',
    kind: 'free-for-all',
    pitch: 'The stopwatch closes after two and a half seconds. Stop it anyway.',
    controls: [{ input: 'Left click', does: 'Stop the stopwatch' }],
    reserved: false,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'wack-attack',
    number: 10,
    title: 'Wack-Attack',
    kind: 'free-for-all',
    pitch: 'Sixteen holes, a hammer each, and a golden mole that will not wait.',
    controls: [
      { input: 'WASD', does: 'Move' },
      { input: 'Left click', does: 'Swing the hammer' },
    ],
    reserved: false,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'lady-luck',
    number: 11,
    title: 'Lady Luck',
    kind: 'free-for-all',
    pitch: 'Three four-leaf clovers hidden in a field of threes. Claim one and it is yours.',
    controls: [
      { input: 'Mouse', does: 'Aim' },
      { input: 'Left click', does: 'Pick a clover' },
    ],
    reserved: false,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'find-yourself',
    number: 12,
    title: 'Find Yourself',
    kind: 'free-for-all',
    pitch: 'Your face under a cup, three shuffles, each one worth more than the last.',
    controls: [
      { input: 'Mouse', does: 'Aim' },
      { input: 'Left click', does: 'Pick a cup' },
    ],
    reserved: false,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'make-the-cut',
    number: 13,
    title: 'Make The Cut',
    kind: 'free-for-all',
    pitch: 'Strings over a tower. Cut the wrong one and you go over the side.',
    controls: [],
    reserved: false,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'hes-one-shot',
    number: 14,
    title: "He's One Shot",
    kind: 'free-for-all',
    pitch: 'First-person free-for-all. Being out does not stop you hunting.',
    controls: [],
    reserved: false,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'wheres-midnight',
    number: 15,
    title: "Where's Midnight?",
    kind: 'free-for-all',
    pitch: 'A black cat in a night junkyard. Drag, zoom, and find her first.',
    controls: [],
    reserved: false,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'let-him-cook',
    number: 16,
    title: 'Let Him Cook',
    kind: 'free-for-all',
    pitch: 'One chef, six ingredients, fifteen dishes, and everybody else remembering.',
    controls: [],
    reserved: false,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'i-see-the-light',
    number: 17,
    title: 'I See The Light',
    kind: 'free-for-all',
    pitch: 'Green light: mash. Red light: hold the cursor in the circle and do not twitch.',
    controls: [],
    reserved: false,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'helping-dad',
    number: 18,
    title: 'Helping Dad',
    kind: 'free-for-all',
    pitch: 'A torch in your colour, a dark puzzle, and a shout every time you hit a wall.',
    controls: [],
    reserved: false,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'synchronize-steps',
    number: 19,
    title: 'Synchronize Steps',
    kind: 'free-for-all',
    pitch: 'One, four or six steps down. Match one player and you move; match two and you fall.',
    controls: [],
    reserved: false,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'sharing-is-caring',
    number: 20,
    title: 'Sharing Is Caring',
    kind: 'free-for-all',
    pitch: 'Reverse tag for a crown. Hold it longest in a minute.',
    controls: [],
    reserved: false,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'keyboard-warrior',
    number: 21,
    title: 'Keyboard Warrior',
    kind: 'free-for-all',
    pitch: 'A letter appears. One try each. The fastest correct key takes it.',
    controls: [],
    reserved: false,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'tetris-master',
    number: 22,
    title: 'Tetris Master',
    kind: 'free-for-all',
    pitch: 'Stack a tower out of awkward blocks, then survive the earthquake.',
    controls: [],
    reserved: false,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'reserved-23',
    number: 23,
    title: 'Free slot',
    kind: 'free-for-all',
    pitch: '',
    controls: [],
    reserved: true,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'reserved-24',
    number: 24,
    title: 'Free slot',
    kind: 'free-for-all',
    pitch: '',
    controls: [],
    reserved: true,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'short-song-rhythm',
    number: 25,
    title: 'Short Song Rhythm',
    kind: 'free-for-all',
    pitch: 'Ten rounds of a short song, on left click, right click, or both at once.',
    controls: [],
    reserved: false,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'make-some-noise',
    number: 26,
    title: 'Make Some Noise',
    kind: 'one-vs-all',
    pitch: 'A duck, a floating island, and a minute to break as much of it as possible.',
    controls: [],
    reserved: false,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'perfect-game',
    number: 27,
    title: 'Perfect Game',
    kind: 'one-vs-all',
    pitch: 'Thirty crabs in a swaying column. One coconut, fifteen seconds to aim it.',
    controls: [],
    reserved: false,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'chef-caricature',
    number: 28,
    title: 'Chef Caricature',
    kind: 'one-vs-all',
    pitch: 'Trace the outline in one unbroken stroke. Cover enough of it and the duck eats it.',
    controls: [],
    reserved: false,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'reserved-29',
    number: 29,
    title: 'Free slot',
    kind: 'one-vs-all',
    pitch: '',
    controls: [],
    reserved: true,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'reserved-30',
    number: 30,
    title: 'Free slot',
    kind: 'one-vs-all',
    pitch: '',
    controls: [],
    reserved: true,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'reserved-31',
    number: 31,
    title: 'Free slot',
    kind: 'free-for-all',
    pitch: '',
    controls: [],
    reserved: true,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'reserved-32',
    number: 32,
    title: 'Free slot',
    kind: 'free-for-all',
    pitch: '',
    controls: [],
    reserved: true,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'reserved-33',
    number: 33,
    title: 'Free slot',
    kind: 'free-for-all',
    pitch: '',
    controls: [],
    reserved: true,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'reserved-34',
    number: 34,
    title: 'Free slot',
    kind: 'free-for-all',
    pitch: '',
    controls: [],
    reserved: true,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'reserved-35',
    number: 35,
    title: 'Free slot',
    kind: 'free-for-all',
    pitch: '',
    controls: [],
    reserved: true,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'reserved-36',
    number: 36,
    title: 'Free slot',
    kind: 'one-vs-all',
    pitch: '',
    controls: [],
    reserved: true,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'reserved-37',
    number: 37,
    title: 'Free slot',
    kind: 'one-vs-all',
    pitch: '',
    controls: [],
    reserved: true,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'reserved-38',
    number: 38,
    title: 'Free slot',
    kind: 'one-vs-all',
    pitch: '',
    controls: [],
    reserved: true,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'reserved-39',
    number: 39,
    title: 'Free slot',
    kind: 'one-vs-all',
    pitch: '',
    controls: [],
    reserved: true,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'reserved-40',
    number: 40,
    title: 'Free slot',
    kind: 'one-vs-all',
    pitch: '',
    controls: [],
    reserved: true,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'reserved-41',
    number: 41,
    title: 'Free slot',
    kind: 'one-vs-all',
    pitch: '',
    controls: [],
    reserved: true,
    done: { environment: false, controls: false, assets: false },
  },
] as const

/**
 * Every id there is, as a type.
 *
 * Derived from the list rather than written out beside it, so registering a
 * build against a game that does not exist - or against a name that has since
 * been spelled differently - is a compile error rather than a tile that never
 * lights up.
 */
export type MinigameId = (typeof ENTRIES)[number]['id']

/** The whole catalogue, in number order. */
export const MINIGAMES: readonly Minigame[] = ENTRIES

const BY_ID = new Map<MinigameId, Minigame>(MINIGAMES.map((game) => [game.id, game]))

export function isMinigameId(value: unknown): value is MinigameId {
  return typeof value === 'string' && BY_ID.has(value as MinigameId)
}

/**
 * The entry for an id.
 *
 * Total on `MinigameId` - anything that got past `isMinigameId` is in the map -
 * so callers do not each carry their own "or else".
 */
export function minigameById(id: MinigameId): Minigame {
  return BY_ID.get(id) ?? MINIGAMES[0]
}

/** Every game of one kind, in number order. */
export function minigamesOfKind(kind: MinigameKind): readonly Minigame[] {
  return MINIGAMES.filter((game) => game.kind === kind)
}

/** How many of the three stages a game has finished: 0 to 3. */
export function stepsDone(game: Minigame): number {
  return BUILD_STEPS.filter((step) => game.done[step]).length
}

/**
 * The stage this game is up to, or `null` when there is nothing left to do.
 *
 * The **first unfinished** one rather than the furthest along, because the
 * three are in dependency order: controls wired to an environment that does
 * not exist yet are controls that cannot be tested.
 */
export function nextStep(game: Minigame): BuildStep | null {
  if (game.reserved) return null
  return BUILD_STEPS.find((step) => !game.done[step]) ?? null
}

/** All three stages finished. The only thing that counts as playable. */
export function isPlayable(game: Minigame): boolean {
  return !game.reserved && stepsDone(game) === BUILD_STEPS.length
}

/**
 * How far the whole catalogue has got: how many games have each stage done,
 * and how many are named at all. What the dashboard counts in its header.
 */
export function progress(games: readonly Minigame[] = MINIGAMES): {
  slots: number
  named: number
  reserved: number
  playable: number
  steps: Record<BuildStep, number>
} {
  const steps: Record<BuildStep, number> = { environment: 0, controls: 0, assets: 0 }
  let named = 0
  let playable = 0
  for (const game of games) {
    if (game.reserved) continue
    named += 1
    if (isPlayable(game)) playable += 1
    for (const step of BUILD_STEPS) if (game.done[step]) steps[step] += 1
  }
  return { slots: games.length, named, reserved: games.length - named, playable, steps }
}
