# 15-minigames

## What this is

The minigames Volcano Island is made of: **forty-six of them**, forty
free-for-all and six one-vs-all, as a catalogue you can browse - twenty tiles
to a page - and a seam each one plugs into when somebody builds it.

**They are numbered alphabetically by title, and the first forty are all
free-for-all.** Every game named so far is free-for-all, the turn-taking ones
included: the kind says who is in the arena, and a game where everybody takes a
turn at the same thing is still everybody's game. The thirty-eight named games
are 1 to 38, in order of name; the two free-for-all slots that are still waiting
for a game are 39 and 40; and the six one-vs-all slots, all still free, are 41 to 46.

It plays none of them. What it owns is the part that has to be right *before*
forty-six of anything can be built:

- **one list** that is the plan, including the slots nobody has named yet,
- **one place** a finished game registers itself,
- **one screen** that draws whichever game is open,
- **one template** for every game that has not been written, which today is all
  of them.

Building a minigame is `registerMinigame(id, { newGame, Panel })`. Nothing else
in this module changes, and nothing in it ever learns which game it was.

## Forty-six slots, and why the empty ones are in the list

**A number is a place in the alphabetical list; an id is the name of a game.**
Games are numbered by title - *Binary BS* is 1 and *Zombie Tag* is 38 - ignoring
case and punctuation, so *M.I.L.F (fishing)* sorts as *milf*. A game named later
takes one of the free slots and goes in its alphabetical place, which moves the
numbers after it: so the id is what a build registers against and what never
changes, and the number is only where the game is in the list today.

A slot nobody has named is a **reserved entry with a number** rather than a gap.
The catalogue is the plan, the dashboard draws the plan, and the distance between
what is planned and what exists is the single most useful thing a dashboard of
templates can show you. Thirty-eight of the forty-six are named; eight are free
slots waiting for one - two free-for-all, at 39 and 40, and six one-vs-all.

| | free-for-all | one-vs-all | total |
| --- | --- | --- | --- |
| Named | 38 | 0 | 38 |
| Free slots | 2 | 6 | 8 |
| **Target** | **40** | **6** | **46** |

**The first forty are free-for-all.** The kinds have moved twice: *Make Some Noise*,
*Perfect Game* and *Chef Caricature* were written down as one-vs-all and are
free-for-all now, and two more of the free slots were made free-for-all so that
the first forty in the list are. Nothing about the games changed: Perfect Game and
Chef Caricature still go turn by turn, and their own modules run those turns.

The numbers in the modules' own docs (*Minigame 34*, and the like) and the
*added as the forty-fourth slot* notes in the catalogue are the order the games were
written down and built in, which is not the order they are numbered in now.

## The three stages every game is built in

Every minigame is built the same way, in the same order, and a game can sit
half built without being broken. That is what makes forty-one of them
tractable: none of them is a single lump of work.

| Stage | What it is |
| --- | --- |
| `environment` | The state the game keeps, and the place it happens in. What there is, where it is, and what changes over a round. |
| `controls` | The inputs wired into that state. What a player presses, and what it does to what the first stage built. |
| `assets` | Models, sprites, sound. Last, because a game that is not fun with capsules will not be fun with models. |

**The order is a dependency order, not a preference.** Controls wired to an
environment that does not exist are controls nobody can test, so `nextStep`
returns the first unfinished stage rather than the furthest along - a game that
somehow got its assets first is still owed its environment.

A game with all three done is `playable`; a slot nobody has named is
`reserved` and has no stages to do at all. Every tile on the dashboard carries
three pips, so the whole plan reads as a progress bar without anybody having to
read a word of it.

A test asserts that nothing has started yet. It is meant to fail the day a
stage is finished, and on that day it is the thing to edit.

## Each minigame keeps its own state

`newGame` returns `unknown`, on purpose. Zombie Tag has six zombies and a
shrinking list of survivors; Perfect Game has thirty crabs and the angle of a
coconut; there is no useful type that is both, and inventing one would mean
forty-one games sharing a shape that fits none of them.

So the game that registers a build owns both halves of it - the state and the
panel that draws it - which makes it the one place that can narrow its own
state, and the one place that should. What the module holds in common is the
wrapper, `MinigameRun`: which game it is, whether it is being briefed, played
or over, and the state itself as an opaque value it never looks inside.

There is a test that registers two fake games with completely different state
shapes and checks both come back intact, because that is the property the whole
arrangement exists to have.

