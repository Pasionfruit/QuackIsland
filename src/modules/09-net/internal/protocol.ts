/**
 * What goes over the wire, and what a lobby code is.
 *
 * The relay in `server/relay.mjs` deliberately does **not** know any of this.
 * It knows rooms and it knows how to pass a message to everyone else in one;
 * the shape of a duck is entirely the client's business. That is what keeps
 * the server at a hundred lines that never need to change as the game grows,
 * and it is why this file is not shared with it.
 *
 * Everything here is pure and validating. Messages arrive from other people's
 * browsers, which is to say from anywhere, so nothing is trusted: a malformed
 * packet produces `null`, never an exception and never a duck at NaN.
 */

/** Characters a code is drawn from: no O/0, no I/1, no confusable pairs. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const CODE_LENGTH = 5

export const NET = {
  /** How often a player's own state goes out, in hertz. */
  sendRate: 15,
  /**
   * How far behind live the remote ducks are drawn, in seconds.
   *
   * Rendering in the past is what buys smooth movement out of updates arriving
   * fifteen times a second: there is always a packet on each side of the
   * moment being drawn, so it is an interpolation rather than a guess.
   */
  delay: 0.12,
  /** A peer silent for this long has gone, whatever the socket thinks. */
  timeout: 8,
  /** Snapshots kept per peer. A second's worth is plenty to interpolate in. */
  history: 24,
  /** How often the host sends the world's clock and weather, in hertz. */
  worldRate: 1,
  /**
   * How far a guest's clock may drift from the host's before it is snapped
   * rather than eased, as a fraction of a day.
   *
   * Small differences are worth easing out - a snap is visible as a jump in
   * the light. A large one means the guest has only just arrived, or the host
   * scrubbed the slider, and easing across half a day would be a slow sunrise
   * going the wrong way.
   */
  daySnap: 0.02,
  /** How much of the remaining difference is corrected per second. */
  dayCatchUp: 2.5,
  /** How often a round trip is measured to each peer, in hertz. */
  pingRate: 0.5,
  /** How much of the new reading to keep. Low, because one packet is noisy. */
  pingSmoothing: 0.35,
} as const

/**
 * One player, as it goes over the wire.
 *
 * Deliberately small and deliberately flat: this is sent fifteen times a
 * second per player, and every field has to earn its place.
 */
export interface DuckState {
  x: number
  y: number
  z: number
  /** Radians. */
  facing: number
  /** 0 upright, 1 flat. */
  lean: number
  swimming: boolean
  /** Metres per second, so a remote duck can be animated later. */
  speed: number
}

export interface Peer {
  id: string
  name: string
  state: DuckState
}

/** The clock and the weather, as the host sees them. */
export interface WorldState {
  /** A turn of the day cycle, 0 to 1. */
  day: number
  /** How fast the host is running the clock. */
  scale: number
  running: boolean
  /** A `WeatherKind`, kept as a string so this file does not depend on core. */
  weather: string
}

/**
 * Who is in charge of the clock.
 *
 * The lowest id in the room, which needs no election, no messages and no
 * tie-breaking: everybody has the same list, so everybody reaches the same
 * answer, and when the host leaves the next one takes over on its own.
 *
 * Ids are `p1`, `p2`, ... so they are compared as numbers. Sorting them as
 * text would put `p10` before `p2` and hand the room to whoever happened to be
 * tenth.
 */
export function isHost(myId: string | null, peerIds: Iterable<string>): boolean {
  if (!myId) return false
  const mine = idNumber(myId)
  for (const other of peerIds) {
    if (other === myId) continue
    if (idNumber(other) < mine) return false
  }
  return true
}

function idNumber(id: string): number {
  const digits = id.replace(/[^0-9]/g, '')
  const value = Number.parseInt(digits, 10)
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER
}

/**
 * A round trip, in milliseconds, smoothed.
 *
 * Measured peer to peer through the relay rather than to the relay itself,
 * because that is the number that matters: it is how far behind you are
 * seeing somebody, and the relay has nothing to say about that.
 *
 * Smoothed because a single packet is noisy enough to make a readout flicker
 * between forty and ninety and look broken.
 */
export function smoothPing(previous: number | null, sample: number): number {
  if (!Number.isFinite(sample) || sample < 0) return previous ?? 0
  const capped = Math.min(9999, sample)
  if (previous === null) return capped
  return previous + (capped - previous) * NET.pingSmoothing
}

export function encodeWorld(world: WorldState): string {
  return JSON.stringify({
    t: 'world',
    d: Math.round(world.day * 1e5) / 1e5,
    sc: world.scale,
    r: world.running,
    w: world.weather,
  })
}

/**
 * Reads a world update, or `null` if it is not one.
 *
 * As untrusted as everything else off the wire: a day outside 0 to 1, a
 * negative time scale or a weather nobody has heard of would all be applied
 * straight into the lighting otherwise.
 */
