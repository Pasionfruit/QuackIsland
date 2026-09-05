import { drawAvatar, type AvatarDef } from '../art/avatar'
import {
  CALICO_CAT,
  CONTRLZEE,
  DIVA,
  DUCK,
  MRPASIONFRUIT,
  NINJAPENGUIN,
  BLACK_CAT,
  SEAGULL,
  SHIBA_DOG,
  TENINCHTOENAIL,
} from '../art/cast'
import { drawCritter } from '../art/critter'
import { PAL } from '../art/palette'
import { bush, campfire, cloud, lantern, log, pine, rock, tent } from '../art/props'
import {
  DAY,
  DUSK,
  NIGHT,
  bunting,
  confetti,
  crate,
  flag,
  ghost,
  grid,
  ground,
  lightCone,
  moon,
  room,
  sky,
  stars,
  sun,
  tank,
  treeline,
  water,
} from '../art/scenes'
import { ellipse, facet, fillPoly, rect, shade, type Pt } from '../lib/draw'

export type GameStatus = 'live' | 'prototype' | 'concept'

export interface GameEntry {
  id: string
  title: string
  /** One line under the title on the game panel. */
  tagline: string
  genre: string
  players: string
  status: GameStatus
  blurb: string
  /** What the game is meant to be, shown on its panel. */
  plan: string[]
  /** Card art painter. Canvas is 160x90 world units. */
  art: (ctx: CanvasRenderingContext2D, frame: number) => void
}

export const ART_W = 160
export const ART_H = 90

const W = ART_W
const H = ART_H

/** Every Polyland game uses the same two-on-a-keyboard plus host-and-join rig. */
const PARTY = '2-8 players'

// ------------------------------------------------------------------- games

const SMASH: GameEntry = {
  id: 'smash',
  title: 'Polyland Smash',
  tagline: 'A friendly scrap on a floating bluff, with no railings.',
  genre: 'Arena fighter',
  players: '1-2 local, 2 online',
  status: 'live',
  blurb:
    'Percent-based knockback on a floating disc: hit hard enough and they go over the rim. Six animals who all fight completely differently.',
  plan: [
    'Six fighters: a raccoon, a penguin, a lion, a frog, a cat, and a leopard still on shift.',
    'Lakeside Bluff, seen from above, with nothing at the edge to catch you.',
    'Eight moves each - poke, lunge, launcher and slam, in attack and special.',
    'Local versus, CPU opponents, and host-and-join online.',
  ],
  art: (ctx, frame) => {
    sky(ctx, W, H, DAY)
    sun(ctx, 138, 14, 7)
    cloud(ctx, 26 + ((frame * 0.07) % 190), 13, 24)

    // The floating disc, matching the arena the match is played on.
    const cx = 80
    const cy = 52
    const rx = 54
    const ry = 26
    ellipse(ctx, cx, cy + ry * 0.7, rx * 1.02, ry * 0.4, 'rgba(58, 72, 78, 0.2)')
    const slab: Pt[] = []
    for (let i = 0; i <= 24; i++) {
      const t = (i / 24) * Math.PI
      slab.push({ x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry })
    }
    for (let i = 24; i >= 0; i--) {
      const t = (i / 24) * Math.PI
      slab.push({ x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry + 12 })
    }
    fillPoly(ctx, slab, PAL.dirt)
    ellipse(ctx, cx, cy, rx, ry, PAL.grass)
    ellipse(ctx, cx, cy - ry * 0.1, rx * 0.88, ry * 0.8, PAL.grassLit)
    pine(ctx, cx - rx * 0.86, cy - ry * 0.34, 9)
    rock(ctx, cx + rx * 0.84, cy - ry * 0.2, 7)

    const bob = Math.sin(frame * 0.06) * 1.2
    drawAvatar(ctx, TENINCHTOENAIL, 66, 56 + bob, { facing: 1, height: 26, pose: 'swingFwd', phase: frame })
    drawAvatar(ctx, NINJAPENGUIN, 94, 50 - bob, {
      facing: -1,
      height: 27,
      pose: 'hurt',
      phase: frame,
    })
    ctx.globalAlpha = 0.9
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + frame * 0.1
      const r = 4 + ((frame % 30) / 30) * 6
      ellipse(ctx, 82 + Math.cos(a) * r, 46 + Math.sin(a) * r, 1.6, 1.6, i % 2 ? '#fff6dd' : PAL.fire)
    }
    ctx.globalAlpha = 1
  },
}

const DUCK_SZN: GameEntry = {
  id: 'duck-szn',
  title: 'Duck szn',
  tagline: 'Dawn on the marsh, and the ducks are up.',
  genre: 'Co-op shooting gallery',
  players: PARTY,
  status: 'concept',
  blurb:
    'Ducks come over the reeds in waves. Everyone shoots at the same sky, and the dog judges you for every miss.',
  plan: [
    'Waves of ducks with escalating patterns and speeds.',
    'Shared score, personal accuracy, one shared reload timer.',
    'The dog appears to collect hits and to laugh at misses.',
  ],
  art: (ctx, frame) => {
    sky(ctx, W, 62, ['#f3c9a0', '#f0d9b0', '#dfe0c6', '#bcd6d2'])
    sun(ctx, 30, 22, 8)
    treeline(ctx, W, 64, 11, -1)
    water(ctx, W, H, 64, frame)
    // Reeds along the near bank.
    ctx.strokeStyle = shade(PAL.pine, -0.1)
    ctx.lineWidth = 1.1
    ctx.beginPath()
    for (let i = 0; i < 26; i++) {
      const x = 3 + i * 6.2
      const sway = Math.sin(frame * 0.04 + i) * 2
      ctx.moveTo(x, H)
      ctx.lineTo(x + sway, H - 14 - (i % 4) * 3)
    }
    ctx.stroke()
    for (let i = 0; i < 3; i++) {
      const t = ((frame * 0.3 + i * 55) % 200) - 20
      drawCritter(ctx, DUCK, t, 26 + i * 9 + Math.sin((frame + i * 30) * 0.05) * 3, {
        facing: 1,
        height: 13,
        pose: 'jump',
        phase: frame + i * 12,
      })
    }
    drawAvatar(ctx, NINJAPENGUIN, 126, H - 4, { facing: -1, height: 28, pose: 'swingUp', phase: frame })
    drawCritter(ctx, SHIBA_DOG, 146, H - 2, { facing: -1, height: 15, pose: 'idle', phase: frame })
  },
}

