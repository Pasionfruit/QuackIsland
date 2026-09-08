# 11-currency

## What this is

Three things worth having: **fish**, **shells** and **grapes**. This owns what
a wallet is, the arithmetic of earning and spending, the readout in the corner,
and remembering it between sessions.

It owns **no way of getting any of them**. Fishing, beachcombing and vines are
each a feature in their own right; this is the ledger they will all write to,
and it is built first so that none of them has to invent its own idea of what a
balance is.

There is a WALLET section in the debug panel that grants and spends, so the
ledger can be checked before anything earns.

## Public contract

| Export | Meaning |
| --- | --- |
| `WalletHUD` | The readout. Rendered from `src/App.tsx` |
| `usePurse()` / `getPurse()` | What you are carrying |
| `earn(id, amount)` | Adds to it |
| `trySpend(cost)` | Pays if it can, and says whether it did |
| `clearPurse()` | Empties it |
| `CURRENCIES` / `CURRENCY_IDS` / `currency(id)` | The three, with labels and colours |
| `emptyWallet()` / `balanceOf(w, id)` | Pure |
| `add(w, id, n)` / `spend(w, id, n)` / `pay(w, cost)` | Pure. Return new wallets |
| `canAfford(w, cost)` | Pure |
| `parseWallet(raw)` | Reads storage safely. Pure |
| `formatAmount(n)` | `999`, `1.5k`, `2.5m`. Pure |
| `sameWallet(a, b)` | Pure |
| `MAX_HELD`, `PURSE_KEY` | The cap and the storage key |
| `Wallet`, `Cost`, `Currency`, `CurrencyId` | The shapes above |

## Invariants you may rely on

- **A balance is a whole number, never negative, never `NaN`.** Everything that
  goes into a wallet passes through one place that floors it, clamps it at
  nothing, and rejects anything not finite.
- **Paying is all or nothing.** A purchase costing two fish and a grape, made
  by somebody with two fish and no grapes, takes *nothing*. That is the whole
  reason `pay` exists rather than a loop of `spend`.
- **Earning cannot take anything away**, however badly a caller works out a
  reward — a negative or fractional amount is floored, not applied.
- **Wallets are values.** Every operation returns a new one, so a failed
  purchase cannot leave a half-spent wallet behind.
- **Nothing read from storage is trusted.** It survives across versions, it is
  editable by hand, and a browser can return a partial write. A hand-edited
  negative, fraction, infinity, string, or a balance hidden on a prototype all
  come back as nothing.
- **The readout never claims you have more than you do.** `formatAmount`
  rounds *down*, so 999 never shows as `1k`.
- **Balances are capped** at `MAX_HELD`. Past 2^53 adding one does nothing, and
  a counter that silently stops counting is worse than one that plainly stops.

## Deliberate non-goals

- **No way to earn anything.** No fishing, no picking things up, no vines. Each
  is its own feature and each will call `earn`.
- **No shop, no prices, no trading.** `pay` and `canAfford` are the half of a
  shop that has to be right; the other half is a shop.
- **No sync between players.** A wallet is yours and lives in your browser.
  Everyone in a lobby has their own, and nobody can see anybody else's.
- **No exchange rate between the three.** They are three things, not one thing
  in three denominations.
- **No history, no receipts, no undo.**

## Why the ledger came before the earning

Nothing earns anything yet, which makes this look like infrastructure built too
early. It is the other way round: fishing, beachcombing and vines will each
want to add to a balance, and if the first of them invents the balance then the
second inherits whatever it happened to decide about negatives, rounding and
storage.

The rules here are the ones that are annoying to change later and very
noticeable when wrong — money is the thing people spot immediately. Getting
them settled costs one small module now and saves three arguments later.

## Why it is not synced

A wallet is personal, it changes far more often than a duck's position, and
nothing in the game reads anybody else's. Sending it would be traffic for a
number nobody can see.

When there is something to spend it on together — a shop on the party island,
say — the thing to send is the *purchase*, not the balance.

## Known limitations

- **Local only**, so clearing site data clears your wallet, and a different
  browser is a different wallet.
- **Trivially editable.** It is a number in `localStorage` and there is no
  attempt to stop anyone changing it. There is nothing to win.
- The cap is per currency, not a total.
- `formatAmount` goes to millions and no further; anything above that is shown
  in millions.

## How to review

- **Look at the corner.** Three counts, with a glyph and a colour each, always
  on screen.
- **Open the WALLET section and press `+` on each.** The count in the corner
  should follow immediately.
- **Press `-` until it reaches zero, then press it again.** It must stop at
  zero and never show a minus.
- **Press `+10` a few times.** The corner should switch to `1.2k` style once it
  passes a thousand, and should never round up — at 999 it must still say 999.
- **Reload the page.** The balances should come back exactly.
- **Edit `localrot.purse` in devtools** to `{"fish":-5,"shell":"lots"}` and
  reload. It should come back as zeroes rather than a broken readout.
- **Press empty it.** All three to zero, and still zero after a reload.
- **Open the game in a private window.** It should start empty and still work —
  blocked storage must not break anything.

## Gate record

Filled in when the human passes it.

## Measured

Filled in from the perf HUD at gate time.
