/** Aura Debt: one skateboard rider versus everybody operating traps.
 * Catalogue integration is pending; no other module is modified by this build.
 */
export { AURA, TRAPS, createRound, difficulty, releaseTrap, speed, standings, tick,
  type Hands, type Hazard, type Player, type Role, type Round, type TrapKind } from './internal/rules'
export { auraRoster, newRound, nextSeed, waitingRound } from './internal/setup'
export { AuraDebtGame, AuraDebtPanel } from './internal/Screen'