## The dashboard

**Five tiles across and four down - twenty to a page** - filterable to one kind
or the other, with a count of what is named against what is planned. Forty-six
slots come to three pages.

**The dice**, to the left of the *all* filter, **picks a game at random for the party**:
one of the games that can be played - something has been built for it, so never a
free slot or a name with nothing behind it - and opens it, for everybody in the lobby,
the same as picking its tile (`randomPlayable`). It is greyed out while nothing is
built.

**The grid never changes shape.** A page with fewer than twenty on it - the last
one, or a filter down to a handful - keeps its five by four and leaves the rest
empty, rather than stretching a handful of tiles across the whole window. Tiles
are the same size on every page, which is what makes them easy to hit and the
plan easy to read.

**Paging** is the arrows under the grid, the dots between them, or the left and
right arrow keys. Picking a filter goes back to its first page. The page and the
filter are remembered while the screen is open - `dashboardWas` in `state.ts` -
so stepping back out of a game lands on the page it was picked from; closing the
screen forgets them.

**A tile is a number, a name and three pips, and nothing else.** No
description: twenty paragraphs at once is a wall of text nobody reads, and the
grid is there to pick a game rather than to read about one. What a game actually
is lives behind its own screen.

**It never scrolls**, the same as Garden Goofs next door and for the same
reason: the four rows share out whatever height is left under the bar. It is a
page - opaque, every edge of the window - not a panel floating over the world.

Reserved slots are drawn faint rather than left out, and they open like any
other tile. The screen behind one is where its name will go.

## It looks like the island, not like the debug panel

The rest of the interface is dark slate and monospace because it is
instrumentation: a frame counter wants to be legible and ignorable. A wall of
party games is the opposite thing, so this is sand, sea and sun - see `ISLAND`
in `look.ts` - in a rounded face, with nothing square on it and no colour that
is not on a beach.

**No web font is shipped.** `ui-rounded` is the real thing on Apple platforms
and the stack falls back through Segoe UI on Windows, which is friendly without
being round. A genuinely rounded face on every machine means shipping a font
file, which is a bigger decision than a colour scheme and one worth taking on
purpose rather than in passing.

## A game's own screen

The title, one panel that flips between **how it plays** and **the controls**,
the three stages underneath, and **play** at the bottom.

Two tabs rather than both at once, because they answer different questions and
you want one at a time: what is this, and what do I press. The panel keeps one
size either way, so flipping between them does not move the play button out
from under the cursor.

Every game gets this screen, built or not, out of its catalogue entry - which
is what makes forty-one briefings a thing that already exists rather than a
thing to generate.

**A one-vs-all game has a third tab, `the party`, and opens on it.** One player against
everybody else needs to know who the 1 is, so the tab lays out the party - everybody in the lobby,
the host first, you marked - and **the host clicks a name to say who the 1 is**, or rolls the
dice (🎲) for somebody at random. Alone, it is you. It is the host's word, carried the way the game
that is open is (`hostChoice`, tag `minigame-one`, in `party.ts`): guests see the party and who the 1
is on their own screens and cannot change it, and a joiner is told. Until the host says, or if the
one leaves the lobby, it is the host. A game asks `getTheOne()` or `useTheOne()` for the id;
free-for-all games have no such tab.

## Fade, three, two, one - and Finish

Press play and the run goes `briefing` -> `fading` -> `counting` -> `playing`
-> `finishing` -> `over`. Every game gets all six, which is exactly why they
live here: a countdown and a finish are things the screen does, not things
forty-one games each have to remember to do.

**Fade.** The screen goes black over the briefing (`FADE.in`). The game is
mounted under the black, so its expensive first frame happens unwatched.

**Three, two, one - over the game.** The black lifts off the game, drawn and
held still (it is handed `paused: true`), with the numbers over it and then a
moment of **Start!**. The briefing has no count of its own any more, and
**neither does any game**: Sprint Triathlon, Time It, He's One Shot, Helping
Dad and Keyboard Warrior had their own 3-2-1 and now start on the screen's
**Start!**; Chef Caricature's first cook does too (later turns keep their
"next up" hand-over). `audio/Countdown.mp3` starts on the edge into `counting`
and is paused with the round - and only a resume carries it on. Leaving or
restarting stops it for good, so a held "two" never comes back on its own with
the next game. Each number is rounded up, so the three is up for a whole second.

