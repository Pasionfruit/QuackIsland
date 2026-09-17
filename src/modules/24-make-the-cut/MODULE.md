# 24-make-the-cut

## What this is

**Minigame 13.** Everybody stands on top of a tower in a web of strings running
from knobs round its rim out and up to tall poles. The web has **three strings
for every player, plus one eliminating string fewer than there are players**.
A random player cuts first, and the turn passes round the group.

- **Your turn:** walk to a string, aim at it, and click to cut it.
- **A normal string:** nothing happens.
- **An eliminating string:** you are launched off the tower, and out.

Last one standing wins.

It plugs into `15-minigames` and nothing else in the build knows it exists.
Importing the module registers it - one line in `src/App.tsx`.

This is the **environment** and **controls** stages done. The assets stage is
not: the cutters are the island's capsule and the strings are cylinders.

## The rules, and where each one lives

| The brief said | Where it is |
| --- | --- |
| A tower surrounded by a web of strings | `TOWER`, `layWeb` |
| 3 strings per player, plus one fewer eliminating strings than players | `stringCount` (4N - 1), `deadlyCount` (N - 1) |
| A random player cuts first, the turn passes around | `createGame` draws `turn`; the `draw` phase shows it; `stepGame` passes it on |
| A normal string: nothing happens | `cut` |
| An eliminating string: launched off and eliminated | `cut` → `out`; the scene's launch |
| The last player remaining wins | `stepGame` ends at one standing; `placings` |
| WASD - move; mouse - aim; left click - cut string | `walk`, `aimAt`, `inReach` |

## Choices the brief left open

- **You have to reach a string to cut it:** its knob on the rim within 2.6 of
  you, a ring drawn on the boards round you on your turn. That is what the
  walking is for; the string under the pointer lights gold when you can reach
  it and grey when you cannot.
- **Twelve seconds a turn.** When the time runs out, the string nearest you is
  cut for you - it could be an eliminating one. Turns cannot be stalled away,
  and nobody is knocked out just for being slow.
- **Walking out of the lobby is out**, and your turn passes on.

## Why it always ends

N - 1 eliminating strings among 4N - 1. Every eliminating string cut takes one
player off, so the last one leaves exactly one standing, and the game cannot run
out of strings first. Tested across two to eight players.

## The web

- **Every string is laid from the web's seed**, evenly round the rim, turned a
  little and twisted a little on the way up.
- **Never down behind the tower.** Strings rise from the rim to their poles, so
  from the camera every string can be seen, rim to pole.
- **No two strings cross, seen from above.** Tested.
- **Every string looks the same.** Nobody can tell an eliminating string until it
  is cut.

## The eliminating strings stay on the host

Which strings eliminate, and who goes first, come from a second seed (`luck`,
from `crypto`) that is never sent. A snapshot says what a string was only once it
has been cut. A guest cannot find out ahead of time; **the host's own browser
knows**, the cost of it running the game, as in Probable Stop.

## One tower, and it is the host's

- **The host runs everything** - everybody's walking, the turns, every cut - and
  sends it (`mc`) twenty times a second.
- **A guest sends** (`mc-in`) which way it is walking, four times a second and on
  every change. When it cuts, it adds the string, the turn it cut on, and a
  number that goes up with each cut. The cut is said until taken, counted once,
  and only for that turn.
- **The host allows a guest 0.6 more reach** (`TOWER.reachGrace`), since it sees
  where the guest was a round trip ago.
- **A guest walks its own body itself.** It moves its own cutter the moment a key
  goes down, the same way the host does, and only drifts back to the host's word:
  gently while walking, quickly once still, at once if more than 2.5 out.
  Everybody else eases towards where the host says.
- **Somebody who goes quiet stops walking** on the host.
- **Pausing in a lobby stops only your hands**; the turn timer does not wait.
  Alone, the clock stops.
- **The canvas is rendered once**, and the scene redraws itself from a ref each
  frame - see Duck Hunt's notes.

**The roster is the lobby**, host first, up to eight - colours and turn order by
roster order. Alone, three stand-ins fill in. Every string looks the same to a
stand-in too. On its turn it picks one of the three strings nearest it, walks
over until it is well in reach, thinks for 1.2 to 3 seconds, and cuts. Off its
turn it stands still.

## Seeing what happened

- **Cutters** are the island pill in their colour on the boards, and whoever's
  turn it is has a spinning marker over their head.
- **Your turn:** a ring on the boards shows how far you can reach, and a banner
  tells you what to do - or to walk closer.
- **The draw:** names flick past and land on whoever cuts first.
- **A cut string snaps:** one end swings down from the rim and the other from its
  pole - pale for a normal string, red for an eliminating one. Whoever cut an
  eliminating one is launched outward and up, spinning, and down into the grass.
- **The HUD:** what is happening, the turn clock (red for the last three
  seconds), how many strings and eliminating strings are left, and everybody in
  roster order, the one whose turn it is outlined and anybody out struck through.
