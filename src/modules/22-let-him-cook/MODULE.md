# 22-let-him-cook

## What this is

**Minigame 16.** A kitchen. Six baskets sit on the counter, one per ingredient,
three of it in each. The chef takes some of them into the pot, one at a time,
while everybody watches. Then the baskets are filled again and **rotate round
the counter**, and players take turns in a random order walking up, taking an
item from a basket and tossing it in the pot:

- **An ingredient the chef did not use:** out.
- **An ingredient the chef used, but every copy of it is already claimed:** out.
  If two tomatoes went in and two have been picked, the third tomato in the
  basket is a trap.
- **Otherwise:** the item stays in the pot, a chip in your colour goes by its
  basket, and you go to the back of the line.

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
| Mouse - aim; left click - select an ingredient | `pickBasket`, `slotFor`, the scene's pointer handling |

## A recipe

- **The baskets.** Three of every ingredient (`KITCHEN.copies`), eighteen
  items, each ingredient in its own basket. Two rows of three: six places round
  the counter (`LOOP`, along the back and back along the front).
- **The recipe.** The chef takes four more items than there are cooks still in,
  between six and ten, each a different item.
- **The answer.** `used` is how many of each ingredient went in.
- **The rotation.** Each recipe deals how many places the baskets move, one to
  five (`spin`). Once the chef's last item is in, the baskets slide round the
  counter that many places, a place at a time, over the last two seconds of the
  cooking (`rotation`, `KITCHEN.rotate`). Where a basket *was* is no help unless
  you watched it go round. The next recipe starts from where they stopped
  (`turned`).
- **The turns.** The baskets are filled again for them. Remembering *what* went
  in, and how many of each, is the game. (The rules still deal the items into
  slots and reshuffle them, `counter` and `served`; the scene sorts each slot
  into its basket, so the shuffle is not seen.)

## Turns

- Ten seconds to pick. Run out, and you are out (`time`).
- A pick only counts on your turn, and only on an item nobody has claimed. A
  click on a basket takes its last unclaimed item (`slotFor`); every copy in a
  basket is the same to the rules. An emptied basket cannot be clicked.
- Two and a half seconds after every pick to see it taken, tossed in, and what
  the chef made of it, then the next turn.

## When everything is claimed

**The chef cooks again**, for whoever is still in, and the line carries on where
it was. Each recipe is **quicker**:

- The chef's pace drops from 1.4 s an item by a fifth each recipe, to 0.6 s.
- The turn loses a second each recipe, down to 5 s.

**Two recipes at most** (`KITCHEN.recipes`). When the second runs dry, the chef
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
- **a pause stops the round for everybody**: you cannot pick while paused, and
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

- **The chef.** The chef goes to each basket as an item is taken from it; the
  item lifts, arcs into the pot, and the soup rises. For the turns, the chef
  waits by the pot.
- **The cook at the counter.** Whoever's turn it is walks in from the left in
  their colour and waits in front of the counter. Nobody else is shown.
- **Picking.** On your turn, the basket under the pointer gets a white ring and
  your cook walks to it. A click takes an item from it, and the item stays lifted
  until the host answers.
- **The toss** (`TOSS`, seconds into the result). The cook goes to the basket,
  the item comes up into their hands (0.35 s), and they toss it in, leaning into
  the throw (lands at 1 s).
- **The chef's answer.** It belongs in the pot: the chef hops. It does not - not
  in the recipe, or every copy already claimed: **the chef shakes his head** (1-2
  s), the basket gets a red ring, and the item is thrown back into its basket.
- **Claimed items.** A chip in the claimer's colour by the basket, one per item
  claimed from it this recipe, which appears once the item lands.
- **Banners.** The first cooking ("watch what the chef puts in the pot"), a new
  recipe, your turn, and every result in words: "cook 3 picked the fish - it was
  not in the recipe. Out!" / "Every egg in the recipe was already claimed…".
- **The line** under the HUD: everybody still in, in turn order, whoever is up
  outlined; everybody out after them, struck through.
- **The HUD.** What is happening, the time left to cook or to pick (red for the
  last three seconds), and how many items you have claimed.

## The camera does not move

In front of the counter, raised 44 degrees to look down into the baskets, with
the counter, the chef's hat, the pot and the cook in front in view the whole
game. Fitted to those points and tested at eight window shapes. So is a click:
every basket, middle, sides and rim, projected through a real camera and picked
back.

