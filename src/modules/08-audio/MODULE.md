# 08-audio

## What this is

The sounds the body makes: a footstep, a jump, a landing, a swim stroke. It
reads the player's state and plays; it changes nothing about the world and
knows nothing about the music.

When a sound fires is decided by `internal/cues.ts`, which is pure — no audio,
no browser, no timers — so "does a footstep fire once per step" is a question
with an answer that can be checked in Node rather than one you find out by
listening for a while.

## Public contract

| Export | Meaning |
| --- | --- |
| `AudioCues` | The scene entry. Renders nothing; drives the engine once a frame |
| `stepCues(state, walker, dt)` | Which cues to play this frame. Pure |
| `createCueState()` | A fresh cue state |
| `strideFor(speed)` | Metres between footsteps at that pace. Pure |
| `CUES` | Stride, stroke interval, landing threshold |
| `CueEngine` | The Web Audio wrapper: load, play, volume |
| `SOUNDS` | Which file, how loud, how much pitch wobble, per cue |
| `pitchFor(wobble, random)` | The playback rate for one play. Pure |
| `clampVolume(v)` | `0`–`1`, or the default if handed nonsense |
| `getCueEngine()` / `setEffectsVolume(v)` / `readStoredVolume()` | For the panel |
| `addWalker(id, source)` / `removeWalker(id)` | Register somebody else to hear |
| `spatialFor(listener, forward, source)` | How loud and which ear. Pure |
| `CueEngine.playAt(name, gain, pan)` | One cue, placed |
| `CueName`, `CueState`, `Walker`, `CueSound` | The shapes above |

`Walker` is a subset of the player's state — position, `vy`, `grounded`,
`swimming`, `speed` — so anything that moves could make these noises, not only
the player.

## Invariants you may rely on

- **Footsteps are spaced by distance, not by time**, with the remainder carried
  between frames, so the cadence does not change with the frame rate. There is
  a test comparing thirty frames against six hundred over the same ground.
- **Running lengthens the stride** rather than taking the same steps faster, so
  a sprint is *fewer* footsteps over the same ground.
- **Nothing fires while airborne or swimming.**
- **A jump and a landing fire exactly once each**, and walking off a ledge is
  not a jump — the difference is which way you are going.
- **Every cue is idempotent per event.** Every rule in here exists because some
  state change fires twice otherwise; see below.
- **Nothing here can stop the game.** No Web Audio, a file that will not
  decode, or a context the browser has not unlocked all end in silence and a
  console line.
- **Volume is always a real number between 0 and 1.** It comes from
  `localStorage`, which can hold anything, and a playback rate of zero throws.

## Deliberate non-goals

- **No positional audio for your own sounds.** Yours play centred and at full
  volume, because they are your own feet. Other people's are placed - see
  below - but that is a stereo pan and a distance curve, not a real 3D panner.
- **No ambience.** Wind, surf and birds are a soundscape, not a cue, and want
  looping and crossfading this does not have.
- **No sounds for anything but the body.** Nothing for the water surface, the
  weather, the shore, or the UI.
- **No variation packs.** One file per cue, pitched about, rather than five
  footstep samples chosen at random.
- **No mixing with the music.** Two independent volumes, no ducking.

## Why Web Audio here and `<audio>` for the music

The opposite choice to `05-music`, for the opposite reason.

An `<audio>` element cannot play the same file twice at once — a second
footstep restarts the first — and it has latency you can hear on a sound meant
to land with a foot. Web Audio decodes once and every play after that is a
fresh, free source node.

Music has the reverse needs: one long file, streamed rather than held decoded
in memory, and nothing overlapping. Six megabytes decoded into an
`AudioBuffer` is a great deal of memory for something an audio element streams
for nothing.

Web Audio also gets pitch variation, which is most of what stops four identical
footsteps in a row sounding like a machine.

## Hearing other people

`09-net` registers each peer through `addWalker`, and this module runs a
separate cue machine for each of them off their interpolated position. It never
learns that a network exists: a walker is a walker.

Placing the sound is `spatialFor`, which is pure and therefore tested, because
"is the duck on my left actually in my left ear" is one sign away from being
wrong and very annoying once heard. **Screen-right is `cross(forward, up)`,
which is `(-forward.z, forward.x)`** - the same derivation the movement basis
uses, which has been wrong in this project once already, so it is checked
against that basis at every angle rather than reasoned about again.

The listener is the **camera**, not the body. In first person they are the same
thing; in third person you hear what you are looking at, which is what people
expect.

`AUDIO.hearing` is short on purpose. Footsteps carry a few metres in life, and
a lobby where everyone hears everyone sounds like a stampede.

A gain node and a stereo panner rather than a full `PannerNode`: a panner wants
the listener's orientation maintained in the audio graph every frame, and for
footsteps on a flat beach the extra realism is not detectable. A browser
without `createStereoPanner` loses the panning and keeps the sound.

## The hard part is not playing three

Every rule in `cues.ts` exists because some state change fires twice otherwise:

- **`landSpeed`** — walking downhill, the player's ground reach catches the
  body every single frame, which looks exactly like a landing each time. Only a
  real fall is a thud.
- **Swimming is handled before grounded** — swimming is not grounded, so wading
  ashore looks like a landing unless the swimming branch comes first.
- **The step counter resets on landing** — otherwise a long jump lands owing a
  footstep for the distance flown, and every jump ends in a double thud.
- **Losing the walker resets everything** — the player module can be switched
  off mid-stride, and coming back must not fire a step for the distance across
  the island.

## Known limitations

- Remote players' sounds are stereo-placed, not truly spatial: no height, no
  occlusion, and no difference between someone behind you and someone in front.
- A remote player's cues are driven from their interpolated position, so their
  footsteps are as far behind live as their duck is - about 120 ms.
- One footstep sound for every surface. Sand, wet sand and dune are the same.
- The stroke is on a fixed beat rather than tied to any animation, because
  there is no swimming animation to tie it to.
- No fade or filter underwater.
- `maxVoices` caps each cue at six at once. Nothing gets near it in practice.

## How to review

- **Walk.** A footstep every stride, evenly spaced, not a machine gun and not
  every other step.
- **Hold shift and run.** The steps should space *out*, not speed up.
- **Walk downhill, then run down the steepest dune you can find.** Steps the
  whole way, and **no thudding** — the landing sound must not fire repeatedly
  on a slope.
- **Jump.** One jump sound going up, one landing coming down. Not two of
  either, and nothing while in the air.
- **Jump on the spot repeatedly.** Still exactly one of each per jump.
- **Walk into the sea.** Footsteps stop, strokes start, and there is **no thud**
  at the moment you start swimming or when you wade back out.
- **Float still in deep water.** Silence — you only stroke when going somewhere.
- **Listen to four steps in a row.** They should not be identical; the pitch
  moves about.
- **Drag the effects volume to zero**, then reload — it should come back
  silent, and the music should be unaffected either way.
- **Load the page and listen before clicking anything.** Silence is correct;
  browsers will not make noise before a gesture. The panel says so.
- **Walk near another player in a lobby.** Their footsteps should be quiet,
  and in the right ear: walk a circle round them and the sound should cross
  from one side to the other.
- **Walk away from them.** It should fade out smoothly rather than stopping.
- **Switch the module off in the panel.** Everything else carries on.

## Gate record

Filled in when the human passes it.

## Measured

Filled in from the perf HUD at gate time.
