import { drawAvatar } from '../art/avatar'
import { BIKER, CALICO_CAT, CHEF, EXPLORER, FISHER, HIKER, SEAGULL, SHIBA_DOG, SURFER } from '../art/cast'
import { drawCritter } from '../art/critter'
import { PAL } from '../art/palette'
import { bush, campfire, cloud, log, pine, rock, tent } from '../art/props'
import { ellipse, facet, rect, shade, softShadow, type Pt } from '../lib/draw'

export type GameStatus = 'live' | 'prototype' | 'concept'

export interface GameEntry {
  id: string
  title: string
  genre: string
  players: string
  status: GameStatus
  blurb: string
  /** Card art painter. Canvas is 160x90 world units. */
  art: (ctx: CanvasRenderingContext2D, frame: number) => void
}

export const ART_W = 160
export const ART_H = 90

function sky(ctx: CanvasRenderingContext2D, to: number, colors: string[]): void {
  const g = ctx.createLinearGradient(0, 0, 0, to)
  colors.forEach((c, i) => g.addColorStop(i / (colors.length - 1), c))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, ART_W, to)
}

const DAY = ['#a9cfdc', '#c4dcdc', '#dee5cf', '#f0e3c6']

function water(ctx: CanvasRenderingContext2D, top: number, frame: number): void {
  const g = ctx.createLinearGradient(0, top, 0, ART_H)
  g.addColorStop(0, PAL.waterLit)
  g.addColorStop(0.4, PAL.water)
  g.addColorStop(1, PAL.waterShade)
  ctx.fillStyle = g
  ctx.fillRect(0, top, ART_W, ART_H - top)
  ctx.globalAlpha = 0.5
  for (let i = 0; i < 9; i++) {
    const y = top + 4 + ((i * 6 + Math.floor(frame * 0.1)) % (ART_H - top - 6))
    const x = (i * 37 + Math.sin(frame * 0.02 + i) * 8 + 20) % ART_W
    ellipse(ctx, x, y, 5, 0.5, '#e8f4f2')
  }
  ctx.globalAlpha = 1
}

function treeline(ctx: CanvasRenderingContext2D, baseY: number, count = 13): void {
  for (let i = 0; i < count; i++) {
    pine(ctx, 3 + i * (ART_W / count), baseY, 13 + ((i * 7) % 10))
  }
}

const SMASH: GameEntry = {
  id: 'smash',
  title: 'Polyland Smash',
  genre: 'Platform fighter',
  players: '1-2 local, 2 online',
  status: 'live',
  blurb:
    'A friendly scrap on the bluff above the lake. Percent-based knockback, stocks, and twelve campers who all fight differently.',
  art: (ctx, frame) => {
    sky(ctx, 56, DAY)
    cloud(ctx, 30 + ((frame * 0.08) % 200), 14, 26)
    treeline(ctx, 58)
    water(ctx, 58, frame)
    // Bluff.
    const bluff: Pt[] = [
      { x: 22, y: 62 },
      { x: 138, y: 62 },
      { x: 138, y: 76 },
      { x: 124, y: 88 },
      { x: 38, y: 86 },
      { x: 22, y: 76 },
    ]
    facet(ctx, bluff, PAL.dirt, { dark: 0.3, light: 0.1, split: 0.2 })
    facet(
      ctx,
      [
        { x: 22, y: 68 },
        { x: 22, y: 62 },
        { x: 138, y: 62 },
        { x: 138, y: 68 },
      ],
      PAL.grass,
      { dark: 0.2, light: 0.16 },
    )
    tent(ctx, 38, 62, 22)
    campfire(ctx, 122, 62, frame, 0.72)
    const bob = Math.sin(frame * 0.06) * 1.2
    drawAvatar(ctx, CHEF, 68, 62 + bob, {
      facing: 1,
      height: 27,
      pose: 'swingFwd',
      phase: frame,
      shadow: true,
    })
    drawAvatar(ctx, HIKER, 98, 62 - bob, {
      facing: -1,
      height: 29,
      pose: 'hurt',
      phase: frame,
      shadow: true,
    })
    // Impact sparkle.
    ctx.globalAlpha = 0.9
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + frame * 0.1
      const r = 4 + ((frame % 30) / 30) * 6
      ellipse(ctx, 84 + Math.cos(a) * r, 48 + Math.sin(a) * r, 1.6, 1.6, i % 2 ? '#fff6dd' : PAL.fire)
    }
    ctx.globalAlpha = 1
  },
}

