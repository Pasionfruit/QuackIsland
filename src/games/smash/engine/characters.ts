import { drawAvatar, type AvatarDef, type AvatarOpts } from '../../../art/avatar'
import {
  CONTRLZEE,
  DIVA,
  MRPASIONFRUIT,
  NIGHTSHIFT,
  NINJAPENGUIN,
  TENINCHTOENAIL,
} from '../../../art/cast'
import type { CharDef, MoveArt, MoveDef, MoveId } from './types'

/**
 * The Polyland Smash roster.
 *
 * Everyone has the same eight moves - a poke, a lunge, a launcher and a slam,
 * each in an attack and a special flavour - and differs in the numbers. Adding
 * a fighter means one entry here plus an avatar in `art/cast.ts`; drop a
 * sprite folder in beside them and they stop being drawn procedurally.
 */
function move(
  id: MoveId,
  name: string,
  art: MoveArt,
  rest: Omit<MoveDef, 'id' | 'name' | 'art'>,
): MoveDef {
  return { id, name, art, ...rest }
}

/** Everything a fighter needs that is not a move, so the roster stays readable. */
interface Body {
  weight: number
  speed: number
  accel: number
  friction: number
  slide: number
  radius: number
}

/** Middleweight defaults; every fighter tweaks what makes them different. */
const BASE: Body = {
  weight: 1.0,
  speed: 1.55,
  accel: 0.34,
  friction: 0.8,
  slide: 0.93,
  radius: 9,
}

/**
 * The default kit. A fighter overrides the handful of moves that make them
 * who they are rather than restating all eight, which keeps the differences
 * between them readable at a glance.
 */
function kit(over: Partial<Record<MoveId, Partial<Omit<MoveDef, 'id' | 'name' | 'art'>>>> = {}, names: Partial<Record<MoveId, string>> = {}): Record<MoveId, MoveDef> {
  const base: Record<MoveId, [string, MoveArt, Omit<MoveDef, 'id' | 'name' | 'art'>]> = {
    attack: [
      'Jab',
      'slash',
      {
        startup: 4,
        active: 5,
        recovery: 9,
        damage: 4,
        baseKb: 26,
        kbScale: 0.5,
        hit: { reach: 15, depth: 16, width: 18 },
      },
    ],
    attackSide: [
      'Lunge',
      'lunge',
      {
        startup: 9,
        active: 5,
        recovery: 17,
        damage: 12,
        baseKb: 52,
        kbScale: 1.0,
        hit: { reach: 20, depth: 20, width: 20 },
        drive: 2.6,
        shake: 5,
      },
    ],
    attackUp: [
      'Launcher',
      'launch',
      {
        startup: 7,
        active: 5,
        recovery: 14,
        damage: 9,
        baseKb: 44,
        kbScale: 0.86,
        hit: { reach: 17, depth: 18, width: 22 },
        shake: 4,
      },
    ],
    attackDown: [
      'Slam',
      'slam',
      {
        startup: 10,
        active: 5,
        recovery: 18,
        damage: 10,
        baseKb: 40,
        kbScale: 0.74,
        hit: { reach: 22, depth: 0, width: 0 },
        radial: true,
        killsMomentum: true,
        shake: 6,
      },
    ],
    special: [
      'Special',
      'burst',
      {
        startup: 6,
        active: 7,
        recovery: 16,
        damage: 7,
        baseKb: 34,
        kbScale: 0.62,
        hit: { reach: 18, depth: 20, width: 20 },
        shake: 3,
      },
    ],
    specialSide: [
      'Charge',
      'bolt',
      {
        startup: 10,
        active: 6,
        recovery: 20,
        damage: 13,
        baseKb: 56,
        kbScale: 1.02,
        hit: { reach: 26, depth: 26, width: 18 },
        drive: 3.2,
        shake: 5,
      },
    ],
    specialUp: [
      'Rise',
      'launch',
      {
        startup: 7,
        active: 6,
        recovery: 16,
        damage: 10,
        baseKb: 46,
        kbScale: 0.88,
        hit: { reach: 18, depth: 20, width: 22 },
        shake: 4,
      },
    ],
    specialDown: [
      'Shockwave',
      'ring',
      {
        startup: 11,
        active: 6,
        recovery: 20,
        damage: 11,
        baseKb: 44,
        kbScale: 0.8,
        hit: { reach: 27, depth: 0, width: 0 },
        radial: true,
        killsMomentum: true,
        shake: 6,
      },
    ],
  }

  const out = {} as Record<MoveId, MoveDef>
  for (const id of Object.keys(base) as MoveId[]) {
    const [name, art, def] = base[id]
    out[id] = move(id, names[id] ?? name, art, { ...def, ...(over[id] ?? {}) })
  }
  return out
}

