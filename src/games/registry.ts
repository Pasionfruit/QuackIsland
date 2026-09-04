import { drawAvatar } from '../art/avatar'
import { CHEF, FISHER, HIKER, HOODIE } from '../art/cast'
import { PAL } from '../art/palette'
import { bush, campfire, cat, pine, seagull, tent } from '../art/props'
import { fillPoly, px } from '../lib/pixel'
import { ROSTER, drawChar } from './smash/engine/characters'

export type GameStatus = 'live' | 'prototype' | 'concept'

export interface GameEntry {
  id: string
  title: string
  genre: string
  players: string
  status: GameStatus
  blurb: string
  /** Card art painter. Canvas is 160x90. */
  art: (ctx: CanvasRenderingContext2D, frame: number) => void
}

export const ART_W = 160
export const ART_H = 90

function skyBands(ctx: CanvasRenderingContext2D, colors: string[], to = ART_H): void {
  const h = to / colors.length
  colors.forEach((c, i) => px(ctx, 0, Math.round(i * h), ART_W, Math.ceil(h) + 1, c))
}

const DAY = ['#b3d4de', '#c6dde0', '#dae3d4', '#ece4c8']

const SMASH: GameEntry = {
  id: 'smash',
  title: 'Polyland Smash',
  genre: 'Platform fighter',
  players: '1-2 local, 2 online',
  status: 'live',
  blurb:
    'A friendly scrap on the bluff above the lake. Percent-based knockback, stocks, and two campers who fight very differently.',
  art: (ctx, frame) => {
    skyBands(ctx, DAY, 58)
    seagull(ctx, 26 + ((frame * 0.2) % 130), 16 + Math.sin(frame * 0.04) * 3, frame)
    for (let i = 0; i < 12; i++) pine(ctx, 4 + i * 14, 58, 14 + ((i * 7) % 9))
    px(ctx, 0, 58, ART_W, ART_H - 58, PAL.water)
    px(ctx, 0, 58, ART_W, 1, '#c6dbdc')
    for (let i = 0; i < 7; i++) {
      px(ctx, (i * 27 + Math.floor(frame * 0.3)) % ART_W, 64 + (i % 4) * 6, 4, 1, '#cfe4e2')
    }
    // Bluff.
    px(ctx, 20, 62, 120, 3, PAL.grassLit)
    px(ctx, 20, 65, 120, 3, PAL.grass)
    px(ctx, 20, 68, 120, 10, PAL.dirt)
    fillPoly(
      ctx,
      [
        { x: 20, y: 78 },
        { x: 140, y: 78 },
        { x: 124, y: 88 },
        { x: 38, y: 86 },
      ],
      PAL.dirtShade,
    )
    tent(ctx, 36, 62, 22)
    campfire(ctx, 124, 62, frame, 0.7)
    const bob = Math.sin(frame * 0.06) * 1.2
    drawChar(ctx, ROSTER[0], 68, 62 + bob, { facing: 1, scale: 0.82, phase: frame })
    drawChar(ctx, ROSTER[1], 100, 62 - bob, { facing: -1, scale: 0.78, phase: frame })
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + frame * 0.1
      const r = 4 + ((frame % 30) / 30) * 5
      px(ctx, 84 + Math.cos(a) * r, 50 + Math.sin(a) * r, 2, 2, i % 2 ? '#fff6dd' : PAL.fire)
    }
  },
}

