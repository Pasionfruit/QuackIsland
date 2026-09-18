# 19-duck-hunt

## What this is

**Minigame 4.** A minute of balloons rising round a sandy arena. Every player
has a colour and a shape, and every balloon wears somebody's. Shoot yours.
Leave everybody else's - popping one scores you nothing, only takes it away
from them. Half a second between shots, hit or miss. Most of your own
popped wins.

It plugs into `15-minigames` and nothing else in the build knows it exists.
Importing the module registers it - one line in `src/App.tsx`.

This is the **environment** and **controls** stages done. The assets stage is
not: balloons are spheres with a flat white shape on them, and the players are
the island's capsule.

## The rules, and where each one lives

| The brief said | Where it is |
| --- | --- |
| Balloons appearing around the arena | `schedule`, `balloonAt`, `ARENA.floor` |
| Matching your colour or face | `COLOURS`, `EMBLEMS` - a colour and a shape per player |
| Aim and shoot | `pickBalloon` - a ray from your camera through the pointer |
| Shot cooldown - half a second | `ARENA.cooldown`, `fire` - spent hit or miss |
| Most of your own balloons popped wins | `score`, `placings` |
| Mouse - aim | the crosshair |
| Left click - shoot | `Trigger` in the scene |

## A colour and a shape

Eight colours that do not look alike, and eight shapes - dot, triangle, square,
ring, diamond, star, hexagon, cross. Roster order is colour order: the host is
red with a dot, the next player blue with a triangle, and so on. The shape is on
every balloon, on the HUD beside your name, and on the sand in front of you.

**The shape is there so nobody has to tell colours apart to play.** Red and
green, blue and purple, never share a shape. All players share the island's one
face, so the shape does the job the brief's "face" was for.

That is why a game is at most **eight players**: eight colours, eight shapes. A
ninth person in the lobby is not dealt in.

## Everybody gets the same balloons

Balloons come in **waves**, every two seconds, **one balloon per player per
wave**. Nobody ever has more to shoot at than anybody else; luck is only in
where yours appear. Within a wave they let go from different spots on the
floor, never on top of each other, and whose goes where is shuffled every wave
so nobody's are always on the same side. No wave lets go in the last two and a
half seconds - a balloon nobody can reach is not a balloon.

A balloon rises steadily, swaying side to side, and is gone about six seconds
later. **Half a second between shots** is fast enough to reach every one of
yours in principle, so what decides it is aim and speed: a miss still costs half
a second, other players' balloons are in the way, and somebody else can pop
yours first. (It was a second and a half; brought down to make it quicker to
play.)

## A shot

`fire`:

- **Too soon** - still cooling down - and nothing happens at all.
- Otherwise the **cooldown starts, hit or miss**.
- If it names a balloon that is up and not already popped, **it pops, whoever's
  it is**. Your own scores. Somebody else's only denies them.

**Your own screen decides what you hit.** A click becomes a ray from your camera
through the pointer, and the nearest balloon along it is the one you shot. Every
window has a different camera, and a guest's balloons are a moment behind the
host's; what counts is what was under your crosshair when you clicked. The host
checks only that you could shoot and that the balloon was still there to pop.

## One game, and it is the host's - but the balloons fly themselves

**No balloon is ever sent.** Every balloon's whole flight - when it lets go,
where, how fast, how it sways - follows from the game's seed, so every browser
flies the same balloons from the same numbers. A snapshot carries only what
cannot be worked out: the clock, the scores and cooldowns, each player's last
shot, and which balloons still in the air have been popped, by whom. Eight
players popping as fast as they can stays under 2.5 KB.

The seed is sent. Unlike Probable Stop's, it is no secret: knowing where a
balloon will be does not aim for you.

**A shot is an event, and events can be lost.** A guest numbers each shot and
says it again every 150 ms until the host's snapshot shows that number dealt
with; the host deals with each number once, so a shot said three times fires
once. Tested with two out of three messages dropped at random.

**Your own shot lands on your own screen at once.** The balloon bursts and your
cooldown ring empties the frame you click. If the host disagrees - somebody
else's shot reached that balloon first - it comes back when the answer does.

**A guest's clock** runs on by itself between snapshots and is pulled towards
the host's, and jumps if it is ever half a second out. Allowing for the round
trip, the host takes a shot up to 0.15 s before the shooter's cooldown ends
(`cooldownGrace`) and at a balloon up to 0.3 s after it floated away
(`escapeGrace`) - the moments a guest's screen can be ahead of the host.

A pause is shared, as in the other minigames: it stops the round for
everybody. Alone, three stand-ins shoot
too: a moment's aim after each cooldown, their own balloons, and a miss about a
third of the time.

## Seeing what happened

- **A pop** is a burst of bits in the balloon's colour.
- **Every player's shot** flashes a ring in their colour where it landed, misses
  included, so you can see who is shooting at what.
- **The crosshair** replaces the pointer over the arena: a ring round it empties
  when you shoot and fills back up over the half-second cooldown, solid in your colour when
  you can fire. It is moved directly, not through React, so it never lags your
  hand.
- **The HUD** has the clock (red for the last ten seconds), your colour and shape
  ("shoot ● only"), and everybody's score in theirs.

## The canvas renders once