// ---------------------------------------------------------------- the cast

/** ContrlZee - raccoon, programmer, wins the spacing rather than the exchange. */
const ZEE: CharDef = {
  id: 'contrlzee',
  name: 'ContrlZee',
  title: 'The Raccoon Programmer',
  blurb:
    'Fixes everything by turning it off and on again, including you. Reads the floor two moves early and is already standing where you were going.',
  avatar: CONTRLZEE,
  height: 33,
  theme: { primary: '#9a978f', dark: '#5f5b53', soft: '#e8dfd0' },
  ...BASE,
  weight: 1.08,
  speed: 1.5,
  radius: 9,
  stats: { power: 2, speed: 3, weight: 3 },
  moves: kit(
    {
      attack: { damage: 4, recovery: 9, hit: { reach: 16, depth: 16, width: 19 } },
      attackSide: { damage: 13, drive: 2.6, recovery: 18 },
      specialDown: { damage: 12, baseKb: 46, hit: { reach: 29, depth: 0, width: 0 } },
    },
    {
      attack: 'Null Check',
      attackSide: 'Hard Reset',
      attackUp: 'Stack Push',
      attackDown: 'Garbage Collect',
      special: 'Ctrl+Z',
      specialSide: 'Force Push',
      specialUp: 'Bubble Sort',
      specialDown: 'Rollback',
    },
  ),
}

/** NinjaPenguin - penguin, ninja, in and out before the dust settles. */
const PENGUIN: CharDef = {
  id: 'ninjapenguin',
  name: 'NinjaPenguin',
  title: 'The Silent Waddle',
  blurb:
    'Moves like a shadow, lands like a sack of gravel. Slides in on the diagonal, flurries you toward the rim, and is gone.',
  avatar: NINJAPENGUIN,
  height: 31,
  theme: { primary: '#4a4744', dark: '#2a2826', soft: '#f2ece0' },
  ...BASE,
  weight: 1.01,
  speed: 1.74,
  accel: 0.42,
  friction: 0.77,
  radius: 9,
  stats: { power: 4, speed: 4, weight: 4 },
  moves: kit(
    {
      attack: { startup: 4, recovery: 7, damage: 4 },
      attackSide: { damage: 12, drive: 3.2 },
      specialSide: { damage: 12, drive: 3.6, startup: 9 },
    },
    {
      attack: 'Flipper Flurry',
      attackSide: 'Belly Slide',
      attackUp: 'Rising Kick',
      attackDown: 'Iceberg Drop',
      special: 'Ice Shard',
      specialSide: 'Frost Dash',
      specialUp: 'Geyser',
      specialDown: 'Cold Snap',
    },
  ),
}

/** teninchtoenail - lion, salesman, the heaviest thing on the floor. */
const LION: CharDef = {
  id: 'teninchtoenail',
  name: 'teninchtoenail',
  title: 'The Lion Salesman',
  blurb:
    'Has not taken no for an answer since he was a cub. Slow across the floor, but almost impossible to move off it.',
  avatar: TENINCHTOENAIL,
  height: 36,
  theme: { primary: '#d9a05b', dark: '#a8672f', soft: '#f2dfba' },
  ...BASE,
  weight: 1.18,
  speed: 1.4,
  accel: 0.3,
  friction: 0.82,
  slide: 0.9,
  radius: 9.8,
  stats: { power: 4, speed: 2, weight: 5 },
  moves: kit(
    {
      attack: { damage: 5, hit: { reach: 17, depth: 17, width: 19 } },
      attackSide: { startup: 10, damage: 11, recovery: 19, drive: 2.4, hit: { reach: 22, depth: 22, width: 22 } },
      attackDown: { damage: 12, hit: { reach: 26, depth: 0, width: 0 } },
      specialSide: { damage: 13, startup: 12, recovery: 22 },
    },
    {
      attack: 'Firm Handshake',
      attackSide: 'Hard Sell',
      attackUp: 'Upsell',
      attackDown: 'Closing Slam',
      special: 'Elevator Pitch',
      specialSide: 'Cold Call',
      specialUp: 'Escalate',
      specialDown: 'Final Offer',
    },
  ),
}

