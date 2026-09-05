/**
 * Static character portraits for the select screen - one painted card per
 * fighter, cropped from src/Character_Player_Cards.png, src/Initial_Characters.png
 * or a character's own reference sheet. These are a different piece of art
 * from the in-match sprites in sprites.ts: a portrait is a single still image
 * with its own painted background, meant for a small "who is this" card, not
 * something drawn frame-by-frame with a transparent background over the
 * arena floor.
 */

// Vite resolves this at build time, so a new portrait is just a matter of
// dropping the file in - no registry to update.
let urls: Record<string, string> = {}
try {
  urls = import.meta.glob('./portraits/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
} catch {
  urls = {}
}

/** The portrait URL for a character, or null to fall back to the procedural rig. */
export function portraitFor(charId: string): string | null {
  return urls[`./portraits/${charId}.webp`] ?? null
}
