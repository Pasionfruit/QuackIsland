# 49-needs-a-walmart

## What this is

Minigame 45, free-for-all: **OG Black Friday.** Everybody sprints round
a supermarket pushing a trolley, with **a grocery list of three of the ten things
the store sells**. Grab yours, put back anything you don't need, **ram the others'
trolleys to knock their shopping out**, and be **first through a checkout with
your whole list.**

**WASD to move, left click to pick up or put back, Space to ram your trolley.**

It plugs into `15-minigames` with `registerMinigame('needs-a-walmart', ...)` and
one import line in `src/App.tsx`. Like 42 to 44 it arrived with every free-for-all
slot taken, so the free-for-all target went from 33 to 34 and it took 45.

It was first called *This Place Needs A Walmart*; it is **OG Black Friday** now.
Its id, `needs-a-walmart`, and this module's name stay as they were - an id is a
permanent handle, not a title. The store itself carries no brand, logo or
likeness of any real one.

## The store

A 40 m by 28 m floor, the door on the south wall.

- **Twelve island shelves** in four rows of three, waist high (1.1 m) with the
  goods on top, so the camera sees across the aisles; **fridges along the north,
  west and east walls.**
- **Four checkouts** by the door, each with a green lane beside it and a green
  light on a pole over it.
- **Everybody starts just inside the door**, in a line.

## The goods and the lists

**Ten things**: milk, bananas, bread, eggs, cheese, apples, cereal, toilet paper,
watermelon, soda - each built from primitives in its own shape and colour.

**Every list is three different things**, from the seed (`listsFor`). **There is
exactly one of each thing on the shelves for everybody whose list has it**, and
one of anything on nobody's list (`stockFor`) - so taking something you don't
need takes it from somebody who does, and a spill matters. Each goes on its own
place on a shelf top, from the seed. The lists and the shelves are the same on
every screen and are never sent.

## The rules

- **Sprinting** at 5.5 m/s. You and your trolley are one round body; you face the
  way you last walked. Nobody walks through a shelf, a counter or anybody else.
- **A click** (`click`) picks up the nearest thing within 1.5 m that is not in a
  trolley - off a shelf or the floor, **yours or not** - if there is room.
  **A trolley holds three.** With nothing in reach, or a full trolley, a click
  **puts something back** on the floor in front of you: the newest thing you
  don't need, or failing that the newest.
- **Space** (`ram`) shoves your trolley forward hard. For 0.45 s it knocks into
  anybody it touches: **they are knocked flying, stunned for 0.9 s - no walking,
  no clicking - and the newest thing in their trolley flies out and lands on an
  empty place on a shelf somewhere in the store, at random** (`landing`), for
  anybody to find - the owner can follow its beam back to it. Where it lands comes
  from the seed and how many things have spilt before, so the same game spills
  the same way. Once a shopper per ram; 1.6 s between rams.
- **Down a checkout lane with your whole list** in your trolley and you are
  through, at that moment, and gone out of the door.
- **The end** (`judgeEnd`): when three are through, when all but one are, 25 s
  after the first is through, or at three minutes.

## Placings

Those through first, **first through first**; then those still shopping, **the
more of their list in their trolley the better**, then the nearer a till; then
anybody who left, the last to leave first. Somebody who leaves drops their
trolley's contents on the floor where they stood.

## Controls

- **WASD / arrows** walk, fixed to the store: W is into it, away from the door.
- **Left click** picks up, or puts back.
- **Space** rams.
- Paused, or the game over: the keys are let go of.

## On the screen

- **From above and behind you**, the camera following.
- **The goods** are drawn bigger than life on the shelves and floor so they can be
  found from up there, and life size riding in a trolley.
- **Everything on your list still out on a shelf or the floor has a beam of light
  over it in its own colour**, bobbing - on your screen only.
- **What you can grab has a white ring round it**, and the banner says what it is
  and whether it is on your list.
- **Bottom left, your grocery list**, crossed off as you get things, **and your
  trolley**: three slots, anything not on your list outlined red.