- **Banners** say what each cut was, and when a string was cut for somebody whose
  time ran out.

## The camera does not move

High in front of the tower (60 degrees), with the tower top, every string and the
poles in view the whole game. Fitted to rings round the poles' feet and tops and
heads on the rim, and tested at eight window shapes. So is the aim: a point near
the rim and halfway along every string, for two, four and eight players,
projected through a real camera and aimed back at.

## Public contract

Exported because it is worth testing, not because anything else needs it.

| Export | What it is |
| --- | --- |
| `TOWER`, `COLOURS`, `PHASES` | The rules and the look, as numbers. |
| `layWeb`, `webFor`, `stringCount`, `deadlyCount`, `spawns` | The web and the start. Pure. |
| `createGame`, `stepGame`, `cut`, `leave`, `walk`, `whoseTurn`, `inReach`, `distanceTo`, `nearestString`, `deadlyLeft`, `standing`, `placings` | The game. Pure. |
| `aimAt`, `rayToSegment` | Aiming. Pure. |
| `Game`, `Cutter`, `Cut`, `Last`, `Strand`, `Intent`, `Phase`, `Point3`, `Entrant` | Its shapes. |
| `botPlan`, `botIntents`, `botCut`, `BOT_THINK` | The stand-ins. |
| `newGame`, `gameRoster`, `secret`, `waitingGame`, `myId`, `ME`, `SOLO_CUTTERS`, `MAX_CUTTERS` | Dealing a game. |
| `encodeSnapshot`, `decodeSnapshot`, `applySnapshot`, `encodeIntent`, `decodeIntent`, `SNAPSHOT_TAG`, `INTENT_TAG` | A shared tower on the wire. Pure. |
| `frameScene`, `POINTS`, `TILT`, `FOV`, `FILL` | The camera. Pure. |
| `MakeTheCutScreen` | The panel the registry draws. |

## Invariants you may rely on

- **4N - 1 strings, N - 1 of them eliminating, hidden differently each game; a
  random first cutter.** Tested.
- **Strings rise from the rim and never cross, seen from above.** Tested.
- **Turns start after the draw and pass round, skipping anybody out.** Tested.
- **A normal string does nothing; an eliminating one puts its cutter out.** Tested.
- **A cut counts only on your turn, in reach (plus the allowance for a guest), on
  a whole string, for the turn it was made on.** Tested.
- **Out of time, the nearest string is cut for you.** Tested.
- **A game always ends with one standing, every eliminating string cut; the rest
  are placed by how long they lasted.** Tested.
- **Somebody who leaves is out, and their turn passes on.** Tested.
- **Bodies stay on the tower top and out of each other.** Tested.
- **Stand-ins walk to a string, cut it, and play whole games.** Tested.
- **A snapshot never says which uncut strings eliminate.** Tested.
- **Eight cutters with a lossy network agree on every cut and who is out, and no
  cut counts twice.** Tested.
- **The whole web is in frame at any window shape, and aiming at a string is that
  string.** Tested.

## Deliberate non-goals

- No models, no sound.
- No moving camera.
- No telling strings apart before they are cut.
- No pushing: bodies are solid, but nobody can be shoved off the tower.

## Known limitations

- **The host's browser knows which strings eliminate.** A host with the dev tools
  open can read it.
- **A guest's body can drift back a little** when it stops, as it settles onto
  the host's word.
- **The shared plumbing is copied a tenth time** - camera fit, host/guest hook,
  results card. Moving it into `15-minigames` is overdue.

## How to review

Open a lobby, leave the game on Volcano Island, press **minigames**, open
**13 · Make The Cut**, and press **play**.

- **Look at the tower.** A stone tower, a round wooden top with four pills on it,
  and strings from knobs on the rim up to poles all round. The HUD says how many
  strings and eliminating strings there are.
- **The draw.** Names flick past and land on who cuts first.
- **On your turn,** a marker spins over your head and a ring shows your reach.
  Walk with WASD. Put the pointer on a string: gold if you can reach it, grey
  if not ("too far").
- **Click a gold string.** It snaps. Normal: a green banner, and the turn moves on.
  Eliminating: its ends go red, you are launched off the tower, a red banner.
- **Wait out a turn.** At twelve seconds a string near you is cut for you.
- **Watch the stand-ins** walk to strings and cut them; now and then one is
  launched.
- **Last one standing.** The results, and **again** deals a new web.

### With two browsers

- **Both see the same web** and the same first cutter.
- **Guest: walk.** It moves on your own screen at once, and on the host's.
- **Guest: cut on your turn.** Both see it snap, and both agree on what it was.

## Gate record

Not yet gated.

## Measured

Not measured against the world's budget, because it does not draw into the
world's canvas. Each string is five meshes (the whole string, two snapped ends, a
knob, a pole), so eight players is about 155, plus the tower and the cutters. One
shadow-casting light.

Like the other minigames, a **second WebGL context** while a game is up.
