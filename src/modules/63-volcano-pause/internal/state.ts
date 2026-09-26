import { hostChoice } from '../../13-modes'

export type VolcanoPauseState = 'running' | 'paused'

const pause = hostChoice<VolcanoPauseState>(
  'volcano-pause',
  (value): value is VolcanoPauseState => value === 'running' || value === 'paused',
  'running',
)

/** The elected host owns this value; guests only receive it. */
export const getVolcanoPause = pause.get
export const setVolcanoPause = pause.set
export const useVolcanoPause = pause.use
export const useVolcanoPauseSync = pause.useSync
