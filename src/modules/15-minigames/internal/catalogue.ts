/**
 * Every minigame Volcano Island is going to have, as data.
 *
 * Forty-six slots: forty free-for-all - every game named so far is one, the
 * turn-taking ones included, and two of the free slots are too - and six
 * one-vs-all, all of them still free slots.
 *
 * **They are numbered alphabetically by title**: the thirty-eight named games in
 * order of name, then the two free-for-all slots, so the first forty are all
 * free-for-all, then the six one-vs-all. A game named later takes one of the free
 * slots and is put in its alphabetical place - which moves the numbers after it,
 * so **a number is a place in the list and an id is the name of a game**; ids never
 * move. A slot nobody has named yet is a **reserved** entry with a number rather
 * than a gap: the count is the plan, and the dashboard draws the plan rather than
 * only the part of it that exists. (The `Added as the Nth slot` notes below, and
 * the `Minigame N` in the modules' own docs, are the order the games were written
 * down and built in, which is not the order they are numbered in now.)
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
  'free-for-all': 40,
  'one-vs-all': 6,
})

const ENTRIES = [
  {
    id: 'binary-bs',
    number: 1,
    title: 'Binary BS',
    kind: 'free-for-all',
    description: [
      'Be the last player standing! Everybody starts on their own side of a giant gear, and one side is marked for elimination. A quick sample round shows you how it works first.',
      'Each round a random number pops up in the middle and you get 5 seconds to vote 0 or 1 - in secret. Then the votes are added into the total, and the gear clicks round one side at a time with a counter going down. Every 0 makes it turn one side less, and if everybody votes 1 the marked side goes as it is.',
      'Whoever is standing on the side that lands on the mark is out! A new number and a new gear come each round until only one player is left.',
    ],
    controls: [
      { input: '0', does: 'Vote 0' },
      { input: '1', does: 'Vote 1' },
      { input: 'WASD', does: 'Run around your side of the gear' },
    ],
    reserved: false,
    // Built: see `45-binary-bs`. The assets stage is still to do - the gear is
    // flat wedges and boxes and the players are the island's capsule.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'breaking-the-ice',
    number: 2,
    title: 'Breaking the Ice',
    kind: 'free-for-all',
    description: [
      'Battle across a floating iceberg, three layers of ice tiles stacked over the sea! Wherever you walk, the ice cracks under your feet - and is gone three seconds later, whether you are still on it or not.',
      "Push an opponent toward a hole the ice has already opened up - anybody's tiles are fair game, including your own. Fall through a layer and you drop onto the one below rather than going straight out - it's only the bottom layer, into the sea, that eliminates you.",
      'The iceberg keeps shrinking as the round goes on, fastest on the layer nearest the water. Last player standing wins.',
    ],
    controls: [
      { input: 'WASD', does: 'Move - the ice cracks wherever you walk' },
      { input: 'Mouse', does: 'Look around - it is your camera' },
      { input: 'Space', does: 'Jump' },
      { input: 'Right click', does: 'Push whoever is in front of you' },
    ],
    reserved: false,
    // Built: see `58-breaking-the-ice`. The assets stage is still to do - the
    // players are the island's capsule and the tiles are flat ice-blue boxes.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'chef-caricature',
    number: 3,
    title: 'Chef Caricature',
    kind: 'free-for-all',
    description: [
      'Draw fast and draw clean! One at a time, each player gets 30 seconds at the easel while everybody else watches.',
      'An outline of an ingredient or a dish is on the board. Hold the button and trace it all the way round without letting go. Close the shape and the duck eats your drawing for 1 point - then the next outline pops up.',
      "Stay on the line: scribbling off it does not count, there is no rubbing out, and letting go early wipes your try. Most dishes after everybody's turn wins.",
    ],
    controls: [
      { input: 'Hold left click + drag', does: 'Trace the outline without letting go' },
    ],
    reserved: false,
    // Built: see `35-chef-caricature`. The assets stage is still to do - the duck
    // and the chef are primitives and the outlines are drawn paths.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'color-coded',
    number: 4,
    title: 'Color Coded',
    kind: 'free-for-all',
    description: [
      'Be the last player standing! You start on floating colour panels while a giant wheel spins to pick a colour. When it stops, you have 2 seconds to get onto a panel that matches.',
      'Every other panel drops away, and anybody on one falls and is out. The dropped panels rise back up each round, but fewer matching ones are left every time.',
      'Watch out - the panels are slippery ice! You slide, you cannot turn on the spot, and running is fast but hard to steer. Shove whoever is in front of you, but remember a crash keeps its speed: bump into somebody and they go flying while you nearly stop.',
    ],
    controls: [
      { input: 'WASD', does: 'Move - it is ice, so you slide' },
      { input: 'Left click / Space / E', does: 'Push whoever is in front of you' },
      { input: 'Shift', does: 'Run - fast, but hard to turn or stop' },
      { input: 'Mouse', does: 'Move the camera' },
    ],
    reserved: false,
    // Built: see `44-color-coded`. The assets stage is still to do - the panels
    // and the wheel are flat colour and the players are the island's capsule.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'duck-hunt',
    number: 5,
    title: 'Duck Hunt',
    kind: 'free-for-all',
    description: [
      "Pop your own balloons - and only yours! Balloons float up round the arena in waves, and each one is in somebody's colour and shape.",
      "Shoot one of yours: 1 point. Shoot somebody else's: they lose a point and you get nothing. Every shot, hit or miss, needs half a second to reload. Most points after 45 seconds wins.",
    ],
    controls: [
      { input: 'Mouse', does: 'Aim' },
      { input: 'Left click', does: 'Shoot - half a second to reload' },
    ],
    reserved: false,
    // Built: see `19-duck-hunt`. The assets stage is still to do - balloons
    // are spheres with a flat shape on them.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'feeding-time',
    number: 6,
    title: 'Feeding Time',
    kind: 'free-for-all',
    description: [
      'Feed the most ducks! Ducks swim about a pond and you are on the bank with a pocket full of crackers.',
      'Aim where you want to throw, hold the left button to charge the power meter, then let go to throw - the longer you hold, the farther it flies. A cracker that lands near a duck feeds it for 1 point, and that duck stops to eat for a moment. You can throw again a quarter of a second later.',
      'Most ducks fed after 45 seconds wins.',
    ],
    controls: [
      { input: 'Mouse', does: 'Aim at the water' },
      { input: 'Hold left click, release', does: 'Charge the power meter, then let go to throw' },
    ],
    reserved: false,
    // Built: see `28-feeding-time`. The assets stage is still to do - the ducks
    // and crackers are primitives.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'find-yourself',
    number: 7,
    title: 'Find Yourself',
    kind: 'free-for-all',
    description: [
      "Follow your own face! Everybody's face goes under a cup - with one or two empty cups spare - and then the cups shuffle, trading places two at a time.",
      'When they stop you have 7 seconds to click the cup hiding YOUR face. There are three stages, each with a longer, faster shuffle, worth 1, 2 and 3 points. Most points wins.',
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
    id: 'helping-dad',
    number: 8,
    title: 'Helping Dad',
    kind: 'free-for-all',
    description: [
      'Be first out of the maze! It is dark, the corridors are narrow, and you carry a torch in your own colour. Put your mouse on the torch to pick it up - it follows your mouse, no faster than a careful walk.',
      "The whole maze turns slowly under you, so a mouse left where it was is a torch walking into a wall. Dad's junk slides up and down the corridors too: bumping into a piece is like any other bump, but a piece that slides onto a torch holding still does not count - so hold still and let it pass.",
      'Touch a wall and Dad yells! You drop the torch and are stunned for 1.5 seconds, then have to pick it up again where it fell. You place in the order you reach the finish. At 2 minutes, anybody still in is placed by how far they had left to go.',
    ],
    controls: [
      { input: 'Mouse', does: 'Pick up the torch and guide it through the turning maze' },
    ],
    reserved: false,
    // Built: see `31-helping-dad`. The assets stage is still to do - the torches
    // are rings and glows, Dad is the island's capsule, and the walls and his
    // junk are boxes and cylinders.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'hes-one-shot',
    number: 9,
    title: "He's One Shot",
    kind: 'free-for-all',
    description: [
      'Last one standing wins! It is first person, everybody against everybody, in a big walled arena full of cover - and one shot eliminates. Your gun needs 1.5 seconds between shots, and nobody can be shot for the first 2 seconds.',
      'Getting shot does not end your game: you start again beside whoever got you, as their hunter. Keep walking and shooting at whoever is still standing - but never at the one you hunt for, since you are on their side now - and nobody can shoot you any more.',
      'Jump over cover and grab the shields lying about the arena: a shield takes the next hit instead of eliminating you. At 1.5 minutes, everybody still standing shares first place.',
    ],
    controls: [
      { input: 'WASD / Arrow keys', does: 'Move' },
      { input: 'Space', does: 'Jump' },
      { input: 'Mouse', does: 'Look and aim' },
      { input: 'Left click', does: 'Click once to lock the mouse, then shoot' },
    ],
    reserved: false,
    // Built: see `32-hes-one-shot`. The assets stage is still to do - players
    // are the island's capsule, the cover is boxes and the gun is three more.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'highest-in-the-room',
    number: 10,
    title: 'Highest In The Room',
    kind: 'free-for-all',
    description: [
      'Climb the highest! Press the key for the arrow on screen - W for up, S for down, A for left, D for right - and a small preview shows the next one. Every correct press builds another block under you, and the camera follows whoever is in the lead.',
      'Press the wrong key and you tumble down 4 blocks. Fall 10 blocks behind the leader and you are out. The last player left wins.',
    ],
    controls: [
      { input: 'W A S D', does: 'Press the key for the arrow shown: W up, S down, A left, D right' },
    ],
    reserved: false,
    // Built: see `43-highest-in-the-room`. The assets stage is still to do - the
    // towers are boxes and the players are the island's capsule.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'i-just-work-here',
    number: 11,
    title: 'I Just Work Here',
    kind: 'free-for-all',
    description: [
      'Build your bazooka, then blast everybody else! Search the office for the 4 pieces in your colour and bring them back to your desk one at a time.',
      'Once all 4 are on your desk you are armed and can start eliminating. Careful: a rocket that bursts too near you takes you with it, so do not fire at a wall you are standing next to. Last one standing wins.',
    ],
    controls: [
      { input: 'WASD', does: 'Move' },
      { input: 'Mouse', does: 'Aim' },
      { input: 'Left click', does: 'Pick up or place a piece' },
      { input: 'Right click', does: 'Fire the bazooka' },
      { input: 'Space', does: 'Drop a piece' },
    ],
    reserved: false,
    // Built: see `42-i-just-work-here`. The assets stage is still to do - the
    // office is boxes, the pieces are primitives and the players are the island's capsule.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'ill-just-wait',
    number: 12,
    title: "I'll Just Wait",
    kind: 'free-for-all',
    description: [
      'Be first to read three clocks! Each target goes up at the top in awkward words - "Quarter till 4:05" - and each is harder than the last. Your clock starts at 12:00: wind it to the target and confirm.',
      "Right, and you are on to the next target. Wrong, and your clock goes back to 12:00 to try again. Everybody can see everybody else's clock - so you could always just wait for somebody to show you!",
      'The first to get all three wins. If nobody does, the game ends at 2.5 minutes.',
    ],
    controls: [
      { input: 'Left click / hold', does: 'Wind the clock forward - hold to go faster' },
      { input: 'Right click / hold', does: 'Wind the clock back - hold to go faster' },
      { input: 'Space', does: 'Confirm the time' },
    ],
    reserved: false,
    // Built: see `39-ill-just-wait`. The assets stage is still to do - the
    // clocks are primitives on a painted face and the players are the island's capsule.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'i-see-the-light',
    number: 13,
    title: 'I See The Light',
    kind: 'free-for-all',
    description: [
      'Race to the finish - and obey the light! On green, every press of space is a step forward, and it takes 70 of them. A 3-2-1 warns you the light is about to change.',
      'On red, freeze and keep your cursor inside a circle that wanders about the screen, swelling and shrinking as it goes. Let it slip out, or press space on red, and you are out. The race ends when three players are over the line, or at 2 minutes.',
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
    id: 'keyboard-warrior',
    number: 14,
    title: 'Keyboard Warrior',
    kind: 'free-for-all',
    description: [
      'Be the fastest typist! 15 letters float into the arena one at a time, after a pause that is different every time.',
      'The first letter key you press after one appears is your only answer, right or wrong. Of everybody who got it right, the quickest wins the point. Each letter stays up 4 seconds at most. Most points wins.',
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
    id: 'lady-luck',
    number: 15,
    title: 'Lady Luck',
    kind: 'free-for-all',
    description: [
      'Find the lucky clovers! A field of three-leaf clovers has three four-leaf clovers hidden in it at any time. Click one to claim it: it is ringed in your colour, nobody else can have it, and a new one grows somewhere else.',
      'Click anything else - a three-leaf clover, a claimed one, bare grass - and you lose a point and cannot click for 1 second. Every click in that second costs another point. Scores can go below zero, so click smart! Most points after 45 seconds wins.',
    ],
    controls: [
      { input: 'Mouse', does: 'Aim' },
      { input: 'Left click', does: 'Claim a four-leaf clover' },
    ],
    reserved: false,
    // Built: see `23-lady-luck`. The assets stage is still to do - the clovers
    // are flat instanced leaves.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'let-him-cook',
    number: 16,
    title: 'Let Him Cook',
    kind: 'free-for-all',
    description: [
      'Remember the recipe! There are six baskets of ingredients, three of each. Watch the chef put 6 to 10 of them into the pot - and remember what went in, and in what order.',
      "Then take turns, in a random order, putting the recipe back together from the start: the first cook adds the chef's first ingredient, the next cook his second, and so on. You get 10 seconds a turn. Pick anything but the one that is due - never in the recipe, or in it but later - or run out of time, and you are out. Get it right and you go to the back of the line.",
      'If the whole recipe is back in the pot and more than one cook is left, the chef cooks again, faster. Last cook standing wins.',
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
    id: 'make-the-cut',
    number: 17,
    title: 'Make The Cut',
    kind: 'free-for-all',
    description: [
      'Do not cut the wrong string! Everybody stands on a tower in a web of strings: 3 for every player, with one fewer eliminating strings than there are players. Nobody can tell them apart. A random player cuts first, and the turn passes round.',
      'On your turn you have 12 seconds to walk up to a string and cut it - run out of time and the nearest one is cut for you. A normal string does nothing. An eliminating one launches you off the tower! Last one standing wins.',
    ],
    controls: [
      { input: 'WASD', does: 'Move' },
      { input: 'Mouse', does: 'Aim at a string' },
      { input: 'Left click', does: 'Cut the string - on your turn, when you are close enough' },
    ],
    reserved: false,
    // Built: see `24-make-the-cut`. The assets stage is still to do - the
    // cutters are the island's capsule and the strings are cylinders.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'messy-maze',
    number: 18,
    title: 'Messy Maze',
    kind: 'free-for-all',
    description: [
      'Race to the middle of the maze! Everybody starts in a different corner.',
      'Spinning platforms sit along the way. Step on one and it spins you round and swaps your four movement keys for random letters - the new ones are shown on screen. The middle only counts once you have been spun by 2 different platforms.',
      'You place in the order you reach the middle. The race ends when three players are in, 30 seconds after the first gets there, or at 4 minutes.',
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
    id: 'milf-fishing',
    number: 19,
    title: 'M.I.L.F (fishing)',
    kind: 'free-for-all',
    description: [
      'Land the biggest catch! You fish for 25 seconds and decide when to pull by how much your rod bends: a slight bend is a small fish, a dramatic bend is a much bigger one.',
      'Five sizes of fish can bite at unpredictable times for each player - the heaviest is called your mom - and there is no guarantee the biggest will show up. Every pull, fish or not, takes a moment before you can cast again, and anything that bites meanwhile is missed.',
      'Pull when you think the fish is ready - but if the rod is not bent, you get nothing. The biggest total catch wins.',
    ],
    controls: [
      { input: 'Left click', does: 'Pull the rod and reel in the fish' },
    ],
    reserved: false,
    // Built: see `50-milf-fishing`. The assets stage is still to do - the lake, the rods
    // and the fish are primitives and the players are the island's capsule.
    // Added as a forty-sixth slot, the same way as 42 to 45.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'musical-mayhem',
    number: 20,
    title: 'Musical Mayhem',
    kind: 'free-for-all',
    description: [
      'Musical chairs, with shoving! A ring of chairs - one fewer than the players still in - and a tune that plays for a time nobody can guess.',
      'While it plays, keep running round: stand about or get too close to the chairs and you are thrown to the edge, and so are you if you try to sit early. When it stops, grab an empty chair! Push whoever is in front of you to knock them back, and right off their chair if they have not been sitting a whole second.',
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
    id: 'needs-a-walmart',
    number: 21,
    title: 'OG Black Friday',
    kind: 'free-for-all',
    description: [
      'Be first to finish your shopping list! Sprint around a chaotic supermarket pushing your trolley to collect the 3 items on your list. There are 10 different items scattered through the store, every player has their own list, and a beam of light shows you where yours are.',
      'Click to grab whatever is in reach, or to put back something you do not need. Ram other trolleys with Space: the newest thing in theirs flies out and lands somewhere random in the store.',
      'Find all 3 items and get through a checkout before everybody else. The first player to complete their list wins.',
    ],
    controls: [
      { input: 'WASD', does: 'Move' },
      { input: 'Left click', does: 'Pick up or put down an item' },
      { input: 'Space', does: 'Ram another trolley' },
    ],
    reserved: false,
    // Built: see `49-needs-a-walmart`. The assets stage is still to do - the store,
    // the goods and the trolleys are primitives and the players are the island's capsule.
    // Added as a forty-fifth slot, the same way as 42 to 44.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'one-piece',
    number: 22,
    title: 'One Piece?!',
    kind: 'free-for-all',
    description: [
      'Solve your puzzle first! Everybody gets a 6-piece square puzzle with their own face on it. Drag, turn and place each piece correctly to finish your square.',
      'You are ranked by the order you finish in: the first player to complete theirs takes first place.',
    ],
    controls: [
      { input: 'Mouse drag', does: 'Move puzzle pieces' },
      { input: 'Left click', does: 'Pick up a piece' },
      { input: 'Right click / Scroll', does: 'Turn the piece' },
    ],
    reserved: false,
    // Built: see `41-one-piece`. The assets stage is still to do - the faces
    // are the island's pill drawn flat, and there is no sound of its own.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'op-finder',
    number: 23,
    title: 'OP Finder',
    kind: 'free-for-all',
    description: [
      "Race everyone else through the same ten CAPTCHA checks, back to back - prove you're human before they do! Match the image, type the warped text, spot the odd one out, pick what comes next, tick the right boxes, count the icons - the ten tasks cycle through all of it, same order for everyone.",
      'Get one wrong and there is a short lockout before your next try counts - guessing fast is not the same as guessing right. First to clear all ten wins; everyone else is ranked by how far they got.',
    ],
    controls: [
      { input: 'Mouse', does: 'Navigate and interact with the CAPTCHA challenges' },
      { input: 'Left click', does: 'Select images, buttons and answers' },
      { input: 'Keyboard', does: 'Type answers when required' },
    ],
    reserved: false,
    // Built: see `61-op-finder`. The assets stage is still to do - the
    // players are the island's capsule and every "image" is a Unicode glyph.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'perfect-game',
    number: 24,
    title: 'Perfect Game',
    kind: 'free-for-all',
    description: [
      'Knock down all 30 crabs! A bent column of 30 crabs moves left to right across the beach - the same column for everybody, every turn. You get one turn each while everybody else watches.',
      'You have 10 seconds to choose where to stand behind the line, the angle of your coconut throw, and when to let it go. When time runs out it rolls anyway.',
      'The coconut rolls along your path, bouncing off the walls down either side of the beach and hitting as many crabs as it can. Every crab is 1 point and the most points wins. Hit all 30 for a perfect game!',
    ],
    controls: [
      { input: 'WASD', does: 'Move your position' },
      { input: 'Mouse', does: 'Aim - set your throw angle' },
      { input: 'Left click', does: 'Roll the coconut' },
    ],
    reserved: false,
    // Built: see `51-perfect-game`. The assets stage is still to do - the beach, the
    // crabs and the coconut are primitives and the players are the island's capsule.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'pet-race',
    number: 25,
    title: 'Pet Race',
    kind: 'free-for-all',
    description: [
      'Pick your pet and race! You get 10 seconds to read the table and choose a dog, cat, rabbit, hamster or fish. Each has its own speed, grip, boost and stamina, and none of them is simply the best. Pick nothing and you get the fish, which flops on the line for the whole race.',
      'Then 3-2-1, and 30 seconds to race down a course of hedges, puddles and treats. Hold the button to boost: it drains your stamina, and letting go lets it fill again. Treats top it up.',
      'The race ends when three are home, everybody is, or the 30 seconds run out. Finishers place by time, everybody else by how far they got.',
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
    id: 'probable-stop',
    number: 26,
    title: 'Probable Stop',
    kind: 'free-for-all',
    description: [
      'Pick the bridge that holds! There are 6 rounds with 3 bridges each. You have 5 seconds to stand on one, and you can change your mind as often as you like until time runs out.',
      'Then everybody walks across. In the first 4 rounds 2 of the 3 bridges hold; in the last 2 only 1 does. A bridge that does not hold snaps and drops whoever is on it.',
      'Survive all 6 rounds, or be the last one left, to win.',
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
    id: 'punch-buggy',
    number: 27,
    title: 'Punch Buggy',
    kind: 'free-for-all',
    description: [
      'Punch your rivals off the platform! It is a round platform over the sea, and your fist comes off. Face the pointer, click to shoot your punch out, and click again to pull it back.',
      'A fist that hits somebody in the side or back knocks them out. One that meets their front, where their own fist is, is blocked and only shoves them - but a shove off the edge is out too. After 10 seconds the platform starts to shrink.',
      'Last one standing wins. You have 30 seconds on the clock.',
    ],
    controls: [
      { input: 'WASD', does: 'Move' },
      { input: 'Mouse', does: 'Aim' },
      { input: 'Left click', does: 'Punch - click again to pull it back' },
    ],
    reserved: false,
    // Built: see `20-punch-buggy`. The assets stage is still to do - the
    // fighters are the island's capsule and the fists are spheres.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'shanty-matrix',
    number: 28,
    title: 'Shanty Matrix',
    kind: 'free-for-all',
    description: [
      'Dodge the cannonballs! Survive as long as you can on the deck of a pirate ship while giant cannonballs fly across it from every direction, at every speed.',
      'A red lane lights up across the deck the moment a ball is fired, a second before it arrives. Get out of its way - and shove the other players into it! Anybody a cannonball hits goes overboard and is out.',
      'The barrage gets faster and fiercer the longer it goes. The last player standing wins.',
    ],
    controls: [
      { input: 'WASD', does: 'Move' },
      { input: 'Left click / Space', does: 'Push whoever is in front of you' },
    ],
    reserved: false,
    // Built: see `47-shanty-matrix`. The assets stage is still to do - the ship
    // and the cannonballs are primitives and the players are the island's capsule.
    // Added as a forty-third slot, the same way as 42.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'sharing-is-caring',
    number: 29,
    title: 'Sharing Is Caring',
    kind: 'free-for-all',
    description: [
      'Wear the crown as long as you can! It sits in the middle of a walled arena: walk into it and it is yours, and you score 1 point for every second you wear it.',
      'Bump into whoever is wearing it to steal it - they are knocked back and dazed for a moment. The wearer is a little faster than everybody else, so use the rocks, the wall and your boost. Most points after 1 minute wins.',
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
    id: 'spidey-senses',
    number: 30,
    title: 'Spidey Senses',
    kind: 'free-for-all',
    description: [
      "Play chicken with a spider! Everybody slowly inches toward a trapdoor hiding a spider's nest. Decide when to stop - a click stops you where you stand.",
      'The trapdoor thuds once or twice as a false alarm, then on the 2nd, 3rd or 4th thud - always before anybody can reach it - it turns dangerous: it rattles and red eyes glint under the lid. Click too late and a spider jumps out at you, and you are out. If nobody is too late, the spider takes whoever stopped furthest from the trapdoor - the chicken - with the same jump scare.',
      'Somebody goes every round. The last player remaining wins.',
    ],
    controls: [
      { input: 'WASD', does: 'Slowly move toward or away from the trapdoor' },
      { input: 'Left click', does: 'Stop where you are' },
    ],
    reserved: false,
    // Built: see `48-spidey-senses`. The assets stage is still to do - the cellar,
    // the trapdoor and the spider are primitives and the players are the island's capsule.
    // Added as a forty-fourth slot, the same way as 42 and 43.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'sprint-triathlon',
    number: 31,
    title: 'Sprint Triathlon',
    kind: 'free-for-all',
    description: [
      'Win the three-part race! Swim by clicking - 60 strokes. Bike by pressing space - 80 turns of the pedals. Then run by typing the sentence on the screen, like this one:',
      'Duck walked up to a lemonade stand, and he said to the man running the stand, hey! Got any grapes?',
      'Every right key is a stride; a wrong one trips you up for a moment. The race ends when three have finished, or at 2.5 minutes. Fastest time wins.',
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
    id: 'synchronize-steps',
    number: 32,
    title: 'Synchronize Steps',
    kind: 'free-for-all',
    description: [
      'Stay as high up the tower as you can! Everybody starts at the top of a 20-step tower, and every 2 seconds you pick how far to go down: 1, 4 or 6.',
      'Alone on a number? You stay where you are. Exactly two on the same number? You both go down that many - except a pair on 1, which drops 8. Three or more on the same number? All of you drop 8. Pick nothing and one is picked for you.',
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
    id: 'time-it',
    number: 33,
    title: 'Time It',
    kind: 'free-for-all',
    description: [
      'Stop the clock as close to the target as you can! You are given a target time, never under 6.5 seconds. The stopwatch starts on Start! and everybody can watch it for the first 2.5 seconds - then it is covered and you are counting in your head.',
      'Click to stop your timer. The round ends when everybody has stopped, or at 30 seconds. Closest to the target wins; anybody who never stopped comes last.',
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
    number: 34,
    title: 'Wack-Attack',
    kind: 'free-for-all',
    description: [
      'Whack the most moles! Walk about a field with a hammer while moles pop out of 16 holes. Stand over one and swing - the hammer comes down in front of you, the way you are facing - before it goes back down.',
      "An ordinary mole is 1 point. The golden mole is worth 3, is rarer, and ducks back down much sooner. The first hit on a mole takes it. Bring the hammer down on somebody's head instead and they are stunned for a moment.",
      'Most points after 45 seconds wins.',
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
    id: 'whats-your-rpm',
    number: 35,
    title: "What's Your RPM?",
    kind: 'free-for-all',
    description: [
      'Be first to the end of the feed! Race down a feed of 60 reels on your mini phone by scrolling the mouse wheel as fast as you can.',
      'Every so often an ad takes over and the feed stops dead until you click its Skip Ad button - somewhere different every time, and smaller the further you get. Miss it and a popup opens that has to be closed, by a small button in a different corner every time, before you can try again.',
      'The game ends at 2 minutes; everybody else places by how far down the feed they got.',
    ],
    controls: [
      { input: 'Mouse wheel', does: 'Scroll through the reels' },
      { input: 'Left click', does: 'Skip ads - and close the popup a miss opens' },
    ],
    reserved: false,
    // Built: see `40-whats-your-rpm`. The assets stage is still to do - the
    // phone and its reels are drawn on the page and the players are the island's capsule.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'wheres-midnight',
    number: 36,
    title: "Where's Midnight?",
    kind: 'free-for-all',
    description: [
      'Find the black cat first! It is a junkyard at night, and an all-black cat called Midnight is somewhere in it. Everybody searches the same yard with their own camera.',
      'Eighteen other cats are hiding in it too, and in the dark every one of them is just a pair of glowing eyes. Get your torch on one and its colour tells you whether you have found him.',
      'Click him and you have found him. A click on anything else costs 1.5 seconds before you can click again. You place in the order you find him; the round ends when three have, everybody has, or at 90 seconds.',
    ],
    controls: [
      { input: 'WASD', does: 'Pan the view' },
      { input: 'Wheel', does: 'Zoom towards the pointer' },
      { input: 'F', does: 'Torch on or off - closest zoom only, and it locks the camera' },
      { input: 'Left click', does: 'Say that is him - a wrong one costs 1.5 seconds' },
    ],
    reserved: false,
    // Built: see `37-wheres-midnight`. The assets stage is still to do - the
    // junkyard is primitives and the cat is three spheres and a tail.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'youre-the-bomb',
    number: 37,
    title: "You're The Bomb",
    kind: 'free-for-all',
    description: [
      'Escape the room before it gets crushed! A giant rolling pin is coming for everybody. Press Space to scan and reveal the bombs around you, then carefully find a way past them - pushing other players out of your way.',
      'You have 45 seconds before the rolling pin reaches the room. Anybody who survives can escape through the hole at the end - the first one out wins.',
    ],
    controls: [
      { input: 'WASD', does: 'Move' },
      { input: 'Space', does: 'Scan for nearby bombs' },
      { input: 'Left click', does: 'Push whoever is in front of you' },
    ],
    reserved: false,
    // Built: see `46-youre-the-bomb`. The assets stage is still to do - the room,
    // the bombs and the pin are primitives and the players are the island's capsule.
    // Added as a forty-second slot when every free-for-all one was taken.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'zombie-tag',
    number: 38,
    title: 'Zombie Tag',
    kind: 'free-for-all',
    description: [
      'Stay human as long as you can! Six zombies chase everybody round a walled arena full of crates. You all start in the middle, and everything is solid - bodies included.',
      'Get caught and you turn into a zombie and join the chase. Every 15 seconds, 3 more climb in over the wall, so the room only ever gets busier.',
      'You move twice as fast as a zombie. Space shoves whoever is next to you and knocks them down for a second - great for leaving somebody behind - and then needs 3 seconds before it works again.',
      'Last one still running wins. The camera never moves, so the whole arena is in front of you all round.',
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
    id: 'reserved-39',
    number: 39,
    title: 'Free slot',
    kind: 'free-for-all',
    description: [],
    controls: [],
    reserved: true,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'reserved-40',
    number: 40,
    title: 'Free slot',
    kind: 'free-for-all',
    description: [],
    controls: [],
    reserved: true,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'jackal',
    number: 41,
    title: 'Jackal',
    kind: 'one-vs-all',
    description: [
      "One player becomes the Sniper, alone at the top of a tower with a laser-sighted rifle - everyone else is a Runner, rushing the tower from spawn through crates, trees and barrels for cover. The Sniper's aim is always visible as a beam, so runners can see exactly where the danger is and move between cover to avoid it.",
      "The Sniper has the number of players times 1.5 bullets before being forced to reload, and can unscope to move freely and reposition, at the cost of precision while doing it. Each runner has 2 lives - getting hit costs one, and losing the last one is out.",
      'The Sniper wins by eliminating every runner before any of them reaches the base. The Runners win the moment even one of them reaches it.',
    ],
    controls: [
      { input: 'Sniper: Mouse', does: 'Aim' },
      { input: 'Sniper: Left click', does: 'Shoot' },
      { input: 'Sniper: Right click', does: 'Scope / unscope' },
      { input: 'Sniper: WASD', does: 'Move around the tower' },
      { input: 'Runner: WASD', does: 'Move' },
      { input: 'Runner: Mouse', does: 'Camera' },
      { input: 'Runner: Space', does: 'Jump / vault over cover' },
    ],
    reserved: false,
    // Built: see `64-jackal`.
    done: { environment: true, controls: true, assets: false },
  },
  {
    id: 'reserved-42',
    number: 42,
    title: 'Free slot',
    kind: 'one-vs-all',
    description: [],
    controls: [],
    reserved: true,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'reserved-43',
    number: 43,
    title: 'Free slot',
    kind: 'one-vs-all',
    description: [],
    controls: [],
    reserved: true,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'reserved-44',
    number: 44,
    title: 'Free slot',
    kind: 'one-vs-all',
    description: [],
    controls: [],
    reserved: true,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'reserved-45',
    number: 45,
    title: 'Free slot',
    kind: 'one-vs-all',
    description: [],
    controls: [],
    reserved: true,
    done: { environment: false, controls: false, assets: false },
  },
  {
    id: 'reserved-46',
    number: 46,
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