**A game that counts for itself** registers with `ownCountdown: true`. Pet Race
opens on ten seconds of choosing a pet, and it is the race that gets counted
in - so for it the screen only lifts the black (`counting` lasts `FADE.in`, with
no numbers and no voice), and the game shows `CountOver` when its race is about
to start: the same numbers, pop, voice and **Start!**.

**Finish.** A game says its round is over with `useFinish(over)`, and draws its
results only when that returns true. In between: two seconds (`FADE.dim`) of a
big **Finish** over the top, `audio/Finish.mp3`, and the game dimming to black
behind it. A game's own "again" button gets a Finish for its next round too.
A game that hands over its standings gets the podium instead of its own
results; see below.

**The game's state is built when the fade starts, not when the count ends** - a
game that wants to draw its board behind the numbers has a board to draw.

`tickRun` is pure and is the only thing that moves a run between the timed
phases, so all of it is tested by passing it numbers rather than by waiting.
The clock that calls it lives in `MinigameScreen` and stops with the screen.

With no build registered, the round that starts is honest about being empty:
the countdown ran, the phase really is `playing`, and what is missing is the
game.

## The podium

Every built game ends on the same page. A game hands its standings to
`useFinish(over, () => standings)` - each player's id, place, name, colour and
whether it is you - and after the two seconds of Finish the podium takes the
place of the game, canvas and all. The game's own results card is never drawn;
`useFinish` answers false for a game that handed standings over.

**How they stand is how they came.** First jumps for joy, second is happy, third
keeps a straight face, and fourth and below fall flat on their faces on the
sand in front of the steps. The steps stand second, first, third, left to
right, the way a podium does.

**Ties share a step, and skip the places after them.** Two level at the top
both jump on the first step, the second step stands empty, and whoever came
next is third. The ranks are worked out in `podium.ts` from the order of the
places a game hands over, not trusted from its numbers, so a game that numbered
its ties 1, 1, 2 still comes out 1, 1, 3.

**If everybody ties, everybody loses.** All three steps stand empty and the
whole field is on the sand. It takes two to tie: a player on their own wins.

**Bottom left is the minigame dashboard, bottom right is replay.** The
dashboard is `backOut`, the same step back escape takes. Replay is the host's,
the same as play is: it goes out as a restart on the pause channel, so every
screen still on the podium goes back through the black and the three-two-one
together. A guest gets *waiting for the host* where the button is.
`Podium_Music.mp3` plays under it and stops when it goes.

It is DOM and SVG, not a scene: the island's pill, drawn flat and painted the
colour each player was in the game, with CSS for the jump, the sway and the
fall. Reduced motion stills all of it.

## Browsing is local; being in a game is the host's call

Opening the dashboard changes your screen and nobody else's. The host flicking
through forty-one tiles has no business dragging everybody about.

**The moment they open a game, everybody goes with them.** Guests get the same
briefing and can read the rules while the host decides; when the host presses
play, everybody counts down together. A guest has no dashboard and no play
button, for the same reason they cannot pick the game in the lobby: there is
nothing they could press that would not immediately be overruled.

It rides on `hostChoice` from `13-modes` — the same machinery that carries
which game the lobby is playing and what the weather is. The value is a string,
because that is what a choice carries and because two fields packed into one
value cannot arrive half-applied: `none`, or `<id>:open`, or `<id>:play`.

**Guests follow a change, not the value.** This is the part that is easy to get
wrong in both directions. A guest that ignores the call sits in the world while
everybody else plays; a guest that applies it continuously is dragged back in on
the very next render and can never leave at all. So `followCall` acts only when
the call *becomes* something new — which means pressing escape and walking out
of a round works, and lasts until the host starts something else.

**The host leaving takes everybody out.** They are the reason anybody is in it.
A guest leaving takes only themselves.

### What is not shared

Only the *call* crosses the wire. Everybody runs their own copy of the game
from their own clock, so two browsers in one round are two simulations that
agree because they started from the same place rather than because anything
keeps them in step. For Zombie Tag, whose bodies are driven by stand-in runners
rather than by peers, that is honest; for a round people actually play
together it is the next thing that has to change.

## Escape pauses, rather than leaving

On the dashboard or a briefing there is nothing to lose, so escape steps back
the way the button does. Once a round is counting or playing, stepping back
would throw away a round you are in the middle of — so it stops the round and
puts a card over it, offering **resume**, **restart the round** and a way out.

