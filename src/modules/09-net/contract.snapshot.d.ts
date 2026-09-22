/**
 * 09-net - the public contract.
 *
 * Lobbies: join one with a code, see everyone else's duck move. One WebSocket
 * to a relay that knows about rooms and nothing about the game.
 *
 * This covers what the plan called `10-transport` and `11-world-sync`. They
 * are one module because the only thing being synced is a duck, and two gates
 * for that would be ceremony rather than safety. If a second kind of thing
 * ever needs syncing, that is the moment to split them.
 */
export { CODE_ALPHABET, CODE_LENGTH, NET, cleanName, dayCorrection, decodeMessage, decodeWorld, encodeState, encodeWorld, isHost, makeCode, normaliseCode, smoothPing, type DuckMessage, type DuckState, type Peer, type WorldState, } from './internal/protocol';
export { createTrack, record, sampleTrack, shortestAngle, stale, type Snapshot, type Track, } from './internal/interpolate';
export { createLobby, followWorld, getMyName, getNet, getPeers, joinLobby, leaveLobby, peerAt, peerTracks, publish, relayProblem, relayUrl, renameSelf, rosterColour, sendToRoom, statusAfterClose, subscribeRoom, sweep, useNet, usePeers, type NetInfo, type NetStatus, type PeerInfo, type RosterEntry, } from './internal/client';
export { NetPlayers } from './internal/NetPlayers';