const TANKS: GameEntry = {
  id: 'tank-trouble',
  title: 'Tank Trouble',
  tagline: 'Small maze. Bouncing shells. No apologies.',
  genre: 'Top-down arena',
  players: PARTY,
  status: 'concept',
  blurb:
    'A tiny randomly generated maze, one tank each, and bullets that ricochet until they hit somebody. Usually you.',
  plan: [
    'Freshly generated maze every round, no two the same.',
    'Ricocheting shells that stay live for several bounces.',
    'Pickups: spread shot, homing, and the ill-advised laser.',
  ],
  art: (ctx, frame) => {
    ctx.fillStyle = '#e0d6bf'
    ctx.fillRect(0, 0, W, H)
    grid(ctx, W, H, 10, 'rgba(150, 132, 104, 0.25)')
    // Maze walls.
    const walls: [number, number, number, number][] = [
      [10, 10, 60, 4], [10, 10, 4, 34], [40, 26, 4, 38], [60, 44, 44, 4],
      [86, 12, 4, 34], [110, 20, 34, 4], [120, 44, 4, 34], [26, 66, 50, 4],
      [96, 62, 40, 4], [140, 10, 4, 40],
    ]
    for (const [x, y, w, h] of walls) {
      facet(
        ctx,
        [
          { x, y },
          { x: x + w, y },
          { x: x + w, y: y + h },
          { x, y: y + h },
        ],
        '#8d7a5e',
        { dark: 0.28, light: 0.14 },
      )
    }
    tank(ctx, 26, 40, 7, '#5f92b8', 0.2)
    tank(ctx, 108, 76, 7, '#e0794f', -2.4)
    // Shell and its bounce trail.
    ctx.strokeStyle = 'rgba(80, 70, 56, 0.4)'
    ctx.lineWidth = 0.8
    ctx.setLineDash([3, 3])
    ctx.beginPath()
    ctx.moveTo(38, 38)
    ctx.lineTo(72, 20)
    ctx.lineTo(96, 40)
    ctx.stroke()
    ctx.setLineDash([])
    const t = (frame % 60) / 60
    ellipse(ctx, 38 + t * 58, 38 - Math.sin(t * Math.PI) * 18, 2, 2, '#3f382f')
  },
}

const SKETCH: GameEntry = {
  id: 'sketch',
  title: 'Sketch',
  tagline: 'Draw it badly. Watch them guess worse.',
  genre: 'Draw and guess',
  players: PARTY,
  status: 'concept',
  blurb:
    'One of you draws, everyone else shouts guesses. The word is always harder than it looked when you picked it.',
  plan: [
    'Rotating artist, live shared canvas, typed guessing.',
    'Word packs: camp things, animals, and deliberately unfair ones.',
    'Points for guessing fast and for being guessed at all.',
  ],
  art: (ctx, frame) => {
    room(ctx, W, H, 62, '#d8c8ae', '#b08e62')
    // Easel legs.
    ctx.strokeStyle = shade(PAL.wood, -0.24)
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(52, 78)
    ctx.lineTo(60, 40)
    ctx.moveTo(92, 78)
    ctx.lineTo(84, 40)
    ctx.stroke()
    // Board.
    facet(
      ctx,
      [
        { x: 48, y: 14 },
        { x: 96, y: 14 },
        { x: 96, y: 52 },
        { x: 48, y: 52 },
      ],
      '#f6f2e6',
      { dark: 0.12, light: 0.05 },
    )
    // A wobbly drawing of a duck appearing stroke by stroke.
    const strokes: Pt[][] = [
      [{ x: 60, y: 40 }, { x: 62, y: 30 }, { x: 70, y: 26 }, { x: 78, y: 30 }, { x: 80, y: 40 }, { x: 60, y: 40 }],
      [{ x: 76, y: 28 }, { x: 78, y: 20 }, { x: 84, y: 20 }],
      [{ x: 84, y: 21 }, { x: 89, y: 23 }, { x: 84, y: 25 }],
    ]
    ctx.strokeStyle = '#3f382f'
    ctx.lineWidth = 1.4
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    const reveal = ((frame * 0.02) % 1.4)
    strokes.forEach((sPts, i) => {
      if (reveal < i * 0.35) return
      ctx.beginPath()
      ctx.moveTo(sPts[0].x, sPts[0].y)
      for (const q of sPts.slice(1)) ctx.lineTo(q.x, q.y)
      ctx.stroke()
    })
    drawAvatar(ctx, CONTRLZEE, 116, 78, { facing: -1, height: 30, pose: 'swingFwd', phase: frame })
    drawAvatar(ctx, DIVA, 26, 78, { facing: 1, height: 29, pose: 'idle', phase: frame })
    // Guess bubble.
    fillPoly(
      ctx,
      [
        { x: 12, y: 22 },
        { x: 40, y: 22 },
        { x: 40, y: 36 },
        { x: 24, y: 36 },
        { x: 20, y: 41 },
        { x: 20, y: 36 },
        { x: 12, y: 36 },
      ],
      '#fbf7ee',
    )
    ctx.fillStyle = '#6f6659'
    for (let i = 0; i < 3; i++) ellipse(ctx, 20 + i * 6, 29, 1.6, 1.6, '#8d8474')
  },
}

