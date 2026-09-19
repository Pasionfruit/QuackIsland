# 41-one-piece

## What this is

Minigame 25, **One Piece?!** Free-for-all, a race to finish a jigsaw. It takes
the slot that was *Short Song Rhythm*, which was never built.

Everybody gets a **six-piece square puzzle of their own face** - two pieces
across, three down - scattered either side of an empty frame, every piece
turned the wrong way. **Drag** a piece into the frame, **turn** it the right way
up, and it clicks in and stays. Players are **placed in the order they finish
their puzzle**: the first to click in all six is first.

The game ends when **three have finished, everybody still in the lobby has, or
at ninety seconds**, whichever comes first - the same rule as the other races.
Anybody not finished by then is placed by how many pieces they got in.

## The controls

| Input | Does |
| --- | --- |
| Mouse drag | Move a puzzle piece |
| Left click | Select a piece (and bring it to the front) |
| Right click / scroll | Turn the selected piece a quarter - right click and wheel down clockwise, wheel up back |

A piece clicks in when it is let go of (or turned) with its middle within
`TABLE.snap` of its place **and** the right way up. Anywhere else it just lies
where it was dropped. A piece that is in cannot be picked up again. Clicking
the bare table drops the selection. The wheel turns at most one quarter every
140 ms, so a trackpad flick is one turn and not twelve.

## Your face

`Portrait.tsx`. There is no camera or photo: your face is the island's pill,
drawn flat the way the podium draws it, **in your colour**, with two eyes, a
smile and your name across the bottom, standing on the beach. Something sits
in every one of the six cells - sun top left, cloud and gull top right, an eye
each side of the middle, a shell and a starfish at the bottom corners, the name
along the bottom - so every piece can be told from the others and the right way
up told from the wrong.

## The table

`rules.ts`, the `Board` half. Laid out in its own units (`TABLE`, 1000 x 600)
and scaled to fit by the screen. The frame is the 360 square in the middle,
with a faint ghost of your picture and a dashed line round each place; the
pieces start three either side of it, in a shuffled order, a little off a neat
column, each turned a quarter, a half or three quarters - never the right way
up. Where they start comes from the seed, so **everybody is dealt the same
table**: nobody gets an easier one.

Your table is yours alone and never goes on the wire. Only which pieces are
in does.

## The screen

`OnePieceScreen.tsx`, all DOM and SVG - no canvas. The table on the left with
a caption under it; down the right, **everybody's puzzles**, small, filling in
piece by piece as they get them in, with their place and time once they
finish. The HUD across the top has your count and a pill for everybody.

## Networking

`usePuzzleNet.ts` and `wire.ts`. The host runs the clock and the stand-ins and
sends every player's pieces-in (a six-bit mask), finish time and whether they
left, ten times a second. A guest works its own table without waiting and says
its mask at once when a piece clicks in, and every 400 ms besides. The host
merges it (`place`: a mask only ever gains bits) and is the only word on when
anybody finished and when the game is over.

Stand-ins only when alone (`ai.ts`): each looks for 1.2 to 3 s, then gets a
piece in every 2.6 to 5.6 s, in a seeded order of its own - so about 20 to 35 s
for the lot. What a stand-in has in is a pure function of the clock.

## How to review

- Open **One Piece?!** (25) from the minigames dashboard and press play.
- Your face - your colour, your name - is ghosted in the frame, and six pieces
  lie either side, all turned.
- Drag a piece: it follows the mouse and comes to the front with a yellow ring.
- Right click it, or scroll: it turns a quarter each time, smoothly.
- Drop it on its place the wrong way up: it stays loose. Turn it the right way
  up while it is there: it clicks in, square, with a bump.
- Try to pick up a piece that is in: you cannot.
- Watch the stand-ins' puzzles fill in down the right.
- Finish all six: *Solved! You came 1st*, and the podium follows once three
  are done.
- In a lobby of two browsers: each sees its own face on its own table, and the
  other's small puzzle fill in as they go.

## Non-goals

- No 3D: the table, the pieces and the faces are DOM and SVG.
- No photo or camera: your face is the island pill in your colour.
- No sound of its own beyond a bump as a piece clicks in; no round music yet.
- Pieces are rectangles, not jigsaw-shaped.
