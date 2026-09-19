/**
 * What the screen itself plays: the three-two-one, Finish, and the podium.
 *
 * **Not on the island's audio bus.** `08-audio` is the body's cues - footsteps,
 * a jump, a swim stroke - mixed in three dimensions and pitched by how fast you
 * are going. These two are neither: they are interface, flat, in your ears
 * rather than somewhere in the world, and they belong to a screen that is drawn
 * over the world rather than in it. Two `Audio` elements are the honest size of
 * the problem.
 *
 * **Each one is loaded once and rewound rather than re-made.** A new `Audio`
 * per round would fetch again on a cold cache and leave the old ones for the
 * collector; rewinding is what makes a restart able to play the countdown twice
 * in a row.
 *
 * Everything here no-ops rather than throwing when there is no `Audio` to be
 * had - a test environment, or a browser that has not been clicked in yet - so
 * a missing sound can never take a round down with it.
 */
import { useEffect, useRef } from 'react'
import { assetUrl } from '../../00-core'
import type { MinigameId } from './catalogue'

export const COUNTDOWN_SOUND = 'audio/Countdown.mp3'
export const FINISH_SOUND = 'audio/Finish.mp3'
/** Under the podium. Long enough to cover it, so it is played once rather than looped. */
export const PODIUM_MUSIC = 'Podium_Music.mp3'
/** Six seconds of ticking, timed to end on zero. See `TopTimer`. */
export const LAST_SECONDS_SOUND = 'Last_6_Second_CountDown.mp3'
/** The screen's own furniture: every button on it, and the pause card. */
export const MENU_CLICK_SOUND = 'Menu_Button_Clicked.mp3'
export const SELECT_GAME_SOUND = 'Select_Option_Minigame.mp3'
export const PAUSE_SOUND = 'Pausing_Menu.mp3'
export const UNPAUSE_SOUND = 'Unpause_Menu.mp3'

/**
 * Every sound effect a game may play, by what it is rather than by file name.
 *
 * One table so the list of what exists is one place to read, and so a game
 * reaches for `CUES.gunShot` rather than spelling a file name out - a renamed
 * file is then one line here rather than a hunt through twenty-five modules.
 */
export const CUES = {
  balloonInflate: 'Balloon_Inflate.mp3',
  balloonPop: 'Balloon_Pop_Audio.mp3',
  bonk: 'Bonk_Audio.mp3',
  bump: 'Bump_Audio.mp3',
  chefSelecting: 'Chef_Selecting_Ingredients_Audio.mp3',
  cutRope: 'Cut_Rope_Audio.mp3',
  dadYelling: ['Dad_Yelling_1.m4a', 'Dad_Yelling_2.m4a', 'Dad_Yelling_3.m4a'],
  drawing: 'Drawing_Audio.mp3',
  fallingOver: 'Falling_Over.mp3',
  gunShot: 'Gun_Shot.mp3',
  holdMouse: 'Hold_Mouse_Audio.mp3',
  launch: 'Launch_Audio.mp3',
  spinning: 'Spinning_Audio.mp3',
  /** Spidy Senses' jump scare: a shriek with the spider lunging at you. */
  spiderJumpscare: 'Spider_Jumpscare_Audio.mp3',
  stepDown: 'Step_Down_Stair_Audio.mp3',
  /** A two-second sting, not a loop: the moment before a reveal. */
  suspense: 'Suspense_Music.mp3',
  throwingBread: 'Throwing_Bread_Audio.mp3',
  woodenBridgeCollapse: 'Wooden_Bridge_Collapse_Audio.mp3',
  wrongSelection: 'Wrong_Selection_Audio.mp3',
} as const

/**
 * What plays under each game's round, looped, from **Start!** to **Finish**.
 *
 * A game missing from here plays in silence - see the list of what is still to
 * be sourced in `MODULE.md`. The screen drives it, not the game: it starts on
 * the edge into `playing`, holds where it is on a pause, and stops on Finish,
 * so no game has a line of code about its own music unless the music is part
 * of the rules - see `muteRoundMusic`.
 */