- **The banner at the top**: what is in reach, *Trolley full - click to put back
  the …*, *Got everything - to a checkout!*, *Rammed!*, *Through the checkout -
  1st!*
- **The HUD**: the time left (the three minutes, then the 25 s after the first is
  through), how many are through, and a pill per player with how much of their
  list they have, or their place once through.
- **A ram** is a lunge; **being rammed**, a spin, and whatever flies out of your
  trolley arcs high across the store to where it lands.
- **Sound**: a pop as you pick something up, a step as you put it back, a whoosh
  as you ram, a bonk if you are rammed and a thud for anybody else, a flourish as
  anybody gets through.
- **The results** are the podium, from `useFinish`.

## One store across the lobby

**The host runs everything**: it walks everybody - itself, the stand-ins and each
guest from what the guest says its hands are doing - and resolves every pick-up,
put-back, ram and checkout, and sends a snapshot twenty times a second: where
everybody is and faces, what is in each trolley, who is through, who is stunned,
and where every item is. Two people can reach for the same thing at once, so one
screen has to decide.

**A guest sends its hands** (`nw-in`): which way it walks, and its clicks and rams
as **running counts**, so a repeated message never doubles one and a lost one
never loses one. **Its own shopper moves at once on its own screen**, round the
shelves, and is eased to where the host has it. What it picked up, and a ram that
lands on it, come from the host.

The same lessons as the other minigames: a guest keeps listening after the game
ends; somebody who leaves the lobby is out; a pause stops the round for everybody.

## Stand-ins

**Only when you are alone**: you and five stand-ins.

- **They find their way round the shelves** on a half-metre grid (`walkField`,
  Dijkstra over eight neighbours), from the nearest free cell to where they stand.
- **Each goes for the nearest thing on its list** that is still out - nearest by
  walking, not as the crow flies - picks it up and **stops to look at it** for
  0.4-1.1 s; with all three it **makes for the nearest till**.
- **If everything it still needs is in somebody's trolley, it goes after them and
  rams them.** On the way it rams whoever is close in front of it now and then,
  far more readily if they carry something it needs.
- **They walk at 62-90% of a sprint.**

All from the seed. Over twelve seeds and two to eight stand-ins, the first through
takes **about 17 seconds**; a person who heads straight for the beams can beat
that.

## Public contract

Nothing depends on this module. The exports are here because they are worth
testing, not because anybody else needs them.

| Export | What it is |
| --- | --- |
| `STORE`, `SHELVES`, `SOLIDS`, `COUNTERS`, `LANES`, `SLOTS`, `ITEMS`, `LIST_SIZE` | The store and what it sells. |
| `listsFor`, `stockFor`, `spawnPoint`, `Slot`, `Stocked`, `Rect` | The lists and the shelves, from the seed. |
| `collide`, `floorSpot`, `inRect`, `inLane` | The floor. |
| `GRID`, `blocked`, `cellOf`, `cellMiddle`, `freeCell`, `walkField`, `downhill` | The way round, for the stand-ins. |
| `BODY`, `CART`, `RAM`, `ROUND`, `COLOURS` | The numbers. |
| `createGame`, `freshItems`, `Game`, `Player`, `Item`, `Entrant` | A game at its start. |
| `steer`, `click`, `reachable`, `toPutBack`, `ram`, `ramLeft`, `ramming`, `landing`, `move` | Walking, picking up, putting back, ramming, and where a spill lands. |
| `stillNeeds`, `gotten`, `isShopping`, `stunned`, `canAct`, `wrapAngle` | Where a shopper is up to. |
| `tick`, `stepGame`, `judgeEnd`, `firstDone`, `toTill`, `leave`, `placings` | The clock, the end, and who placed where. |
| `BOT`, `botSteer`, `goalFor`, `fieldTo` | The stand-ins. |
| `newGame`, `waitingGame`, `gameRoster`, `nextSeed`, `myId`, `ME`, `SOLO_PLAYERS`, `MAX_PLAYERS`, `GameSetup` | Putting a game together from the lobby. |
| `encodeSnapshot`, `decodeSnapshot`, `applySnapshot`, `encodeIntent`, `decodeIntent`, tags and wire types | The wire. Decoding refuses a message whole - an item in two trolleys included - rather than half-reading it. |
| `StoreScene`, `PALETTE`, `CartSpot` | The 3D view. |
| `StoreScreen` | The panel `15-minigames` draws. |

