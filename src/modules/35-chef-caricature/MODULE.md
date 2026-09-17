# 35-chef-caricature

## What this is

Minigame 28. **Turn by turn, everybody gets forty-five seconds at the easel while
everybody else watches.** An outline of an ingredient or a dish is on the board.

- **Tracing it:** hold left click and trace it without letting go. The moment
  your ink covers **three quarters** of the outline, the hungry duck eats the
  drawing, it is a point, and the next outline goes up.
- **Letting go early** wipes the attempt, and you start that outline again.
- **No erasing and no undo.**

Most dishes after everybody's turn wins.

**Left click + drag to trace the outline; the mouse to aim.**

It plugs into `15-minigames` with `registerMinigame('chef-caricature', ...)` and
one import line in `src/App.tsx`. Nothing else in the build knows it exists.

The catalogue files it as one-vs-all. It plays as everybody against everybody,
one turn each, because that is what the brief describes; the catalogue's `kind`
is untouched.

## The outlines

Sixteen: orange, egg, lemon, apple, pear, carrot, mushroom, fish, banana, pizza
slice, cheese, ice cream, cupcake, burger, bread and drumstick. Each is one closed
path, built from arcs, profiles and corners.

- **Resampled to a point every 2 cm of board**, so coverage is simply the share of
  those points your ink passed near. A long outline and a short one are equally
  hard to cover.
- **Scaled to the same size**, each reaching 0.78 of the way to the board's edge.
- **In an order from the seed**: all sixteen shuffled, then all sixteen again.
  **Everybody's turn gets the same sequence**, so nobody draws easier shapes than
  anybody else.

## The pen

The board runs -1 to 1 each way.

- **Covered:** a point of the outline that ink passed within **0.07** of.
- **Accepted:** the moment an attempt has covered **75%** of the outline and at
  least **60% of its ink lies within 0.13 of the outline**.

**The second rule is not in the brief, and it matters.** Without it, colouring in
the whole board covers any outline, and the game is a scribbling contest. An
attempt that is mostly scribble is never accepted, however much it covers. The
banner says *Too messy - stay on the line*, and the only way out is to let go.

The rest of the pen:

- **Letting go before an attempt is accepted wipes it.** The paper flashes red and
  the next attempt starts from nothing on the same outline.
- **After an accepted drawing, the pen has to come up** before it draws again, so
  one long hold cannot run on into the next outline.
- **Ink may go a little past the board's edge** (0.08), and no further.
- **The mouse maps to the board exactly** (see *The kitchen*), so what you see the
  pen touch is where it is.

## Turns and the end

Everybody gets one turn, in an order shuffled by the seed. Each turn is three
seconds of *Next up*, forty-five seconds of drawing, and three seconds of *fed
the duck N dishes*.

- **Somebody who has left** has their turn skipped.
- **A drawer who leaves** mid-turn goes straight to their result.
- **At the end:** most dishes first, level scores sharing a place, anybody who
  left last.

Alone it is you and **two** stand-ins, not the three or four of the other games:
every turn is watched, and three turns take two and a half minutes.

## The kitchen

**The camera looks straight down -Z, square on to the easel.** A flat thing square
on to the camera is drawn without perspective distortion, so the board is an
exact square on the screen and the mouse maps to it by scaling alone. The camera
is slid back until the easel, the duck and the chef all fit, whatever shape the
window is, and moved sideways and up to centre them; it never turns. Tested at
eight window shapes, and the mouse maps back to the board point it is over to a
millionth.

What is in it:

- **The paper** shows the outline as a grey dashed line, the parts of it already
  covered in green, and the ink in the drawer's colour.
- **The hungry duck** stands to the right with its beak towards the easel, bobbing
  and opening its beak a little now and then. When a drawing is accepted, the
  drawing peels off the paper on a round plate and flies into the duck's open
  beak, and the duck gulps.
- **The drawer** stands at the easel's left in a white chef's hat, leaning in
  while the pen is down.
- **Everybody else** stands along the back wall either side of the easel,
  watching.

On the screen:

