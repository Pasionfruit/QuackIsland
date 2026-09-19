# 23-lady-luck

## What this is

**Minigame 11.** A meadow of three-leaf clovers with, always, exactly three
four-leaf clovers hidden among them. Find one and click it:

- It is yours: ringed in your colour, and nobody else can have it.
- A new four-leaf clover grows somewhere else in the field.

A click on anything else - a three-leaf clover, a claimed one, bare grass - costs
**a point** and a second before you can click again. Every click during that
second is spam, and costs **a point** too. Scores can go below zero. Highest
score when the forty-five seconds are up wins.

Like Duck Hunt: a fixed view, mouse to aim, left click, a cooldown, a
scoreboard, most points wins.

It plugs into `15-minigames` and nothing else in the build knows it exists.
Importing the module registers it - one line in `src/App.tsx`.

This is the **environment** and **controls** stages done. The assets stage is
not: the clovers are flat heart-shaped leaves.

## The rules, and where each one lives

| The brief said | Where it is |
| --- | --- |
| A field of three-leaf clovers | `layField`: 220 clovers on a jittered 20 x 11 grid |
| One of the 3 hidden four-leaf clovers | `FIELD.hidden`; `game.lucky` is always three long |
| Click a valid four-leaf clover to claim it | `click` → `'claim'` |
| Your colour forms a circle around it | the scene's claim ring, `COLOURS` |
| Claimed, it cannot be selected by others | `click` on a claimed clover is a miss, and the claim stands |
| As many as possible before the round ends | a new one grows per claim (`grow`); `FIELD.duration` 45 s; `placings` |
| Mouse - aim; left click - select a clover | `groundHit`, `cloverAt`, the crosshair |

## Two things the brief left open

- **"Three hidden" is always three at once**, not three for the whole round:
  every claim grows another, at least 3.5 units from the other two and from the
  one just claimed, so "as many as possible" means something. The catalogue text
  says so.
- **A click that does not claim costs a point and a second** (`FIELD.penalty`,
  `FIELD.cooldown`), as Duck Hunt's shots cost time. Without it, clicking every
  clover in a sweep finds them all faster than looking does.
- **Spam costs a point a click.** A click while your own crosshair's ring is
  still filling back up is judged on the clicker's own screen, not the host's: a
  guest counts its spam and sends the running count with its clicks (said again
  until the host has it, taken once), so a click the guest saw as fair is never
  punished for reaching the host a few frames early. A click while a claim is
  still waiting on the host is neither.

## The field

Every clover has its own place, turn, size and shade of green from the field's
seed.

- **Four-leaf clovers are drawn a touch smaller**, so one is no bigger than a
  three-leaf clover; same greens. The only way to find one is to count leaves.
- **No two clovers' leaves overlap** (the jitter is held to that, tested), so
  counting leaves is always possible.
- **Tufts of grass.** Nine hundred of them to look past.

## Secrets

- **The field's seed is sent**: everybody draws the same meadow.
- **Where four-leaf clovers grow comes from a second seed** (`luck`, from
  `crypto`) that the host never sends, so the next one's spot cannot be worked
  out in advance. The three waiting now are sent, because every browser has to
  draw them.

## One round, and it is the host's

- **The host settles every click** - its own, the stand-ins', the guests' - in the
  order they arrive, and sends the round (`ll`) twelve times a second. Two
  hunters clicking the same clover: the first click the host takes claims it, and
  the second is a miss.
- **A guest sends a click** (`ll-in`) with a number that goes up every click,
  said again every 150 ms until the host's copy of that hunter has taken it, and
  counted once.
- **A guest's own click shows at once.** A click on a four-leaf clover is ringed
  in white until the host says whose it is; a click that cannot be a claim starts
  the cooldown on the spot. Clock and cooldowns run on between snapshots.
- **a pause stops the round for everybody.** Alone, the clock stops.
- **The canvas is rendered once**, and the scene redraws itself from a ref each
  frame - see Duck Hunt's notes.

**The roster is the lobby**, host first, up to eight. Alone, three stand-ins fill
in. A stand-in spots each four-leaf clover 8 to 24 seconds after it grows, and
clicks it if it is still there. In about one in three five-second windows it
misclicks a three-leaf clover and waits out the cooldown.

## Seeing what happened

- **Claims.** A claimed clover gets a ring in the claimer's colour, landing with
  a pop.
- **Misses.** A missed click leaves a ring in the clicker's colour that shrinks
  and fades.
- **The crosshair** replaces the pointer: in your colour when a click will count,
  its ring emptying and filling back up over the cooldown.
