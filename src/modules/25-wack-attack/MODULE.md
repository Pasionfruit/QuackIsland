# 25-wack-attack

## What this is

**Minigame 10.** A fenced field of grass with sixteen holes in it, four by four,
and everybody walking about it with a hammer. Moles pop out of the holes, stay up
a moment, and go back down. Walk over and swing: the mole your hammer lands on is
whacked.

- **A regular mole:** one point.
- **The Golden Mole:** five points. Rarer, and it does not stay up as long.

The first whack on a mole takes it. Most points when the minute is up wins.

It plugs into `15-minigames` and nothing else in the build knows it exists.
Importing the module registers it - one line in `src/App.tsx`.

This is the **environment** and **controls** stages done. The assets stage is
not: the players are the island's capsule, and the moles and hammers are
primitives.

## The rules, and where each one lives

| The brief said | Where it is |
| --- | --- |
| Walk around a field with a hammer | `walk`, `FIELD.half` - a fence keeps you in |
| Moles pop out of 16 different spots | `holeAt`, `HOLES`, `schedule` |
| Regular moles give standard points | `FIELD.points.mole` (1) |
| The Golden Mole gives bonus points | `FIELD.points.golden` (5), `FIELD.goldenChance` |
| Position yourself over emerging moles, swing quickly | `swing`, `strikePoint` |
| Highest score before time runs out | `FIELD.duration` (60 s), `placings` |
| WASD - move; left click - swing hammer | the screen |

## The moles

`schedule(seed)` lays out every mole of the round:

- **Timing:** the first comes up at 1.2 s. After that one comes every 0.55 to
  0.95 s at the start of the round, speeding up to every 0.3 to 0.6 s by the end.
- **Holes:** a mole never comes out of a hole another mole is still in or sinking
  back into, nor out of the hole the last mole used.
- **How long they stay up:** a regular mole 1.3 to 2.1 s. About one mole in eight
  is golden, and stays up only 0.8 to 1.1 s.

The schedule is a function of the seed, so **every browser draws the same moles
at the same moment** without being told, against a clock eased to the host's.
The seed is not a secret: knowing when a mole comes up does not walk you over to
it.

## The hammer

- **A swing lands 0.95 in front of you**, the way you are facing - you face the
  way you walk. Your landing spot is marked on the grass in your colour.
- **It whacks a mole whose hole is within 1.15 of where it lands, or within 0.8
  of you** if you are standing over it. If two qualify, the nearer one.
- **A mole can be whacked from the moment it comes up** until 0.2 s after it
  starts back down (`FIELD.downGrace`), for a guest heard a moment late.
- **0.4 s between swings.** A swing during that time is dropped, not saved up.
  The host allows a swing up to 0.1 s early (`FIELD.swingGrace`), since a
  guest's clock is only eased to the host's.
- **No miss penalty.** A swing at nothing just costs you the swing's time.
- **A swing with no mole under it bonks a head.** Anybody standing within 0.7 of
  where the hammer lands (`FIELD.bonk`) - the nearest, if two - is **stunned for
  1.5 s** (`FIELD.stun`): they cannot walk or swing. No points for it. A mole
  under the hammer always comes first. Once a stun wears off, that player cannot
  be stunned again for another 1.5 s (`FIELD.stunGuard`), so nobody is
  stun-locked. A guest's keys do nothing while it is stunned, on its own screen
  as on the host's.

## One field, and it is the host's

- **The host runs the round** - everybody's walking and swings, whacks and
  scores - and sends it (`wa`) twenty times a second, with only the last three
  seconds of whacks. Older moles are back in their holes, and a guest has heard
  about those whacks several times over.
- **A guest sends** which way it is walking, and **its swing count for the
  round**, four times a second and on every change. A count rather than "swung
  now", so repeats and losses do no harm. The round's id is on it, so last
  round's count never lands in the next.
- **A guest walks its own body and swings its own hammer itself.**
  - **Walking:** its own whacker moves the moment a key goes down, the same way
    the host moves it, and only drifts back to the host's word - gently while
    walking, quickly once still, at once if more than 2.5 out.
  - **Swinging:** the hammer comes down the moment it clicks. Whether a mole was
    whacked, and by whom, is the host's to say.
  - **Everybody else** eases towards where the host says.
- **Somebody who goes quiet stops walking** on the host; their swings are never
  lost.
- **a pause stops the round for everybody.** Alone, the clock stops.
- **The canvas is rendered once**, and the scene redraws itself from a ref each
  frame - see Duck Hunt's notes.

**The roster is the lobby**, host first, up to eight - eight colours, none of them
gold. Alone, three stand-ins fill in:

- **Choosing a mole:** a stand-in goes for a mole it can reach before it goes
  down, the golden mole first.
- **Letting some go:** it lets 45% of moles go, as a person would.
- **Swinging:** it walks at 80% of a person's pace and swings 0.3 to 0.65 s after
  the mole comes up.

Against a scripted player who never misses and reacts instantly, stand-ins
finish within a few points of it. A person should be in the running, and the
knobs for tuning are `BOT_IGNORES`, `BOT_REACTION` and `FIELD.botPace`.

## Seeing what happened

- **The field:** striped grass inside a wooden fence, and sixteen dark holes
  ringed with dirt.
- **Moles** rise out of their holes, look about, and sink back. The golden mole
  shines and spins.
