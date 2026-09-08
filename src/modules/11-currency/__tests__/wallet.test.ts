import { describe, expect, it } from 'vitest'
import {
  CURRENCIES,
  CURRENCY_IDS,
  MAX_HELD,
  add,
  balanceOf,
  canAfford,
  currency,
  emptyWallet,
  formatAmount,
  parseWallet,
  pay,
  sameWallet,
  spend,
} from '../internal/wallet'

describe('the three things', () => {
  it('are fish, shells and grapes', () => {
    expect([...CURRENCY_IDS]).toEqual(['fish', 'shell', 'grape'])
  })

  it('each have a label, a glyph and a colour', () => {
    for (const c of CURRENCIES) {
      expect(c.label.length).toBeGreaterThan(0)
      expect(c.glyph.length).toBeGreaterThan(0)
      expect(c.colour).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('are told apart by colour, so a glance is enough', () => {
    expect(new Set(CURRENCIES.map((c) => c.colour)).size).toBe(CURRENCIES.length)
    expect(new Set(CURRENCIES.map((c) => c.glyph)).size).toBe(CURRENCIES.length)
  })

  it('can be looked up, and never come back undefined', () => {
    for (const id of CURRENCY_IDS) expect(currency(id).id).toBe(id)
  })
})

describe('a new wallet', () => {
  it('holds nothing, of everything', () => {
    const wallet = emptyWallet()
    for (const id of CURRENCY_IDS) expect(balanceOf(wallet, id)).toBe(0)
  })

  it('is complete, so nothing downstream ever sees undefined', () => {
    expect(Object.keys(emptyWallet()).sort()).toEqual([...CURRENCY_IDS].sort())
  })
})

describe('earning', () => {
  it('adds it up', () => {
    let wallet = emptyWallet()
    wallet = add(wallet, 'fish', 3)
    wallet = add(wallet, 'fish', 4)
    expect(balanceOf(wallet, 'fish')).toBe(7)
  })

  it('leaves the other two alone', () => {
    const wallet = add(emptyWallet(), 'grape', 5)
    expect(balanceOf(wallet, 'fish')).toBe(0)
    expect(balanceOf(wallet, 'shell')).toBe(0)
  })

  it('never takes anything away', () => {
    // A caller that works out a reward badly must not be able to charge you
    // by calling the earning function.
    const wallet = add(add(emptyWallet(), 'fish', 5), 'fish', -100)
    expect(balanceOf(wallet, 'fish')).toBe(5)
  })

  it('deals in whole things', () => {
    // Half a fish is not a thing anybody wants in a total.
    expect(balanceOf(add(emptyWallet(), 'fish', 2.9), 'fish')).toBe(2)
  })

  it('survives being handed nonsense', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const wallet = add(add(emptyWallet(), 'fish', 4), 'fish', bad)
      expect(balanceOf(wallet, 'fish')).toBe(4)
    }
  })

  it('stops at the cap rather than silently going wrong', () => {
    // Past 2^53 adding one does nothing, and a counter that quietly stops
    // counting is worse than one that plainly stops.
    const full = add(emptyWallet(), 'shell', MAX_HELD + 1000)
    expect(balanceOf(full, 'shell')).toBe(MAX_HELD)
    expect(balanceOf(add(full, 'shell', 10), 'shell')).toBe(MAX_HELD)
  })

  it('gives back a new wallet rather than changing the old one', () => {
    const before = emptyWallet()
    const after = add(before, 'fish', 1)
    expect(balanceOf(before, 'fish')).toBe(0)
    expect(after).not.toBe(before)
  })

  it('does not bother making one when nothing was earned', () => {
    const wallet = emptyWallet()
    expect(add(wallet, 'fish', 0)).toBe(wallet)
  })
})

describe('spending', () => {
  const rich = { fish: 10, shell: 5, grape: 2 }

  it('takes what it costs', () => {
    expect(balanceOf(spend(rich, 'fish', 4)!, 'fish')).toBe(6)
  })

  it('refuses what cannot be paid, and takes nothing', () => {
    expect(spend(rich, 'grape', 3)).toBeNull()
    expect(balanceOf(rich, 'grape')).toBe(2)
  })

  it('allows spending everything', () => {
    expect(balanceOf(spend(rich, 'grape', 2)!, 'grape')).toBe(0)
  })

  it('never goes negative', () => {
    for (const id of CURRENCY_IDS) {
      for (const amount of [1, 5, 11, 1e9]) {
        const after = spend(rich, id, amount)
        if (after) expect(balanceOf(after, id)).toBeGreaterThanOrEqual(0)
      }
    }
  })
})

describe('paying for something with more than one thing', () => {
  const wallet = { fish: 2, shell: 9, grape: 0 }

  it('says what can be afforded', () => {
    expect(canAfford(wallet, { fish: 2, shell: 9 })).toBe(true)
    expect(canAfford(wallet, { fish: 3 })).toBe(false)
    expect(canAfford(wallet, {})).toBe(true)
  })

  it('is all or nothing', () => {
    // The reason this is one function and not a loop of `spend`: two fish and
    // a grape, paid by somebody with two fish and no grapes, must not take
    // the fish and then fail.
    expect(pay(wallet, { fish: 2, grape: 1 })).toBeNull()
    expect(balanceOf(wallet, 'fish')).toBe(2)
  })

  it('takes every part of a cost it can pay', () => {
    const after = pay(wallet, { fish: 1, shell: 4 })!
    expect(balanceOf(after, 'fish')).toBe(1)
    expect(balanceOf(after, 'shell')).toBe(5)
    expect(balanceOf(after, 'grape')).toBe(0)
  })

  it('treats a missing or zero price as free', () => {
    expect(pay(wallet, { grape: 0 })).toEqual(wallet)
    expect(pay(wallet, {})).toEqual(wallet)
  })

  it('cannot be used to earn by charging a negative price', () => {
    const after = pay(wallet, { fish: -50 })!
    expect(balanceOf(after, 'fish')).toBe(2)
  })

  it('rounds a fractional price down rather than charging a fraction', () => {
    expect(balanceOf(pay(wallet, { shell: 2.9 })!, 'shell')).toBe(7)
  })
})

describe('reading a wallet back from storage', () => {
  it('reads a good one', () => {
    expect(parseWallet({ fish: 3, shell: 1, grape: 7 })).toEqual({ fish: 3, shell: 1, grape: 7 })
  })

  it('gives an empty one for rubbish rather than throwing', () => {
    // This survives across versions and is editable by hand.
    for (const bad of [null, undefined, 4, 'nope', [], true]) {
      expect(parseWallet(bad)).toEqual(emptyWallet())
    }
  })

  it('fills in whatever is missing', () => {
    // A partial write, or a save from before a currency existed.
    expect(parseWallet({ fish: 2 })).toEqual({ fish: 2, shell: 0, grape: 0 })
  })

  it('refuses a hand-edited negative, fraction or infinity', () => {
    const wallet = parseWallet({ fish: -50, shell: 2.7, grape: Number.POSITIVE_INFINITY })
    expect(wallet.fish).toBe(0)
    expect(wallet.shell).toBe(2)
    // Nothing rather than the cap: an impossible value is a corrupt save, and
    // refusing it outright is safer than reading it as "as much as possible".
    expect(wallet.grape).toBe(0)
  })

  it('refuses a number that is not a number', () => {
    expect(parseWallet({ fish: '99', shell: null, grape: {} })).toEqual(emptyWallet())
  })

  it('ignores anything that is not a currency', () => {
    expect(parseWallet({ fish: 1, gold: 999 })).toEqual({ fish: 1, shell: 0, grape: 0 })
  })

  it('does not read balances off a prototype', () => {
    // `source[id]` walks the chain, so an object carrying a `__proto__` with
    // balances on it would hand them over. This reads whatever is in storage,
    // which is editable by hand.
    const nasty = Object.create({ shell: 5000 }) as Record<string, unknown>
    nasty.fish = 1
    expect(parseWallet(nasty)).toEqual({ fish: 1, shell: 0, grape: 0 })
  })
})

describe('comparing wallets', () => {
  it('knows when nothing changed, so a store can skip the write', () => {
    expect(sameWallet(emptyWallet(), emptyWallet())).toBe(true)
    expect(sameWallet({ fish: 1, shell: 0, grape: 0 }, { fish: 1, shell: 0, grape: 0 })).toBe(true)
    expect(sameWallet({ fish: 1, shell: 0, grape: 0 }, emptyWallet())).toBe(false)
  })
})

describe('the readout', () => {
  it('shows small numbers exactly', () => {
    expect(formatAmount(0)).toBe('0')
    expect(formatAmount(7)).toBe('7')
    expect(formatAmount(999)).toBe('999')
  })

  it('shortens the big ones so the panel cannot be pushed wider', () => {
    expect(formatAmount(1000)).toBe('1k')
    expect(formatAmount(1500)).toBe('1.5k')
    expect(formatAmount(12_340)).toBe('12.3k')
    expect(formatAmount(1_000_000)).toBe('1m')
    expect(formatAmount(2_500_000)).toBe('2.5m')
  })

  it('never claims you have more than you do', () => {
    // Rounding up would show 1k when you had 999, which is the one direction
    // a money readout must not be wrong in.
    for (const n of [999, 1099, 1999, 999_999, 1_099_000]) {
      const shown = formatAmount(n)
      const value = shown.endsWith('k')
        ? Number.parseFloat(shown) * 1000
        : shown.endsWith('m')
          ? Number.parseFloat(shown) * 1_000_000
          : Number.parseFloat(shown)
      expect(value).toBeLessThanOrEqual(n)
    }
  })

  it('shows nothing for nonsense rather than NaN', () => {
    expect(formatAmount(Number.NaN)).toBe('0')
    expect(formatAmount(-5)).toBe('0')
  })
})