- **"🍀 Lucky! +1"** flashes when you claim one.
- **The HUD.** The clock, red for the last ten seconds, and everybody's claims.

## The camera does not move

High and steep (66 degrees) over the whole field, so clovers are seen from nearly
above. Fitted to the field's corners and tested at eight window shapes. So is a
click: every clover, centre and off-centre, projected through a real camera,
back down to the ground, and found again.

## Public contract

Exported because it is worth testing, not because anything else needs it.

| Export | What it is |
| --- | --- |
| `FIELD`, `COLOURS` | The rules and the look, as numbers. |
| `layField`, `fieldFor`, `cloverAt` | The meadow. Pure. |
| `createGame`, `click`, `stepGame`, `fourLeaf`, `timeLeft`, `placings` | The round. Pure. |
| `Game`, `Hunter`, `Clover`, `Lucky`, `Claim`, `Outcome`, `Entrant` | Its shapes. |
| `botClicks`, `BOT_SPOTS`, `BOT_MISS_EVERY`, `BOT_MISS_CHANCE` | The stand-ins. |
| `newGame`, `gameRoster`, `secret`, `waitingGame`, `myId`, `ME`, `SOLO_HUNTERS`, `MAX_HUNTERS` | Dealing a round. |
| `encodeSnapshot`, `decodeSnapshot`, `applySnapshot`, `encodeIntent`, `decodeIntent`, `SNAPSHOT_TAG`, `INTENT_TAG` | A shared round on the wire. Pure. |
| `frameScene`, `groundHit`, `HALF`, `POINTS`, `TILT`, `FOV`, `FILL` | The camera and clicks. Pure. |
| `LadyLuckScreen` | The panel the registry draws. |

## Invariants you may rely on

- **The same seed is the same meadow; no two clovers' leaves overlap.** Tested.
- **Always exactly three four-leaf clovers hidden, at least 3.5 apart; a new one
  grows away from the one just claimed.** Tested.
- **A free four-leaf clover is claimed with no cooldown; anything else is a miss,
  a point lost and a second's wait; a claim is never taken from its claimer.**
  Tested.
- **A click during the cooldown is spam, a point lost for each, a running count
  taken once however often it is said.** Tested.
- **A click said twice counts once; nothing counts after the round.** Tested.
- **Ranked by claims, level scores sharing a place.** Tested.
- **Stand-ins spot clovers seconds after they grow, miss now and then, and take a
  sensible share of a round.** Tested.
- **Eight hunters with a lossy network agree on every claim and score, no clover
  is claimed twice, and a score is claims less a point per miss and per spam.**
  Tested.
- **The luck seed is never sent.** Tested.
- **The whole field is in frame at any window shape, and a click on a clover is
  that clover.** Tested.

## Deliberate non-goals

- No models, no sound.
- No moving camera, no zoom.
- No hiding the three waiting clovers from a browser that has to draw them.

## Known limitations

- **A browser draws where the three waiting clovers are**, so a player with the
  dev tools open can read them. The next one's spot stays secret.
- **Two clicks on the same clover a ping apart go to whoever the host hears
  first**, not whoever clicked first.
- **In a small window the clovers are small.** The field is sized for a laptop
  screen or bigger.
- **The shared plumbing is copied a ninth time** - camera fit, host/guest hook,
  results card, and now the crosshair. Moving it into `15-minigames` is overdue.

## How to review

Open a lobby, leave the game on Volcano Island, press **minigames**, open
**11 · Lady Luck**, and press **play**.

- **Look at the field.** A meadow of clovers and grass tufts; the pointer is a
  crosshair in your colour.
- **Hunt.** Somewhere are three with four leaves. Click one: a ring in your
  colour pops round it, "Lucky! +1", your score goes up.
- **Click a three-leaf clover.** A ring fades out on it, a red "-1", your score
  goes down, and the crosshair's ring empties and refills over a second.
- **Click again while it refills.** Another "-1" for each click.
- **Click a clover somebody has claimed.** A miss; their ring stays.
- **Watch the stand-ins.** Rings in their colours appear now and then, and misses
  flash.
- **At forty-five seconds,** the results, most clovers first. **Again** deals a new field.

### With two browsers

- **Both see the same field.**
- **Guest: claim one.** The host sees the ring in the guest's colour.
- **Both click the same clover.** One ring, one score; the other is a miss.

## Gate record

Not yet gated.

## Measured

Not measured against the world's budget, because it does not draw into the
world's canvas. The meadow is three instanced draws - every leaf, every middle,
every tuft - plus two ground planes, a ring per claim, and a ring per hunter's
miss. One shadow-casting light.

Like the other minigames, a **second WebGL context** while a round is up.
