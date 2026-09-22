export { ARENA, arenaFor, blocked, collide, lineClear, openPoint, rayHit, respawnSpot, slab, slide, spawnPoint, type Arena, type Block, type Point, type Vec3, } from './internal/arena';
export { BODY, CLAIM, COLOURS, GUN, JUMP, PICKUP, SHIELD, PITCH_LIMIT, ROUND, SHOT_LIFE, aimDirection, allied, bodyHit, canAct, canShoot, claim, clock, collect, cooldownLeft, createGame, crewOf, eliminate, eyeOf, fire, isHunter, isStanding, judgeEnd, leave, look, pickupReady, shieldCooldown, placings, report, stepGame, tick, trace, walk, wrapAngle, type Claim, type Entrant, type Game, type Player, type Shot, } from './internal/rules';
export { BOT, botSteer, sightedBy, yawTowards } from './internal/ai';
export { MAX_PLAYERS, ME, SOLO_PLAYERS, gameRoster, myId, newGame, nextSeed, waitingGame, type GameSetup } from './internal/setup';
export { MOVE_TAG, SHOT_TAG, SNAPSHOT_TAG, applySnapshot, decodeMove, decodeShot, decodeSnapshot, encodeMove, encodeShot, encodeSnapshot, type Snapshot, type WirePlayer, type WireShot, } from './internal/wire';
export { GUN_AT, GUN_SCALE, HesOneShotScene, PALETTE, type LookRef } from './internal/HesOneShotScene';
export { HesOneShotScreen, SENSITIVITY } from './internal/HesOneShotScreen';