const FLAGS: GameEntry = {
  id: 'flag-frenzy',
  title: 'Flag Frenzy',
  tagline: 'Their flag, your camp, a lot of running.',
  genre: 'Capture the flag',
  players: PARTY,
  status: 'concept',
  blurb:
    'Two teams, two flags, one meadow. Grab theirs, get home, and try not to be tagged carrying it.',
  plan: [
    'Team scoring with a carrier who moves slower and glows.',
    'Tag rules, jails, and a rescue mechanic for freeing teammates.',
    'Symmetrical maps with cover, ramps and a risky middle lane.',
  ],
  art: (ctx, frame) => {
    sky(ctx, W, 52, DAY)
    treeline(ctx, W, 54, 12)
    ground(ctx, W, H, 52)
    // Two low hills.
    facet(ctx, [{ x: -6, y: 74 }, { x: 30, y: 58 }, { x: 62, y: 74 }], shade(PAL.grass, 0.1), { dark: 0.16 })
    facet(ctx, [{ x: 100, y: 74 }, { x: 132, y: 58 }, { x: 166, y: 74 }], shade(PAL.grass, 0.1), { dark: 0.16 })
    flag(ctx, 30, 58, 20, '#5f92b8', frame)
    flag(ctx, 132, 58, 20, '#e0794f', frame)
    const dash = Math.sin(frame * 0.06) * 6
    drawAvatar(ctx, MRPASIONFRUIT, 74 + dash, 84, { facing: 1, height: 28, pose: 'walk', phase: frame * 2 })
    drawAvatar(ctx, DIVA, 96 + dash, 82, { facing: -1, height: 27, pose: 'walk', phase: frame * 2 + 20 })
    // Dust puffs.
    ctx.globalAlpha = 0.45
    for (let i = 0; i < 3; i++) {
      ellipse(ctx, 66 + dash - i * 5, 84 - i, 3 - i * 0.6, 1.8, '#efe6d2')
    }
    ctx.globalAlpha = 1
  },
}

const HIDE: GameEntry = {
  id: 'hide-and-seek',
  title: 'Hide & Seek',
  tagline: 'Count to twenty. No peeking. Definitely peeking.',
  genre: 'Social hiding',
  players: PARTY,
  status: 'concept',
  blurb:
    'One seeker counts while everyone scatters into the trees. Props, bushes and the tent are all fair game.',
  plan: [
    'Hiders can disguise themselves as scenery and hold still.',
    'The seeker gets warmer-colder audio as they close in.',
    'Found hiders join the seeking team for the rest of the round.',
  ],
  art: (ctx, frame) => {
    sky(ctx, W, 48, DAY)
    treeline(ctx, W, 52, 10)
    ground(ctx, W, H, 50)
    // Big foreground tree the seeker is counting against.
    rect(ctx, 24, 44, 9, 40, PAL.trunk)
    pine(ctx, 28, 50, 46)
    drawAvatar(ctx, DIVA, 42, 82, { facing: -1, height: 29, pose: 'brace', phase: frame })
    bush(ctx, 96, 84, 26)
    // A hider peeking out of the bush.
    drawAvatar(ctx, CONTRLZEE, 104, 84, { facing: -1, height: 22, pose: 'idle', phase: frame + 40 })
    bush(ctx, 100, 86, 30)
    tent(ctx, 138, 84, 30)
    drawCritter(ctx, BLACK_CAT, 128, 84, { facing: -1, height: 12, pose: 'idle', phase: frame })
    // Counting numbers floating up.
    ctx.globalAlpha = 0.6
    for (let i = 0; i < 3; i++) {
      const t = ((frame * 0.02 + i * 0.33) % 1)
      ellipse(ctx, 44 + Math.sin((frame + i * 20) * 0.05) * 3, 56 - t * 18, 1.8, 1.8, '#fbf7ee')
    }
    ctx.globalAlpha = 1
  },
}

const GHOST_HUNT: GameEntry = {
  id: 'ghost-hunt',
  title: 'Ghost Hunt',
  tagline: 'Something is in the woods and it is not a raccoon.',
  genre: 'Co-op spooky',
  players: PARTY,
  status: 'concept',
  blurb:
    'Torches out, split up, find the thing before it finds you. Nothing here is actually scary. Probably.',
  plan: [
    'Torch beams as the only light, with batteries that run down.',
    'Evidence to collect and compare back at the fire.',
    'The ghost only moves when nobody has it in their beam.',
  ],
  art: (ctx, frame) => {
    sky(ctx, W, 64, NIGHT)
    stars(ctx, W, 40, frame)
    moon(ctx, 130, 18, 7)
    treeline(ctx, W, 66, 11, -1)
    ground(ctx, W, H, 64, shade(PAL.grass, -0.48))
    lightCone(ctx, 34, 66, -0.5, 62, 0.28)
    ghost(ctx, 104, 60, 20, frame)
    drawAvatar(ctx, NINJAPENGUIN, 30, 84, { facing: 1, height: 29, pose: 'brace', phase: frame })
    lantern(ctx, 132, 52, 14, frame)
    drawCritter(ctx, SHIBA_DOG, 60, 84, { facing: 1, height: 15, pose: 'brace', phase: frame })
  },
}

