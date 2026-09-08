/**
 * 11-currency - the public contract.
 *
 * Three things worth having: fish, shells and grapes. This owns what a wallet
 * is, the arithmetic of earning and spending, and the readout.
 *
 * It owns no way of *getting* any of them. Fishing, beachcombing and vines are
 * each a feature in their own right; this is the ledger they will all write
 * to, and it is deliberately built first so that none of them has to invent
 * its own idea of what a balance is.
 */

export {
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
  type Cost,
  type Currency,
  type CurrencyId,
  type Wallet,
} from './internal/wallet'

export { PURSE_KEY, clearPurse, earn, getPurse, trySpend, usePurse } from './internal/purse'
export { WalletHUD } from './internal/WalletHUD'
