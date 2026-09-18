/**
 * The two ends of a shared game.
 *
 * The **host** runs the clock, takes everybody's shots - its own, the
 * stand-ins', and the guests' as they arrive - and sends the game out. A
 * **guest** flies the balloons itself from the seed, sends its shots, and takes
 * the scores and pops from the host.
 *
 * **Your own shot lands on your own screen at once.** The balloon you clicked
 * bursts the frame you click it and your cooldown starts; the host is told, and
 * its answer takes over when it comes. If the host disagrees - somebody else's
 * shot reached it first - the balloon comes back. What you see is what you
 * shot at, which is the only fair thing for a game about aiming.
 *
 * Alone, you are your own host with nobody listening.
 */
import { useEffect, useRef } from 'react'
import { getNet, sendToRoom, subscribeRoom } from '../../09-net'
import { botShots } from './ai'
import { ARENA, type Point } from './arena'
import { fire, stepGame, type Game, type Shot } from './game'
import { myId } from './setup'
import {
  applySnapshot,
  decodeAim,
  decodeShot,
  decodeSnapshot,
  encodeAim,
  encodeShot,
  encodeSnapshot,
  type ShotMessage,
  type Snapshot,
} from './wire'

/** How often the host sends the game. The balloons fly themselves; this is scores and pops. */
const SEND_MS = 80
/** How often a guest says an unanswered shot again. */
const RESEND_MS = 150
/** How long a guest keeps saying it before giving up on an answer. */
const GIVE_UP_MS = 2000
/** Past this far apart, a guest's clock jumps to the host's rather than easing. */
const SNAP_SECONDS = 0.5
/** How often your crosshair is sent while it moves. */
const AIM_MS = 50
/** How often it is said again while it keeps still, so a newcomer sees it. */
const AIM_KEEPALIVE_MS = 1000
/** A crosshair not heard of for this long has gone - its owner left, or their tab is asleep. */
export const AIM_STALE_MS = 2500

/** Everybody else's crosshair, by player id, as last heard. */
export type Aims = Map<string, { point: Point | null; at: number }>

export interface Trigger {
  balloon: number | null
  point: Point
}

export interface GameNet {
  /**
   * Moves the game on a frame. `trigger` is a click this frame, if there was
   * one. Returns whether anything changed.
   */
  advance(game: Game, dt: number, trigger: Trigger | null, paused: boolean): boolean
  /** Tells everybody where your crosshair is, as often as is worth it. Call every frame. */
  sendAim(aim: Point | null): void
  /** Everybody else's crosshairs. The same map for the life of the game; read it, never replace it. */
  aims: Aims
}

