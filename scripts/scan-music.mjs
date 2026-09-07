/**
 * Rebuilds the playlist manifest from whatever is in public/assets/music.
 *
 * The manifest is data next to the audio rather than a source file inside the
 * module, which matters under the freeze rule: adding a song is dropping a
 * file in and running this, and it never touches module source. A generated
 * `tracks.ts` would make every new song a change to a frozen module.
 *
 *   node scripts/scan-music.mjs        # rewrite the manifest
 *   node scripts/scan-music.mjs --check # fail if it is out of date
 *
 * Titles come from the filename, which is the only metadata there is without
 * parsing ID3 frames. The convention is "Artist - Title (source).mp3"; a name
 * that does not match is used whole, as the title, with no artist.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'public/assets/music'
const MANIFEST = join(DIR, 'tracks.json')
const AUDIO = /\.(mp3|ogg|m4a|wav|flac)$/i

/** Strips the extension and any trailing "(something.com)" credit. */
function readName(file) {
  const bare = file.replace(AUDIO, '').replace(/\s*\([^)]*\)\s*$/, '').trim()
  const dash = bare.indexOf(' - ')
  if (dash === -1) return { artist: '', title: bare }
  return { artist: bare.slice(0, dash).trim(), title: bare.slice(dash + 3).trim() }
}

const files = readdirSync(DIR)
  .filter((f) => AUDIO.test(f))
  // Sorted, so the playlist order is the same for everyone and does not depend
  // on what the filesystem feels like returning.
  .sort((a, b) => a.localeCompare(b, 'en'))

const tracks = files.map((file) => ({
  // Relative to the assets base, because the module resolves it with assetUrl.
  src: `music/${file}`,
  ...readName(file),
}))

const json = `${JSON.stringify({ tracks }, null, 2)}\n`

if (process.argv.includes('--check')) {
  let current = ''
  try {
    current = readFileSync(MANIFEST, 'utf8')
  } catch {
    current = ''
  }
  if (current.replace(/\r\n/g, '\n') !== json) {
    console.error(`music manifest is out of date - run: node scripts/scan-music.mjs`)
    process.exit(1)
  }
  console.log(`music manifest matches ${tracks.length} tracks`)
} else {
  writeFileSync(MANIFEST, json)
  console.log(`wrote ${MANIFEST} with ${tracks.length} tracks`)
  for (const t of tracks) console.log(`  ${t.artist || '(no artist)'} - ${t.title}`)
}
