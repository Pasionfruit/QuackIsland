/**
 * 52-turn-order - the public contract.
 *
 * Locks the connected Volcano Island roster after the existing party starts,
 * lets each player request an authoritative d6 from the elected host, resolves
 * tied roll histories, and publishes one revisioned final order to the room.
 */
export { EMPTY_TURN_ORDER, TURN_ORDER, applyTurnOrderRoll, canAcknowledgeTurnOrder, comparePlayerIds, createTurnOrder, reconcileTurnOrderPlayers, rollsFor, type DieValue, type TurnOrderPhase, type TurnOrderPlayer, type TurnOrderRoll, type TurnOrderSnapshot, } from './internal/rules';
export { TURN_ORDER_WIRE, decodeTurnOrderMessage, decodeTurnOrderSnapshot, encodeTurnOrderMessage, type TurnOrderMessage, } from './internal/protocol';
export { acknowledgeTurnOrder, getTurnOrder, isTurnOrderAcknowledged, listenForTurnOrder, requestTurnOrderRoll, resetTurnOrder, syncTurnOrderLifecycle, useTurnOrder, useTurnOrderAcknowledged, } from './internal/state';
export { TurnOrder } from './internal/TurnOrderView';