### A pause is shared, and it is the host's

**Only the host works the minigame screen.** Guests in a party press no button
on it at all: no back on the briefing or the empty round, no pause, nothing on
the pause card, no dashboard or replay on the podium, and escape does nothing
for them. They still read the briefing's two tabs, which change nothing but
their own view. `iMayControl` is `paused && host`; `pauseMinigame` refuses a
guest; and a pause message is applied only if it came from the host (the lowest
id in the room, `isHost`), so an older build's guest cannot stop the round.

**It stops for everybody**, and the card says so on every screen. Everybody but
the host gets the same card with nothing to press and *waiting for the host*.

**If the host leaves**, hosting passes to the next lowest id on its own, and the
buttons go with it - so a card is never stranded with nobody to take it down.

It is a plain broadcast rather than `hostChoice`, applied by everybody who hears
it - the sender included, which is harmless because `pauseRun` and `resumeRun`
return the same run when there is nothing to do. Nothing is repeated and
nothing is asked for: a pause is a moment, not a setting, so somebody who joins
mid-pause is not dragged into it.

### Restart

**Restart** starts the whole round again, from the three-two-one and a new game
state, for everybody - from the pause card, the podium's replay, or a game's own
"again" (which is `replayMinigame` too, so no round is ever restarted without
its count). It cuts **straight to black** and lifts off the new game into
three, two, one: a fresh run of the same game, never back through the briefing,
which is not what anybody was looking at.

### What stops

A paused countdown does not count. Pressing escape on "two" and coming back to
"two" is the only behaviour anybody would expect, and there is a test for it.

The build's `Panel` is handed the run, and **every game stops dead on it — the
host's own simulation included.** Each game's net hook returns at the top of
`advance` while `paused`, so no clock advances, no stand-in moves, no snapshot
is sent and no input is queued up to arrive in a burst on resume. A game that
kept going behind a pause card would be a pause card with a game going on
behind it.

## Sound

Everything lives in `internal/sound.ts`, flat and in your ears rather than on
the island's 3D bus.

- **Round music** - `ROUND_MUSIC` maps a game to a looped track. The screen
  (`RoundMusic`) starts it on **Start!**, holds it on a pause, rewinds it on a
  restart and stops it on Finish. A game never starts its own music; one whose
  rules *are* the music calls `muteRoundMusic` (I See The Light, silent on red).
  Musical Mayhem is not in the table: it synthesises its own tune in `tune.ts`.
- **Cues** - `CUES` names every sound effect. `useCueOnChange(cue, key)` plays
  one on a change of a value in the game's synced state, so host and guests
  hear it from the same line; `playCue` is for your own input only; `useLoopCue`
  keeps a held sound going (drawing, winding) and stops it when the component
  goes. Cues overlap, up to six voices a file.
- **The screen's own** - menu clicks (`clicked`), choosing a game, pause and
  unpause, the three-two-one, Finish, the podium, and the last six seconds:
  pass `TopTimer` a `left` and it ticks from six to zero. Only for a round that
  ends on a deadline - never a count-up clock or a turn timer.

## Public contract

