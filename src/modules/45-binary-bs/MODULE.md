# 45-binary-bs

## What this is

Minigame 35, free-for-all. **Everybody stands on a side of a giant gear - as many
sides as there are players - with a mark at the top.** A number appears on the
hub, and everybody has **five seconds to vote 0 or 1, in secret.** Then the gear
turns, and the side it brings round to the mark drops away with whoever is on
it. A new gear with a side fewer, a new number, again - until one is left.

**0 and 1 vote. WASD walks about your own side.**

It plugs into `15-minigames` with `registerMinigame('binary-bs', ...)` and one
import line in `src/App.tsx`. It took the free slot 35.

## The count

As it was asked for: *if the number is 3 and everybody picks 1, the gear turns
3 mod 3 and removes that side; if somebody votes 0, it removes the side in that
position instead.*

    sides turned = the number - how many voted 0
    the side that goes = sides turned, mod the number of sides

The sides are numbered from the mark, clockwise: side 1 on the screen is at the
mark (side 0 in the code). **If everybody votes 1, side `number mod sides`
goes - that side is striped red while the vote is on**, so everybody can see who
is in trouble. **Every 0 turns the gear one side less**, onto the side before.
More zeros than the number turns it back past the mark; that just wraps round.
**Not voting counts as 1.**

So the marked player wants a 0 - but one 0 moves the trouble onto the side
before them, whose owner now wants a second 0, and so on. Nobody sees anybody
else's vote until the five seconds are up: that is where the BS comes in. You
see *who* has voted (a tick over their head, and in their pill), never *what*.

## The sample round

**Before round one there is a round played for show** (`ROUND.demo`, one round's length,
about fifteen seconds), on a gear of four made-up players - Ann, Bo, Cy and Di - so that
anybody who has not played sees how it goes before it counts. The number is 7, so if
everybody voted 1 the striped side, Di's, would go; Bo votes 0, one side less, and it
is Cy's that goes. It is a real `Game` on its own clock, run by the same rules, with
the votes put in for it at set moments (`viewOf`, `SAMPLE`); the yellow box at the bottom
says what is happening as it happens, and the pill at the top says *sample round*. The
game's own clock (`clock`) starts when it is over - a real game has a `lead` of that long
(`createGame`'s fourth argument; the rules' own tests build one without) - so nothing
counts, and nobody can vote or walk, until then. Every screen works it out from the same
clock.

## The round

**About fifteen seconds**, all arithmetic on the clock (`when`):

| Phase | Seconds | What happens |
| --- | --- | --- |
| vote | 5 | The number is up, the marked side striped. Vote, and change your mind if you like. Walk about your side. |
| reveal | 3.2 | Everybody's vote over their head, and then **the votes added into the total in the middle, one at a time** (0.5 s in, then one every 0.32 s: room for eight): a 0 takes one off, a 1 adds nothing, and the total goes *7 → 6 → 6 → 5*. The sum ends up at the top: *7 − 2 zeros = 5 → 5 mod 4 = 1 → side 2*. |
| turn | 4.2 | **The gear turns a side at a time**, like the teeth of a clicking gear, with a counter going down in the middle: room for seven clicks. |
| drop | 1.6 | The side at the mark drops away with whoever is on it. |
| reseat | 1.2 | Everybody left walks onto a new gear with a side fewer, in roster order. |

**The tally** (`tallied`, `totalAfter`): once the votes are shown they are added into the number in
the middle in the order of the sides, and the top of the screen says whose vote has just gone in and what it
did. It is only how the count is shown - the count itself is as it was, the number less the zeros.

**The turn** (`turnState`, `clicksOf`): the gear turns **one side at a time**. Each side swings round in 0.26 s
and then **holds still for the rest of 0.6 s** before the next one moves, so every one is clearly at rest
before the next goes; and **the counter in the middle goes down by one as each stops**, from the sides to turn
to 0 - the number of sides the count comes to round the gear, so never more than one less than the sides (a count
of 12 on a five-sided gear is two clicks, 12 mod 5). If the count lands on the mark already there are no clicks
and the counter starts at 0. The number in the middle stays the right way up while the gear turns under it.

