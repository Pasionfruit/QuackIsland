# 50-milf-fishing

## What this is

Minigame 46, free-for-all: **M.I.L.F (fishing).** Everybody fishes off one dock for
**25 seconds**. **Watch your rod**: when a fish bites it bends - **a slight bend
is a small fish, a dramatic bend a much bigger one** - tugs for a second or two,
and lets go. **Click to pull.** Pull while a fish is on and you land it; **pull
when the rod is not bent and you get nothing.** Five sizes of fish bite at
unpredictable times, each player their own, and **there is no guarantee the
biggest - *your mom* - ever appears**. The biggest total catch wins.

**Left click pulls the rod.**

It plugs into `15-minigames` with `registerMinigame('milf-fishing', ...)` and one
import line in `src/App.tsx`. Like 42 to 45 it arrived with every free-for-all
slot taken, so the free-for-all target went from 34 to 35 and it took 46.

## The fish

| Fish | Weight | Bends the rod | How often it is the one biting |
| --- | --- | --- | --- |
| perch | 0.3-0.8 kg | a little (0.18) | 40% |
| bass | 1.5-3 kg | a fair way (0.36) | 29% |
| pike | 4-7 kg | a long way (0.55) | 18% |
| catfish | 10-18 kg | nearly over (0.76) | 9% |
| **your mom** | **25-40 kg - the heaviest** | right over (1.0) | 4% |

Every fish bends the rod further than any smaller one can, even at the top of its
tugging, so the bend always tells the fish.

## The bites

**Each player has their own run of bites**, dealt from the seed before the round
(`bitesFor`): the first between 0.8 and 2.5 s in, each fish on for 1.1-2.2 s (a
little longer the bigger it is), then a quiet 0.6-3 s before the next. That is
about six or seven bites a round. Over many rounds **more than half of players
never get a your-mom bite at all.**

A bite (`bendAt`): the rod **bends over in 0.35 s** to its fish's bend, **tugs**
while the fish is on, and **straightens in 0.25 s** as it lets go.

## The rules

- **A pull** (`pull`) lands the fish on the hook at that moment - bitten at least
  0.12 s ago and not let go yet - or **nothing**, if the rod was straight, the
  fish had just touched the bait, or it had already let go.
- **Every pull, fish or not, takes 1.2 s to cast again** (`RECAST`). The rod is
  up and the line out of the water: **nothing can be caught**, a click does
  nothing, and anything that bites meanwhile is missed while it is on.
- A fish landed is in the bucket: it never bends the rod again.
- **So every bite is a choice**: take this fish now, or let it go and wait for a
  bigger one that may never come.
- **The round is 25 seconds.** The biggest total catch places first; level
  catches share - nothing caught at all is level with nothing caught at all.

**What anybody has caught is worked out from their pulls alone** (`playBack`):
their bites are the seed's, and playing their pulls back against them says what
each landed. That is the whole of what a player is.

## Controls

- **Left click** pulls. During the three-two-one, and while casting, it does
  nothing.

## On the screen

- **A lake at sunset**, hills and pines round it, and one long dock with everybody
  along it in a row, each with a rod, a line, a bobber and a bucket.
- **The camera** sits between you and whoever is on your left, looking past your
  right shoulder, so your rod stands out against the water.
- **The rod** is jointed and bends from butt to tip by exactly as much as the
  fish on it - a gentle arc for a perch, the tip down to the water for your mom -
  and tugs. **The bobber** is dragged under.
- **A pull** whips the rod up; **a fish** comes flying out of the water over your
  head into your bucket, as big as it is; the bobber flies back out on the cast.
- **Everybody's rod bends for their own fish**, so you can see who has what on.
- **The banner**: *Caught a pike! 5.3 kg*, or *Nothing! the rod wasn't bent*, or
  *Casting…*
- **Your catch**, bottom left, fish by fish with the total.
- **The HUD**: the 25 seconds, your total, and everybody's total, best first.
- **Sound**: a plop when something takes your bait - the same for every fish, so
  it says look, not what is there - a whoosh for a pull, a pop for a small fish, a
  bigger splash for a big one, a buzz for nothing, and a small pop for anybody
  else's catch.
- **The results** are the podium, from `useFinish`.

## One dock across the lobby

**Only the pulls go on the wire.** The host keeps the clock and everybody's pulls -
its own, the stand-ins' and each guest's - and sends them twenty times a second
(`mf`). The bites come from the seed and what each pull landed comes from the
pulls, so every screen works out every rod and every catch for itself.

**A guest is judged on its own timing, not its ping.** It sends **every pull it has
made, by its own clock** (`mf-in`); the host takes those it has not seen, believing
a reading up to half a second old (`PULL_SLACK`) and none from the future. A guest
pulls at once on its own screen - its rod whips up and the fish comes out the
moment it clicks - and keeps its own pulls on top of the host's until the host
has them.

The same lessons as the other minigames: a guest keeps listening after the game
ends; somebody who leaves the lobby is out; a pause stops the round for everybody.

## Stand-ins

**Only when you are alone**: you and five stand-ins.

