/**
 * Fish, shells and grapes.
 *
 * All pure, and all of it arithmetic that has to be exactly right: money is
 * the one thing in a game people notice being wrong, and every mistake here
 * is either a balance that goes negative, a balance that goes to `NaN` and
 * stays there, or somebody being charged for half a purchase.
 *
 * Wallets are values, not objects that mutate. Every operation returns a new
 * one, so a failed purchase cannot leave a half-spent wallet behind - the
 * caller either takes the new wallet or does not.
 */

export type CurrencyId = 'fish' | 'shell' | 'grape'

export interface Currency {
  id: CurrencyId
  label: string
  /** Shown in the readout. */
  glyph: string
  colour: string
}

export const CURRENCIES: readonly Currency[] = [
  { id: 'fish', label: 'Fish', glyph: '\u{1F41F}', colour: '#7fc2c0' },
  { id: 'shell', label: 'Shells', glyph: '\u{1F41A}', colour: '#f0dcc6' },
  { id: 'grape', label: 'Grapes', glyph: '\u{1F347}', colour: '#b39ddb' },
]

export const CURRENCY_IDS: readonly CurrencyId[] = CURRENCIES.map((c) => c.id)

/**
 * The most of any one thing you can hold.
 *
 * A cap rather than no cap, because without one a long enough game reaches the
 * point where adding one does nothing - floats stop being able to represent
 * consecutive integers above 2^53 - and a counter that silently stops counting
 * is worse than one that plainly stops.
 */
export const MAX_HELD = 9_999_999

/** How much of each thing something costs. Anything left out is free. */
export type Cost = Partial<Record<CurrencyId, number>>

export type Wallet = Readonly<Record<CurrencyId, number>>

export function emptyWallet(): Wallet {
  return { fish: 0, shell: 0, grape: 0 }
}

export function balanceOf(wallet: Wallet, id: CurrencyId): number {
  return wallet[id] ?? 0
}

/** Whole, non-negative, capped. Everything that goes into a wallet goes through here. */
function clean(amount: number): number {
  if (!Number.isFinite(amount)) return 0
  return Math.min(MAX_HELD, Math.max(0, Math.floor(amount)))
}

/**
 * Earns some of something.
 *
 * A negative or fractional amount is not an error to shout about - it is
 * rounded down and floored at nothing, so a caller that works out a reward
 * badly cannot take money away by calling `add`.
 */
export function add(wallet: Wallet, id: CurrencyId, amount: number): Wallet {
  const gain = clean(amount)
  if (gain === 0) return wallet
  return { ...wallet, [id]: clean(balanceOf(wallet, id) + gain) }
}

/** Whether everything in a cost can be paid, all at once. */
export function canAfford(wallet: Wallet, cost: Cost): boolean {
  for (const id of CURRENCY_IDS) {
    const price = clean(cost[id] ?? 0)
    if (price > balanceOf(wallet, id)) return false
  }
  return true
}

/**
 * Pays a cost, or does not.
 *
 * All or nothing, and that is the point of it being one function rather than a
 * loop of `spend`: a purchase costing two fish and a grape, made by somebody
 * with two fish and no grapes, must not take the fish. Returns `null` when it
 * cannot be paid, and the caller keeps the wallet it already had.
 */
export function pay(wallet: Wallet, cost: Cost): Wallet | null {
  if (!canAfford(wallet, cost)) return null
  const next: Record<CurrencyId, number> = { ...wallet }
  for (const id of CURRENCY_IDS) {
    const price = clean(cost[id] ?? 0)
    if (price > 0) next[id] = balanceOf(wallet, id) - price
  }
  return next
}

/** Spends one kind. A thin wrapper on `pay`, so the rules are in one place. */
export function spend(wallet: Wallet, id: CurrencyId, amount: number): Wallet | null {
  return pay(wallet, { [id]: amount })
}

/** Whether two wallets hold the same, so a store can skip a needless update. */
export function sameWallet(a: Wallet, b: Wallet): boolean {
  return CURRENCY_IDS.every((id) => balanceOf(a, id) === balanceOf(b, id))
}

/**
 * Reads a wallet back from storage.
 *
 * `localStorage` can hold anything at all - it survives across versions, it is
 * editable by hand, and a browser can hand back a partial write. Anything that
 * is not a whole non-negative number becomes nothing, and the shape is always
 * complete, so nothing downstream ever sees `undefined` where a number should
 * be.
 */
export function parseWallet(raw: unknown): Wallet {
  const out = emptyWallet() as Record<CurrencyId, number>
  if (!raw || typeof raw !== 'object') return out
  const source = raw as Record<string, unknown>
  for (const id of CURRENCY_IDS) {
    // Own properties only. `source[id]` walks the prototype chain, so an
    // object carrying a `__proto__` with balances on it would hand them over -
    // and this reads whatever is in storage, which is editable by hand.
    const value = hasOwn(source, id) ? source[id] : undefined
    out[id] = typeof value === 'number' ? clean(value) : 0
  }
  return out
}

/**
 * A count, short enough to fit in a corner.
 *
 * Thousands and millions get a suffix rather than being allowed to push the
 * panel wider, and the number stays honest: it rounds down, so a readout never
 * claims you have more than you do.
 */
export function formatAmount(amount: number): string {
  const value = clean(amount)
  if (value < 1000) return String(value)
  if (value < 1_000_000) {
    const thousands = Math.floor(value / 100) / 10
    return `${thousands % 1 === 0 ? thousands.toFixed(0) : thousands.toFixed(1)}k`
  }
  const millions = Math.floor(value / 100_000) / 10
  return `${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(1)}m`
}

/** `Object.hasOwn` in everything but name; the project targets ES2020. */
function hasOwn(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key)
}

/** The currency with this id, for a label or a colour. */
export function currency(id: CurrencyId): Currency {
  return CURRENCIES.find((c) => c.id === id) ?? CURRENCIES[0]
}