export function decodeWorld(raw: unknown, knownWeather: readonly string[]): WorldState | null {
  if (typeof raw !== 'string') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const message = parsed as Record<string, unknown>
  if (message.t !== 'world') return null

  const day = typeof message.d === 'number' && Number.isFinite(message.d) ? message.d : null
  if (day === null || day < 0 || day > 1) return null

  const scale = typeof message.sc === 'number' && Number.isFinite(message.sc) ? message.sc : 1
  const weather = typeof message.w === 'string' && knownWeather.includes(message.w) ? message.w : null
  if (!weather) return null

  return {
    day,
    scale: Math.min(3600, Math.max(0, scale)),
    running: message.r === true,
    weather,
  }
}

/**
 * How far to move a guest's clock towards the host's, this frame.
 *
 * The day is a turn, so it wraps: a host at 0.99 and a guest at 0.01 are two
 * hundredths apart, not ninety-eight. Getting that wrong sends the guest
 * backwards through a whole day every time midnight passes.
 */
export function dayCorrection(mine: number, theirs: number, dt: number): number {
  let diff = theirs - mine
  if (diff > 0.5) diff -= 1
  if (diff < -0.5) diff += 1
  if (Math.abs(diff) >= NET.daySnap) return diff
  return diff * Math.min(1, dt * NET.dayCatchUp)
}

/** A lobby code, or null if what was typed is not one. */
export function normaliseCode(input: string): string | null {
  const code = input.trim().toUpperCase()
  if (code.length !== CODE_LENGTH) return null
  for (const character of code) {
    if (!CODE_ALPHABET.includes(character)) return null
  }
  return code
}

/**
 * A fresh code.
 *
 * `crypto.getRandomValues` rather than the world's seeded generator: a lobby
 * code is not part of the world and must *not* be reproducible - two people
 * opening the game should not be handed the same room.
 */
export function makeCode(random: (n: number) => number[] = cryptoBytes): string {
  const bytes = random(CODE_LENGTH)
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  }
  return code
}

function cryptoBytes(n: number): number[] {
  const out = new Uint8Array(n)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(out)
  } else {
    // Only reachable in an environment with no crypto at all. A code that is
    // merely unlikely to collide is better than throwing.
    for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256)
  }
  return Array.from(out)
}

/** Trims a display name to something that will fit above a duck. */
export function cleanName(input: string): string {
  const name = input.replace(/[ -]/g, '').trim().slice(0, 16)
  return name.length > 0 ? name : 'duck'
}

/**
 * `colour` rides along with the name, and for the same reason: it changes
 * rarely, and a peer who hears a different one simply repaints you. Left out
 * when there is none, so the packet is the size it always was.
 */
export function encodeState(name: string, state: DuckState, colour?: string): string {
  return JSON.stringify(
    colour ? { t: 'duck', name, c: colour, s: round(state) } : { t: 'duck', name, s: round(state) },
  )
}

/** Six decimals is a thousandth of a millimetre, and halves the packet size. */
function round(state: DuckState): DuckState {
  const to = (v: number) => Math.round(v * 1e3) / 1e3
  return {
    x: to(state.x),
    y: to(state.y),
    z: to(state.z),
    facing: to(state.facing),
    lean: to(state.lean),
    swimming: state.swimming,
    speed: to(state.speed),
  }
}

export interface DuckMessage {
  type: 'duck'
  name: string
  /** `#rrggbb`, or null when the sender did not say - drawn the default red. */
  colour: string | null
  state: DuckState
}

/**
 * Reads a relayed message.
 *
 * Returns `null` for anything that is not a well-formed duck update - which
 * includes anything hostile. A remote player can put whatever they like on the
 * wire; they cannot put a duck at infinity in your world.
 */
export function decodeMessage(raw: unknown): DuckMessage | null {
  if (typeof raw !== 'string') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const message = parsed as Record<string, unknown>
  if (message.t !== 'duck') return null

  const s = message.s
  if (!s || typeof s !== 'object') return null
  const raws = s as Record<string, unknown>

  const state: DuckState = {
    x: finite(raws.x),
    y: finite(raws.y),
    z: finite(raws.z),
    facing: finite(raws.facing),
    lean: Math.min(1, Math.max(0, finite(raws.lean))),
    swimming: raws.swimming === true,
    speed: Math.min(100, Math.max(0, finite(raws.speed))),
  }
  // Somewhere in the world, not out at a million metres where the float
  // precision goes and the camera follows it.
  if (Math.abs(state.x) > 5000 || Math.abs(state.z) > 5000 || Math.abs(state.y) > 5000) return null

  return {
    type: 'duck',
    name: cleanName(typeof message.name === 'string' ? message.name : ''),
    // Only ever a plain hex colour. Anything else off the wire is ignored
    // rather than handed to a material.
    colour: typeof message.c === 'string' && /^#[0-9a-f]{6}$/i.test(message.c) ? message.c : null,
    state,
  }
}

function finite(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