- **Each has its own greed**: the smallest fish it will take early on - a bass, a
  pike, a catfish, or holding out for your mom - and it gives that up as the clock runs
  down, taking anything in the last five seconds (`wantsAt`).
- **It sizes each fish up from the bend, not always right**: 15% of the time it
  takes a fish for one size bigger or smaller.
- **It pulls after its own reaction**, 0.25-0.75 s after the bite - sometimes after
  the fish has gone, landing nothing.
- **Now and then it loses its nerve** and pulls on a straight rod.

All from the seed. Six stand-ins land between 1 and about 45 kg a round.

## Public contract

Nothing depends on this module. The exports are here because they are worth
testing, not because anybody else needs them.

| Export | What it is |
| --- | --- |
| `FISH`, `ODDS`, `BITE`, `RECAST`, `LENGTH` | The numbers. |
| `bitesFor`, `fishFor`, `Bite` | Each player's bites, from the seed. |
| `bendAt`, `Bend`, `hooked`, `playBack`, `Played` | How a rod bends when, and what a set of pulls lands. |
| `PULL_SLACK`, `COLOURS` | How old a guest's pull may be; the colours. |
| `createGame`, `Game`, `Player`, `Entrant` | A game at its start. |
| `pull`, `canPull`, `castLeft`, `bitesOf`, `catches`, `total` | Pulling, and what you have. |
| `tick`, `stepGame`, `judgeEnd`, `leave`, `placings` | The clock, the end, and who placed where. |
| `BOT`, `botPull`, `wantsAt` | The stand-ins. |
| `newGame`, `waitingGame`, `gameRoster`, `nextSeed`, `myId`, `ME`, `SOLO_PLAYERS`, `MAX_PLAYERS`, `GameSetup` | Putting a game together from the lobby. |
| `encodeSnapshot`, `decodeSnapshot`, `applySnapshot`, `encodeIntent`, `decodeIntent`, tags and wire types | The wire. Decoding refuses a message whole rather than half-reading it. |
| `PondScene`, `PALETTE`, `SPACING`, `standAt` | The 3D view. |
| `PondScreen` | The panel `15-minigames` draws. |

## Invariants you may rely on

- **The same seed and player, the same bites; another player, others.** Tested.
- **Bites come one at a time, each a real fish at a real weight.** Tested.
- **Small fish are common and big ones rare, and the biggest is often never
  offered.** Tested.
- **Bigger fish weigh more and bend further; the bend always tells them apart.**
  Tested.
- **The rod is straight with nothing on, bends to its fish, straightens as it lets
  go, and is straight while casting and for a fish already landed.** Tested.
- **A pull lands the fish on the hook and nothing otherwise; a click while casting
  does not count; no fish is landed twice.** Tested.
- **A guest's pull is believed from its own clock, but never from the future or
  more than half a second back.** Tested.
- **Every screen lands the same fish from the same pulls.** Tested.
- **Biggest total first; level totals share.** Tested.
- **The stand-ins land fish of every size, sometimes pull on nothing, and play the
  same way every time.** Tested.

## Deliberate non-goals

- No models: the lake, the rods and the fish are primitives, players are the
  island's capsule.
- No reeling in: one click lands the fish.
- No music of its own: the round is silent under the cues until an entry goes into
  `ROUND_MUSIC` in `15-minigames`.

## Known limitations

- **A guest's clock is trusted**, within half a second. A doctored client could
  claim it pulled at the best moment.
- **Other players' rods can crowd the view** at the right of the screen with eight
  on the dock.
- **Not played with two browsers yet.** The wire is tested in Node only, and
  `lobby.mjs` does not know this game.

## How to review

Open the minigames dashboard (alone, or as host of a lobby), open **M.I.L.F
(fishing)** (46) and press play. `node .claude/skills/run-localrot/scripts/solo.mjs
--game milf-fishing --steer` pulls once on a straight rod and fails unless that
lands nothing, then pulls on anything bass-sized or bigger with real clicks and
screenshots the bends and a catch.

- **During the three, two, one**, you should be on the dock with your rod out over
  the water and the others along the dock to your right.
- **Click with nothing on**: *Nothing!*, the rod whips up and is cast back out;
  clicking again straight away does nothing.
- **Wait for a bite**: a plop, and your rod bends. Compare a few: a perch barely
  bends it, a catfish bends the tip right down to the water.
- **Click while it is bent**: the fish should fly out of the water over your head
  into your bucket, and your catch should list it with its weight.
- **Click just after a fish lets go**: nothing.
- **At 25 seconds** the podium, the biggest catch highest.

### With two or more browsers

- **Everybody's rods should bend at the same moments on every screen.**
- **A guest's pull should land the fish it saw on its own screen**, even on a slow
  connection, and everybody should agree on the totals.

## Gate record

Not yet gated by a human.

## Measured

Not measured; the budgets in `pipeline.json` are unset. Drawn per frame: the lake,
the far shore, five hills, seventy pines, the sun, the dock with its posts and
joins, and per player the island's avatar, a rod of seven joints, a line, a bobber,
a bucket and four fish (one shown at most, in flight).
