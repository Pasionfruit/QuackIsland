import { fillPoly, px, regularPoly, shapePoly, transformPts, type Pt } from '../lib/pixel'
import { ROSTER } from './smash/engine/characters'
import { drawBody } from './smash/engine/render'

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

function skyBands(ctx: CanvasRenderingContext2D, colors: string[]): void {
  const h = ART_H / colors.length
  colors.forEach((c, i) => px(ctx, 0, Math.round(i * h), ART_W, Math.ceil(h) + 1, c))
}

function stars(ctx: CanvasRenderingContext2D, frame: number, n = 26): void {
  for (let i = 0; i < n; i++) {
    const x = (i * 37) % ART_W
    const y = (i * 53) % 46
    const twinkle = (frame + i * 9) % 90 < 60
    if (twinkle) px(ctx, x, y, 1, 1, i % 4 === 0 ? '#ffffff' : '#bdb2ff')
  }
}

const SMASH: GameEntry = {
  id: 'smash',
  title: 'Polyland Smash',
  genre: 'Platform fighter',
  players: '1-2 local',
  status: 'live',
  blurb:
    'Knock the other polygon off the map. Percent-based knockback, stocks, air dodging physics and two very different fighters.',
  art: (ctx, frame) => {
    skyBands(ctx, ['#0c0a22', '#221450', '#54205f', '#9b2f5d', '#e46d5c'])
    stars(ctx, frame)
    const sun = transformPts(regularPoly(16, Math.PI / 16), { x: 80, y: 58, sx: 22, sy: 22 })
    fillPoly(ctx, sun, '#ffc978')
    px(ctx, 58, 56, 44, 2, '#9b2f5d')
    px(ctx, 58, 62, 44, 3, '#9b2f5d')
    px(ctx, 58, 69, 44, 4, '#9b2f5d')

    // Island.
    px(ctx, 30, 66, 100, 3, '#d7e6f5')
    px(ctx, 30, 69, 100, 10, '#414f74')
    fillPoly(
      ctx,
      [
        { x: 30, y: 79 },
        { x: 130, y: 79 },
        { x: 106, y: 90 },
        { x: 54, y: 90 },
      ],
      '#242c46',
    )
    px(ctx, 44, 50, 26, 2, '#9b7bff')
    px(ctx, 92, 44, 26, 2, '#9b7bff')

    const bob = Math.sin(frame * 0.06) * 1.5
    drawBody(ctx, ROSTER[0], 58, 66 + bob, { facing: 1, scale: 0.85 })
    drawBody(ctx, ROSTER[1], 104, 66 - bob, { facing: -1, scale: 0.85 })

    // Clash spark in the middle.
    const k = (frame % 40) / 40
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + frame * 0.12
      const r = 4 + k * 8
      px(ctx, 81 + Math.cos(a) * r, 54 + Math.sin(a) * r, 2, 2, i % 2 ? '#ffe066' : '#ffffff')
    }
  },
}

const DRIFT: GameEntry = {
  id: 'drift',
  title: 'Prism Drift',
  genre: 'Kart racer',
  players: '1-4 local',
  status: 'concept',
  blurb: 'Corner-cutting polygon karts on neon circuits. Drift charge, shell physics, and a rubber-band rival AI.',
  art: (ctx, frame) => {
    skyBands(ctx, ['#0c0a22', '#1c1247', '#3d1a5c', '#6d2360'])
    stars(ctx, frame, 18)
    px(ctx, 0, 50, ART_W, 40, '#1b1638')
    for (let i = 0; i < 9; i++) {
      const y = 52 + i * 4
      const inset = i * 5
      px(ctx, 12 + inset, y, ART_W - 24 - inset * 2, 2, i % 2 ? '#2f2a63' : '#3b3480')
    }
    for (let i = 0; i < 6; i++) {
      const x = ((frame * 1.6 + i * 30) % 180) - 20
      px(ctx, x, 60 + (i % 3) * 8, 12, 2, '#ffe066')
    }
    const bob = Math.sin(frame * 0.14) * 1
    drawBody(ctx, ROSTER[0], 60, 74 + bob, { facing: 1, scale: 0.8 })
    px(ctx, 48, 74, 26, 3, '#ff5f6d')
    px(ctx, 50, 77, 4, 3, '#37317a')
    px(ctx, 68, 77, 4, 3, '#37317a')
    drawBody(ctx, ROSTER[1], 104, 68 - bob, { facing: 1, scale: 0.7 })
    px(ctx, 94, 68, 24, 3, '#4fd6ff')
  },
}