export const ROUND_MUSIC: Partial<Record<MinigameId, string>> = {
  'zombie-tag': 'Zombie_Tag_Music.mp3',
  'messy-maze': 'Messy_Maze_Music.mp3',
  'probable-stop': 'Probable_Stop_Music.mp3',
  'duck-hunt': 'Duck_Hunt_Music.mp3',
  'pet-race': 'Pet_Race_Music.mp3',
  'feeding-time': 'Feeding_Time_Music.mp3',
  'punch-buggy': 'Punch_Buggy_Music.mp3',
  'time-it': 'Time_It_Music.mp3',
  'wack-attack': 'Wack_Attack_Music.mp3',
  'lady-luck': 'Lady_Luck_Music.mp3',
  'make-the-cut': 'Make_The_Cut_Music.mp3',
  'hes-one-shot': 'Hes_One_Shot_Music.mp3',
  'wheres-midnight': 'Wheres_Midnight_Music.mp3',
  'i-see-the-light': 'I_See_the_Light_Music.mp3',
  'helping-dad': 'Helping_Dad_Music.mp3',
  'synchronize-steps': 'Synchronize_Steps_Music.mp3',
  'keyboard-warrior': 'Keyboard_Warrior_Music.mp3',
  'chef-caricature': 'Chef_Caricature_Music.mp3',
}

/** Music sits under the cues, and both sit under the screen's own voice. */
export const MUSIC_VOLUME = 0.35
export const CUE_VOLUME = 0.6

/** How loud, against the file's own level. Interface, so under the game. */
export const SCREEN_VOLUME = 0.55

const players = new Map<string, HTMLAudioElement>()

function playerFor(id: string): HTMLAudioElement | null {
  const had = players.get(id)
  if (had) return had
  if (typeof Audio !== 'function') return null
  try {
    const made = new Audio(assetUrl(id))
    made.preload = 'auto'
    made.volume = SCREEN_VOLUME
    players.set(id, made)
    return made
  } catch {
    return null
  }
}

/**
 * Plays one from the top, whatever it was doing.
 *
 * Rewound rather than started, so pressing restart during the three-two-one
 * gets a countdown from the beginning rather than nothing at all.
 */
export function playOnce(id: string): void {
  const player = playerFor(id)
  if (!player) return
  try {
    player.currentTime = 0
    // A browser nobody has clicked in yet refuses, and that is not an error
    // worth having: the sound is missed and the round carries on.
    void player.play()?.catch(() => {})
  } catch {
    // Some environments have `Audio` and no media stack behind it.
  }
}

const held = new Set<HTMLAudioElement>()

/**
 * Pauses whichever of them is going, where it stands, or carries it on.
 *
 * For the pause card: the three-two-one is voiced, and a round stopped on "two"
 * that went on saying "one, start" behind the card would be a card that lied.
 * Only what was actually cut off is carried on - a sound that had already
 * finished is not played again on resume.
 */
export function holdScreenSounds(hold: boolean): void {
  if (hold) {
    for (const player of players.values()) {
      try {
        if (!player.paused && !player.ended) {
          player.pause()
          held.add(player)
        }
      } catch {
        // As below.
      }
    }
    return
  }
  for (const player of held) {
    try {
      void player.play()?.catch(() => {})
    } catch {
      // As below.
    }
  }
  held.clear()
}

/** Stops one of them, if it is going. For the podium music, when the podium goes. */
export function stopOne(id: string): void {
  const player = players.get(id)
  if (!player) return
  held.delete(player)
  try {
    player.pause()
    player.currentTime = 0
  } catch {
    // As below.
  }
}

