# 06-sky

## What this is

What is above the island: a gradient dome with the sun, the stars and the cloud
in it, and whatever is falling out of it.

It **draws** the sky. It does not decide it. The time of day and the weather
both live in `00-core`, and this reads them — so the same weather that puts
cloud on the dome has already dimmed the sun on the ground, and the two cannot
disagree.

## Public contract

| Export | Meaning |
| --- | --- |
| `Sky` | Dome and precipitation together. Registered in `src/app/scene.ts` |
| `SkyDome` | Just the dome, if something ever wants it alone |
| `Precipitation` | Just the rain and snow |
| `domeFits(radius, fogFar, cameraFar)` | Whether the dome is sized to be seen. Pure |
| `cloudUv(x, y, z, height)` | Where a view direction lands on the cloud layer. Pure |
| `cloudThreshold(cover)` | Cover to noise threshold. Pure |
| `horizonFalloff(dirY, fade?)` | How far clouds have faded near the horizon. Pure |
| `SKY` | Dome radius, cloud height and drift, sun sharpness |
| `PRECIPITATION` | The box, the particle budget, and the rain and snow styles |
| `FallStyle` | The shape of one of those styles |

## Invariants you may rely on

- **The dome is one draw call, and so is the weather.** Gradient, sun, stars
  and cloud are all functions of the direction you are looking, so they are all
  one shader on one sphere.
- **The dome sits outside the fog and inside the far plane.** Inside the fog it
  is painted out with the very colour it is supposed to be providing; past the
  far plane it is clipped and there is no sky at all. A test checks the radius
  against every time of day and every weather.
- **It rides with the camera**, so it can never be walked out of or seen from
  outside.
- **The horizon takes the fog colour.** The world fades into a sky that is
  already the colour it is fading to, which is what stops a seam at the
  waterline.
- **Nothing here moves on the CPU.** Precipitation falls by a `mod` in the
  vertex shader, so a few thousand particles cost one uniform a frame.
- **The particle buffers are allocated once**, for the heaviest weather there
  is, and thinner weather fades out the tail of the list rather than rebuilding
  anything. A test checks the allocation covers every preset.
- **Weather arrives and leaves gradually**, and rain never turns into snow in
  mid-air: precipitation fades out before the type changes.

## Deliberate non-goals

- **No ownership of the weather or the light.** Both are `00-core`'s. This
  module has no say in either and reads them once a frame.
- **No simulated weather.** It is chosen, never a front moving across the
  island. That is what was asked for, and it is also what makes it reviewable:
  every state is one click away instead of something you wait for.
- **No accumulation.** Snow does not settle and rain does not wet anything. The
  ground would have to change, and the terrain is a pure function of position
  that several modules resolve against.
- **No lightning, thunder, wind in the trees, or any sound at all.**
- **No volumetric cloud and no god rays.** Both want a second render pass, and
  the frame belongs to `00-core`.
- **No moon.** Night is stars and a dark gradient.
- **No effect on the water or the footprints.** Rain does not dimple the sea.

## Why the clouds are in the dome shader

The obvious way to draw clouds is billboards. That is hundreds of large
overlapping transparent quads, which have to be sorted, which fill the screen
several times over, and which have to be faded individually at the horizon.

Instead the cloud is noise sampled inside the dome's own fragment shader, on a
flat layer projected in perspective — `dir.xz / dir.y` — so it converges towards
the horizon the way a real cloud layer does rather than wrapping around the dome
like a fisheye. It costs four octaves of value noise and no extra geometry at
all.

The projection runs to infinity at the horizon, which is why cloud fades out
below `SKY.horizonFade`: past that the noise smears into stripes.

## Why weather is multipliers

Every weather preset scales what the time of day already worked out. It never
sets an absolute. Rain at noon and rain at midnight are both rain, and both
still have to be lit like noon and midnight — a preset that set absolute values
would make every hour look the same in bad weather.

The one thing weather sets rather than scales is how far the colours are pulled
towards a flat grey. Without that, rain is sunshine with particles falling
through it.

## Known limitations

- **The cloud layer has no thickness.** It is a shaded pattern, not volume, so
  flying up through it is not a thing that can happen.
- **Stars are a hash on a grid**, so they are evenly spread rather than
  clustered into anything you could name.
- **The precipitation box is 90 m across.** Far enough not to notice the edge
  on foot; pull the camera right out and rain stops before the horizon does.
- **Snow does not light up**, so at night it is grey rather than catching the
  moonlight there is no moon for.
- The particle allocation is fixed at 5,200 whether it is raining or not, so a
  sunny day still holds the buffers. They are small.
- Clouds drift at a fixed speed and direction; there is no wind anywhere else
  in the world for them to agree with.

## How to review

- **Look up on a sunny day.** A clean gradient, a sun where the light is coming
  from, and no cloud at all — not a wisp.
- **Follow the sun round with the day slider.** The disc in the sky must sit
  exactly where the shadows say it is. Speed the clock up to 600× and watch it.
- **Go to night.** Stars, and they should fade in as the sun goes down rather
  than switching on. They must not show through in daylight.
- **Switch to cloudy.** It should take a couple of seconds to come over, not
  cut. The ground should go flat and shadowless as the sky fills in — if the
  sky clouds over but the sun still casts hard shadows, the lighting and the
  dome have come apart.
- **Switch to rainy, then snowy.** Rain falls fast in streaks; snow drifts
  slowly and wanders. Neither should turn into the other in mid-air — the first
  should fade out before the second starts.
- **Look straight up in rain, then straight down.** The streaks must stay
  vertical either way.
- **Walk and run through weather.** It should follow you without popping or
  streaming past, and there should be no edge to the box you can find.
- **Check each weather at each time of day.** Night rain should be dark, snow
  should be the brightest of the bad weathers, and nothing should ever be lit
  the same at midnight as at noon.
- **Watch the horizon.** The world should fade into the sky, not meet it at a
  line. Look at the waterline especially.
- **Turn the sky module off in the panel.** Everything else should carry on,
  lit exactly the same — the weather lives in core, not here.
- **Check the perf HUD in the rain.** Two draw calls for the sky, and the frame
  time should barely move.

## Gate record

Filled in when the human passes it.

## Measured

Filled in from the perf HUD at gate time.