## Public contract

Exported because it is worth testing, not because anything else needs it.

| Export | What it is |
| --- | --- |
| `KITCHEN`, `INGREDIENTS`, `KINDS`, `COLOURS`, `PHASES`, `WHYS` | The rules and the look, as numbers. |
| `dealRecipe`, `recipeSize`, `pace`, `turnTime`, `pickTime`, `cookTime`, `rotation` | Recipes, their timing, and where the baskets have turned to. Pure. |
| `createGame`, `pick`, `leave`, `stepGame`, `whoseTurn`, `claimedOf`, `unclaimed`, `stillIn`, `fastForwarding`, `placings` | The game. Pure. |
| `Game`, `Cook`, `Pick`, `Phase`, `Why`, `Recipe`, `Entrant` | Its shapes. |
| `botMove`, `remembered`, `BOT_MEMORY`, `BOT_FORGETS`, `BOT_THINK` | The stand-ins. |
| `newGame`, `gameRoster`, `secret`, `waitingGame`, `myId`, `ME`, `SOLO_COOKS`, `MAX_COOKS` | Dealing a game. |
| `encodeSnapshot`, `decodeSnapshot`, `applySnapshot`, `shownPicks`, `encodeIntent`, `decodeIntent`, `LOOKAHEAD`, `SNAPSHOT_TAG`, `INTENT_TAG` | A shared kitchen on the wire. Pure. |
| `frameScene`, `pickBasket`, `basketAt`, `itemAt`, `chipAt`, `LOOP`, `LAYOUT`, `POT`, `POINTS`, `TILT`, `FOV`, `FILL` | The kitchen's layout, the camera and clicks. Pure. |
| `LetHimCookScreen` | The panel the registry draws. |

## Invariants you may rely on

- **Six ingredients, three of each; the recipe's counts are what the chef took;
  the turns' baskets hold the same items.** Tested.
- **The baskets rotate one to five places, only after the last item is in, and
  every basket is always in a place of its own; a click lands on a basket
  wherever it has turned to.** Tested.
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
- **A guest's pick waits on the host** before it is tossed - the item stays
  lifted until then. Fine for a turn-based game; noted in case it feels slow on
  a bad connection.
- **The shared plumbing is copied an eighth time** - camera fit, host/guest hook,
  results card. Moving it into `15-minigames` is overdue.

## How to review

Open a lobby, leave the game on Volcano Island, press **minigames**, open
**16 · Let Him Cook**, and press **play**.

- **Watch the chef.** Six baskets of ingredients, the chef in a hat going to a
  basket at a time, each item arcing into the pot, the soup rising. Count what
  goes in.
- **The turn order.** A card with everybody's place in the line.
- **The baskets rotate.** Once everything is in, the baskets slide round the
  counter one to five places.
- **The baskets fill again**, and the first cook walks in, in their colour.
- **On your turn, move the pointer over the baskets.** The one under it gets a
  white ring and your cook walks to it. Click one you saw go in: your cook tosses
  an item into the pot, the chef hops, green banner, a chip in your colour by the
  basket, and you go to the back of the line.
- **Click one you did not see go in.** Tossed in, the chef shakes his head and
  throws it back; red banner, you are out.
- **Watch the stand-ins.** They think a moment and pick; now and then they get
  one wrong, or pick a copy that is already gone, and the banner says which.
- **Wait out a turn.** At ten seconds you are out for time.
- **Claim everything in the recipe.** The chef cooks again, quicker; the HUD says
  which recipe it is.
- **Last one in.** The results, and **again** starts a new game.

### With two browsers

- **Both watch the same cooking**, see the baskets rotate the same way, and see
  the same order and baskets.
- **Guest: pick on your turn.** The host sees the guest's cook toss it in and a
  chip in the guest's colour, and both see the same line after it.
- **Guest: pick wrong.** Both see the guest out, and why.

## Gate record

Not yet gated.

## Measured

Not measured against the world's budget, because it does not draw into the
world's canvas. Eighteen ingredients of one to four meshes each, six baskets of
six meshes and a ring, eighteen chips, the room, the chef, the cook at the
counter - around a hundred and twenty draw calls at most. One
shadow-casting light.

Like the other minigames, a **second WebGL context** while a game is up.
