# 75-lobby-casino

The five central lobby fixtures are playable with the existing fish, seashell
and grape purse. Walk near a table and press **G**, or click **Play**. Choose
one resource, a whole-number wager and the available bet. Winnings return to
that same resource. Closing a table saves an unfinished hand rather than
refunding its committed stake.

## Games in this version

- Blackjack: Hit/Stand, dealer stands on all 17s, naturals pay 3:2, other wins
  pay 1:1. Stakes use multiples of two. Splits, doubles and insurance are not
  included.
- Roulette: single-zero wheel; red/black, odd/even, low/high and straight numbers.
- Slots: five reels, three visible rows, one paying centre line, four symbols
  and an explicit 3/4/5-match paytable.
- Baccarat: Player, Banker and Tie, with the complete third-card draw rules.
  Banker uses 5% commission and multiples of 20 to keep payouts integral.
- Craps: Pass Line, including come-out outcomes and subsequent point rolls
  without charging another stake.

[Detailed rules, payouts and source references](RULES.md) describe the selected
variants and the project's custom slot paytable.

## Public contract and integration

`LobbyCasino` is the registered scene component. `getCasinoStations`,
`layoutCasino`, `stationMatrix`, station names and types describe the central
fixtures. `CasinoPanel` is the DOM game view. `playRound`, `wagerProblem`,
`stakeStep`, `totalReturn`, round/action types and slot data expose the pure
rules. A standalone caller of CasinoPanel must manage player input if the
world remains active; the lobby integration already does this.

CasinoInteraction renders its DOM through a separate React DOM root, since
it mounts inside R3F. It checks horizontal and vertical proximity, rechecks
on opening, ignores text-field shortcuts and hides its prompt behind other
input owners. Opening releases captured mouse look and claims the public
player input lease from module 02. Closing, hiding or unmounting releases it.
The panel traps keyboard focus and supports Escape. World movement and held
keys are blocked while the table is open.

The current props, cards, printing and cabinet remain procedural 3D scenery;
the interactive panel presents the live dealt hands, reels, wheel outcome and
dice. The world props are not physical furniture and do not add collision.
The scene hides during party games or an open minigame.

## Wallet and round lifecycle

Module 11 remains the wallet owner. Casino code calls only its public
`getPurse`, `trySpend`, `earn`, parsing and metadata functions. Each wager uses
one selected currency; resources are never exchanged and no starter funds
are granted. Live balances appear beside the wager controls. Empty purses,
invalid amounts, insufficient balances and unsafe wallet-cap returns disable
or reject a wager.

The kit supplies the local human seat, identity and seed dealer. Game rules
use the core seeded RNG. A round is represented by its game, seed, wager and
accepted action transcript, with a private journal under
`localrot.casino.ticket.v1`. Outcomes are recomputed rather than trusting a
saved payout. Blackjack hands and craps points resume after a reload.

The stake record is saved before spending. A payout record is saved before
crediting. Recovery compares before/after balances to avoid repeating an
identifiable debit or credit. Reused wager IDs are idempotent. A new wager
cannot replace a valid unfinished hand. Unreadable records can be explicitly
reset without changing the purse. Stale cached wallets from other tabs are
rejected; Web Locks serialize casino operations where available.

The inherited wallet is browser-local and editable. There is no shared server
bankroll or multiplayer dealer. Its public API has no atomic transaction IDs:
if a balance changes independently during an interrupted transfer, recovery
may be ambiguous. The casino refuses further wallet changes in that case;
stronger guarantees need a future wallet transaction contract. See RULES.md
for the exact recovery and capacity behavior.

## Geometry and budgets

The five fixtures retain their wood, teal felt, brass trim, cards, chips and
stools. One local 1024-by-1024 atlas supplies labels and card/reel printing.
Each fixture stays below 3,000 triangles and the combined allocation is below
18,000. No models, downloads, AI-generated assets or packages were added.

## Validation

Tests cover deck/score rules, naturals, roulette zero, the baccarat third-card
chart, craps point progression, slot paytable enumeration, each resource,
unaffordable and malformed stakes, interrupted debits/credits, idempotent
retry, saved-hand validation, payout capacity, real wallet integration,
stale tabs and hand IDs, duplicate UI clicks, empty wallets, resumed hands, proximity,
keyboard opening, DOM cleanup and player input leases. Repository machine
gates run before handoff. No live user funds were wagered by these tests.

Automated browser visual review is pending. No new screenshots, measured
renderer performance or human PASS are claimed.

## How to review

1. Use a test purse with fish, seashells and grapes. Walk near each fixture.
   Check the Play prompt, G shortcut, mouse release and keyboard focus.
2. Open a table while holding a movement key. The duck should stop. Close with
   Escape or the close button; controls should resume without stuck movement.
3. Bet each resource. Confirm the stake leaves the correct balance once, and
   the displayed return/net result matches the wallet. No other resource changes.
4. Play blackjack Hit/Stand, roulette outside and straight bets, slots, all
   baccarat bets and a craps point round. Check the rules and paytables.
5. Close or reload during blackjack or a craps point. Reopen a table and resume
   the same cards/point with no additional stake. Finish and reopen again to
   check that a completed payout is not repeated.
6. Try an empty purse, invalid amount, insufficient balance and Banker amount
   outside multiples of 20. Check clear feedback and no resource movement.
7. Check two tabs: a stale wallet should require reload rather than overwrite
   newer balances. Inspect the saved-record recovery behavior on test data.
8. Start a party game or minigame while the panel is open, then return. The
   panel and input claim should clear; unfinished wagers remain resumable.