const TRAIL: GameEntry = {
  id: 'trail',
  title: 'Trail Rally',
  genre: 'Downhill race',
  players: '1-2 local, 4 online',
  status: 'concept',
  blurb:
    'Freewheel down a forest trail with the whole camp. Pick your line, hop the roots, try not to end up in the creek.',
  art: (ctx, frame) => {
    sky(ctx, 48, DAY)
    treeline(ctx, 52, 12)
    ctx.fillStyle = PAL.grass
    ctx.fillRect(0, 50, ART_W, ART_H - 50)
    // Winding trail.
    ctx.fillStyle = PAL.dirt
    ctx.beginPath()
    ctx.moveTo(74, 50)
    for (let y = 50; y <= ART_H; y += 2) {
      const t = (y - 50) / (ART_H - 50)
      ctx.lineTo(80 + Math.sin(t * 2.2) * 26 - (10 + t * 44) / 2, y)
    }
    for (let y = ART_H; y >= 50; y -= 2) {
      const t = (y - 50) / (ART_H - 50)
      ctx.lineTo(80 + Math.sin(t * 2.2) * 26 + (10 + t * 44) / 2, y)
    }
    ctx.closePath()
    ctx.fill()
    for (let i = 0; i < 4; i++) {
      const t = (frame * 0.008 + i * 0.25) % 1
      const y = 54 + t * 30
      rock(ctx, 80 + Math.sin(t * 2.2) * 26 - 12, y, 5)
    }
    const bob = Math.sin(frame * 0.2) * 1
    drawAvatar(ctx, BIKER, 76, 84 + bob, { facing: 1, height: 26, pose: 'jump', phase: frame })
    // Bike underneath.
    ctx.strokeStyle = '#3b4650'
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.arc(66, 84, 5, 0, Math.PI * 2)
    ctx.moveTo(91, 84)
    ctx.arc(86, 84, 5, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(66, 84)
    ctx.lineTo(76, 76)
    ctx.lineTo(86, 84)
    ctx.stroke()
    softShadow(ctx, 76, 89, 14, 2.5, 0.2)
  },
}

const CATCH: GameEntry = {
  id: 'catch',
  title: 'Catch of the Day',
  genre: 'Fishing / collecting',
  players: '1-2 local, 4 online',
  status: 'concept',
  blurb:
    'Sit on the dock, read the ripples, fill the record book. Nobody loses, the fish just get bigger.',
  art: (ctx, frame) => {
    sky(ctx, 40, ['#b9d6dd', '#d2e0da', '#eae3ca'])
    treeline(ctx, 42, 11)
    water(ctx, 42, frame)
    // Dock.
    facet(
      ctx,
      [
        { x: 6, y: 62 },
        { x: 84, y: 62 },
        { x: 84, y: 67 },
        { x: 6, y: 67 },
      ],
      PAL.wood,
      { dark: 0.28, light: 0.14 },
    )
    for (let i = 0; i < 4; i++) rect(ctx, 14 + i * 20, 67, 3, 13, shade(PAL.wood, -0.3))
    drawAvatar(ctx, FISHER, 52, 62, { facing: 1, height: 30, pose: 'idle', phase: frame })
    drawCritter(ctx, CALICO_CAT, 22, 62, { facing: 1, height: 15, pose: 'idle', phase: frame })
    // Float bobbing on the water.
    const dip = Math.sin(frame * 0.08) * 1.2
    ctx.strokeStyle = '#8a8378'
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(78, 46)
    ctx.lineTo(96, 68 + dip)
    ctx.stroke()
    ellipse(ctx, 96, 69 + dip, 2.4, 2, '#d0664f')
    ctx.globalAlpha = 0.5
    ellipse(ctx, 96, 71 + dip, 7, 1.4, '#e8f4f2')
    ctx.globalAlpha = 1
    drawCritter(ctx, SEAGULL, 126, 40, { facing: -1, height: 16, pose: 'jump', phase: frame })
  },
}

const KITCHEN: GameEntry = {
  id: 'kitchen',
  title: 'Camp Kitchen',
  genre: 'Co-op cooking',
  players: '2-4 local or online',
  status: 'concept',
  blurb: 'One pan, one fire, four hungry campers. Chop, pass and plate before the light goes.',
  art: (ctx, frame) => {
    sky(ctx, 54, ['#9db9c4', '#c2cfc4', '#e6d9b8', '#f2cfa0'])
    treeline(ctx, 56, 10)
    ctx.fillStyle = PAL.grass
    ctx.fillRect(0, 55, ART_W, ART_H - 55)
    ctx.fillStyle = shade(PAL.grass, 0.12)
    ctx.fillRect(0, 55, ART_W, 2)
    log(ctx, 24, 84, 24)
    campfire(ctx, 26, 78, frame, 0.85)
    // Prep table.
    facet(
      ctx,
      [
        { x: 44, y: 70 },
        { x: 118, y: 70 },
        { x: 118, y: 75 },
        { x: 44, y: 75 },
      ],
      PAL.wood,
      { dark: 0.28, light: 0.14 },
    )
    rect(ctx, 48, 75, 3, 13, shade(PAL.wood, -0.3))
    rect(ctx, 112, 75, 3, 13, shade(PAL.wood, -0.3))
    drawAvatar(ctx, CHEF, 66, 70, { facing: 1, height: 29, pose: 'swingDown', phase: frame })
    drawAvatar(ctx, EXPLORER, 102, 70, { facing: -1, height: 30, pose: 'idle', phase: frame })
    drawCritter(ctx, SHIBA_DOG, 136, 88, { facing: -1, height: 18, pose: 'idle', phase: frame })
    // Steam.
    ctx.globalAlpha = 0.7
    for (let i = 0; i < 4; i++) {
      const t = (frame * 0.02 + i * 0.25) % 1
      ctx.globalAlpha = 0.7 * (1 - t)
      ellipse(ctx, 84 + Math.sin((frame + i * 20) * 0.06) * 3, 66 - t * 16, 2.4, 2, PAL.cloud)
    }
    ctx.globalAlpha = 1
    bush(ctx, 146, 84, 18)
  },
}

const SURF: GameEntry = {
  id: 'surf',
  title: 'Shore Break',
  genre: 'Wave riding',
  players: '1-2 local',
  status: 'concept',
  blurb: 'Paddle out, read the set, ride it in. The gulls will absolutely try to steal your lunch.',
  art: (ctx, frame) => {
    sky(ctx, 44, ['#a9cfdc', '#c9dcd6', '#f0dfbe'])
    cloud(ctx, 120 - ((frame * 0.06) % 180), 16, 24)
    water(ctx, 44, frame)
    // A rolling wave.
    const swell = Math.sin(frame * 0.04) * 3
    const wave: Pt[] = [{ x: -4, y: ART_H }]
    for (let x = -4; x <= ART_W + 4; x += 6) {
      wave.push({ x, y: 64 + Math.sin(x * 0.05 + frame * 0.05) * 4 + swell })
    }
    wave.push({ x: ART_W + 4, y: ART_H })
    facet(ctx, wave, PAL.water, { dark: 0.2, light: 0.18 })
    ctx.globalAlpha = 0.85
    for (let i = 0; i < 12; i++) {
      const x = i * 14 + ((frame * 0.4) % 14)
      ellipse(ctx, x, 64 + Math.sin(x * 0.05 + frame * 0.05) * 4 + swell, 5, 1.4, '#f4fbf8')
    }
    ctx.globalAlpha = 1
    drawAvatar(ctx, SURFER, 70, 68 + swell, { facing: 1, height: 28, pose: 'brace', phase: frame })
    drawCritter(ctx, SEAGULL, 124, 34, { facing: -1, height: 15, pose: 'jump', phase: frame })
  },
}

const CAMP: GameEntry = {
  id: 'camp',
  title: 'Night Watch',
  genre: 'Cosy survival',
  players: '1-4 online',
  status: 'concept',
  blurb: 'Keep the fire lit until sunrise. Gather wood, share the watch, listen to the woods.',
  art: (ctx, frame) => {
    sky(ctx, 60, ['#2c3b52', '#43566b', '#6b7b7f', '#9c8f79'])
    // Stars.
    for (let i = 0; i < 26; i++) {
      const x = (i * 37) % ART_W
      const y = (i * 53) % 40
      ctx.globalAlpha = (frame + i * 9) % 90 < 60 ? 0.9 : 0.3
      ellipse(ctx, x, y, 0.6, 0.6, '#fdf6e6')
    }
    ctx.globalAlpha = 1
    treeline(ctx, 62, 12)
    ctx.fillStyle = shade(PAL.grass, -0.45)
    ctx.fillRect(0, 60, ART_W, ART_H - 60)
    tent(ctx, 34, 78, 30)
    campfire(ctx, 96, 80, frame, 1.1)
    drawAvatar(ctx, HIKER, 74, 80, { facing: 1, height: 28, pose: 'idle', phase: frame })
    drawCritter(ctx, SHIBA_DOG, 118, 80, { facing: -1, height: 17, pose: 'idle', phase: frame })
    // Firelight wash.
    const g = ctx.createRadialGradient(96, 74, 4, 96, 74, 54)
    g.addColorStop(0, 'rgba(255, 186, 96, 0.32)')
    g.addColorStop(1, 'rgba(255, 186, 96, 0)')
    ctx.fillStyle = g
    ctx.fillRect(30, 34, 132, 56)
  },
}

export const GAMES: GameEntry[] = [SMASH, TRAIL, CATCH, KITCHEN, SURF, CAMP]

export function gameById(id: string): GameEntry | undefined {
  return GAMES.find((g) => g.id === id)
}