- **Along the top:** whose turn of how many, the time left, and a pill per player
  with their dishes (✏️ on the drawer's).
- **A coverage meter** with a mark at 75%, green once it is there and red when
  the attempt is too messy.
- **A banner:**
  - *Next up* before a turn;
  - *Hold left click on the outline and trace it*;
  - *Yum! +1*;
  - *Let go for the next one*;
  - *You let go - wiped*;
  - *Too messy*;
  - *… is drawing*, for watchers;
  - *… fed the duck N dishes* after a turn.

## One kitchen across the lobby

**The drawer draws on their own screen**, where the pen has to feel immediate, and
**sends their pen to everybody**: batches of board points, twenty a second. Each
batch says which turn, which outline and which attempt it belongs to, and whether
the pen came up after it. The points are exactly the ones the drawer's own stroke
recorded: on the board, to the thousandth.

**Everybody else, host included, runs those batches through the same pen**
(`applyInk`), so:

- watchers see the drawing as it is made, about a tenth of a second behind;
- the host decides every dish by the same arithmetic the drawer's screen used,
  and so finds exactly the same dishes;
- nobody's word is taken for a dish, not even the drawer's own.

The relay is a WebSocket, so batches arrive, and in order. A batch is at most 300
points, so it fits the relay's message size even at the board's edge.

**The host sends a snapshot ten times a second**: the clock, the order, the turn,
when it started, which outline is up, and the scores. Outlines are never sent; the
seed makes them. A copy that heard the pen before the host's snapshot caught up
can be a dish ahead, so it keeps whichever outline is further on and the drawer's
higher score.

**One lesson this game taught.** The screen keeps **one game object, changed in
place**, and redraws by a counter rather than copying the game each frame. The pen
changes the game straight from pointer events, between frames. With a copy each
frame, a pen event landing before React drew the copy changed the discarded one:
the score survived, because it lives on a player object both copies share, but
*which outline is up* was lost. The same outline could then be fed to the duck
twice. The browser run caught it (a drawing scoring two); the other minigames
avoid it by handling input inside the frame.

The same lessons as the other minigames: a guest keeps listening after the game
ends; somebody who leaves the lobby is out; pausing in a lobby stops only your
hands, and lifts your pen. Alone, the clock stops.

## Stand-ins

**Only when you are alone.**

- **Pace:** each looks at a new outline for 0.5-1.1 s, puts the pen down somewhere
  on it, and follows it round, wobbling up to 1-3.5 cm off the line, at its own
  steady 0.75-1.1 board units a second.
- **Slips:** one attempt in seven or so, its hand slips somewhere in the first
  two thirds, it lets go, and it starts that outline again.

That comes to roughly eight to twelve dishes a turn. All of it comes from the
seed, so the same game plays out the same way. Tested.

## Public contract

Nothing depends on this module. The exports are here because they are worth
testing, not because anybody else needs them.

| Export | What it is |
| --- | --- |
| `OUTLINE_NAMES`, `outlineNamed`, `outlineFor`, `Outline`, `Pt`, `SIZE`, `SPACING` | The outlines, and the `k`th of a game from its seed. |
| `pointAlong`, `toOutline`, `toSegment` | Walking an outline, and distances to it. All pure. |
| `TURN`, `TRACE`, `COLOURS` | Turn timings; how near, how much and how tidy; eight colours. |
| `createGame`, `Game`, `Player`, `Stroke`, `Entrant`, `Phase`, `turnOrder` | A game at its start. |
| `penDown`, `penMove`, `penUp`, `coverage`, `tidiness` | The pen. All pure. |
| `tick`, `stepGame`, `phase`, `drawer`, `timeLeft`, `currentOutline`, `leave`, `placings` | The clock, the turns, leaving, and who placed where. |
| `botDraw`, `botPlan`, `BOT` | The stand-ins. |
| `newGame`, `waitingGame`, `gameRoster`, `nextSeed`, `myId`, `ME`, `SOLO_PLAYERS`, `MAX_PLAYERS`, `GameSetup` | Putting a game together from the lobby. |
| `encodeSnapshot`, `decodeSnapshot`, `applySnapshot`, `encodeInk`, `decodeInk`, `applyInk`, `SNAPSHOT_TAG`, `INK_TAG`, `MAX_POINTS`, `Snapshot`, `Ink`, `WirePlayer` | The wire. Decoding refuses a message whole rather than half-reading it. |
| `cameraFor`, `frameScene`, `boardPoint`, `boardToScreen`, `BOARD`, `DUCK`, `CHEF`, `POINTS`, `FOV`, `FILL`, `Shot` | The still camera, and the mouse on the board. |
| `ChefCaricatureScene`, `PALETTE` | The 3D view. |
| `ChefCaricatureScreen` | The panel `15-minigames` draws. |

## Invariants you may rely on

- **Every outline is the same size, its points evenly spaced, round a closed
  path.** Tested for all sixteen.
- **The same seed, the same outlines, in the same order for everybody**, all
  sixteen before any comes again. Tested.
- **A careful tracing of any outline, from anywhere round it, is accepted the
  moment it covers three quarters.** Tested for all sixteen.
- **Ink kept off the outline, or a scribble over the whole board, is never
  accepted.** Tested in Node, and in the browser (a scribble covering 100% at 31%
  tidy).
- **Letting go wipes the attempt; the next starts from nothing, on the same
  outline.** Tested in Node and in the browser.
- **An accepted drawing is exactly one dish, and the pen must come up before the
  next.** Tested in Node, and in the browser over 25 drawings.
- **Only the drawer draws, only in their turn, and an attempt is never begun
  twice.** Tested.
- **Everybody gets one turn, in the seeded order; leavers are skipped, and a
  leaving drawer's turn ends.** Tested.
- **The host and every watcher find exactly the dishes the drawer's screen
  did**, with the pen relayed late and attempts slipping. Tested in Node with
  four players, and with eight real browsers.
- **The board is square on the screen, and the mouse maps to it exactly, at every
  window shape.** Tested.

## Deliberate non-goals

- No models: the duck and the chef's hat are primitives, and the outlines are
  drawn paths.
- No moving camera.
- No erasing part of a drawing, and no undo.
- No sound. No score kept between games.

## Known limitations

- **The drawer is not checked on the timing of their pen.** The host replays
  positions, not times, so a modified client could send a perfect tracing
  instantly. The coverage and tidiness rules still apply to it.
- **Watchers see the drawing about a tenth of a second late**, and anybody who
  joins mid-attempt sees nothing of it until the next.
- **The scripted player in `run-localrot` traces perfectly**, and fed the duck 24
  dishes in a turn. A person with a mouse will manage far fewer; how many feels
  fair - and so whether 0.07 of reach and 75% are the right numbers - wants
  somebody to play it.
- **Eight players is six and a half minutes**, most of it watching. That is what
  the brief asks for; a shorter turn is a one-number change (`TURN.length`).
- **The duck eats whatever you drew, not the outline:** the plate that flies into
  its beak shows your ink.

## How to review

Open the minigames dashboard (alone, or as host of a lobby), open **Chef
Caricature** and press play.

- **Watch a stand-in's turn.** The chef in a hat at the easel, an outline in grey,
  green creeping round it as the ink goes on, the drawing flying into the duck's
  beak, the duck gulping, and a slip now and then (a red flash, and it starts
  again).
- **On your turn, trace an outline.** Hold left click on the line and follow it.
  The meter should rise, and the duck should take it the moment it passes the
  mark, with *Yum! +1*.
- **Keep holding after a dish.** Nothing should draw until you let go and press
  again.
- **Let go half way.** A red flash, *You let go - wiped*, and the meter back to
  nothing on the same outline.
- **Scribble all over the board.** The meter can pass the mark, but the banner
  should say *Too messy*, and the duck should not take it.
- **Draw off the edge of the board and back without letting go.** The stroke
  should carry on.
- **Check the pen is where the cursor is**, all over the board, and again after
  resizing the window, tall and wide.
- **The results** should put the most dishes first, level scores sharing a place,
  and **again** for a new order and new outlines.

### With two or more browsers

- **Everybody should see the same outline** and the same drawer, and the drawing
  as it is made.
- **A guest's dish** should reach every screen and the scores at the same time.
- **Everybody should get a turn**, in the same order on every screen.
- **A drawer closing their browser** should end their turn and move on.
- **As a guest, the results** should say *waiting for the host*. The host's
  **again** should start everybody over.

`run-localrot` covers a wiped attempt, a rejected scribble and a turn of accepted
tracings with `solo.mjs --game chef-caricature --steer`, and a guest's drawing
seen mid-stroke and agreed on by eight real browsers with `lobby.mjs --games
chef-caricature`.

## Gate record

Not yet gated by a human.

## Measured

Not measured; the budgets in `pipeline.json` are unset. Drawn per frame:

- The floor, the wall, and the easel in five pieces.
- The duck in about twelve meshes.
- Two calls a body per player (the island's avatar), plus the drawer's hat.
- The flying plate, only while it flies.
- One shadow-casting directional light and a hemisphere light.

The paper is a 1024-pixel canvas, redrawn only when what is on it changes.
