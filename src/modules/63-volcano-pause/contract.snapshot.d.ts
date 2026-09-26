/** Shared, host-controlled pausing for the board portion of Volcano Island. */
export { getVolcanoPause, setVolcanoPause, useVolcanoPause, useVolcanoPauseSync, type VolcanoPauseState, } from './internal/state';
export { CONTROL_CODES, isVolcanoBoardParty, shouldBlockKey } from './internal/guards';
export { VolcanoPause } from './internal/VolcanoPauseView';
