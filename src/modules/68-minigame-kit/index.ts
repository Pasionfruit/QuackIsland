/**
 * 68-minigame-kit - the public contract.
 *
 * The standard base cases every minigame is built from, so a new game is its
 * rules, its scene and its screen, and nothing else:
 *
 * - **roster** - who is playing (the lobby, or you and stand-ins), your id,
 *   and a seed dealer. Every game, free-for-all or one-vs-all.
 * - **one-vs-all** - who the 1 is, the rest in spawn order, a placeholder
 *   round that can never read as finished, and `oneVsAllSetup`, which is a
 *   one-vs-all game's whole `setup.ts`. `oneVsAllProblems` is the same rules
 *   as a check each game's tests run against itself.
 * - **wire** - the integer units and guards every `wire.ts` uses, and the
 *   pose, claim and one-vs-all header messages the arena games share.
 * - **arena** - the host/guest net loop of a real-time arena game. A game
 *   hands `useArenaNet` its `ArenaRules`; `createArenaLink` is the same loop
 *   off the live room, for tests.
 *
 * It plays nothing and registers nothing. A game still registers itself with
 * `15-minigames`.
 */

export {
  ME,
  MAX_PLAYERS,
  entrantsOf,
  lobbyRoster,
  myId,
  seedDealer,
  type Entrant,
  type RosterRule,
  type Seat,
} from './internal/roster'

export {
  castOneVsAll,
  holding,
  oneVsAllProblems,
  oneVsAllSetup,
  resolveTheOne,
  type Cast,
  type Decidable,
  type OneVsAllKit,
  type OneVsAllSpec,
  type RoundSetup,
} from './internal/oneVsAll'

export {
  MRAD_LIMIT,
  adoptRound,
  cm,
  cs,
  decodeClaim,
  decodeHeader,
  decodePose,
  encodeClaim,
  encodeHeader,
  encodePose,
  fixed,
  isCount,
  isId,
  isInt,
  isNumber,
  mergePlayers,
  mrad,
  playerRows,
  r2,
  sides,
  type Claim,
  type OneVsAllHeader,
  type Pose,
  type PoseBounds,
  type Sides,
} from './internal/wire'

export {
  LIVE_ROOM,
  createArenaLink,
  useArenaNet,
  type Advanced,
  type ArenaLink,
  type ArenaPlayer,
  type ArenaRoom,
  type ArenaRound,
  type ArenaRules,
  type Said,
} from './internal/arena'
