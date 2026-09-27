export { FIELD, SPAWN_ROOM, arenaFor, blocked, collide, hillHeightAt, lineClear, mamaSpawn, miniSpawn, openPoint, rayHit, slab, slide, type Arena, type Block, type Point, type Vec3 } from './internal/arena';
export { CLAIM, COLOURS, MAMA, MINI, PITCH_LIMIT, ROUND, RUNOVER, aimDirection, bodyHit, canAct, canShoot, claim, cooldownLeft, createRound, eyeOf, fire, isLegalTarget, isStanding, judgeEnd, leave, look, mamaOf, minisOf, report, resolveMama, runOver, runsOver, stepRound, summarize, tick, trace, walk, wrapAngle, type Claim, type Entrant, type Intent, type Player, type Role, type Round, type Shot, } from './internal/rules';
export { BOT, botSteer } from './internal/ai';
export { MAX_PLAYERS, ME, SOLO_PLAYERS, gameRoster, myId, newRound, nextSeed, waitingRound, type RoundSetup } from './internal/setup';
export { MOVE_TAG, SHOT_TAG, SNAPSHOT_TAG, applySnapshot, decodeMove, decodeShot, decodeSnapshot, encodeMove, encodeShot, encodeSnapshot, type MoveOut, type Snapshot, type WirePlayer, } from './internal/wire';
export { MamaScene, PALETTE, PITCH, type LookRef } from './internal/MamaScene';
export { MamaScreen, SENSITIVITY } from './internal/MamaScreen';
