# 22-let-him-cook

## What this is

**Minigame 16.** A kitchen. Fifteen items sit on the counter, each one of six
ingredients. The chef takes some of them into the pot, one at a time, while
everybody watches. Then the counter is laid out again, all fifteen in new places,
and players take turns in a random order picking an item they think was in the
recipe:

- **An ingredient the chef did not use:** out.
- **An ingredient the chef used, but every copy of it is already claimed:** out.
  If two tomatoes went in and two have been picked, the third tomato on the
  counter is a trap.
- **Otherwise:** the item goes on a plate in your colour, and you go to the back of the line.

Last cook standing wins.

It plugs into `15-minigames` and nothing else in the build knows it exists.
Importing the module registers it - one line in `src/App.tsx`.

This is the **environment** and **controls** stages done. The assets stage is
not: the chef is the island's capsule in a hat, and the ingredients are
primitives.

## The rules, and where each one lives

| The brief said | Where it is |
| --- | --- |
| The chef creates a recipe from 15 items across 6 ingredients | `dealRecipe`, `INGREDIENTS`, `KITCHEN.items` |
| Memorize which ingredients were used | the cooking phase: each item arcs into the pot (`pickTime`) |
| Players are placed in a random turn order | `createGame` shuffles `queue`; shown in the `order` phase |
| Take turns selecting an ingredient | `pick`, `whoseTurn` |
| Not used, or all copies already claimed, eliminates you | `pick` - `Why` = `wrong` / `gone` |
| Correct: back of the line, another chance next turn | `pick` moves you to the end of `queue` |
| The last player remaining wins | `stepGame` ends at one left; `placings` |
| Mouse - aim; left click - select an ingredient | `pickSlot`, the scene's pointer handling |

## A recipe

- **The counter.** Every ingredient has at least one copy and at most four; the
  fifteen are shuffled onto three rows of five.
- **The recipe.** The chef takes four more items than there are cooks still in,
  between six and ten, each a different item.
- **The answer.** `used` is how many of each ingredient went in.
- **The turns.** The counter is shuffled again for them, so remembering *where*
  things were is no help. Remembering *what* went in, and how many of each, is
  the game.

## Turns

- Ten seconds to pick. Run out, and you are out (`time`).
- A pick only counts on your turn, and only on an item nobody has claimed;
  claimed items sit on their plates and a click passes through them.
- Two seconds after every pick to see what it was and what it meant, then the
  next turn.

## When everything is claimed

**The chef cooks again**, for whoever is still in, and the line carries on where
it was. Each recipe is **quicker**:

- The chef's pace drops from 1.4 s an item by a fifth each recipe, to 0.6 s.
- The turn loses a second each recipe, down to 5 s.

**Six recipes at most** (`KITCHEN.recipes`). When the sixth runs dry, the chef
does not cook again: every item left is either not in the recipe or already
claimed, so every pick is out. That guarantees a game ends, however good
everybody's memory is. The brief's own rule ends it; without the cap, two
players who never forget would play forever. Tested with players who never
pick wrong.

## The recipe stays on the host

The host deals the recipe from a secret seed (`crypto`, as in Probable Stop) and
never sends it:

- **No seed, no counts.** Nothing that tells a guest what went into the pot.
- **Picks only as they happen.** While the chef cooks, a snapshot carries the
  items the chef has *reached for so far*, 0.4 s ahead of the moment (`shownPicks`,
  `LOOKAHEAD`) so a guest has them in time to draw them.
- **Nothing after the cooking.** Once cooking ends, snapshots carry no picks at
  all.

A guest that wants the answer has to watch the chef, like everybody else. **The
host's own browser has the answer in memory**; that is the cost of it running the
kitchen, as with Probable Stop.

## One kitchen, and it is the host's

The same arrangement as the other minigames:

- **The host runs everything** - the chef's clock, the turns, its own picks, the
  stand-ins', the guests' - and sends what everybody can see (`lhc`) ten times a
  second.
- **A guest sends a pick** (`lhc-in`): which game, which turn, which slot. Said
  again every 150 ms until the turn moves on, and harmless to repeat: the host
  only takes a pick for the turn it is on, from whoever's turn it is.
- **A guest's clock runs on between snapshots**, eased towards the host's within
  a phase and snapped to it across one, so the chef's hands and the turn timer
  move smoothly.
- **Somebody who leaves the lobby is out** (`left`); if it was their turn, it
  ends there.
- **Pausing in a lobby stops only your hands**: you cannot pick while paused, and
  the turn timer does not wait. Alone, the clock stops.
- **The canvas is rendered once**, and the scene redraws itself from a ref each
  frame - see Duck Hunt's notes.

**Once only stand-ins are left in** a game a person was playing, the kitchen
runs at four times speed to the end (`fastForwarding`, `KITCHEN.fastForward`),
and the HUD says so. Nobody is left to remember anything, and without it a
person out on the first turn watched three stand-ins for three minutes.

**The roster is the lobby**, host first, up to eight - colours by roster order,
turns by the shuffle. Alone, three stand-ins fill in. A stand-in thinks for 1.2
to 3 seconds and picks an item it believes still has a copy left. It remembers
each ingredient's count right four times in five, one off otherwise, and a
twentieth worse each recipe as the chef speeds up.

## Seeing what happened

- **The chef.** The chef goes to each item as it is taken; the item lifts, arcs
  into the pot, and the soup rises.
- **Picking.** On your turn, the item under the pointer grows and gets a white
  ring. A click takes it, and it stays lifted until the host answers.