The number is 2 to 15, from the seed and the round. **Exactly one side goes each
round**, so a game of `n` is `n - 1` rounds. If the side that comes round belongs
to somebody who has left the lobby, nobody goes that round.

**Placings:** the last one left first; then the removed, the last to go first;
then anybody who left while in.

## Controls

- **0 or 1** on the number row or the keypad, or the two buttons at the bottom.
  You can change your vote until the five seconds are up; the button you are on
  is lifted. After that, and outside the vote, the buttons go faint.
- **WASD** walks you about your own side, W towards the mark. You cannot leave
  your side, and you can only walk while the vote is on and the votes are shown -
  not while the gear turns.

## On the screen

- **The gear**, from above, lying flat in the dark: a side in each player's colour,
  teeth round the rim, **the number on the hub**. **The mark** is a red pointer off
  the north edge and never moves.
- **While the vote is on**, the marked side is striped red, the seconds count down
  at the top with the number, the sides and who is marked, and over each head is
  a tick once they have voted - **your own vote, over your own head**.
- **At the reveal**, everybody's vote over their head (0 blue, 1 green, – for no
  vote), and then **the votes added into the total in the middle one at a time**, with the sum at the top.
- **The turn and the drop**: the gear clicks round a side at a time with a counter going
  down in the middle, everybody on it, then the side at the mark falls away, whoever is on it
  tumbling after. *X is out!*
- **The HUD:** the round, how many are left, and a pill per player with their side
  and - a tick during the vote, their vote after it.
- **Sound:** a sting under the vote, a tick as each vote is added into the total, a click as each
  side of the gear comes to rest, a crash as the side drops, a fall for whoever goes, a bump for your vote.
- **The results** are the podium, from `useFinish`.

## One gear across the lobby

**The host runs the game**: the clock, every vote, the count, who goes, the seats
and the end. It sends a snapshot ten times a second: the round, who is on which
side, and every player - where they stand, **whether they have voted and never
what**, when they went, whether they have left - with the last three rounds'
results, votes and all. The numbers are not sent: the seed makes them.

**A vote is only on the wire once it is counted.** Until then, no snapshot
carries it - not even hidden in a field the screen does not show - so nobody can
read the votes out of the network tab. Tested.

**A guest sends its vote the moment it changes** (`bbs-v`), tagged with the round,
and where it stands ten times a second (`bbs-mv`). The host takes a guest's vote
up to **0.3 s after the five seconds** are up, for the wire; the count happens
then. A guest's own vote and place stay as its own screen has them while the
round is the same.

The same lessons as the other minigames: a guest keeps listening after the game
ends; somebody who leaves the lobby is out; a pause stops the round for everybody.

## Stand-ins

**Only when you are alone**: you and four stand-ins, a five-sided gear to start.

A stand-in votes 0.8-3.2 s into the vote. It reasons as if everybody else votes 1:
**on the marked side, it votes 0**; on the side one 0 would bring round, it votes
1 and hopes; anywhere else it mostly votes 1, and one time in five votes 0 to stir
things up. A quarter of the time it changes its mind before the end - but never
into trouble. It wanders its side while it thinks. All from the seed. Tested.

## Public contract

Nothing depends on this module. The exports are here because they are worth
testing, not because anybody else needs them.