export function useGameNet(): GameNet {
  const heard = useRef<{ from: string; shot: ShotMessage }[]>([])
  const latest = useRef<{ snap: Snapshot; at: number } | null>(null)
  const applied = useRef<Snapshot | null>(null)
  const sentAt = useRef(0)
  const seq = useRef(0)
  const pending = useRef<{ shot: ShotMessage; firstAt: number; saidAt: number; landed: Shot } | null>(null)
  const aims = useRef<Aims>(new Map())
  const aimSent = useRef<{ aim: Point | null; at: number }>({ aim: null, at: 0 })

  useEffect(() => {
    return subscribeRoom((from, raw) => {
      // Crosshairs come from everybody, to everybody, host or not.
      const aim = decodeAim(raw)
      if (aim !== undefined) {
        aims.current.set(from, { point: aim, at: performance.now() })
        return
      }
      if (getNet().host) {
        const shot = decodeShot(raw)
        if (shot) heard.current.push({ from, shot })
        return
      }
      const snap = decodeSnapshot(raw)
      if (snap) latest.current = { snap, at: performance.now() }
    })
  }, [])

  const advance = (game: Game, dt: number, trigger: Trigger | null, paused: boolean): boolean => {
    const net = getNet()
    const now = performance.now()

    // A pause is shared: whoever pressed it stopped the round for everybody,
    // so this stops dead - the host's own simulation included. A round that
    // carried on behind the card would make the card a lie. See
    // `15-minigames/internal/pause.ts`.
    if (paused) return false

    if (net.host) {
      if (game.players.length === 0) return false

      const me = game.players.findIndex((p) => p.mine)
      if (trigger && me >= 0 && !paused) fire(game, { shooter: me, balloon: trigger.balloon, point: trigger.point })
      for (const shot of botShots(game)) fire(game, shot)
      for (const { from, shot } of heard.current.splice(0)) {
        const index = game.players.findIndex((p) => p.id === from)
        if (index < 0) continue
        fire(game, { shooter: index, balloon: shot.balloon, point: shot, seq: shot.seq })
      }
      stepGame(game, dt)

      if (net.status === 'joined' && now - sentAt.current >= SEND_MS) {
        sentAt.current = now
        sendToRoom(encodeSnapshot(game))
      }
      return true
    }

    // A guest. The host's word first, then the clock, then anything of our own.
    const heardFrom = latest.current
    const localElapsed = game.elapsed
    const fresh = !!heardFrom && heardFrom.snap !== applied.current
    if (fresh) {
      applied.current = heardFrom.snap
      applySnapshot(game, heardFrom.snap, myId())
    }
    if (game.players.length === 0) return false

    const step = Math.min(Math.max(dt, 0), 0.25)
    if (!game.over) {
      // Our own clock runs on between snapshots, pulled towards where the host
      // was when it spoke plus the time since.
      const ours = localElapsed + step
      const hostNow = heardFrom ? heardFrom.snap.elapsed + (now - heardFrom.at) / 1000 : ours
      const gap = hostNow - ours
      game.elapsed = Math.abs(gap) > SNAP_SECONDS ? hostNow : ours + gap * Math.min(1, step * 6)
      game.elapsed = Math.max(0, Math.min(ARENA.duration, game.elapsed))
    }
    // Cooldowns run down between snapshots too, or a bar fills in tenths.
    if (!fresh) for (const player of game.players) player.cooldown = Math.max(0, player.cooldown - step)

    const me = game.players.findIndex((p) => p.mine)
    const mine = game.players[me]

    // A new shot: straight onto our own copy, and to the host.
    if (trigger && mine && !paused && !game.over && mine.cooldown <= 0 && !pending.current) {
      seq.current = Math.max(seq.current, mine.seq) + 1
      const shot: ShotMessage = { seq: seq.current, balloon: trigger.balloon, ...trigger.point }
      const target = trigger.balloon === null ? undefined : game.balloons[trigger.balloon]
      pending.current = {
        shot,
        firstAt: now,
        saidAt: now,
        landed: { ...trigger.point, at: game.elapsed, hit: !!target, own: target?.owner === me },
      }
      sendToRoom(encodeShot(shot))
    }

    const waiting = pending.current
    if (waiting && mine) {
      if (mine.seq >= waiting.shot.seq || now - waiting.firstAt > GIVE_UP_MS) {
        pending.current = null
      } else {
        if (now - waiting.saidAt >= RESEND_MS) {
          waiting.saidAt = now
          sendToRoom(encodeShot(waiting.shot))
        }
        // Until the host answers, our shot has happened: the balloon is gone,
        // the cooldown is running, and the shot is where we fired it.
        const age = (now - waiting.firstAt) / 1000
        mine.cooldown = Math.max(mine.cooldown, ARENA.cooldown - age)
        const balloon = waiting.shot.balloon
        if (balloon !== null && !game.popped.has(balloon)) game.popped.set(balloon, me)
        mine.lastShot = waiting.landed
      }
    }
    return true
  }

  const sendAim = (aim: Point | null) => {
    if (getNet().status !== 'joined') return
    const now = performance.now()
    const last = aimSent.current
    const moved = aim === null || last.aim === null ? aim !== last.aim : Math.hypot(aim.x - last.aim.x, aim.y - last.aim.y) > 0.02
    if (now - last.at < (moved ? AIM_MS : AIM_KEEPALIVE_MS)) return
    aimSent.current = { aim, at: now }
    sendToRoom(encodeAim(aim))
  }

  return { advance, sendAim, aims: aims.current }
}