const MOVING: GameEntry = {
  id: 'moving-day',
  title: 'Moving Day',
  tagline: 'Everything must go in the cart. Everything.',
  genre: 'Co-op physics hauling',
  players: PARTY,
  status: 'concept',
  blurb:
    'Wobbly furniture, narrow doorways and friends who let go early. Load the cart before the light goes.',
  plan: [
    'Two-handed carrying: big things need two animals in step.',
    'Physics props that snag on doorframes and each other.',
    'A packing score for how much survives the trip intact.',
  ],
  art: (ctx, frame) => {
    sky(ctx, W, 52, DUSK)
    treeline(ctx, W, 54, 10)
    ground(ctx, W, H, 52, shade(PAL.grass, -0.06))
    // Cart.
    facet(
      ctx,
      [
        { x: 96, y: 46 },
        { x: 150, y: 46 },
        { x: 150, y: 72 },
        { x: 96, y: 72 },
      ],
      '#a8845c',
      { dark: 0.28, light: 0.14 },
    )
    ctx.strokeStyle = '#3f382f'
    ctx.lineWidth = 1.6
    for (const cx of [108, 140]) {
      ctx.beginPath()
      ctx.arc(cx, 78, 7, 0, Math.PI * 2)
      ctx.stroke()
    }
    crate(ctx, 118, 46, 16)
    crate(ctx, 136, 46, 13)
    // Two of them carrying a crate between them.
    const lift = Math.sin(frame * 0.06) * 1.6
    drawAvatar(ctx, MRPASIONFRUIT, 30, 84, { facing: 1, height: 28, pose: 'brace', phase: frame })
    drawAvatar(ctx, DIVA, 66, 84, { facing: -1, height: 29, pose: 'brace', phase: frame })
    crate(ctx, 48, 62 + lift, 18)
  },
}

const LOCKED: GameEntry = {
  id: 'locked-in',
  title: 'Locked In',
  tagline: 'One door, four locks, everybody talking at once.',
  genre: 'Co-op escape room',
  players: PARTY,
  status: 'concept',
  blurb:
    'Puzzles split across rooms, so nobody can solve anything alone. Shout the right numbers at the right person.',
  plan: [
    'Information split between rooms; talking is the mechanic.',
    'Multi-stage locks that need several people acting together.',
    'A ticking clock you can extend by finding optional secrets.',
  ],
  art: (ctx, frame) => {
    room(ctx, W, H, 70, '#a89680', '#8a6f4d')
    // Heavy door.
    facet(
      ctx,
      [
        { x: 54, y: 16 },
        { x: 106, y: 16 },
        { x: 106, y: 70 },
        { x: 54, y: 70 },
      ],
      '#7d6247',
      { dark: 0.3, light: 0.12 },
    )
    ctx.strokeStyle = shade('#7d6247', -0.34)
    ctx.lineWidth = 1.2
    ctx.beginPath()
    for (let i = 1; i < 4; i++) {
      ctx.moveTo(54 + i * 13, 16)
      ctx.lineTo(54 + i * 13, 70)
    }
    ctx.stroke()
    // Locks down the side.
    for (let i = 0; i < 4; i++) {
      const lit = (Math.floor(frame * 0.02) % 4) > i
      facet(
        ctx,
        [
          { x: 98, y: 24 + i * 11 },
          { x: 104, y: 24 + i * 11 },
          { x: 104, y: 31 + i * 11 },
          { x: 98, y: 31 + i * 11 },
        ],
        lit ? '#8fae6a' : '#5c5348',
        { flat: true },
      )
    }
    ellipse(ctx, 100, 46, 2.4, 2.4, '#d9c07a')
    lantern(ctx, 24, 40, 16, frame)
    drawAvatar(ctx, CONTRLZEE, 30, 86, { facing: 1, height: 29, pose: 'brace', phase: frame })
    drawAvatar(ctx, TENINCHTOENAIL, 132, 86, { facing: -1, height: 28, pose: 'idle', phase: frame })
  },
}