| Export | What it is |
| --- | --- |
| `MINIGAMES` | All forty-six entries, in number order. |
| `getTheOne`, `useTheOne`, `chooseTheOne`, `partyOf`, `randomOne`, `isInParty`, `Member` | Who the 1 is in a one-vs-all game, and the party it is chosen from. |
| `MINIGAME_TARGET` | How many of each kind there are meant to be. |
| `minigameById`, `minigamesOfKind`, `isMinigameId` | Reading the catalogue. |
| `BUILD_STEPS`, `nextStep`, `stepsDone`, `isPlayable`, `progress` | The three stages, and how far each game and the catalogue as a whole has got. |
| `Minigame`, `MinigameId`, `MinigameKind`, `BuildStep`, `Control` | The shape of an entry. `MinigameId` is derived from the list, so an id that is not in it does not compile. |
| `registerMinigame` | How a built game plugs in. |
| `buildFor`, `isBuilt`, `builtMinigames`, `forgetBuilds` | Reading the registry. `forgetBuilds` is for tests. |
| `freshRun`, `MinigameRun`, `MinigameBuild`, `RunPhase` | A run of one game, at its beginning. |
| `beginRun`, `tickRun`, `countShown`, `curtain`, `finishRun`, `COUNT_FROM`, `FADE` | Fade, three-two-one and Finish. All pure. |
| `useFinish` | A game's one line about ending: says it is over, hands over its standings for the podium, and answers whether its own results may be drawn yet (never, once it has handed standings over). |
| `rankStandings`, `poseFor`, `Standing`, `Placed`, `Pose`, `PodiumResult` | Who stands where on the podium and how they take it. All pure. |
| `replayMinigame` | The podium's replay: the same game again, for everybody. The host's. |
| `openDashboard`, `openMinigame`, `playMinigame`, `tickMinigame`, `backOut`, `closeMinigames` | Moving the screen about. |
| `pauseMinigame`, `resumeMinigame`, `restartMinigame`, `isPausable`, `pauseRun`, `resumeRun`, `restartRun` | Stopping a round, starting it again, and starting it over. The host's alone. |
| `CountOver`, `countLength`, `screenCounts`, `MinigameBuild.ownCountdown` | A game that counts itself in later - Pet Race - with the screen's own look and voice. |
| `mayControl`, `iMayControl`, `useMayControl`, `nameOfPauser`, `Pauser` | Who the card belongs to, and what to call them. |
| `encodePause`, `decodePause`, `PAUSE_TAG`, `PauseAct`, `PauseMessage` | A pause on the wire. |
| `useMinigameSync`, `getMinigameCall` | Taking a guest where the host went. Mount the hook once. |
| `encodeCall`, `parseCall`, `followCall`, `isMinigameCall`, `NO_CALL` | The call itself. All pure. |
| `useMinigameScreen`, `getMinigameScreen`, `MinigameScreenState` | Where the screen is. |
| `MinigameScreen` | The one component the app mounts. |

## Invariants you may rely on

- **Ties share a rank and skip the ones after**: 1, 1, 3. Tested.
- **Everybody tied means everybody on their face**, and nobody on a step.
  Tested, and so is a lone player winning.

- **Every id is unique, and so is every number.** Tested.
- **The numbers run 1..46 with no holes.** Tested.
- **Every game has a panel**, built or not - the template is the fallback and
  it covers all forty-one. Tested against the whole catalogue, not a sample.
- **A build takes over from the template the moment it registers**, and takes
  over nothing else. Tested.
- **Each run gets its own fresh state**, never one shared between runs.
- **`nextStep` is the first unfinished stage**, never the furthest along.
  Tested, including against a game that skipped ahead.
- **Nothing claims to be playable without a build behind it.** Tested - and
  tested against a game that does claim it, so the rule is not passing just
  because the catalogue is empty.
- **Every game has a briefing**, with both tabs and a play button. Tested
  against the whole catalogue, not a sample.
- **The countdown always reaches `playing`**, in big steps or small, and never
  counts past zero or backwards. Tested, for every game in the catalogue.
- **Pressing play twice is not a restart.** Tested.
- **A guest follows a change and never a value**, so stepping out of a round
  keeps you out until the host starts something else. Tested.
- **The host never follows their own call.** Tested.
- **A paused countdown does not advance**, however long the card is up.
  Tested.
- **Nothing on the screen scrolls.** Tested.
- **The dashboard is five across and four down on every page**, every game on
  exactly one page, and a short page keeps the grid's shape. Tested.
- **The page survives opening a game and stepping back out**, and a filter goes
  back to page one. Tested.

## Deliberate non-goals

- No minigame beyond the first. Zombie Tag plays; the other forty do not.
- No rules, scoring, rounds or win conditions - each arrives with its build.
- No turn order from this module for the games that take turns. The kind is
  recorded; the rotation
  that goes with it is not.
- No host authority over what is open. See above.
- No 3D, no art, no sound.

## Known limitations

- **One game of forty-one is built.** Zombie Tag has its environment and its
  controls; everything else is a briefing with nothing behind it.
- **The controls are half written.** Games 1–12 arrived with theirs and they
  are in the catalogue; 13 onwards have none, and their controls tab says so.
- **Only the call is shared, not the round.** Everybody runs their own copy
  from their own clock. Two browsers agree because they started together, not
  because anything keeps them in step.
- **The rules are nowhere.** The descriptions the games were specified with
  have not been written into the catalogue - `pitch` is one line rather than a
  summary of them. Those belong with each game's `environment` stage, which is
  where its rules stop being prose and become state.
