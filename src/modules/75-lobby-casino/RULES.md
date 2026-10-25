# Implemented casino rules

These are personal, browser-local games using the existing fish, seashell and
grape wallet. One selected resource is wagered per round. Returns include the
original stake; no currency conversion is performed.

## Blackjack

A fresh seeded single deck is dealt each hand. Aces count as 1 or 11; faces
count as 10. The player may Hit or Stand; 21 automatically stands. The dealer
stands on all 17s. A two-card natural wins 3:2 unless the dealer also has a
natural, which pushes. Other wins pay 1:1. Splits, doubles, insurance and
surrender are not in this first version. Stakes use multiples of two to keep
the 3:2 return in whole resources.

Rule reference: [MGM Guide to Blackjack](https://www.mgmresorts.com/en/gamesense/guide-to-blackjack.html).

## Roulette

One number from 0–36 is selected. Straight numbers pay 35:1. Red/black,
odd/even, and 1–18/19–36 pay 1:1. Zero loses on outside bets. This version uses
a single zero; American double-zero and combination bets are not included.

Payout reference: [MGM Guide to Roulette](https://www.mgmresorts.com/en/gamesense/guide-to-roulette.html).

## Five-reel slots

Each reel shows three independently selected symbols from Cherries, Bell,
Star and Seven. Only the middle row pays, for three or more matching symbols
starting at the leftmost reel. The following are total-return multipliers.

| Symbol | 3 matching | 4 matching | 5 matching |
| --- | ---: | ---: | ---: |
| Cherries | 4× | 12× | 40× |
| Bell | 6× | 20× | 60× |
| Star | 8× | 30× | 90× |
| Seven | 12× | 40× | 120× |

This is the project's own paytable. Exhaustive enumeration of the 1,024
equally likely centre lines yields a mathematical total return of 95.3125%.
The rules test verifies that calculation. No wilds, scatter payouts, bonus
rounds or additional paylines are implemented.

## Baccarat

A fresh seeded eight-deck shoe is dealt each round. Aces count as one; tens
and faces count as zero; hand totals use the last digit. Natural eights and
nines stop drawing. Otherwise Player draws on 0–5, and Banker follows the
standard third-card table, including Player's third-card value.

Player wins pay 1:1; Banker wins pay 19:20 after 5% commission; Tie wins pay
8:1. Player and Banker wagers push on a tie. Banker wagers use multiples of
20 to preserve whole-resource payouts. Side bets are not implemented.

References: [MGM third-card guide](https://static.mgmresorts.com/content/dam/MGM/mgm-national-harbor/casino/table-games/gaming-guides/mgm-national-harbor-casino-table-games-baccarat-royal-9.pdf),
[MGM Guide to Baccarat](https://www.mgmresorts.com/en/gamesense/guide-to-baccarat.html).

## Craps

Pass Line is implemented. A come-out 7 or 11 wins; 2, 3 or 12 loses. Other
totals establish the point; subsequent rolls win on that point and lose on
seven. Other totals continue the same wager. Wins pay 1:1. No additional stake
is taken for later rolls. Odds and other table bets are not implemented.
An unusually long round that reaches the 512-action storage limit pushes.

Rule reference: [MGM Guide to Craps](https://www.mgmresorts.com/en/gamesense/guide-to-craps.html).

## Wallet settlement and recovery

The stake is saved before `trySpend` is called, and a terminal result is saved
before `earn` pays it. An incomplete debit or credit is reconciled against
the recorded before/after balance, avoiding a second charge or payout when
the balance identifies what happened. Reused wager IDs are idempotent.
Blackjack hands and craps points resume from their seed and accepted actions.
Closing the panel saves the hand; it does not refund a committed wager.

The wallet remains local and editable, as defined by `11-currency`. Web Locks
serialize casino operations when available; a persisted-wallet comparison
rejects stale cached balances from other tabs. There is no server bankroll or
multiplayer dealer. The wallet API has no atomic transaction IDs: if another
operation changes a balance during an interrupted debit or payout, recovery
can be ambiguous. The casino refuses further wallet changes in that case.
This limitation needs a future wallet transaction contract for stronger guarantees.

New wagers are limited to 10,000 resources and must leave room for the largest
possible return under the wallet cap. If other wallet activity fills that
space during an unfinished hand, the displayed payout records the amount
actually credited. Malformed saved hands are never used to compute a payout;
their record can be explicitly reset without changing the wallet.