const TRAIL: GameEntry = {
  id: 'trail',
  title: 'Trail Rally',
  genre: 'Downhill race',
  players: '1-2 local, 4 online',
  status: 'concept',
  blurb:
    'Freewheel down a forest trail with the whole camp. Pick your line, hop the roots, do not end up in the creek.',
  art: (ctx, frame) => {
    skyBands(ctx, DAY, 46)
    for (let i = 0; i < 14; i++) pine(ctx, 2 + i * 12, 50, 18 + ((i * 5) % 10))
    px(ctx, 0, 50, ART_W, ART_H - 50, PAL.grass)
    // Winding trail.
    for (let y = 50; y < ART_H; y++) {
      const t = (y - 50) / (ART_H - 50)
      const cx = 80 + Math.sin(t * 2.2) * 26
      const w = 10 + t * 44
      px(ctx, cx - w / 2, y, w, 1, t > 0.5 ? PAL.dirt : PAL.dirtShade)
    }
    for (let i = 0; i < 5; i++) {
      const t = ((frame * 0.01 + i * 0.2) % 1)
      const y = 52 + t * 34
      px(ctx, 80 + Math.sin(t * 2.2) * 26 - 8, y, 3, 2, PAL.rock)
    }
    const bob = Math.sin(frame * 0.2) * 1
    drawAvatar(ctx, HOODIE, 74, 82 + bob, { facing: 1, height: 26, pose: 'jump', phase: frame })
    px(ctx, 64, 82, 22, 2, '#4a4740')
    px(ctx, 66, 84, 5, 5, '#33302b')
    px(ctx, 80, 84, 5, 5, '#33302b')
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
    skyBands(ctx, ['#b9d6dd', '#cfe0dd', '#e6e2cd'], 40)
    for (let i = 0; i < 12; i++) pine(ctx, 4 + i * 14, 42, 12 + ((i * 3) % 8))
    px(ctx, 0, 42, ART_W, ART_H - 42, PAL.water)
    px(ctx, 0, 42, ART_W, 1, '#c6dbdc')
    for (let i = 0; i < 9; i++) {
      px(ctx, (i * 21 + Math.floor(frame * 0.24)) % ART_W, 50 + (i % 5) * 7, 5, 1, '#cfe4e2')
    }
    // Dock.
    px(ctx, 8, 62, 74, 3, PAL.wood)
    px(ctx, 8, 65, 74, 2, PAL.woodShade)
    for (let i = 0; i < 4; i++) px(ctx, 14 + i * 20, 67, 3, 12, PAL.woodShade)
    drawAvatar(ctx, FISHER, 52, 62, { facing: 1, height: 30, pose: 'idle', phase: frame })
    // Line and float.
    const dip = Math.sin(frame * 0.08) * 1.5
    px(ctx, 84, 46, 1, 22 + dip, '#8a8378')
    px(ctx, 82, 68 + dip, 5, 3, '#d0664f')
    cat(ctx, 22, 62, 10, 1, frame)
    seagull(ctx, 120, 24 + Math.sin(frame * 0.05) * 4, frame, -1)
  },
}

const KITCHEN: GameEntry = {
  id: 'kitchen',
  title: 'Camp Kitchen',
  genre: 'Co-op cooking',
  players: '2-4 local or online',
  status: 'concept',
  blurb:
    'One pan, one fire, four hungry campers. Chop, pass and plate before the light goes.',
  art: (ctx, frame) => {
    skyBands(ctx, ['#9db9c4', '#c0cfc6', '#e2d9bd', '#eecfa2'], 54)
    for (let i = 0; i < 11; i++) pine(ctx, 6 + i * 15, 56, 16 + ((i * 4) % 8))
    px(ctx, 0, 56, ART_W, ART_H - 56, PAL.grass)
    px(ctx, 0, 56, ART_W, 2, PAL.grassLit)
    // Prep table.
    px(ctx, 44, 70, 72, 4, PAL.wood)
    px(ctx, 44, 74, 72, 2, PAL.woodShade)
    px(ctx, 48, 76, 3, 12, PAL.woodShade)
    px(ctx, 110, 76, 3, 12, PAL.woodShade)
    campfire(ctx, 26, 78, frame, 0.9)
    drawAvatar(ctx, CHEF, 66, 70, { facing: 1, height: 30, pose: 'swingDown', phase: frame })
    drawAvatar(ctx, HIKER, 104, 70, { facing: -1, height: 32, pose: 'idle', phase: frame })
    // Steam.
    for (let i = 0; i < 4; i++) {
      const t = ((frame * 0.02 + i * 0.25) % 1)
      px(ctx, 84 + Math.sin((frame + i * 20) * 0.06) * 3, 68 - t * 16, 2, 2, PAL.cloud)
    }
    bush(ctx, 140, 76, 18)
  },
}

export const GAMES: GameEntry[] = [SMASH, TRAIL, CATCH, KITCHEN]

export function gameById(id: string): GameEntry | undefined {
  return GAMES.find((g) => g.id === id)
}