- **Claimed items.** They sit on a plate edged in the claimer's colour.
- **A wrong pick.** The item shakes on a red ring.
- **Banners.** The first cooking ("watch what the chef puts in the pot"), a new
  recipe, your turn, and every result in words: "cook 3 picked the fish - it was
  not in the recipe. Out!" / "Every egg in the recipe was already claimed…".
- **The line** under the HUD: everybody still in, in turn order, whoever is up
  outlined; everybody out after them, struck through.
- **The HUD.** What is happening, the time left to cook or to pick (red for the
  last three seconds), and how many items you have claimed.

## The camera does not move

In front of the counter, raised 44 degrees so the back row shows past the front
one, with the counter, the chef's hat and the pot in view the whole game. Fitted
to those points and tested at eight window shapes. So is a click: every item,
centre and edges, projected through a real camera and picked back.

## Public contract

Exported because it is worth testing, not because anything else needs it.

| Export | What it is |
| --- | --- |
| `KITCHEN`, `INGREDIENTS`, `KINDS`, `COLOURS`, `PHASES`, `WHYS` | The rules and the look, as numbers. |
| `dealRecipe`, `recipeSize`, `pace`, `turnTime`, `pickTime`, `cookTime` | Recipes and their timing. Pure. |
| `createGame`, `pick`, `leave`, `stepGame`, `whoseTurn`, `claimedOf`, `unclaimed`, `stillIn`, `fastForwarding`, `placings` | The game. Pure. |
| `Game`, `Cook`, `Pick`, `Phase`, `Why`, `Recipe`, `Entrant` | Its shapes. |
| `botMove`, `remembered`, `BOT_MEMORY`, `BOT_FORGETS`, `BOT_THINK` | The stand-ins. |
| `newGame`, `gameRoster`, `secret`, `waitingGame`, `myId`, `ME`, `SOLO_COOKS`, `MAX_COOKS` | Dealing a game. |
| `encodeSnapshot`, `decodeSnapshot`, `applySnapshot`, `shownPicks`, `encodeIntent`, `decodeIntent`, `LOOKAHEAD`, `SNAPSHOT_TAG`, `INTENT_TAG` | A shared kitchen on the wire. Pure. |
| `frameScene`, `pickSlot`, `slotAt`, `LAYOUT`, `POT`, `POINTS`, `TILT`, `FOV`, `FILL` | The kitchen's layout, the camera and clicks. Pure. |
| `LetHimCookScreen` | The panel the registry draws. |

## Invariants you may rely on

- **Fifteen items, six ingredients, one to four of each; the recipe's counts are
  what the chef took; the turns' counter is the same fifteen reshuffled.** Tested.
- **The turn order is a random permutation of everybody.** Tested.
- **Cooking, then the order (first recipe only), then turns.** Tested.
- **A pick in the recipe with a copy left is claimed and goes to the back; not in
  the recipe is out; every copy claimed is out; out of time is out.** Tested.
- **A pick off your turn, on a claimed item or outside the turns does
  nothing.** Tested.
- **Last one in wins; the rest are placed by how long they lasted.** Tested.
- **A dry recipe is followed by a quicker one, keeping the line - six at most -
  and a game always ends.** Tested.
- **The kitchen fast-forwards only when a person was playing and only stand-ins
  are left in.** Tested.
- **A snapshot never carries the recipe, and a guest is shown each pick before
  its moment and not long before.** Tested.
- **Eight cooks with a lossy network agree on every claim, out and the winner,
  and no pick counts twice.** Tested.
- **The whole kitchen is in frame at any window shape, and a click on an item is
  that item.** Tested.

## Deliberate non-goals

- No models, no sound.
- No moving camera.
- No hiding the recipe from the host's own browser.
- No choosing to pass: on your turn, you pick.

## Known limitations

- **The host's browser holds the answer.** A host with the dev tools open can
  read it.
- **A guest's pick waits on the host** before it is on a plate - the item stays
  lifted until then. Fine for a turn-based game; noted in case it feels slow on
  a bad connection.
- **The shared plumbing is copied an eighth time** - camera fit, host/guest hook,
  results card. Moving it into `15-minigames` is overdue.

## How to review

Open a lobby, leave the game on Volcano Island, press **minigames**, open
**16 · Let Him Cook**, and press **play**.

- **Watch the chef.** A counter of fifteen ingredients, the chef in a hat going
  to each item in turn, each one arcing into the pot, the soup rising. Count what
  goes in.
- **The turn order.** A card with everybody's place in the line.
- **Look at the counter again.** The same items, in new places.
- **On your turn, move the pointer over the items.** The one under it grows and
  gets a white ring. Click one you saw go in: green banner, it goes on a plate in
  your colour, and you go to the back of the line.
- **Click one you did not see go in.** Red banner, it shakes, you are out.
- **Watch the stand-ins.** They think a moment and pick; now and then they get
  one wrong, or pick a copy that is already gone, and the banner says which.
- **Wait out a turn.** At ten seconds you are out for time.
- **Claim everything in the recipe.** The chef cooks again, quicker; the HUD says
  which recipe it is.
- **Last one in.** The results, and **again** starts a new game.

### With two browsers

- **Both watch the same cooking**, and see the same order and counter.
- **Guest: pick on your turn.** The host sees the plate in the guest's colour, and
  both see the same line after it.
- **Guest: pick wrong.** Both see the guest out, and why.

## Gate record

Not yet gated.

## Measured

Not measured against the world's budget, because it does not draw into the
world's canvas. Fifteen ingredients of one to four meshes each, a plate and a
ring per slot, the room, the chef - well under a hundred draw calls. One
shadow-casting light.

Like the other minigames, a **second WebGL context** while a game is up.