## Invariants you may rely on

- **Every list is three different things; the same seed and headcount give the
  same lists and the same shelves.** Tested.
- **There is one of each thing for everybody who needs it, one of anything nobody
  does, each on its own place, and somewhere to stand in reach of every place.**
  Tested.
- **Nobody walks through a shelf or out of the store; nothing is put down inside
  a shelf; a body pushed out of a wall fridge comes out into the room.** Tested.
- **Every free cell of the floor can be walked to from the door**, and the way
  downhill always gets there. Tested.
- **A click takes the nearest thing in reach and nothing further; a full trolley
  puts back the newest spare rather than taking more; anything can be taken, on
  your list or not.** Tested.
- **A ram knocks, stuns and sends the newest thing to an empty shelf; it misses
  anybody behind; it has a cooldown.** Tested.
- **A spill lands somewhere different each time, never on top of anything, and
  the same way for the same game.** Tested.
- **Through only down a lane with the whole list; first through first; the rest by
  their lists, then how near a till.** Tested.
- **The stand-ins get their lists and through in well under the limit, ram now
  and then, and play the same way every time.** Tested.

## Deliberate non-goals

- No models: the store, the goods and the trolleys are primitives, players are
  the island's capsule.
- No real store's likeness.
- No music of its own: the round is silent under the cues until an entry goes into
  `ROUND_MUSIC` in `15-minigames`.

## Known limitations

- **A guest sees what it grabbed a round trip late**, and is rammed on its own
  screen a round trip late. Walking is predicted; clicks and rams are the host's.
- **Picking up takes the nearest thing**, not necessarily the one you meant, when
  two are within reach.
- **Some emoji on the list card depend on the machine's emoji font.**
- **Not played with two browsers yet.** The wire is tested in Node only, and
  `lobby.mjs` does not know this game.

## How to review

Open the minigames dashboard (alone, or as host of a lobby), open **OG Black
Friday** (45) and press play. `node .claude/skills/run-localrot/scripts/solo.mjs
--game needs-a-walmart --steer` shops with real keys and clicks, rams once and
screenshots it.

- **During the three, two, one**, you should be by the door with a trolley, the
  tills just ahead, the aisles beyond, your list bottom left.
- **Walk with WASD.** W goes into the store. Walk into a shelf: you should stop.
- **Follow a beam** to something on your list. A white ring should come up round
  it and the banner should say *Click to grab the …*. Click: it should ride in
  your trolley and be crossed off.
- **Grab something that is not on your list**: outlined red in your trolley. Fill
  the trolley: *Trolley full - click to put back the …*, and a click should put it
  on the floor in front of you.
- **Ram a stand-in** that is carrying something: they should spin, and something
  should fly out of their trolley in a high arc and land on a shelf somewhere
  else in the store. Get rammed: *Rammed!*, and you can't move for a
  moment.
- **With all three**, walk down a green lane: *Through the checkout - 1st!*
- **The results** should be the podium, first through first.

### With two or more browsers

- **Everybody should see the same things on the same shelves**, and each their own
  list and beams.
- **Two reaching for the same thing**: only one gets it, on every screen.
- **A guest ramming the host** should spill the host's shopping on both screens.

## Gate record

Not yet gated by a human.

## Measured

Not measured; the budgets in `pipeline.json` are unset. Drawn per frame: the
floor, five walls, the door, fifteen shelves with their tops, four counters with
belts and tills, four lanes with their lights, every item (a few meshes each) with
its beam and ring, and per player the island's avatar and a trolley of about a
dozen meshes.