const TESSERA: GameEntry = {
  id: 'tessera',
  title: 'Tessera',
  genre: 'Falling-block puzzle',
  players: '1-2 versus',
  status: 'concept',
  blurb: 'Tile the plane with polygon pieces. Chain clears to bury your opponent in garbage shapes.',
  art: (ctx, frame) => {
    px(ctx, 0, 0, ART_W, ART_H, '#0d0b26')
    for (let x = 46; x <= 114; x += 10) px(ctx, x, 8, 1, 74, '#1e1a45')
    for (let y = 8; y <= 82; y += 10) px(ctx, 46, y, 68, 1, '#1e1a45')
    const colors = ['#4fd6ff', '#ff8a3d', '#ffe066', '#6ee7a8', '#ff5f6d']
    const stack = [4, 2, 5, 3, 1, 3, 6]
    stack.forEach((h, col) => {
      for (let i = 0; i < h; i++) {
        const pts = transformPts(regularPoly(3 + ((col + i) % 4), 0.4), {
          x: 51 + col * 10,
          y: 77 - i * 10,
          sx: 4.6,
          sy: 4.6,
        })
        shapePoly(ctx, pts, colors[(col + i) % colors.length], '#0a0820', 1)
      }
    })
    const drop = 8 + ((frame * 0.9) % 40)
    const falling = transformPts(regularPoly(5, frame * 0.04), { x: 91, y: drop, sx: 5.5, sy: 5.5 })
    shapePoly(ctx, falling, '#ffe066', '#0a0820', 1)
    px(ctx, 46, 6, 68, 1, '#554ec2')
  },
}

const DUNGEON: GameEntry = {
  id: 'dungeon',
  title: 'Dungeon of Angles',
  genre: 'Roguelike crawler',
  players: '1 player',
  status: 'concept',
  blurb: 'Descend the tessellated depths. Every floor is generated, every enemy is a shape with a grudge.',
  art: (ctx, frame) => {
    px(ctx, 0, 0, ART_W, ART_H, '#0a0918')
    px(ctx, 16, 22, 128, 56, '#191634')
    for (let x = 16; x < 144; x += 16) px(ctx, x, 22, 1, 56, '#221d47')
    for (let y = 22; y < 78; y += 14) px(ctx, 16, y, 128, 1, '#221d47')
    px(ctx, 16, 22, 128, 3, '#2f2860')
    // Torches.
    for (const tx of [28, 132]) {
      const flick = (frame + tx) % 20 < 10 ? 1 : 0
      px(ctx, tx, 30, 2, 6, '#6b5a2a')
      px(ctx, tx - 1, 26 - flick, 4, 5, '#ffb347')
      px(ctx, tx, 24 - flick, 2, 3, '#ffe066')
    }
    const bob = Math.sin(frame * 0.07) * 1.5
    drawBody(ctx, ROSTER[0], 56, 66 + bob, { facing: 1, scale: 0.8 })
    const slime = transformPts(regularPoly(5, -Math.PI / 2), { x: 104, y: 60, sx: 9, sy: 8 })
    shapePoly(ctx, slime, '#6ee7a8', '#123a2a', 1)
    px(ctx, 101, 58, 2, 2, '#123a2a')
    px(ctx, 107, 58, 2, 2, '#123a2a')
    // Loot.
    const gleam = frame % 60 < 30
    const chest: Pt[] = [
      { x: 76, y: 40 },
      { x: 88, y: 40 },
      { x: 88, y: 48 },
      { x: 76, y: 48 },
    ]
    fillPoly(ctx, chest, gleam ? '#ffe066' : '#c9a642')
    px(ctx, 76, 43, 12, 1, '#7a5c14')
  },
}

export const GAMES: GameEntry[] = [SMASH, DRIFT, TESSERA, DUNGEON]

export function gameById(id: string): GameEntry | undefined {
  return GAMES.find((g) => g.id === id)
}