const CASE: GameEntry = {
  id: 'case-closed',
  title: 'Case Closed',
  tagline: 'Somebody moved the marshmallows. Somebody is lying.',
  genre: 'Social deduction',
  players: PARTY,
  status: 'concept',
  blurb:
    'Clues get dealt out unevenly, everyone compares notes, and exactly one of you is quietly steering the rest wrong.',
  plan: [
    'Private clue hands, public accusation rounds, one hidden culprit.',
    'A shared evidence board everyone can pin to during discussion.',
    'A short timed vote, then the reveal and the fallout.',
  ],
  art: (ctx, frame) => {
    room(ctx, W, H, 74, '#c4b49a', '#9c7c58')
    // Pin board.
    facet(
      ctx,
      [
        { x: 34, y: 10 },
        { x: 128, y: 10 },
        { x: 128, y: 62 },
        { x: 34, y: 62 },
      ],
      '#b8945f',
      { dark: 0.22, light: 0.1 },
    )
    const notes: [number, number, number][] = [
      [46, 20, -0.1], [70, 17, 0.08], [96, 22, -0.05],
      [52, 42, 0.06], [84, 44, -0.09], [110, 40, 0.1],
    ]
    ctx.strokeStyle = '#b8483c'
    ctx.lineWidth = 0.7
    ctx.beginPath()
    ctx.moveTo(46, 20)
    ctx.lineTo(84, 44)
    ctx.lineTo(96, 22)
    ctx.lineTo(52, 42)
    ctx.lineTo(110, 40)
    ctx.stroke()
    for (const [x, y, rot] of notes) {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(rot)
      rect(ctx, -8, -6, 16, 12, '#f6f0e0')
      ctx.strokeStyle = '#b0a48c'
      ctx.lineWidth = 0.5
      ctx.beginPath()
      ctx.moveTo(-5, -2)
      ctx.lineTo(5, -2)
      ctx.moveTo(-5, 1)
      ctx.lineTo(3, 1)
      ctx.stroke()
      ctx.restore()
      ellipse(ctx, x, y - 6, 1.4, 1.4, '#b8483c')
    }
    drawAvatar(ctx, DIVA, 22, 88, { facing: 1, height: 30, pose: 'brace', phase: frame })
    drawAvatar(ctx, NINJAPENGUIN, 142, 88, { facing: -1, height: 29, pose: 'idle', phase: frame })
    // Magnifier.
    const drift = Math.sin(frame * 0.04) * 3
    ctx.strokeStyle = '#6f6659'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(80 + drift, 36, 9, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = 0.3
    ellipse(ctx, 80 + drift, 36, 8, 8, '#cfe4ea')
    ctx.globalAlpha = 1
  },
}

const PARADE: GameEntry = {
  id: 'party-parade',
  title: 'Party Parade',
  tagline: 'A board, a die, and forty minutes of betrayal.',
  genre: 'Party board game',
  players: PARTY,
  status: 'concept',
  blurb:
    'Take turns around the board, land on tiles, then everyone drops into a minigame to decide who gets the good stuff.',
  plan: [
    'A looping board of tiles: good, bad, and actively hostile.',
    'A rotating pool of minigames between every round of turns.',
    'Stars, coins, and a final scoring twist nobody will like.',
  ],
  art: (ctx, frame) => {
    sky(ctx, W, 46, DAY)
    ground(ctx, W, H, 44)
    bunting(ctx, W, 10, 5)
    // Winding board path.
    const tiles: [number, number, string][] = [
      [18, 76, '#7f9c62'], [34, 70, '#7f9c62'], [50, 64, '#e8c05f'],
      [66, 60, '#7f9c62'], [82, 58, '#e0794f'], [98, 60, '#7f9c62'],
      [114, 65, '#e8c05f'], [130, 72, '#5f92b8'], [144, 80, '#7f9c62'],
    ]
    ctx.strokeStyle = 'rgba(90, 76, 56, 0.25)'
    ctx.lineWidth = 8
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    tiles.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.stroke()
    tiles.forEach(([x, y, c], i) => {
      const pop = (Math.floor(frame * 0.05) % tiles.length) === i ? 1.2 : 1
      ellipse(ctx, x, y, 6 * pop, 4 * pop, c)
      ellipse(ctx, x, y - 1, 4.4 * pop, 2.6 * pop, shade(c, 0.2))
    })
    drawAvatar(ctx, CONTRLZEE, 66, 56, { facing: 1, height: 24, pose: 'jump', phase: frame })
    drawAvatar(ctx, TENINCHTOENAIL, 116, 62, { facing: -1, height: 23, pose: 'idle', phase: frame })
    confetti(ctx, W, H, frame)
  },
}

const CANDY: GameEntry = {
  id: 'candy-rush',
  title: 'Candy Rush',
  tagline: 'The jar tipped over. Go.',
  genre: 'Grab and grab back',
  players: PARTY,
  status: 'concept',
  blurb:
    'Sweets scatter across the floor and everyone dives. You can carry a lot, but you can also be made to drop it.',
  plan: [
    'Carry capacity that slows you down the greedier you get.',
    'Bumps and tackles that scatter whatever you were holding.',
    'Sugar-rush powerups that are as dangerous as they are fast.',
  ],
  art: (ctx, frame) => {
    room(ctx, W, H, 58, '#e0c6c0', '#c9a488')
    // Tipped jar.
    ctx.save()
    ctx.translate(30, 54)
    ctx.rotate(-0.5)
    ctx.globalAlpha = 0.65
    facet(
      ctx,
      [
        { x: -12, y: -18 },
        { x: 12, y: -18 },
        { x: 12, y: 6 },
        { x: -12, y: 6 },
      ],
      '#cfe4ea',
      { dark: 0.16, light: 0.1 },
    )
    ctx.globalAlpha = 1
    ctx.restore()
    // Scattered sweets.
    const colors = ['#e0794f', '#e8c05f', '#c87fa8', '#7f9c62', '#5f92b8']
    for (let i = 0; i < 26; i++) {
      const x = 20 + ((i * 41) % 130)
      const y = 62 + ((i * 17) % 24)
      const hop = i % 5 === Math.floor(frame * 0.06) % 5 ? -2 : 0
      ellipse(ctx, x, y + hop, 2.6, 2.2, colors[i % colors.length])
    }
    drawAvatar(ctx, MRPASIONFRUIT, 78, 88, { facing: 1, height: 28, pose: 'swingDown', phase: frame })
    drawAvatar(ctx, TENINCHTOENAIL, 118, 86, { facing: -1, height: 27, pose: 'walk', phase: frame * 2 })
    drawCritter(ctx, CALICO_CAT, 146, 88, { facing: -1, height: 14, pose: 'brace', phase: frame })
  },
}

const LAST_RUN: GameEntry = {
  id: 'last-one-running',
  title: 'Last One Running',
  tagline: 'The meadow is shrinking. Keep moving.',
  genre: 'Elimination runner',
  players: PARTY,
  status: 'concept',
  blurb:
    'The safe ring closes in and the ground behind it drops away. Last one still on solid grass takes it.',
  plan: [
    'A shrinking safe zone with a visible, fair warning before each step.',
    'Stamina: sprinting is free early and expensive late.',
    'Shoves and trips, so the finish is never purely about speed.',
  ],
  art: (ctx, frame) => {
    sky(ctx, W, 40, DUSK)
    treeline(ctx, W, 42, 12, -1)
    ground(ctx, W, H, 40)
    // Shrinking ring.
    const pulse = 1 + Math.sin(frame * 0.04) * 0.04
    ctx.strokeStyle = 'rgba(224, 138, 60, 0.85)'
    ctx.lineWidth = 2
    ctx.setLineDash([5, 4])
    ctx.beginPath()
    ctx.ellipse(80, 70, 52 * pulse, 20 * pulse, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 0.16
    ctx.fillStyle = '#e08a3c'
    ctx.beginPath()
    ctx.ellipse(80, 70, 52 * pulse, 20 * pulse, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
    const runners: [number, number, AvatarDef][] = [
      [58, 74, MRPASIONFRUIT],
      [86, 70, DIVA],
      [108, 78, CONTRLZEE],
    ]
    runners.forEach(([x, y, def], i) => {
      drawAvatar(ctx, def, x + Math.sin((frame + i * 40) * 0.05) * 4, y, {
        facing: 1,
        height: 25,
        pose: 'walk',
        phase: frame * 2 + i * 25,
      })
    })
    // One already out, beyond the ring.
    ctx.globalAlpha = 0.45
    drawAvatar(ctx, TENINCHTOENAIL, 142, 84, { facing: -1, height: 24, pose: 'hurt', phase: frame })
    ctx.globalAlpha = 1
  },
}

const PANIC: GameEntry = {
  id: 'kitchen-panic',
  title: 'Kitchen Panic',
  tagline: 'Six orders up and the pan is on fire.',
  genre: 'Co-op cooking',
  players: PARTY,
  status: 'concept',
  blurb:
    'Chop, fry, plate, repeat, in a kitchen that was clearly designed to make you fail. Nobody is in charge.',
  plan: [
    'Recipes that need several stations and several animals in sequence.',
    'Kitchens that fight back: moving floors, fires, blocked paths.',
    'A tip jar score, and a rating you will argue about afterwards.',
  ],
  art: (ctx, frame) => {
    room(ctx, W, H, 56, '#cfd6cf', '#b0a08a')
    // Counter.
    facet(
      ctx,
      [
        { x: 0, y: 58 },
        { x: W, y: 58 },
        { x: W, y: 68 },
        { x: 0, y: 68 },
      ],
      '#b8a488',
      { dark: 0.24, light: 0.12 },
    )
    // Stove with two pans.
    for (const px of [40, 70]) {
      ellipse(ctx, px, 56, 9, 3.4, '#5c5348')
      ellipse(ctx, px, 54, 8, 3, '#7d746a')
      const f = Math.sin(frame * 0.2 + px) * 0.4 + 1
      fillPoly(
        ctx,
        [
          { x: px, y: 54 - 12 * f },
          { x: px + 5, y: 52 },
          { x: px - 5, y: 52 },
        ],
        PAL.fire,
      )
      fillPoly(
        ctx,
        [
          { x: px, y: 54 - 7 * f },
          { x: px + 3, y: 52 },
          { x: px - 3, y: 52 },
        ],
        PAL.fireHot,
      )
    }
    // Plates waiting.
    for (let i = 0; i < 3; i++) ellipse(ctx, 112 + i * 14, 58, 6, 2.4, '#f6f2e6')
    drawAvatar(ctx, TENINCHTOENAIL, 56, 88, { facing: 1, height: 29, pose: 'swingDown', phase: frame })
    drawAvatar(ctx, MRPASIONFRUIT, 104, 88, { facing: -1, height: 28, pose: 'brace', phase: frame })
    // Airborne plate.
    const t = (frame % 90) / 90
    ellipse(ctx, 60 + t * 44, 40 - Math.sin(t * Math.PI) * 22, 6, 2.4, '#f6f2e6')
  },
}

const BUILD: GameEntry = {
  id: 'build-and-betray',
  title: 'Build & Betray',
  tagline: 'Place a trap. Then run the course you just ruined.',
  genre: 'Build-a-course platformer',
  players: PARTY,
  status: 'concept',
  blurb:
    'Everyone adds one piece to the level, then everyone has to complete it. The trick is making it hard for them and survivable for you.',
  plan: [
    'A drafting phase where everyone places one block or trap.',
    'Scoring that rewards being the only one to reach the end.',
    'A growing library of parts: platforms, saws, springs, glue.',
  ],
  art: (ctx, frame) => {
    sky(ctx, W, 60, DAY)
    treeline(ctx, W, 62, 10)
    ground(ctx, W, H, 78)
    const blocks: [number, number, number, string][] = [
      [16, 66, 26, PAL.wood],
      [54, 54, 22, PAL.wood],
      [90, 44, 20, PAL.wood],
      [124, 58, 24, PAL.wood],
    ]
    for (const [x, y, w, c] of blocks) {
      facet(
        ctx,
        [
          { x, y },
          { x: x + w, y },
          { x: x + w, y: y + 6 },
          { x, y: y + 6 },
        ],
        c,
        { dark: 0.28, light: 0.14 },
      )
    }
    // A saw trap spinning on the middle platform.
    const sx = 100
    const sy = 38
    ctx.save()
    ctx.translate(sx, sy)
    ctx.rotate(frame * 0.14)
    const teeth: Pt[] = []
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      const r = i % 2 === 0 ? 7 : 4.6
      teeth.push({ x: Math.cos(a) * r, y: Math.sin(a) * r })
    }
    facet(ctx, teeth, '#9aa2a8', { dark: 0.28, light: 0.18 })
    ctx.restore()
    // Ghost preview of the piece about to be placed.
    ctx.globalAlpha = 0.4 + Math.sin(frame * 0.08) * 0.14
    facet(
      ctx,
      [
        { x: 60, y: 26 },
        { x: 84, y: 26 },
        { x: 84, y: 32 },
        { x: 60, y: 32 },
      ],
      '#8fae6a',
      { flat: true },
    )
    ctx.globalAlpha = 1
    drawAvatar(ctx, CONTRLZEE, 28, 66, {
      facing: 1,
      height: 25,
      pose: 'jump',
      phase: frame,
    })
    drawAvatar(ctx, DIVA, 136, 58, { facing: -1, height: 26, pose: 'brace', phase: frame })
  },
}

const FRIENDSHIP: GameEntry = {
  id: 'friendship-ruined',
  title: 'Friendship Ruined',
  tagline: 'A rope, a mud pit, and long-held grievances.',
  genre: 'Physics tug of war',
  players: PARTY,
  status: 'concept',
  blurb:
    'Teams on a rope over something unpleasant. Pull in rhythm, or discover exactly how little your teammates trust you.',
  plan: [
    'Rhythm pulling: timing beats raw button mashing.',
    'Rope events, slips, and the option to simply let go.',
    'Rotating hazards under the middle so losing is entertaining.',
  ],
  art: (ctx, frame) => {
    sky(ctx, W, 50, DAY)
    treeline(ctx, W, 52, 11)
    ground(ctx, W, H, 50)
    // Mud pit.
    facet(
      ctx,
      [
        { x: 58, y: 68 },
        { x: 104, y: 68 },
        { x: 98, y: 82 },
        { x: 64, y: 82 },
      ],
      '#6d5a44',
      { dark: 0.24, light: 0.08 },
    )
    ctx.globalAlpha = 0.5
    for (let i = 0; i < 4; i++) {
      ellipse(ctx, 68 + i * 9, 74 + Math.sin(frame * 0.06 + i) * 1.2, 4, 1.4, '#8a7358')
    }
    ctx.globalAlpha = 1
    // Rope.
    const pull = Math.sin(frame * 0.05) * 4
    ctx.strokeStyle = '#c9a86f'
    ctx.lineWidth = 1.8
    ctx.beginPath()
    ctx.moveTo(36, 64)
    ctx.quadraticCurveTo(80 + pull, 72, 126, 64)
    ctx.stroke()
    fillPoly(
      ctx,
      [
        { x: 78 + pull, y: 66 },
        { x: 84 + pull, y: 66 },
        { x: 84 + pull, y: 72 },
        { x: 78 + pull, y: 72 },
      ],
      '#c8613f',
    )
    drawAvatar(ctx, MRPASIONFRUIT, 26 + pull * 0.4, 84, { facing: 1, height: 28, pose: 'brace', phase: frame })
    drawAvatar(ctx, NINJAPENGUIN, 136 + pull * 0.4, 84, { facing: -1, height: 29, pose: 'brace', phase: frame })
  },
}

const BLACKSTONE: GameEntry = {
  id: 'blackstone',
  title: 'Blackstone',
  tagline: 'Quiet stones by the fire. Ruthless underneath.',
  genre: 'Abstract strategy',
  players: PARTY,
  status: 'concept',
  blurb:
    'Place a stone, take the ground, cut your neighbour off. The calmest game in Polyland and the one that ends friendships.',
  plan: [
    'Territory capture on a small board that resolves in minutes.',
    'Free-for-all rounds for up to eight, with alliances that will not hold.',
    'A slow, warm presentation: firelight, wooden board, no timers.',
  ],
  art: (ctx, frame) => {
    sky(ctx, W, 40, NIGHT)
    stars(ctx, W, 30, frame)
    ground(ctx, W, H, 38, shade(PAL.grass, -0.44))
    campfire(ctx, 22, 62, frame, 0.9)
    // Board on a low table.
    ctx.save()
    ctx.translate(88, 62)
    facet(
      ctx,
      [
        { x: -44, y: -16 },
        { x: 44, y: -16 },
        { x: 52, y: 16 },
        { x: -52, y: 16 },
      ],
      '#b8945f',
      { dark: 0.24, light: 0.12 },
    )
    ctx.strokeStyle = 'rgba(70, 56, 40, 0.5)'
    ctx.lineWidth = 0.6
    ctx.beginPath()
    for (let i = 0; i <= 6; i++) {
      const t = i / 6
      ctx.moveTo(-44 + t * 88, -16)
      ctx.lineTo(-52 + t * 104, 16)
      ctx.moveTo(-44 - t * 8, -16 + t * 32)
      ctx.lineTo(44 + t * 8, -16 + t * 32)
    }
    ctx.stroke()
    const stones: [number, number, boolean][] = [
      [-30, -8, true], [-14, -8, false], [2, 0, true],
      [18, 0, true], [-18, 8, false], [26, 8, false], [10, -8, false],
    ]
    stones.forEach(([x, y, black], i) => {
      const pop = i === Math.floor(frame * 0.03) % stones.length ? 1.15 : 1
      ellipse(ctx, x, y + 1, 5.4 * pop, 3 * pop, 'rgba(60, 48, 34, 0.35)')
      ellipse(ctx, x, y, 5 * pop, 2.8 * pop, black ? '#3b352f' : '#f2ece0')
    })
    ctx.restore()
    drawAvatar(ctx, CONTRLZEE, 140, 84, { facing: -1, height: 27, pose: 'brace', phase: frame })
    const g = ctx.createRadialGradient(22, 54, 4, 22, 54, 70)
    g.addColorStop(0, 'rgba(255, 186, 96, 0.28)')
    g.addColorStop(1, 'rgba(255, 186, 96, 0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 20, W, H - 20)
  },
}

const KNOCKOUT: GameEntry = {
  id: 'knockout',
  title: 'Knockout!',
  tagline: 'Stay on the log. That is the whole rule.',
  genre: 'Sumo brawler',
  players: PARTY,
  status: 'concept',
  blurb:
    'No health, no stocks, just a shrinking platform over cold water and everyone else wanting you off it.',
  plan: [
    'Momentum shoving: heavy animals push, light ones dodge.',
    'Arenas that tilt, crumble and shrink as the round goes on.',
    'Instant rounds, running score across a whole set.',
  ],
  art: (ctx, frame) => {
    sky(ctx, W, 48, DAY)
    treeline(ctx, W, 50, 11)
    water(ctx, W, H, 50, frame)
    // Floating log arena.
    const bobY = Math.sin(frame * 0.04) * 1.4
    log(ctx, 80, 74 + bobY, 92)
    ctx.globalAlpha = 0.4
    ellipse(ctx, 80, 78 + bobY, 52, 4, '#cfe4e2')
    ctx.globalAlpha = 1
    drawCritter(ctx, SEAGULL, 132, 46 + Math.sin(frame * 0.04) * 3, {
      facing: -1,
      height: 14,
      pose: 'jump',
      phase: frame,
    })
    const shove = Math.sin(frame * 0.09) * 5
    drawAvatar(ctx, NINJAPENGUIN, 58 + shove, 66 + bobY, { facing: 1, height: 29, pose: 'swingFwd', phase: frame })
    drawAvatar(ctx, MRPASIONFRUIT, 96 + shove * 1.6, 66 + bobY, { facing: -1, height: 28, pose: 'hurt', phase: frame })
    // Impact.
    ctx.globalAlpha = 0.9
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + frame * 0.12
      const r = 5 + ((frame % 24) / 24) * 6
      ellipse(ctx, 80 + shove + Math.cos(a) * r, 54 + Math.sin(a) * r, 1.8, 1.8, '#fff6dd')
    }
    ctx.globalAlpha = 1
  },
}

const STUCK: GameEntry = {
  id: 'stuck-together',
  title: 'Stuck Together',
  tagline: 'Tied at the waist. Good luck.',
  genre: 'Co-op tether platformer',
  players: PARTY,
  status: 'concept',
  blurb:
    'Pairs share a rope with real physics. Getting anywhere means agreeing on where anywhere is, which is the hard part.',
  plan: [
    'A springy tether that swings, snags and drags you both.',
    'Obstacles that only work if one of you anchors the other.',
    'Pairs racing pairs, with a shared clock and shared blame.',
  ],
  art: (ctx, frame) => {
    sky(ctx, W, 44, DAY)
    treeline(ctx, W, 46, 10)
    // Two ledges with a gap between them.
    facet(
      ctx,
      [
        { x: -4, y: 62 },
        { x: 52, y: 62 },
        { x: 52, y: H },
        { x: -4, y: H },
      ],
      PAL.dirt,
      { dark: 0.28, light: 0.12 },
    )
    rect(ctx, -4, 62, 56, 4, PAL.grass)
    facet(
      ctx,
      [
        { x: 108, y: 54 },
        { x: 164, y: 54 },
        { x: 164, y: H },
        { x: 108, y: H },
      ],
      PAL.dirt,
      { dark: 0.28, light: 0.12 },
    )
    rect(ctx, 108, 54, 56, 4, PAL.grass)
    // The rope between them.
    const swing = Math.sin(frame * 0.05) * 6
    const ax = 46
    const ay = 56
    const bx = 100
    const by = 44 + swing
    ctx.strokeStyle = '#c9a86f'
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.moveTo(ax, ay)
    ctx.quadraticCurveTo((ax + bx) / 2, ay + 18 + swing, bx, by)
    ctx.stroke()
    drawAvatar(ctx, CONTRLZEE, ax, 62, { facing: 1, height: 27, pose: 'brace', phase: frame })
    drawAvatar(ctx, TENINCHTOENAIL, bx, by + 14, { facing: -1, height: 26, pose: 'fall', phase: frame })
    rock(ctx, 20, 62, 10)
    bush(ctx, 140, 54, 16)
  },
}

export const GAMES: GameEntry[] = [
  SMASH,
  DUCK_SZN,
  TANKS,
  SKETCH,
  FLAGS,
  HIDE,
  GHOST_HUNT,
  MOVING,
  LOCKED,
  CASE,
  PARADE,
  CANDY,
  LAST_RUN,
  PANIC,
  BUILD,
  FRIENDSHIP,
  BLACKSTONE,
  KNOCKOUT,
  STUCK,
]

export function gameById(id: string): GameEntry | undefined {
  return GAMES.find((g) => g.id === id)
}
