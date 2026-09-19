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
  'free-for-all': 35,
  'one-vs-all': 11,
})

const ENTRIES = [
  {
    id: 'zombie-tag',
    number: 1,
    title: 'Zombie Tag',
    kind: 'free-for-all',
    description: [
      'Six zombies chase everybody round a walled arena full of crates. You all start in the middle, and everything is solid - bodies included.',
      'Get caught and you turn into a zombie and join the chase.',
      'You move twice as fast as a zombie. Space shoves whoever is next to you and knocks them down for a second - handy for leaving somebody behind - and then needs three seconds before it works again.',
      'Last one still running wins. The camera never moves: the whole arena is in front of you all round.',
    ],
    controls: [
      { input: 'WASD / Arrow keys', does: 'Move' },
      { input: 'Space', does: 'Push whoever is next to you (3 second cooldown)' },
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
      'Everybody starts in a different corner of a maze and races for the middle.',
      'Spinning platforms sit along the way, and stepping on one spins you and swaps your four movement keys for random letters - the new ones are shown on screen. The middle only counts once you have been spun by two different platforms.',
      'You place in the order you reach the middle. The race ends when three are in, thirty seconds after the first gets there, or at four minutes.',
    ],
    controls: [
      { input: 'WASD', does: 'Move, until a platform changes your keys' },
      { input: 'Letters on screen', does: 'Your new up, left, down and right after a spin' },
    ],
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
      'Six rounds, three bridges each. You have five seconds to stand on one, and you can change your mind as often as you like until the time runs out.',
      'Then everybody walks across. In the first four rounds two of the three bridges hold; in the last two only one does. A bridge that does not hold snaps and drops whoever is on it.',
      'Survive all six rounds, or be the last one left, to win.',
    ],
    controls: [
      { input: 'A / D or Arrow keys', does: 'Move to the bridge on the left or right' },
      { input: 'Left click', does: 'Step onto a bridge - click it again to confirm' },
      { input: 'Space', does: 'Confirm - the wait ends early once everybody has' },
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
      'Balloons float up round the arena in waves, each one in somebody\'s colour and shape. Shoot yours and leave everybody else\'s alone.',
      'One of yours is a point. One of somebody else\'s takes a point off them and gives you nothing. Every shot, hit or miss, costs half a second before you can shoot again. Most points after a minute wins.',
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
      'Ten seconds to read the table and pick a pet - dog, cat, rabbit, hamster or fish. Each has its own speed, grip, boost and stamina, and none of them is simply the best. Pick nothing and you get the fish, which flops on the line for the whole race.',
      'Then three, two, one, and thirty seconds to race down a course of hedges, puddles and treats. Hold the button to boost: it drains your stamina, and letting go lets it fill again. Treats top it up.',
      'The race ends when three are home, everybody is, or the thirty seconds run out. Finishers place by time, everybody else by how far they got.',
    ],
    controls: [
      { input: 'Left click / 1-5', does: 'Choose a pet from the table' },
      { input: 'WASD / Arrow keys', does: 'Steer' },
      { input: 'Hold left click', does: 'Boost - burns stamina' },
    ],
    reserved: false,
    // Built: see `38-pet-race`. The assets stage is still to do - the five
    // animals are boxes, balls and cones, and the hedges are bushes.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'feeding-time',
    number: 6,
    title: 'Feeding Time',
    kind: 'free-for-all',
    description: [
      'Ducks swim about a pond and you stand on the bank with a pocket of crackers. Point where you want to throw, hold the left button to charge the power meter and let go to throw - the longer you hold, the further it goes.',
      'A cracker that lands near a duck feeds it for a point, and that duck is busy eating for a moment. You can throw again a quarter of a second later. Most ducks fed after a minute wins.',
    ],
    controls: [
      { input: 'Mouse', does: 'Aim at the water' },
      { input: 'Hold left click, release', does: 'Charge the power meter, then throw' },
    ],
    reserved: false,
    // Built: see `28-feeding-time`. The assets stage is still to do - the ducks
    // and crackers are primitives.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'sprint-triathlon',
    number: 7,
    title: 'Sprint Triathlon',
    kind: 'free-for-all',
    description: [
      'Three legs, back to back. Swim by clicking - sixty strokes. Bike by pressing space - eighty turns of the pedals. Then run by typing the sentence on the screen, like this one:',
      'Duck walked up to a lemonade stand, and he said to the man running the stand, hey! Got any grapes?',
      'Every right key is a stride; a wrong one trips you up for a moment. The race ends when three have finished, or at two and a half minutes. Fastest time wins.',
    ],
    controls: [
      { input: 'Left click', does: 'Swim' },
      { input: 'Space', does: 'Bike' },
      { input: 'Keyboard', does: 'Type the sentence to run' },
    ],
    reserved: false,
    // Built: see `26-sprint-triathlon`. The assets stage is still to do - the
    // racers are the island's capsule and the bikes are primitives.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'punch-buggy',
    number: 8,
    title: 'Punch Buggy',
    kind: 'free-for-all',
    description: [
      'A round platform over the sea, and a fist that comes off. Face the pointer, click to shoot your punch out, and click again to pull it back.',
      'A fist that hits somebody in the side or back knocks them out. One that meets their front, where their own fist is, is blocked and only shoves them - but a shove off the edge is out too. After ten seconds the platform starts to shrink.',
      'Last one standing wins. Thirty seconds on the clock.',
    ],
    controls: [
      { input: 'WASD', does: 'Move' },
      { input: 'Mouse', does: 'Aim' },
      { input: 'Left click', does: 'Punch, then click again to pull it back' },
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
      'You are given a target time, never under six and a half seconds. The stopwatch starts on Start!, and everybody can watch it for the first two and a half seconds - then it is covered and you are counting in your head.',
      'Click to stop your timer. The round ends when everybody has stopped, or at thirty seconds. Closest to the target wins; anybody who never stopped comes last.',
    ],
    controls: [
      { input: 'Left click', does: 'Stop your stopwatch' },
    ],
    reserved: false,
    // Built: see `29-time-it`. The assets stage is still to do - the players are
    // the island's capsule and the stopwatch is primitives.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'wack-attack',
    number: 10,
    title: 'Wack-Attack',
    kind: 'free-for-all',
    description: [
      'Walk about a field with a hammer while moles pop out of sixteen holes. Stand over one and swing - the hammer comes down in front of you, the way you are facing - before it goes back down.',
      'An ordinary mole is a point. The golden mole is five, is rarer, and ducks back down much sooner. First hit on a mole takes it. Bring the hammer down on somebody\'s head instead and they are stunned for a moment.',
      'Most points after a minute wins.',
    ],
    controls: [
      { input: 'WASD', does: 'Move' },
      { input: 'Left click', does: 'Swing the hammer' },
    ],
    reserved: false,
    // Built: see `25-wack-attack`. The assets stage is still to do - the
    // players are the island's capsule and the moles are primitives.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'lady-luck',
    number: 11,
    title: 'Lady Luck',
    kind: 'free-for-all',
    description: [
      'A field of three-leaf clovers with three four-leaf clovers hidden in it at any time. Find one and click it: it is ringed in your colour, nobody else can have it, and a new one grows somewhere else.',
      'Clicking anything else - a three-leaf clover, a claimed one, bare grass - costs you a point and a second before you can click again, and every click in that second costs another. Scores can go below zero. Most points after a minute wins.',
    ],
    controls: [
      { input: 'Mouse', does: 'Aim' },
      { input: 'Left click', does: 'Claim a clover' },
    ],
    reserved: false,
    // Built: see `23-lady-luck`. The assets stage is still to do - the clovers
    // are flat instanced leaves.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'find-yourself',
    number: 12,
    title: 'Find Yourself',
    kind: 'free-for-all',
    description: [
      'Everybody\'s face goes under a cup, with an empty one or two spare, and then the cups shuffle - two at a time, trading places.',
      'When they stop you have seven seconds to click the cup your own face is under. Three stages, each shuffle longer and faster than the last, worth one, two and three points. Most points wins.',
    ],
    controls: [
      { input: 'Mouse', does: 'Aim' },
      { input: 'Left click', does: 'Pick a cup' },
    ],
    reserved: false,
    // Built: see `27-find-yourself`. The assets stage is still to do - the
    // faces are the island's capsule and the cups are cylinders.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'make-the-cut',
    number: 13,
    title: 'Make The Cut',
    kind: 'free-for-all',
    description: [
      'Everybody stands on a tower in a web of strings: three for every player, and one fewer eliminating strings than there are players. Nobody can tell them apart. A random player cuts first, and the turn passes round.',
      'On your turn you have twelve seconds to walk up to a string and cut it - run out and the nearest one is cut for you. A normal string: nothing happens. An eliminating one: you are launched off the tower. Last one standing wins.',
    ],
    controls: [
      { input: 'WASD', does: 'Move' },
      { input: 'Mouse', does: 'Aim at a string' },
      { input: 'Left click', does: 'Cut the string (on your turn, within reach)' },
    ],
    reserved: false,
    // Built: see `24-make-the-cut`. The assets stage is still to do - the
    // cutters are the island's capsule and the strings are cylinders.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'hes-one-shot',
    number: 14,
    title: "He's One Shot",
    kind: 'free-for-all',
    description: [
      'First person, everybody against everybody, and one shot eliminates. Your gun needs a second and a half between shots, and nobody can be shot for the first two seconds.',
      'Being eliminated does not take you out of it: you keep walking and shooting at whoever is still standing, but nobody can shoot you any more. The last one standing wins; at a minute and fifteen, everybody still standing shares first.',
    ],
    controls: [
      { input: 'WASD / Arrow keys', does: 'Move' },
      { input: 'Mouse', does: 'Look and aim' },
      { input: 'Left click', does: 'Capture the mouse, then shoot' },
    ],
    reserved: false,
    // Built: see `32-hes-one-shot`. The assets stage is still to do - players
    // are the island's capsule, the cover is boxes and the gun is three more.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'wheres-midnight',
    number: 15,
    title: "Where's Midnight?",
    kind: 'free-for-all',
    description: [
      'A junkyard at night, and an all-black cat called Midnight somewhere in it. Everybody searches the same yard with their own camera.',
      'Click him and you have found him. A click on anything else costs a second and a half before you can click again. You place in the order you find him; the round ends when three have, everybody has, or at ninety seconds.',
    ],
    controls: [
      { input: 'Left drag', does: 'Look around - the scene follows the pointer' },
      { input: 'Wheel', does: 'Zoom towards the pointer' },
      { input: 'F', does: 'Torch on or off, once zoomed in close' },
      { input: 'Left click', does: 'Say that is him - a wrong one costs a second and a half' },
    ],
    reserved: false,
    // Built: see `37-wheres-midnight`. The assets stage is still to do - the
    // junkyard is primitives and the cat is three spheres and a tail.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'let-him-cook',
    number: 16,
    title: 'Let Him Cook',
    kind: 'free-for-all',
    description: [
      'Six baskets of ingredients, three of each. Watch the chef take between six and ten of them into the pot, and remember what went in.',
      'Then take turns, in a random order, picking an item - ten seconds a turn. Pick an ingredient that was not in the recipe, or one whose every copy has already been claimed, or run out of time, and you are out. Pick right and you go to the back of the line.',
      'If every copy is claimed and more than one cook is left, the chef cooks again, faster. Last cook standing wins.',
    ],
    controls: [
      { input: 'Mouse', does: 'Aim' },
      { input: 'Left click', does: 'Pick an ingredient on your turn' },
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
      'Red light, green light. On green, every press of space is a step towards the finish - seventy of them. A three-two-one warns you the light is about to change.',
      'On red, hold your cursor inside a circle that wanders about the screen. Let it slip out, or press space on red, and you are out. The race ends when three are over the line, or at two minutes.',
    ],
    controls: [
      { input: 'Space', does: 'Step forward on green' },
      { input: 'Mouse', does: 'Keep the cursor inside the circle on red' },
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
      'A maze in the dark, and a torch in your own colour. Put the mouse on your torch to pick it up, and it follows the mouse - no faster than a careful walk.',
      'Touch a wall and Dad yells: you drop the torch and stand stunned for a second and a half, then have to pick it up again where it fell. You place in the order you reach the finish; at two minutes, anybody still in is placed by how far they had left.',
    ],
    controls: [
      { input: 'Mouse', does: 'Pick up the torch and guide it through the maze' },
    ],
    reserved: false,
    // Built: see `31-helping-dad`. The assets stage is still to do - the torches
    // are rings and glows, Dad is the island's capsule and the walls are boxes.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'synchronize-steps',
    number: 19,
    title: 'Synchronize Steps',
    kind: 'free-for-all',
    description: [
      'Everybody starts at the top of a tower twenty steps high, and the higher you stay the better. Every two seconds you pick how far to go down: 1, 4 or 6.',
      'Alone on a number, you stay where you are. Exactly two on the same number, you both go down that many - except a pair on 1, which drops eight. Three or more on the same number all drop eight. Pick nothing and one is picked for you.',
      'Reach the bottom and you are out, and that ends the game. Highest up at the end wins.',
    ],
    controls: [
      { input: '1 / 4 / 6', does: 'Choose how many steps' },
      { input: 'Left click', does: 'Choose an option on screen' },
    ],
    reserved: false,
    // Built: see `30-synchronize-steps`. The assets stage is still to do - the
    // players are the island's capsule and the tower is primitives.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'sharing-is-caring',
    number: 20,
    title: 'Sharing Is Caring',
    kind: 'free-for-all',
    description: [
      'Tag, backwards. A crown sits in the middle of a walled arena: walk into it and it is yours, and you score a point for every second you wear it.',
      'Bump into whoever is wearing it to take it - they are knocked back and dazed for a moment. The wearer is a little faster than everybody else, so use the rocks, the wall and your boost. Most points after a minute wins.',
    ],
    controls: [
      { input: 'WASD', does: 'Move' },
      { input: 'Space', does: 'Boost - a burst of speed that recharges (not while wearing the crown)' },
    ],
    reserved: false,
    // Built: see `34-sharing-is-caring`. The assets stage is still to do - the
    // players are the island's capsule and the crown is primitives.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'keyboard-warrior',
    number: 21,
    title: 'Keyboard Warrior',
    kind: 'free-for-all',
    description: [
      'Fifteen letters float into the arena one at a time, after a pause that is different every time.',
      'The first letter key you press after one appears is your only answer, right or wrong. Of everybody who got it right, the quickest gets the point. Each letter stays up four seconds at most. Most points wins.',
    ],
    controls: [
      { input: 'Keyboard', does: 'Type the letter on screen - one try each' },
    ],
    reserved: false,
    // Built: see `33-keyboard-warrior`. The assets stage is still to do - the
    // players are the island's capsule and the letters are tiles.
    done: { environment: true, controls: true, assets: false },
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
    id: 'musical-mayhem',
    number: 23,
    title: 'Musical Mayhem',
    kind: 'free-for-all',
    description: [
      'Musical chairs, with shoving. A ring of chairs, one fewer than the players still in, and a tune that plays for a time nobody can know.',
      'While it plays, keep running round - stand about or get too close to the chairs and you are thrown to the edge, and trying to sit early gets you thrown there too. When it stops, sit in an empty chair. Push whoever is in front of you to knock them back, and off their chair if they have not been sitting a whole second.',
      'Whoever is left standing is out and a chair goes, until one player is left.',
    ],
    controls: [
      { input: 'WASD / Arrow keys', does: 'Run' },
      { input: 'Space', does: 'Sit in the chair you are next to' },
      { input: 'Left click', does: 'Push whoever is in front of you' },
    ],
    reserved: false,
    // Built: see `36-musical-mayhem`. The assets stage is still to do - the
    // players are the island's capsule and the chairs are boxes.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'ill-just-wait',
    number: 24,
    title: "I'll Just Wait",
    kind: 'free-for-all',
    description: [
      'A race through three clock-reading targets. Each goes up at the top in awkward words - "Quarter till 4:05" - and each is harder than the last. Your clock starts at 12:00: wind it to the target and confirm.',
      'Right, and you are on to the next target. Wrong, and your clock goes back to 12:00 to try again. Everybody can see everybody else\'s clock - so you could always just wait for somebody to show you. The first to get all three wins; otherwise the game ends at two and a half minutes.',
    ],
    controls: [
      { input: 'Left click / hold', does: 'Wind the clock forward - hold to speed up' },
      { input: 'Right click / hold', does: 'Wind the clock back - hold to speed up' },
      { input: 'Space', does: 'Confirm the time' },
    ],
    reserved: false,
    // Built: see `39-ill-just-wait`. The assets stage is still to do - the
    // clocks are primitives on a painted face and the players are the island's capsule.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'one-piece',
    number: 25,
    title: 'One Piece?!',
    kind: 'free-for-all',
    description: [
      'Each player receives a 6-piece square puzzle featuring their own face. Players must drag, rotate, and place each piece correctly to complete their square.',
      'Players are ranked by the order in which they successfully solve their puzzle, with the first player to complete it taking first place.',
    ],
    controls: [
      { input: 'Mouse Drag', does: 'Move puzzle pieces' },
      { input: 'Left Click', does: 'Select piece' },
      { input: 'Right Click / Scroll', does: 'Rotate piece' },
    ],
    reserved: false,
    // Built: see `41-one-piece`. The assets stage is still to do - the faces
    // are the island's pill drawn flat, and there is no sound of its own.
    done: { environment: true, controls: true, assets: false },
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
      'A bent column of 30 crabs moves from left to right across the beach. One turn each, while everybody else watches.',
      'You have 10 seconds to choose your position behind the line and the angle of your coconut throw - and when to let it go. When time runs out it rolls anyway.',
      'The coconut rolls along the chosen path, hitting as many crabs as possible. 1 point for every crab hit; the player with the most points wins. Hit all 30 for a perfect game.',
    ],
    controls: [
      { input: 'WASD', does: 'Adjust position' },
      { input: 'Mouse', does: 'Aim / adjust throw angle' },
      { input: 'Left Click', does: 'Roll coconut' },
    ],
    reserved: false,
    // Built: see `51-perfect-game`. The assets stage is still to do - the beach, the
    // crabs and the coconut are primitives and the players are the island's capsule.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'chef-caricature',
    number: 28,
    title: 'Chef Caricature',
    kind: 'one-vs-all',
    description: [
      'One at a time, each player gets thirty seconds at the easel while everybody else watches. The outline of an ingredient or a dish is on the board: hold the button down and trace it without letting go.',
      'Once your ink has gone all the way round and closed the shape, the duck eats the drawing for a point and the next outline is up. Scribbling off the line does not count. There is no rubbing out, and letting go before the shape is closed wipes the attempt.',
      'Most dishes after everybody\'s turn wins.',
    ],
    controls: [
      { input: 'Hold left click + drag', does: 'Trace the outline' },
    ],
    reserved: false,
    // Built: see `35-chef-caricature`. The assets stage is still to do - the duck
    // and the chef are primitives and the outlines are drawn paths.
    done: { environment: true, controls: true, assets: false },
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
    id: 'whats-your-rpm',
    number: 31,
    title: "What's Your RPM?",
    kind: 'free-for-all',
    description: [
      'Race down a feed of sixty reels on your mini phone by scrolling the mouse wheel as fast as you can. First to the end wins.',
      'Every so often an ad takes over and the feed stops dead until you click its Skip Ad button - somewhere different every time, and smaller the further you get. The game ends at two minutes; everybody else places by how far down the feed they got.',
    ],
    controls: [
      { input: 'Mouse wheel', does: 'Scroll through the reels' },
      { input: 'Left click', does: 'Skip ads' },
    ],
    reserved: false,
    // Built: see `40-whats-your-rpm`. The assets stage is still to do - the
    // phone and its reels are drawn on the page and the players are the island's capsule.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'i-just-work-here',
    number: 32,
    title: 'I Just Work Here',
    kind: 'free-for-all',
    description: [
      'Search the office for the four pieces of your bazooka - they are in your colour - and bring them back to your desk one at a time.',
      'Once all four are on your desk you are armed and can start eliminating everybody else. Careful: a rocket that bursts too near you takes you with it, so do not fire at a wall you are standing next to. Last one standing wins.',
    ],
    controls: [
      { input: 'WASD', does: 'Move' },
      { input: 'Mouse', does: 'Aim' },
      { input: 'Left Click', does: 'Pick up / place piece' },
      { input: 'Right Click', does: 'Fire bazooka' },
      { input: 'Space', does: 'Drop piece' },
    ],
    reserved: false,
    // Built: see `42-i-just-work-here`. The assets stage is still to do - the
    // office is boxes, the pieces are primitives and the players are the island's capsule.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'highest-in-the-room',
    number: 33,
    title: 'Highest In The Room',
    kind: 'free-for-all',
    description: [
      'Race upward by correctly typing the arrow keys shown on screen. Every correct input builds another block beneath you, while the camera follows the player currently in the lead.',
      'Make a mistake and you are knocked down 4 blocks. If you fall 10 blocks behind the leader, you are eliminated. The last player remaining wins.',
    ],
    controls: [{ input: '↑ ↓ ← →', does: 'Press the displayed arrow key' }],
    reserved: false,
    // Built: see `43-highest-in-the-room`. The assets stage is still to do - the
    // towers are boxes and the players are the island's capsule.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'color-coded',
    number: 34,
    title: 'Color Coded',
    kind: 'free-for-all',
    description: [
      'Spawn on floating color panels as a giant wheel spins to select a color. Once the color is revealed, players have 2 seconds to push each other and get onto a panel matching the spinner’s color.',
      'When the timer ends, every panel of a different color disappears, and anyone standing on one falls and is eliminated. The surviving platforms slowly rebuild before the next round, but fewer matching platforms remain as the rounds go on. Last player standing wins.',
    ],
    controls: [
      { input: 'WASD', does: 'Move' },
      { input: 'Mouse', does: 'Camera' },
      { input: 'Left Click', does: 'Push' },
    ],
    reserved: false,
    // Built: see `44-color-coded`. The assets stage is still to do - the panels
    // and the wheel are flat colour and the players are the island's capsule.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'binary-bs',
    number: 35,
    title: 'Binary BS',
    kind: 'free-for-all',
    description: [
      'Players spawn on different sides of a giant gear - as many sides as players - with one side marked to be removed. A random number appears in the center, and players have 5 seconds to vote 0 or 1, in secret.',
      'When the countdown ends the gear turns by the number, one side less for every 0, and removes the side that lands on the mark along with everyone standing on it. If everyone votes 1, the marked side goes. A new number and a new gear come each round until only one player remains.',
    ],
    controls: [
      { input: '0', does: 'Vote 0' },
      { input: '1', does: 'Vote 1' },
      { input: 'WASD', does: 'Move around your side of the gear' },
    ],
    reserved: false,
    // Built: see `45-binary-bs`. The assets stage is still to do - the gear is
    // flat wedges and boxes and the players are the island's capsule.
    done: { environment: true, controls: true, assets: false },
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
  {
    id: 'youre-the-bomb',
    number: 42,
    title: "You're The Bomb",
    kind: 'free-for-all',
    description: [
      'Escape a dangerous room before a giant rolling pin crushes everyone. Press Space to scan and reveal the bombs surrounding you, then carefully navigate around them while pushing other players out of your way.',
      'You have 45 seconds before the rolling pin reaches the room. Players who survive can escape through the hole at the end - the first out of it wins.',
    ],
    controls: [
      { input: 'WASD', does: 'Move' },
      { input: 'Space', does: 'Scan for nearby bombs' },
      { input: 'Left Click', does: 'Push' },
    ],
    reserved: false,
    // Built: see `46-youre-the-bomb`. The assets stage is still to do - the room,
    // the bombs and the pin are primitives and the players are the island's capsule.
    // Added as a forty-second slot when every free-for-all one was taken.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'shanty-matrix',
    number: 43,
    title: 'Shanty Matrix',
    kind: 'free-for-all',
    description: [
      'Survive as long as you can on the deck of a pirate ship while giant cannonballs fly across it from every direction, at every speed.',
      "A red lane lights up across the deck the moment a ball is fired, a second before it arrives. Dodge out of its way - and push the other players into it. Anybody a cannonball hits goes overboard and is out.",
      'The barrage gets faster and fiercer the longer it goes. The last player standing wins.',
    ],
    controls: [
      { input: 'WASD', does: 'Move' },
      { input: 'Left Click / Space', does: 'Push whoever is in front of you' },
    ],
    reserved: false,
    // Built: see `47-shanty-matrix`. The assets stage is still to do - the ship
    // and the cannonballs are primitives and the players are the island's capsule.
    // Added as a forty-third slot, the same way as 42.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'spidy-senses',
    number: 44,
    title: 'Spidy Senses',
    kind: 'free-for-all',
    description: [
      "Play a game of chicken as everyone slowly inches toward a trapdoor hiding a spider's nest. Decide when to stop - a click stops you where you stand.",
      'At a random point the trapdoor becomes dangerous: it rattles and red eyes glint under the lid. Click too late and a spider jumps out at you, and you are out. If nobody is too late, the spider takes whoever stopped furthest from the trapdoor - the chicken.',
      'Somebody goes every round. The last player remaining wins.',
    ],
    controls: [
      { input: 'WASD', does: 'Slowly move toward or away from the trapdoor' },
      { input: 'Left Click', does: 'Stop / react to the trapdoor' },
    ],
    reserved: false,
    // Built: see `48-spidy-senses`. The assets stage is still to do - the cellar,
    // the trapdoor and the spider are primitives and the players are the island's capsule.
    // Added as a forty-fourth slot, the same way as 42 and 43.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'needs-a-walmart',
    number: 45,
    title: 'OG Black Friday',
    kind: 'free-for-all',
    description: [
      'Sprint around a chaotic supermarket pushing your trolley and collect the 3 items on your grocery list. There are 10 different items scattered through the store, and every player has their own list - a beam of light shows you where yours are.',
      'Click to grab whatever is in reach, or to put something you do not need back. Ram other trolleys with Space: the newest thing in theirs flies out and lands somewhere random in the store.',
      'Find all 3 items and get through a checkout before everyone else. The first player to complete their grocery list wins.',
    ],
    controls: [
      { input: 'WASD', does: 'Move' },
      { input: 'Left Click', does: 'Pick up / place item' },
      { input: 'Space', does: 'Push shopping cart' },
    ],
    reserved: false,
    // Built: see `49-needs-a-walmart`. The assets stage is still to do - the store,
    // the goods and the trolleys are primitives and the players are the island's capsule.
    // Added as a forty-fifth slot, the same way as 42 to 44.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'milf-fishing',
    number: 46,
    title: 'M.I.L.F (fishing)',
    kind: 'free-for-all',
    description: [
      'Fish for 25 seconds and decide when to pull based on how much your fishing rod bends. A slight bend means a smaller fish, while a dramatic bend means a much bigger fish.',
      'Four different fish sizes can bite at unpredictable times for each player, and there is no guarantee the biggest fish will appear. Every pull - fish or not - takes a moment to cast again, and anything that bites meanwhile is missed.',
      'Pull when you think the fish is ready - but if the rod is not bent, you get nothing. The player with the biggest total catch wins.',
    ],
    controls: [{ input: 'Left Click', does: 'Pull the rod / reel in fish' }],
    reserved: false,
    // Built: see `50-milf-fishing`. The assets stage is still to do - the lake, the rods
    // and the fish are primitives and the players are the island's capsule.
    // Added as a forty-sixth slot, the same way as 42 to 45.
    done: { environment: true, controls: true, assets: false },
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