/** Stops whichever of them is going. For leaving a round part way through one. */
export function stopScreenSounds(): void {
  stopCues()
  stopRoundMusic()
  held.clear()
  for (const player of players.values()) {
    try {
      player.pause()
      player.currentTime = 0
    } catch {
      // As above.
    }
  }
}

/** Throws the loaded sounds away. For tests, which must not leak one into the next. */
export function forgetScreenSounds(): void {
  stopScreenSounds()
  players.clear()
  pools.clear()
  loops.clear()
  music = null
  musicId = null
}

// ---------------------------------------------------------------------------
// Cues: a game's own sound effects.
//
// Unlike the screen's sounds these overlap - two balloons popping in the same
// frame are two pops - so each file keeps a few elements and hands out
// whichever is free, rather than rewinding the one it has.

/** How many of one cue may sound at once. More than this and the oldest is cut. */
const VOICES = 6

const pools = new Map<string, { voices: HTMLAudioElement[]; next: number }>()

function voiceFor(id: string): HTMLAudioElement | null {
  let pool = pools.get(id)
  if (!pool) {
    pool = { voices: [], next: 0 }
    pools.set(id, pool)
  }
  const free = pool.voices.find((v) => v.paused || v.ended)
  if (free) return free
  if (pool.voices.length < VOICES) {
    if (typeof Audio !== 'function') return null
    try {
      const made = new Audio(assetUrl(id))
      made.preload = 'auto'
      pool.voices.push(made)
      return made
    } catch {
      return null
    }
  }
  const oldest = pool.voices[pool.next % pool.voices.length]
  pool.next += 1
  return oldest
}

/**
 * Plays a sound effect from the top, over whatever else is playing.
 *
 * Pass one of `CUES`. A list - `CUES.dadYelling` - plays one of them, chosen
 * by `pick`, which is any whole number the caller has to hand (a count of how
 * many times it has happened is the usual one). Chosen that way rather than at
 * random so every screen in the lobby hears the same line.
 */
export function playCue(id: string | readonly string[], volume = CUE_VOLUME, pick = 0): void {
  const file = typeof id === 'string' ? id : id[Math.abs(Math.trunc(pick)) % id.length]
  if (!file) return
  const voice = voiceFor(file)
  if (!voice) return
  try {
    voice.volume = Math.max(0, Math.min(1, volume))
    voice.loop = false
    voice.currentTime = 0
    void voice.play()?.catch(() => {})
  } catch {
    // As above.
  }
}

const loops = new Map<string, HTMLAudioElement>()

/**
 * Keeps a sound going for as long as `on` is true, and stops it when it is not.
 *
 * For the held ones: a pencil on paper for as long as you are drawing, a
 * winding clock for as long as the button is down. Only acts on a change, so it
 * is safe to call with the same answer every frame. Fold `paused` into `on`: a
 * held sound is the game's, and a paused game is silent.
 */
export function loopCue(id: string, on: boolean, volume = CUE_VOLUME): void {
  let player = loops.get(id)
  if (!on) {
    if (player && !player.paused) {
      try {
        player.pause()
        player.currentTime = 0
      } catch {
        // As above.
      }
    }
    return
  }
  if (!player) {
    if (typeof Audio !== 'function') return
    try {
      player = new Audio(assetUrl(id))
      player.preload = 'auto'
      player.loop = true
      loops.set(id, player)
    } catch {
      return
    }
  }
  if (!player.paused) return
  try {
    player.volume = Math.max(0, Math.min(1, volume))
    void player.play()?.catch(() => {})
  } catch {
    // As above.
  }
}

/** Silences every cue and every held sound. The screen calls it on the way out. */
export function stopCues(): void {
  for (const player of loops.values()) {
    try {
      player.pause()
      player.currentTime = 0
    } catch {
      // As above.
    }
  }
  for (const pool of pools.values()) {
    for (const voice of pool.voices) {
      try {
        voice.pause()
      } catch {
        // As above.
      }
    }
  }
}

