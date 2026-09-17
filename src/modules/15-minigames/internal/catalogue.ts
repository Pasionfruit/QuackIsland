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
 * `BUILD_STEPS`. A game with none of them done is a name, a description and a
 * list of controls; a game with all three is playable. Nothing below has
 * started, which is exactly as far as this pass goes.
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
  /**
   * How the game is played, a paragraph at a time. Empty on a reserved slot.
   *
   * Not shown on the dashboard - forty-one tiles each carrying a paragraph is
   * a wall of text nobody reads, and the grid is for picking a game rather
   * than for reading about one. It lives behind the game's own screen, under
   * the tab of the same name.
   */
  description: readonly string[]
  /** What the player presses. Empty until the controls pass has been done. */
  controls: readonly Control[]
  /**
   * A slot with a number and no game in it yet. Its description and controls
   * are empty, and none of its stages can be started until somebody names it.
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
    description: [
      'Survive as long as you can while six zombies chase everybody around an enclosed arena full of obstacles. All of you spawn in the middle, and everything is solid - bodies included.',
      'Get caught and you become a zombie and join the chase.',
      'Players move twice as fast as zombies, and can push each other to disrupt an escape. A push has a three second cooldown and puts whoever it lands on down for one second.',
      'The last surviving player wins. The camera never moves - the whole arena is in front of you the entire round.',
    ],
    controls: [
      { input: 'WASD', does: 'Move' },
      { input: 'Space', does: 'Push' },
    ],
    reserved: false,
    // Built: see `16-zombie-tag`. The assets stage is still to do - every body
    // is a coloured circle and every crate a brown rectangle.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'messy-maze',
    number: 2,
    title: 'Messy Maze',
    kind: 'free-for-all',
    description: [
      'Everybody starts in a different corner and races for the centre.',
      'Two spinning platforms sit in the way, and stepping on one rebinds your movement to different letters at random. You place in the order you reach the middle.',
    ],
    controls: [{ input: 'WASD / assigned keys', does: 'Move' }],
    reserved: false,
    // Built: see `17-messy-maze`. The assets stage is still to do - every
    // racer is the island's capsule and every wall a box.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'probable-stop',
    number: 3,
    title: 'Probable Stop',
    kind: 'free-for-all',
    description: [
      'Six rounds, three paths each. Pick one, and keep changing your mind until the countdown runs out.',
      'The first four rounds give you two chances in three. The last two give you one in three. Survive a round and you go through to the next.',
    ],
    controls: [
      { input: 'WASD', does: 'Move between choices' },
      { input: 'Mouse', does: 'Select or change path' },
      { input: 'Space', does: 'Confirm' },
    ],
    reserved: false,
    // Built: see `18-probable-stop`. The assets stage is still to do - the
    // players are the island's capsule and the bridges are planks.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'duck-hunt',
    number: 4,
    title: 'Duck Hunt',
    kind: 'free-for-all',
    description: [
      'Balloons drift up around the arena, each one wearing somebody\'s colour. Shoot the ones that are yours and leave everybody else\'s alone.',
      'Half a second between shots, so a miss still costs you. Most correct pops wins.',
    ],
    controls: [
      { input: 'Mouse', does: 'Aim' },
      { input: 'Left click', does: 'Shoot' },
    ],
    reserved: false,
    // Built: see `19-duck-hunt`. The assets stage is still to do - balloons
    // are spheres with a flat shape on them.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'pet-race',
    number: 5,
    title: 'Pet Race',
    kind: 'free-for-all',
    description: [
      'Pick a dog, a cat, a rabbit, a hamster or a fish. Each has its own speed and its own stamina, and none of them is simply the best one.',
      'Twenty seconds of countdown, and then race for the line.',
    ],
    controls: [{ input: 'WASD', does: 'Move' }],
    reserved: false,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'feeding-time',
    number: 6,
    title: 'Feeding Time',
    kind: 'free-for-all',
    description: [
      'Ducks on a pond and a handful of crackers. Hold the button and flick the mouse from the bottom of the screen to the top to throw one.',
      'Whoever feeds the most ducks wins.',
    ],
    controls: [{ input: 'Left click + drag', does: 'Throw a cracker' }],
    reserved: false,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'sprint-triathlon',
    number: 7,
    title: 'Sprint Triathlon',
    kind: 'free-for-all',
    description: [
      'Three legs, back to back. Swim by clicking as fast as you can. Bike by hammering space. Then run, by typing the sentence out without getting it wrong:',
      'Duck walked up to a lemonade stand, and he said to the man running the stand, hey! Got any grapes?',
      'How you did across all three is your time.',
    ],
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
    description: [
      'A floating platform and a pair of fists that come off. Click to shoot a punch out, click again to pull it back.',
      'A punch that lands on somebody knocks them out of the round. Thirty seconds on the clock.',
    ],
    controls: [
      { input: 'WASD', does: 'Move' },
      { input: 'Left click', does: 'Extend or retract the punch' },
    ],
    reserved: false,
    // Built: see `20-punch-buggy`. The assets stage is still to do - the
    // fighters are the island's capsule and the fists are spheres.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'time-it',
    number: 9,
    title: 'Time It',
    kind: 'free-for-all',
    description: [
      'A stopwatch runs and you have to stop it on the target. You can watch it for the first two and a half seconds, and then it shuts and you are on your own.',
      'The target is never under six and a half seconds. Closest wins. The round ends when everybody has stopped, or at thirty seconds, whichever comes first.',
    ],
    controls: [{ input: 'Left click', does: 'Stop the stopwatch' }],
    reserved: false,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'wack-attack',
    number: 10,
    title: 'Wack-Attack',
    kind: 'free-for-all',
    description: [
      'Sixteen holes, moles coming out of them, and everybody walking about with a hammer.',
      'An ordinary mole is worth what it is worth. The golden one is worth more and gives you far less time to get to it.',
    ],
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
    description: [
      'A field of three-leaf clovers with exactly three four-leaf clovers hidden in it. Search, and click what you find.',
      'Claiming one rings it in your colour and shuts everybody else out of it.',
    ],
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
    description: [
      'Your face goes under a cup, and then the cups shuffle. Three stages, each one faster than the last, and you pick your cup at the end of each.',
      'The first stage is worth a point, the second two, the third three.',
    ],
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
    description: [
      'Everybody gets three strings, and there is one eliminating string for every player but one. A random player goes first.',
      'Cut a string. Cut an eliminating one and you go off the side of the tower.',
    ],
    controls: [],
    reserved: false,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'hes-one-shot',
    number: 14,
    title: "He's One Shot",
    kind: 'free-for-all',
    description: [
      'First person, everybody against everybody, with a gun that needs a moment between shots. A minute and fifteen on the clock.',
      'Being eliminated does not take you out of it - you stay in and keep hunting. The last player to go wins.',
    ],
    controls: [],
    reserved: false,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'wheres-midnight',
    number: 15,
    title: "Where's Midnight?",
    kind: 'free-for-all',
    description: [
      'A junkyard at night, and an all-black cat called Midnight somewhere in it.',
      'Drag and zoom around the scene until you find her. You place in the order everybody does.',
    ],
    controls: [],
    reserved: false,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'let-him-cook',
    number: 16,
    title: 'Let Him Cook',
    kind: 'free-for-all',
    description: [
      'Watch the chef cook a recipe from fifteen items across six ingredients, and remember what went into the pot.',
      'Then take turns, in a random order, choosing an ingredient. Choose one that was not in the recipe, or one whose every copy has already been claimed, and you are out. Choose right and you go to the back of the line. Last cook standing wins.',
    ],
    controls: [
      { input: 'Mouse', does: 'Aim' },
      { input: 'Left click', does: 'Select an ingredient' },
    ],
    reserved: false,
    // Built: see `22-let-him-cook`. The assets stage is still to do - the chef
    // is the island's capsule in a hat and the ingredients are primitives.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'i-see-the-light',
    number: 17,
    title: 'I See The Light',
    kind: 'free-for-all',
    description: [
      'Red light, green light. On green, hammer space to get yourself forward.',
      'On red, hold your cursor inside a floating circle that will not stay still. Let it slip out, or touch space while the light is red, and you are out.',
    ],
    controls: [
      { input: 'Space', does: 'Move forward during green light' },
      { input: 'Mouse', does: 'Keep the cursor inside the circle during red light' },
    ],
    reserved: false,
    // Built: see `21-i-see-the-light`. The assets stage is still to do - the
    // racers are the island's capsule and the light is two discs.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'helping-dad',
    number: 18,
    title: 'Helping Dad',
    kind: 'free-for-all',
    description: [
      'A torch in your own colour, and a puzzle in the dark. Go slowly.',
      'Walk into a wall and you get shouted at, and stand there stunned for a second and a half while everybody else gets on with it.',
    ],
    controls: [],
    reserved: false,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'synchronize-steps',
    number: 19,
    title: 'Synchronize Steps',
    kind: 'free-for-all',
    description: [
      'Twenty steps down, and every two seconds everybody picks 1, 4 or 6.',
      'If exactly two of you pick the same number, you both move that far. If three or more do, all of you drop eight. Match nobody and you stay exactly where you are.',
      'Where you end up, top to bottom, is where you place.',
    ],
    controls: [],
    reserved: false,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'sharing-is-caring',
    number: 20,
    title: 'Sharing Is Caring',
    kind: 'free-for-all',
    description: [
      'Tag, backwards. A crown sits in the middle, and the first player to grab it starts scoring.',
      'Bump into whoever is wearing it to take it off them. After a minute, whoever held it longest wins.',
    ],
    controls: [],
    reserved: false,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'keyboard-warrior',
    number: 21,
    title: 'Keyboard Warrior',
    kind: 'free-for-all',
    description: [
      'Letters float into the arena one at a time.',
      'Each is worth a point to whoever types it correctly first, and you get exactly one attempt at each.',
    ],
    controls: [],
    reserved: false,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'tetris-master',
    number: 22,
    title: 'Tetris Master',
    kind: 'free-for-all',
    description: [
      'Blocks of awkward shapes, one tower each. Build it high and build it stable.',
      'Earthquakes and worse are coming for it. The best tower still standing at the end wins.',
    ],
    controls: [],
    reserved: false,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'reserved-23',
    number: 23,
    title: 'Free slot',
    kind: 'free-for-all',
    description: [],
    controls: [],
    reserved: true,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'reserved-24',
    number: 24,
    title: 'Free slot',
    kind: 'free-for-all',
    description: [],
    controls: [],
    reserved: true,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'short-song-rhythm',
    number: 25,
    title: 'Short Song Rhythm',
    kind: 'free-for-all',
    description: [
      'A short song, ten rounds of rhythm, and three things you can hit: left click, right click, or both at once.',
      'How close you are to the beat is your score.',
    ],
    controls: [],
    reserved: false,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'make-some-noise',
    number: 26,
    title: 'Make Some Noise',
    kind: 'one-vs-all',
    description: [
      'You are a duck on a floating island with one minute to wreck as much of it as you possibly can.',
      'Different parts of the island are worth different amounts. Fall off the edge and your turn ends that instant.',
    ],
    controls: [],
    reserved: false,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'perfect-game',
    number: 27,
    title: 'Perfect Game',
    kind: 'one-vs-all',
    description: [
      'A bent column of thirty crabs sways left and right in front of you.',
      'Fifteen seconds to set where you stand and the angle of your coconut roll, and then you let it go. Every crab it hits is a point.',
    ],
    controls: [],
    reserved: false,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'chef-caricature',
    number: 28,
    title: 'Chef Caricature',
    kind: 'one-vs-all',
    description: [
      'You get the outline of an ingredient or a dish, and forty-five seconds to trace as many of them as you can.',
      'Cover at least three quarters of an outline and a duck accepts the drawing and eats it for a point.',
      'There is no erasing, and letting go before an outline is finished wipes what you had.',
    ],
    controls: [],
    reserved: false,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'reserved-29',
    number: 29,
    title: 'Free slot',
    kind: 'one-vs-all',
    description: [],
    controls: [],
    reserved: true,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'reserved-30',
    number: 30,
    title: 'Free slot',
    kind: 'one-vs-all',
    description: [],
    controls: [],
    reserved: true,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'reserved-31',
    number: 31,
    title: 'Free slot',
    kind: 'free-for-all',
    description: [],
    controls: [],
    reserved: true,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'reserved-32',
    number: 32,
    title: 'Free slot',
    kind: 'free-for-all',
    description: [],
    controls: [],
    reserved: true,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'reserved-33',
    number: 33,
    title: 'Free slot',
    kind: 'free-for-all',
    description: [],
    controls: [],
    reserved: true,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'reserved-34',
    number: 34,
    title: 'Free slot',
    kind: 'free-for-all',
    description: [],
    controls: [],
    reserved: true,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'reserved-35',
    number: 35,
    title: 'Free slot',
    kind: 'free-for-all',
    description: [],
    controls: [],
    reserved: true,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'reserved-36',
    number: 36,
    title: 'Free slot',
    kind: 'one-vs-all',
    description: [],
    controls: [],
    reserved: true,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'reserved-37',
    number: 37,
    title: 'Free slot',
    kind: 'one-vs-all',
    description: [],
    controls: [],
    reserved: true,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'reserved-38',
    number: 38,
    title: 'Free slot',
    kind: 'one-vs-all',
    description: [],
    controls: [],
    reserved: true,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'reserved-39',
    number: 39,
    title: 'Free slot',
    kind: 'one-vs-all',
    description: [],
    controls: [],
    reserved: true,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'reserved-40',
    number: 40,
    title: 'Free slot',
    kind: 'one-vs-all',
    description: [],
    controls: [],
    reserved: true,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'reserved-41',
    number: 41,
    title: 'Free slot',
    kind: 'one-vs-all',
    description: [],
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