- **A swing** swings the hammer from over your shoulder down onto the grass in
  front of you.
- **A whacked mole** is flattened into its hole, with a ring bursting out in the
  whacker's colour.
- **A stunned player** wobbles, with yellow stars going round over their head.
- **Your own points** flash up top: "Whack! +1", or "Golden mole! +5". So does
  "Bonk! Stunned them" when you stun somebody, and "Bonked! Seeing stars…" when
  somebody stuns you.
- **The results** say how many heads each player bonked.
- **The HUD** has the clock (red for the last ten seconds), what moles are worth,
  and everybody's points.

## The camera does not move

High in front of the field (58 degrees), the whole fence in view the whole round.
Fitted to the fence's corners and tested at eight window shapes.

## Public contract

Exported because it is worth testing, not because anything else needs it.

| Export | What it is |
| --- | --- |
| `FIELD`, `HOLES`, `COLOURS` | The rules and the look, as numbers. |
| `holeAt`, `schedule`, `molesFor`, `isUp`, `spawns` | The field and its moles. Pure. |
| `createGame`, `stepGame`, `swing`, `canSwing`, `strikePoint`, `walk`, `whackOf`, `timeLeft`, `placings` | The round. Pure. |
| `Game`, `Whacker`, `Whack`, `Mole`, `Intent`, `Point`, `Entrant` | Its shapes. |
| `botIntents`, `botTarget`, `BOT_IGNORES`, `BOT_REACTION` | The stand-ins. |
| `newGame`, `gameRoster`, `nextSeed`, `waitingGame`, `myId`, `ME`, `SOLO_WHACKERS`, `MAX_WHACKERS` | Dealing a round. |
| `encodeSnapshot`, `decodeSnapshot`, `applySnapshot`, `encodeIntent`, `decodeIntent`, `RECENT`, `SNAPSHOT_TAG`, `INTENT_TAG` | A shared round on the wire. Pure. |
| `frameScene`, `POINTS`, `TILT`, `FOV`, `FILL` | The camera. Pure. |
| `WackAttackScreen` | The panel the registry draws. |

## Invariants you may rely on

- **Sixteen holes inside the fence, with room to stand round each.** Tested.
- **The same seed is the same moles; a mole never comes out of a busy hole or the
  one just used; golden moles are about one in eight and stay up less; moles come
  faster as the round goes on.** Tested.
- **A swing whacks the mole it lands on - in front of you or under you - for a
  point, or five for the golden mole.** Tested.
- **Not a mole that is not up yet, is gone back down, or was whacked already; not
  from a step away.** Tested.
- **0.4 s between swings, with 0.1 s allowed early on the host.** Tested.
- **A swing with no mole under it stuns the head it lands on for 1.5 s - no
  walking, no swinging - and that head cannot be stunned again for 1.5 s after.
  A mole under the hammer comes first.** Tested.
- **Who is stunned, and who bonked them, reach every guest.** Tested.
- **A running swing count is dealt with once; the round ends at a minute.** Tested.
- **Bodies stay inside the fence and out of each other.** Tested.
- **Ranked by points, level scores sharing a place.** Tested.
- **Stand-ins whack plenty, golden moles included, and leave plenty.** Tested.
- **Eight players with a lossy network agree on every score, no mole is whacked
  twice, and no swing is dealt more than once.** Tested.
- **The whole field is in frame at any window shape.** Tested.

## Deliberate non-goals

- No models, no sound.
- No moving camera.
- No penalty for a swing at nothing.

## Known limitations

- **Two swings at the same mole a ping apart go to whoever the host hears
  first.**
- **A guest's body can drift back a little** when it stops, as it settles onto
  the host's word.
- **The shared plumbing is copied an eleventh time** - camera fit, host/guest
  hook, own-body prediction, results card. Moving it into `15-minigames` is
  overdue.

## How to review

Open a lobby, leave the game on Volcano Island, press **minigames**, open
**10 · Wack-Attack**, and press **play**.

- **Look at the field.** A fenced field, sixteen holes, four pills with hammers,
  a ring in front of you on the grass.
- **Walk with WASD.** You turn to face the way you walk, and the ring comes with
  you.
- **Wait for a mole,** walk until the ring is on its hole, and **click.** The
  hammer comes down, the mole is flattened, a ring bursts in your colour,
  "Whack! +1".
- **Catch a golden mole.** "Golden mole! +5". It will not wait long.
- **Swing at nothing.** The hammer comes down; nothing else happens.
- **Swing at a stand-in's head.** Stand close, face it, click: stars go round
  its head, it stops dead for a second and a half, "Bonk! Stunned them".
  Swinging at it again straight after does nothing.
- **Race a stand-in to a mole.** Whoever swings first gets it.
- **At a minute,** the results, most points first. **Again** starts a new round.

### With two browsers

- **Both see the same moles** at the same moment.
- **Guest: walk and swing.** It moves and swings at once on your own screen, and
  the host sees it.
- **Guest: whack a mole.** Both screens show it flattened, and the same scores.
- **Bonk each other.** The one hit sees stars on both screens and cannot move or
  swing until it wears off.

## Gate record

Not yet gated.

## Measured

Not measured against the world's budget, because it does not draw into the
world's canvas. The field is about ninety meshes (fence, stripes, holes), a mole
is five, a player is the pill and a two-part hammer. One shadow-casting light.

Like the other minigames, a **second WebGL context** while a round is up.
