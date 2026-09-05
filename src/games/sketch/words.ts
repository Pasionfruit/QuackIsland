/**
 * Word packets for Sketch. Scribble draws three at a time from the active
 * packets plus anything players have added; Phone uses the same pool to fill
 * in for anyone who leaves their starting prompt blank.
 */
export interface WordPacket {
  id: string
  name: string
  words: string[]
}

export const WORD_PACKETS: WordPacket[] = [
  {
    id: 'camp',
    name: 'Camp',
    words: [
      'campfire',
      'tent',
      's\'mores',
      'canoe',
      'sleeping bag',
      'lantern',
      'marshmallow',
      'raccoon',
      'fishing rod',
      'compass',
      'backpack',
      'flashlight',
      'hiking boot',
      'mosquito',
      'firewood',
    ],
  },
  {
    id: 'animals',
    name: 'Animals',
    words: [
      'penguin',
      'octopus',
      'giraffe',
      'kangaroo',
      'hedgehog',
      'flamingo',
      'walrus',
      'platypus',
      'chameleon',
      'peacock',
      'otter',
      'sloth',
      'narwhal',
      'armadillo',
      'toucan',
    ],
  },
  {
    id: 'food',
    name: 'Food',
    words: [
      'pizza',
      'taco',
      'pancake',
      'watermelon',
      'sushi',
      'popcorn',
      'spaghetti',
      'donut',
      'hamburger',
      'pretzel',
      'avocado',
      'waffle',
      'sandwich',
      'cupcake',
      'burrito',
    ],
  },
  {
    id: 'everyday',
    name: 'Everyday',
    words: [
      'umbrella',
      'toothbrush',
      'bicycle',
      'ladder',
      'headphones',
      'suitcase',
      'calendar',
      'staircase',
      'mirror',
      'keyboard',
      'candle',
      'wristwatch',
      'skateboard',
      'binoculars',
      'wheelbarrow',
    ],
  },
  {
    id: 'wildcard',
    name: 'Wildcard',
    words: [
      'time travel',
      'haunted house',
      'robot uprising',
      'secret handshake',
      'invisible dog',
      'volcano wedding',
      'ninja accountant',
      'flying carpet',
      'pirate meeting',
      'dragon nap',
      'space cowboy',
      'underwater tea party',
      'giant hamster',
      'wizard traffic jam',
      'zombie book club',
    ],
  },
]

export function wordPacketById(id: string): WordPacket {
  return WORD_PACKETS.find((p) => p.id === id) ?? WORD_PACKETS[0]
}

/** All words from the given packets plus anything players have submitted. */
export function buildPool(packetIds: string[], custom: string[]): string[] {
  const pool = packetIds.flatMap((id) => wordPacketById(id).words)
  return [...pool, ...custom]
}

export function pickRandom(pool: string[], n: number, exclude: string[] = []): string[] {
  const available = pool.filter((w) => !exclude.includes(w))
  const out: string[] = []
  const bag = [...available]
  while (out.length < n && bag.length > 0) {
    const i = Math.floor(Math.random() * bag.length)
    out.push(bag[i])
    bag.splice(i, 1)
  }
  return out
}

// ------------------------------------------------------------- hangman

/** A word's letters, `_` for anything not yet revealed. Spaces stay visible. */
export function maskWord(word: string, revealed: Set<number>): string {
  return word
    .split('')
    .map((ch, i) => (ch === ' ' || ch === '\'' || revealed.has(i) ? ch : '_'))
    .join('')
}

/** Picks one more letter index to reveal, skipping spaces and punctuation. */
export function revealOneMore(word: string, revealed: Set<number>): Set<number> {
  const candidates: number[] = []
  for (let i = 0; i < word.length; i++) {
    if (word[i] !== ' ' && word[i] !== '\'' && !revealed.has(i)) candidates.push(i)
  }
  const next = new Set(revealed)
  if (candidates.length > 0) next.add(candidates[Math.floor(Math.random() * candidates.length)])
  return next
}

export function normalizeGuess(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ')
}
