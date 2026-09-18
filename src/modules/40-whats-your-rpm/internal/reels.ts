/**
 * What is on the reels, and on the ads.
 *
 * Nobody has time to watch any of it - that is rather the point - but a feed
 * of identical grey cards does not feel like a feed. So every reel has a
 * colour, a big picture, somebody's handle and a caption, and every ad is
 * selling something, all drawn from the seed so everybody scrolls past the
 * same ones. Pure data.
 */
import { createRng, hashSeed } from '../../00-core'

export interface Reel {
  /** Hue, 0 to 360, of the reel's background. */
  hue: number
  emoji: string
  handle: string
  caption: string
  likes: string
}

export interface AdCopy {
  emoji: string
  product: string
  pitch: string
  action: string
}

const EMOJI = ['🌋', '🦆', '🐈', '🍍', '🥥', '🏝️', '🐢', '🦀', '🍳', '🎧', '💃', '🛹', '🐶', '🍕', '🎸', '🧃', '🌮', '🐸', '🎯', '🧋', '🦩', '🐙', '🍩', '🎮']
const WHO = ['duckfluencer', 'lavalamp', 'coconut.tv', 'island_eats', 'sandyclaws', 'tiki.tok', 'volcano.vlogs', 'shellshock', 'palmreader', 'wave.check', 'krill.issue', 'beach.bum']
const CAPTIONS = [
  'POV: you said "one more reel" an hour ago',
  'wait for it…',
  'nobody:  absolutely nobody:  this duck:',
  'rating island snacks until I find a good one',
  'this took 47 tries 😭',
  'day 3 of learning the ukulele',
  'you will NOT believe what the volcano did',
  'part 2 because you asked',
  'is it just me or',
  'tell me you live on an island without telling me',
  'the ending 💀',
  'unpopular opinion: pineapple is fine',
  'how it started vs how it is going',
  'I tried the viral coconut hack',
  'no thoughts, just vibes',
  'get ready with me: lava edition',
  'rate my setup 1-10',
  'sound on 🔊',
  'this crab has more rizz than me',
  'follow for part 3',
]
const PRODUCTS: readonly AdCopy[] = [
  { emoji: '🧴', product: 'LavaBlock SPF 9000', pitch: 'Sunscreen for volcanoes', action: 'Shop now' },
  { emoji: '🦆', product: 'Duck Insurance', pitch: 'Because ducks happen', action: 'Get a quote' },
  { emoji: '📱', product: 'ReelCoach Pro', pitch: 'Scroll 40% faster. Doctors hate it.', action: 'Install' },
  { emoji: '🥥', product: 'CocoWater+', pitch: 'Now with extra coconut', action: 'Order now' },
  { emoji: '🏝️', product: 'Island Timeshare', pitch: 'Own 1/52nd of paradise', action: 'Learn more' },
  { emoji: '🎮', product: 'Crab Clash', pitch: 'Level 1 is impossible', action: 'Play free' },
  { emoji: '🍳', product: 'VolcanoChef', pitch: 'Cook eggs on real lava', action: 'Buy now' },
  { emoji: '🦀', product: 'PinchFit', pitch: 'The crab-inspired workout', action: 'Join now' },
]

/** Reel `index` of the feed with this seed. */
export function reelAt(seed: number, index: number): Reel {
  const random = createRng(hashSeed(seed, `whats-your-rpm:reel:${index}`))
  const pick = <T>(list: readonly T[]) => list[Math.floor(random() * list.length)]
  const likes = random() * random() * 900
  return {
    hue: Math.floor(random() * 360),
    emoji: pick(EMOJI),
    handle: `@${pick(WHO)}`,
    caption: pick(CAPTIONS),
    likes: likes >= 100 ? `${(likes / 100).toFixed(1)}M` : `${Math.max(1, Math.round(likes * 10))}K`,
  }
}

/** What ad `index` of the feed with this seed is selling. */
export function adCopyAt(seed: number, index: number): AdCopy {
  const random = createRng(hashSeed(seed, `whats-your-rpm:ad:${index}`))
  return PRODUCTS[Math.floor(random() * PRODUCTS.length)]
}
