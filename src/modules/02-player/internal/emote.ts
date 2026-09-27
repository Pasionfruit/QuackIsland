import { createStore, useStore } from '../../00-core'

/** The ordinary face plus the expressions chosen from the lobby wheel. */
export const FACE_EMOTES = ['smile', 'mad', 'scared', 'laugh', 'sad', 'surprised', 'mog'] as const
export type FaceEmote = (typeof FACE_EMOTES)[number]

export const EMOTE_LABELS: Record<FaceEmote, string> = {
  smile: 'Smile',
  mad: 'Mad',
  scared: 'Scared',
  laugh: 'Laugh',
  sad: 'Sad',
  surprised: 'Surprised',
  mog: 'Mog',
}

export function isFaceEmote(value: unknown): value is FaceEmote {
  return typeof value === 'string' && (FACE_EMOTES as readonly string[]).includes(value)
}

const emote = createStore<FaceEmote>('smile')

export function getFaceEmote(): FaceEmote {
  return emote.get()
}

export function useFaceEmote(): FaceEmote {
  return useStore(emote)
}

export function setFaceEmote(next: FaceEmote): void {
  emote.set(next)
}