| Export | What it is |
| --- | --- |
| `PHASES`, `ROUND_LENGTH`, `NUMBERS`, `ROUND`, `REVEAL`, `TURN`, `GEAR`, `COLOURS` | The numbers. |
| `when`, `voteEnds`, `dropsAt`, `Phase`, `When` | The schedule. |
| `numberFor`, `markedSide`, `tally`, `mod` | The count. |
| `sideAngle`, `onSide`, `seatSpot`, `clampToSide` | Where the sides are. |
| `createGame`, `Game`, `Player`, `Result`, `Entrant` | A game at its start. |
| `vote`, `canVote`, `walk`, `place`, `canWalk`, `sideOf` | Voting and walking. |
| `resultOf`, `advance`, `tick`, `stepGame`, `judgeEnd`, `clock`, `isIn`, `leave`, `placings` | Counting, removing, reseating, and who placed where. |
| `BOT`, `botSteer`, `wantedVote` | The stand-ins. |
| `newGame`, `waitingGame`, `gameRoster`, `nextSeed`, `myId`, `ME`, `SOLO_PLAYERS`, `MAX_PLAYERS`, `GameSetup` | Putting a game together from the lobby. |
| `encodeSnapshot`, `decodeSnapshot`, `applySnapshot`, `encodeVote`, `decodeVote`, `encodeMove`, `decodeMove`, tags and wire types | The wire. Decoding refuses a message whole rather than half-reading it. |
| `GearScene`, `PALETTE`, `turnAngle` | The 3D view. |
| `GearScreen`, `VOTES`, `VOTE_SECONDS` | The panel `15-minigames` draws, and the vote keys. |

## Invariants you may rely on

- **The side that goes is the number less the zeros, mod the sides; everybody 1
  is the marked side.** Tested, including more zeros than the number.
- **A vote can be changed until the five seconds are up**, and not after but for
  the grace on the wire. Not voting counts as 1. Tested.
- **One side goes a round, everybody left is reseated a side fewer in roster
  order, and the last one left wins.** Tested.
- **You cannot walk off your own side.** Tested.
- **No snapshot carries a vote before it is counted.** Tested.
- **The stand-ins all vote in time, the marked one votes 0, and they play the same
  way every time.** Tested.

## Deliberate non-goals

- No models: the gear is flat wedges and boxes, players are the island's capsule.
- Nobody sees anybody else's vote before the count.
- No music of its own: the round is silent under the cues until an entry goes into
  `ROUND_MUSIC` in `15-minigames`.

## Known limitations

- **Walking does nothing to the rules.** It is there because it was asked for -
  something to do with your hands while you decide.
- **The number turns with the hub** while the gear turns, so it is upside down
  for a moment. It is read in the vote, when the hub is still.
- **Not played with two browsers yet.** The wire is tested in Node only.

## How to review

Open the minigames dashboard (alone, or as host of a lobby), open **Binary BS**
(35) and press play.

- **During the three, two, one**, a five-sided gear in five colours, the number on
  the hub, the red mark at the top, everybody on their own side.
- **The vote:** one side striped red and named at the top; five seconds counting
  down. Press **1**: a 1 over your head and the 1 button lifted. Press **0**: it
  changes. Stand-ins should get ticks over their heads - never their votes.
- **The reveal:** everybody's vote over their head, and the sum at the top. Check
  it: the number, less the zeros, counted from the mark clockwise.
- **The turn:** the gear turns that many sides, everybody on it, and the side the
  sum named ends up at the mark and drops, whoever is on it with it.
- **The next round:** a gear with a side fewer, everybody walked onto it, a new
  number.
- **Get yourself marked, and vote 0**: if nobody else votes 0, the side before you
  goes instead.
- **WASD** should walk you about your side and no further.
- **The results** should be the podium, the last one left first.

### With two or more browsers

- **Everybody should see the same gear, number and marked side.**
- **A guest's vote** should show as a tick on the host's screen - not the vote -
  and count at the reveal.
- **A guest's side going** should drop them on every screen.

## Gate record

Not yet gated by a human.

## Measured

Not measured; the budgets in `pipeline.json` are unset. Drawn per frame: a wedge
and three teeth per side, the hub and its number, the stripe, the mark, and the
island's avatar and a badge per player.