/**
 * Plays a cue whenever `key` changes - but not on the first render.
 *
 * The shape nearly every game wants: the state every screen in the lobby is
 * sent already has a count of pops, a list of who is out, a turn number. A cue
 * on the edge of that is heard by everybody at once, host and guest, from the
 * same line of code, with nothing extra on the wire. `when` gates it - pass
 * `false` for a change that should be silent, a count going back to zero on a
 * restart, say.
 */
export function useCueOnChange(
  id: string | readonly string[],
  key: unknown,
  when = true,
  volume = CUE_VOLUME,
  pick = 0,
): void {
  const was = useRef(key)
  useEffect(() => {
    if (Object.is(was.current, key)) return
    was.current = key
    if (when) playCue(id, volume, pick)
  }, [key]) // Only the key is the edge; the rest are read as they are at that moment.
}

/**
 * Keeps `loopCue` running for exactly as long as `on`, and stops it for good
 * when the component goes. The hook form, so a game cannot leave a loop behind.
 */
export function useLoopCue(id: string, on: boolean, volume = CUE_VOLUME): void {
  useEffect(() => {
    loopCue(id, on, volume)
  }, [id, on, volume])
  useEffect(() => () => loopCue(id, false), [id])
}

// ---------------------------------------------------------------------------
// Round music: one looped track under a game, driven by the screen.

let music: HTMLAudioElement | null = null
let musicId: string | null = null
let musicMuted = false
let musicWanted: 'play' | 'hold' | 'stop' = 'stop'

/**
 * What the round's music should be doing: `play` it, `hold` it where it is, or
 * `stop` it and rewind. Called by the screen on every change of phase or
 * pause. A different `id`, or `restart`, starts the track from the top.
 */
export function driveRoundMusic(id: string | null, want: 'play' | 'hold' | 'stop', restart = false): void {
  if (!id) {
    stopRoundMusic()
    return
  }
  if (musicId !== id || restart) {
    stopRoundMusic()
    musicId = id
    if (!music) {
      if (typeof Audio !== 'function') return
      try {
        music = new Audio()
        music.loop = true
        music.preload = 'auto'
      } catch {
        return
      }
    }
    try {
      music.src = assetUrl(id)
      music.volume = MUSIC_VOLUME
    } catch {
      // As above.
    }
  }
  musicWanted = want
  if (want === 'stop') musicMuted = false
  applyMusic()
}

function applyMusic(): void {
  if (!music) return
  try {
    if (musicWanted === 'play' && !musicMuted) {
      if (music.paused) void music.play()?.catch(() => {})
    } else if (musicWanted === 'stop') {
      music.pause()
      music.currentTime = 0
    } else {
      music.pause()
    }
  } catch {
    // As above.
  }
}

/**
 * Stops the round's music where it is, or lets it carry on.
 *
 * For a game whose music is part of the rules - Musical Mayhem's tune stopping
 * is the signal to sit, and I See The Light goes quiet on red. The screen still
 * decides whether there is a round to play music under at all; this only
 * silences it inside one. Forgotten whenever the round's music stops.
 */
export function muteRoundMusic(muted: boolean): void {
  if (musicMuted === muted) return
  musicMuted = muted
  applyMusic()
}

/** Stops it, rewinds it, and forgets any mute a game left on. */
export function stopRoundMusic(): void {
  musicMuted = false
  musicWanted = 'stop'
  if (!music) return
  try {
    music.pause()
    music.currentTime = 0
  } catch {
    // As above.
  }
}

/**
 * A button's click, then whatever the button does.
 *
 * For the screen's own buttons - back, close, the tabs, the pause card's. A
 * game's buttons are the game's to voice. `sound` is the click unless the
 * button is choosing a game, which has a sound of its own.
 */
export function clicked(then: () => void, sound: string = MENU_CLICK_SOUND): () => void {
  return () => {
    playCue(sound)
    then()
  }
}