The HUD re-renders every frame; `<Canvas>` must not. react-three-fiber re-runs
its setup each time the canvas renders and finishes it a moment later, and with
the canvas re-rendering sixty times a second, the last of those was still
finishing when a guest's game closed - it tried to attach to a canvas that was
gone, and logged an error in every guest's console, every game. So the canvas
(`Stage`) takes only a ref to the live game and a stable callback, and the scene
inside redraws itself from the ref each frame. Found by the eight-browser run.

## The camera does not move

Low at the near end, looking across the arena rather than down on it - a
shooting gallery. Balloons rise up the view with their colour and shape facing
you, and the whole arena, floor to ceiling, is in frame for the whole game.
Fitted exactly, and tested against a real camera at eight window shapes.

## Public contract

Exported because it is worth testing, not because anything else needs it.

| Export | What it is |
| --- | --- |
| `ARENA`, `BOUNDS`, `COLOURS`, `EMBLEMS` | The rules and the look, as numbers. |
| `schedule`, `balloonAt`, `lifetime`, `shootable`, `pickBalloon` | The balloons and what a ray hits. Pure. |
| `createGame`, `fire`, `stepGame`, `ready`, `timeLeft`, `balloonsFor`, `placings` | The game. Pure. |
| `botShot`, `botShots`, `BOT_ACCURACY`, `BOT_AIM` | The stand-ins. |
| `newGame`, `gameRoster`, `nextSeed`, `waitingGame`, `myId`, `ME`, `SOLO_PLAYERS`, `MAX_PLAYERS` | Dealing a game. |
| `encodeSnapshot`, `decodeSnapshot`, `applySnapshot`, `encodeShot`, `decodeShot`, `SNAPSHOT_TAG`, `SHOT_TAG` | A shared game on the wire. Pure. |
| `frameScene`, `TILT`, `FOV`, `FILL` | Where the camera stands. Pure. |
| `DuckHuntScreen`, `EmblemIcon` | The panel, and a player's shape in the DOM. |

## Invariants you may rely on

- **Everybody gets exactly the same number of balloons**, for any lobby from one
  to eight, and at any moment of the game. Tested.
- **Balloons let go on the arena floor, apart from each other, in waves of one
  per player.** Tested.
- **A balloon rises steadily from floor to ceiling and never moves front to
  back.** Tested.
- **A shot hits the nearest balloon under it**, misses just outside the edge,
  passes through popped balloons, never hits behind. Tested.
- **A shot costs the cooldown hit or miss; a shot too soon is not taken at all.**
  Tested.
- **Only your own balloons score; anybody's can be popped, once.** Tested.
- **A shot said more than once fires once.** Tested.
- **The game is a minute, and nothing is taken after it.** Tested.
- **Ties share a place.** Tested.
- **Eight players and a lossy network agree on every score.** Tested.
- **The whole arena is in frame and fills it, at any window shape.** Tested.

## Deliberate non-goals

- No models, no sound.
- No moving camera, zoom or pointer lock.
- No lag compensation beyond trusting the shooter's screen - the same trust
  every minigame here gives a player about themselves.

## Known limitations

- **A modified browser could claim hits it did not make.** The host checks the
  cooldown and that the balloon was up, not the aim.
- **Two players shooting one balloon at the same moment**: the host's first
  arrival gets it, and the other sees it come back. Rare, since only one of them
  can score from it.
- **The shared plumbing is copied a fourth time** - camera fit, host/guest hook
  shape, results card. See Probable Stop's notes; moving it into `15-minigames`
  is the obvious next piece of work, and more obvious with every game.

## How to review

Open a lobby, leave the game on Volcano Island, press **minigames**, open
**4 · Duck Hunt**, and press **play**.

- **Look at the arena.** Sand, a fence on three sides, four capsules along the
  front in four colours with a shape on the sand before each. Nothing moves but
  the balloons.
- **Look at the HUD.** A minute on the clock, "shoot ● only" in your colour and
  shape, and four scores.
- **Move the mouse over the arena.** The pointer is a crosshair, and it follows
  without lag.
- **Watch a wave.** Four balloons let go together, one in each colour, each with
  its owner's shape on the front, rising and swaying.
- **Shoot one of yours.** It bursts in its colour, a ring flashes where you shot,
  your score goes up, and the crosshair's ring empties and refills over a second
  and a half. Clicking before it is full does nothing.
- **Shoot somebody else's.** It bursts; nobody scores.
- **Miss.** The ring still flashes, and the cooldown still runs.
- **Watch the stand-ins.** Their rings flash on their own balloons, with the
  odd miss.
- **Let the clock run out.** Red for the last ten seconds, then the results: most
  of their own popped first, shots taken beside each, ties sharing a place.
  **Again** deals new balloons.
- **Press escape, alone.** Everything stops.

### With two browsers

- **Both shoot.** Each sees the other's shots flash and balloons burst, and the
  scores agree.
- **Shoot the same balloon at once.** One gets it; for the other it comes back.
- **Host: again.** Both are dealt the new game.

## Gate record

Not yet gated.

## Measured

Not measured against the world's budget, because it does not draw into the
world's canvas. Around thirty balloons are up at once with eight players, each
three or four draw calls, plus the arena and the players - under 150 in all -
with one shadow-casting light. Each balloon's position is a sine and a
multiplication per frame.

Like the other minigames, a **second WebGL context** while a game is up.
