/**
 * Per-frame work, ordered by band.
 *
 * A thin wrapper over useFrame whose only job is to make the priority explicit
 * and shared. Modules pass a PRIORITY band rather than inventing a number, so
 * ordering between modules that never import each other stays predictable.
 */
import { useFrame } from '@react-three/fiber'
import type { RootState } from '@react-three/fiber'
import type { Priority } from './conventions'

export type FrameCallback = (state: RootState, delta: number) => void

export function useGameFrame(cb: FrameCallback, priority: Priority): void {
  useFrame(cb, priority)
}