- **`done` is hand-maintained.** Nothing derives it from the registry, so the
  plan and the code can drift. The direction that matters is guarded - a game
  cannot claim to be playable with no build behind it - but a game part way
  through a stage is whatever somebody last wrote down.

## How to review

### The podium

- **Play any built game to the end.** After **Finish**, the podium: the winner
  jumping on the tall middle step, second smiling on the left, third straight
  faced on the right, everybody else falling on their faces on the sand.
- **Get a tie for first** (Time It with stand-ins is quickest to try). Both
  jump on the top step, the second step is empty, and the next player is on
  third.
- **Everybody tied** (Where's Midnight with nobody finding her): empty steps,
  everybody on the sand, and a headline saying everybody loses.
- **Replay**, bottom right: back through the black and the three-two-one into
  the same game. **Minigame dashboard**, bottom left: back to the grid.
- **As a guest**: no replay button, *waiting for the host* instead, and the
  host's replay takes you with them.

### Everything else

Open a lobby, leave the game on Volcano Island, and press **minigames** in the
party panel, bottom left.

- **Count the tiles.** Twenty, five across and four down, with nothing to
  scroll, and *page 1 of 3* under them.
- **Turn the page** with the arrow, a dot, and the left and right arrow keys.
  The last page has six tiles on it and **the grid keeps its shape** - the tiles
  stay the size they were, with the rest of the grid empty.
- **Resize the window**, both ways, and drag it small. The tiles should get
  taller and shorter with it; no scrollbar should ever appear.
- **Read the dim ones.** Eight tiles should be visibly fainter and say *free
  slot*. Those are the numbers nobody has named yet, and they should look
  unfinished on purpose.
- **The dice.** Press the 🎲 left of *all*: a built game should open, for the whole party;
  press it again from the dashboard and it may be a different one.
- **Filter to one vs all.** Eight tiles on one page, the grid still five by four
  with the rest of it empty.
- **Open a game from page two and press escape.** You should come back to page
  two, not to page one.
- **Open a game with controls** - anything from 1 to 12. It should open on
  *how it plays*; the **controls** tab should list them, and flipping back and
  forth should not move the play button.
- **Open one without** - 13 upwards. The controls tab should say they are not
  written down yet rather than showing an empty box.
- **Press play.** A big three, then two, then one, over the top of the briefing
  you were just reading - each for about a second - and then the round starts
  and says it is empty, because nothing is built.
- **Press play and then escape.** You should come back to the grid, and opening
  the game again should give a fresh briefing rather than the round you left.
- **Open a free slot.** It should open like any other tile and say a number is
  waiting for a game.
- **Look at the pips on any named tile.** Three of them, all hollow, because
  nothing has been built. A free slot has none at all.
- **Check no tile carries a description.** Number, name, pips. Nothing else.
- **Read the stages on a game's screen.** Environment, controls, assets, in
  that order, with an arrow against *environment* - the one owed next.
- **Look at the whole thing.** Sand, sea and sun, round corners, nothing
  monospace. If it looks like the debug panel, the palette did not take.
- **Check the footer.** It should count each stage against the number of named
  games, and all three should read 0 of 26 today.
- **Press escape on the grid and on a briefing.** Nothing is running, so it
  still takes you back a step — grid to world, briefing to grid.
- **Press escape mid-round.** The round should *stop*, with a card over it
  offering resume. Escape again, or resume, and it picks up exactly where it
  left off — not a second later.
- **Press escape during the three-two-one.** It should freeze on the number it
  was on and come back to the same one.

### With two browsers

- **As a guest, look at the party panel.** No minigames button — it should say
  the host picks it.
- **Host: open a game.** The guest should land on the same briefing, able to
  read both tabs, with *waiting for the host to start* where the play button is.
- **Host: press play.** Both should count down and start together.
- **Guest: press escape, on the briefing and in a round.** Nothing should
  happen. A guest has no back, pause or podium button anywhere on the screen.
- **Host: open a different game.** The guest who walked out should be picked
  back up by it.
- **Host: leave the round.** The guest should be taken out of it too.
- **Check the world is still there behind it.** Closing the dashboard should
  put you back exactly where you were standing - this screen does not move
  anybody.

## Gate record

Not yet gated.

## Measured

Nothing to measure: no draw calls, no triangles, no frame cost. The screen is
DOM and only exists while it is open.
