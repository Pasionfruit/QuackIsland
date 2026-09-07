# 05-music

## What this is

A background playlist that runs continuously, and a small panel in the top
right to drive it: back, play/pause, skip, and a volume slider.

It owns one `HTMLAudioElement` and nothing in the world. No positional sound,
no reaction to anything on screen, no place in the scene registry — it is DOM,
so `src/App.tsx` renders it beside the debug panel rather than the canvas
drawing it.

Everything decidable without a browser lives in `internal/playlist.ts` with no
audio element in it, so the ordering, the back button, the volume clamp and the
readout are all tested in Node.

## Public contract

| Export | Meaning |
| --- | --- |
| `MusicPlayer` | The panel. Rendered from `src/App.tsx` |
| `nextIndex(i, count)` | The next track, wrapping. Pure |
| `previousIndex(i, count)` | The previous track, wrapping. Pure |
| `stepBack(i, count, position, window?)` | Where the back button lands. Pure |
| `clampVolume(v)` | `0`–`1`, or the default if handed nonsense |
| `formatTime(seconds)` | `m:ss`, or `-:--` when not yet known |
| `trackLabel(track)` | `Artist - Title`, or just the title |
| `parseTracks(raw)` | A fetched manifest into a track list. Never throws |
| `MUSIC` | Manifest path, default volume, restart window, storage key |
| `Track` | `{ src, title, artist }` |

`Track.src` is relative to the asset base and resolved with `assetUrl`, so the
audio can move to a CDN without touching this module.

## Invariants you may rely on

- **The playlist never ends.** It wraps at both ends, so it runs as long as the
  page is open.
- **Nothing here can stop the game.** A missing manifest, a malformed one, or a
  track that will not play are all logged and worked around. `parseTracks`
  returns a shorter list rather than throwing.
- **A broken playlist stops rather than spins.** If every track in turn fails
  to play, it gives up instead of racing through the list forever.
- **The back button behaves like every other music player.** Past
  `MUSIC.restartWindow` seconds it restarts the current track; before that it
  goes to the previous one. Back once for the top of this song, twice for the
  one before.
- **Volume is always a real number between 0 and 1.** It is read from
  `localStorage`, which can hold anything at all, and setting `volume` to `NaN`
  throws in the browser.
- **The volume is remembered** between sessions, and its absence is not an
  error — a private window simply starts at the default.

## Deliberate non-goals

- **No positional or diegetic audio.** This is background music, not a sound in
  the world: it must not pan or duck as the camera turns. That is why it is a
  plain audio element rather than the Web Audio API or three's `Audio`.
- **No sound effects.** Footsteps, water and wind belong to a module that can
  see the world; this one cannot and should not.
- **No crossfading or ducking.** Tracks butt up against each other.
- **No shuffle, no repeat-one, no visible queue.** One order, straight through,
  forever.
- **No seeking.** The bar is a readout, not a scrubber.
- **No metadata beyond the filename.** No ID3 parsing, no cover art.
- **No streaming from anywhere but the assets folder.**

## How to add a song

Drop it in `public/assets/music/` and run:

```
npm run music:scan
```

That rewrites `public/assets/music/tracks.json` from whatever is in the folder.
Nothing in `src/` changes, which is the point — see below.

Filenames are read as `Artist - Title (source).mp3`; the credit in brackets is
stripped for display, and a name that does not match that shape is used whole
as the title. Tracks play in filename order, sorted, so the order does not
depend on what the filesystem happens to return.

There is a test that fails if the folder and the manifest disagree, because
dropping a file in and forgetting to rescan is otherwise a song that silently
never plays.

## Why the manifest is data, fetched at runtime

The obvious alternative is generating a `tracks.ts` inside this module. Under
the freeze rule that is exactly wrong: adding a song would be a change to a
frozen module, needing a formal unfreeze and a re-verification of every
dependent, for a new mp3.

Keeping it as JSON next to the audio means the playlist is **content**, not
code. Adding a song touches no module source at all.

The cost is a fetch, an empty playlist for the first moment, and having to
treat the response as untrusted — which `parseTracks` does.

## The autoplay policy

Browsers will not make a noise before the page has been interacted with, and
they refuse by rejecting the promise from `play()` rather than by throwing.

So: it tries to play as soon as the playlist arrives. If that is refused, it
says `click to start` in the panel and arms a one-shot listener for the first
`pointerdown` or `keydown` anywhere, then tries again. In practice the music
starts the moment you click into the world, which is also the moment you would
want it to.

## Known limitations

- **The whole playlist is committed to the repository** — about 23 MB of audio.
  Fine now; `assetUrl` is the seam that moves it to a CDN when it is not.
- The track title is whatever the filename says. Rename the file and the
  display name changes.
- No gapless playback: there is a small pause between tracks while the next one
  loads.
- The progress bar updates on `timeupdate`, which browsers fire about four
  times a second, so it moves in visible steps.
- Only one player can exist at a time in any useful sense — two would be two
  audio elements playing over each other.

## How to review

- **Load the page and click into the world.** Music should start on its own, or
  on that first click if the browser held it back. The panel says `click to
  start` while it is waiting.
- **Let a track run out.** The next one should start by itself, and the counter
  should tick over.
- **Skip through the whole list.** It should wrap round to the first track
  rather than stopping at the end.
- **Press back mid-song.** It should restart the song. **Press back twice
  quickly** — the second press should go to the previous track, and from the
  first track it should wrap to the last.
- **Pause and play.** Resuming must continue from where it stopped, not restart
  the track.
- **Drag the volume slider**, including all the way to zero. Then **reload the
  page** — it should come back at the volume you left it.
- **Check the panel does not cover the debug panel** and that neither has moved
  off the corner.
- **Play with the game while music runs.** Walking, swimming and the day
  slider should all behave exactly as before; the frame time in the perf HUD
  should not move.
- Try it with the assets folder renamed, if you want to see it fail: the game
  should run in silence with a console message, not break.

## Gate record

Filled in when the human passes it.

## Measured

Filled in from the perf HUD at gate time.