/** diva - frog, fashionista, longest reach and the first to fly. */
const FROG: CharDef = {
  id: 'diva',
  name: 'diva',
  title: 'The Frog Fashionista',
  blurb:
    "Holds the whole floor at arm's length and looks bored doing it. Lightest thing out here, so she goes flying - and then stops dead while everyone else is still sliding.",
  avatar: DIVA,
  height: 32,
  theme: { primary: '#c85f96', dark: '#8f3d6a', soft: '#e8e4c6' },
  ...BASE,
  weight: 0.93,
  speed: 1.64,
  friction: 0.78,
  slide: 0.85,
  radius: 8.6,
  stats: { power: 2, speed: 3, weight: 1 },
  moves: kit(
    {
      attack: { damage: 5, hit: { reach: 23, depth: 16, width: 15 } },
      attackSide: { damage: 13, hit: { reach: 28, depth: 22, width: 18 } },
      attackUp: { hit: { reach: 20, depth: 20, width: 24 } },
      specialSide: { hit: { reach: 34, depth: 26, width: 16 } },
    },
    {
      attack: 'Tongue Lash',
      attackSide: 'Clutch Swing',
      attackUp: 'Hop Kick',
      attackDown: 'Runway Stomp',
      special: 'Grand Entrance',
      specialSide: 'Catwalk',
      specialUp: 'Encore',
      specialDown: 'Standing Ovation',
    },
  ),
}

/** MrPasionfruit - black cat, athlete, never stops moving. */
const CAT: CharDef = {
  id: 'mrpasionfruit',
  name: 'MrPasionfruit',
  title: 'The Athlete',
  blurb:
    'Fastest thing in Polyland and never stops moving. Individually the hits are nothing; the problem is there are always four more coming.',
  avatar: MRPASIONFRUIT,
  height: 32,
  theme: { primary: '#7a4f8c', dark: '#4f3060', soft: '#e8c05f' },
  ...BASE,
  weight: 0.94,
  speed: 1.84,
  accel: 0.46,
  friction: 0.74,
  radius: 8.5,
  stats: { power: 2, speed: 5, weight: 3 },
  moves: kit(
    {
      attack: { startup: 3, recovery: 8, damage: 4 },
      attackSide: { startup: 8, damage: 10, recovery: 14, drive: 3.0 },
      attackUp: { startup: 6, damage: 8, recovery: 12 },
    },
    {
      attack: 'Quick Paw',
      attackSide: 'Sprint Claw',
      attackUp: 'Vault Kick',
      attackDown: 'Slide Tackle',
      special: 'Second Wind',
      specialSide: 'Sprint Finish',
      specialUp: 'High Jump',
      specialDown: 'Ground Work',
    },
  ),
}

/** NightShift - leopard, night watch, one committed pounce. */
const LEOPARD: CharDef = {
  id: 'nightshift',
  name: 'NightShift',
  title: 'The Night Watch',
  blurb:
    'Locked in since Tuesday and not blinking now. Waits at the edge of your range for one opening, takes it, and is standing behind you before the sound arrives.',
  avatar: NIGHTSHIFT,
  height: 33,
  theme: { primary: '#d8b25c', dark: '#8a6a2c', soft: '#f2e3c0' },
  locked: true,
  unlockHint: 'Still on shift. Coming in a later build.',
  ...BASE,
  weight: 0.97,
  speed: 1.7,
  accel: 0.4,
  friction: 0.76,
  radius: 9,
  stats: { power: 5, speed: 4, weight: 3 },
  moves: kit(
    {
      attack: { startup: 3, recovery: 8, damage: 4 },
      attackSide: { damage: 13, drive: 3.4, recovery: 16 },
      specialSide: { damage: 13, drive: 3.6 },
    },
    {
      attack: 'Claw Check',
      attackSide: 'Pounce',
      attackUp: 'Alley Vault',
      attackDown: 'Pin Down',
      special: 'Sixth Sense',
      specialSide: 'Blindside',
      specialUp: 'Fire Escape',
      specialDown: 'Lights Out',
    },
  ),
}

export const ROSTER: CharDef[] = [ZEE, PENGUIN, LION, FROG, CAT, LEOPARD]

/** The fighters anyone can actually pick right now. */
export const PLAYABLE: CharDef[] = ROSTER.filter((c) => !c.locked)

export function charById(id: string): CharDef {
  return ROSTER.find((c) => c.id === id) ?? ROSTER[0]
}

/** Falls back to a pickable fighter, so a locked id can never start a match. */
export function playableId(id: string): string {
  const def = ROSTER.find((c) => c.id === id)
  return def && !def.locked ? def.id : PLAYABLE[0].id
}

/** Draws a roster fighter at their canonical size. */
export function drawChar(
  ctx: CanvasRenderingContext2D,
  def: CharDef,
  x: number,
  y: number,
  opts: Omit<AvatarOpts, 'height'> & { scale?: number } = {},
): void {
  const { scale = 1, ...rest } = opts
  drawAvatar(ctx, def.avatar, x, y, { ...rest, height: def.height * scale })
}

export type { AvatarDef }
