import { useEffect } from 'react'
import { createStore, useStore } from '../../00-core'
import { getMyName, getNet, sendToRoom, subscribeRoom } from '../../09-net'

export interface VolcanoPauser {
  id: string
  name: string
}

export interface VolcanoPauseState {
  paused: boolean
  pausedBy: VolcanoPauser | null
}

type PauseAction = 'pause' | 'resume'

interface PauseMessage {
  action: PauseAction
  by: VolcanoPauser
}

const TAG = 'volcano-pause'
const RUNNING: VolcanoPauseState = { paused: false, pausedBy: null }
const store = createStore<VolcanoPauseState>(RUNNING)

function me(): VolcanoPauser {
  return { id: getNet().id ?? 'you', name: getMyName() }
}

function decode(raw: Record<string, unknown>): PauseMessage | null {
  if (raw.t !== TAG || (raw.a !== 'pause' && raw.a !== 'resume')) return null
  if (typeof raw.i !== 'string' || raw.i.length === 0 || typeof raw.n !== 'string') return null
  return { action: raw.a, by: { id: raw.i, name: raw.n.slice(0, 24) } }
}

function apply(message: PauseMessage): void {
  const current = store.get()
  if (message.action === 'pause') {
    if (!current.paused) store.set({ paused: true, pausedBy: message.by })
    return
  }
  if (current.paused && current.pausedBy?.id === message.by.id) store.set(RUNNING)
}

function announce(action: PauseAction): void {
  const by = me()
  const message = { action, by }
  apply(message)
  if (getNet().status === 'joined') sendToRoom({ t: TAG, a: action, i: by.id, n: by.name })
}

export function getVolcanoPause(): VolcanoPauseState {
  return store.get()
}

export function useVolcanoPause(): VolcanoPauseState {
  return useStore(store)
}

export function pauseVolcanoGame(): void {
  if (!store.get().paused) announce('pause')
}

export function mayResumeVolcanoGame(): boolean {
  const current = store.get()
  return current.paused && current.pausedBy?.id === me().id
}

export function resumeVolcanoGame(): void {
  if (mayResumeVolcanoGame()) announce('resume')
}

export function clearVolcanoPause(): void {
  store.set(RUNNING)
}

/** Receives any player's pause so every party member sees who stopped play. */
export function useVolcanoPauseSync(): void {
  useEffect(() => subscribeRoom((from, raw) => {
    const message = decode(raw)
    if (!message || message.by.id !== from) return
    apply(message)
  }), [])
}
