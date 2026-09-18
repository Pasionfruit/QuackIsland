# 40-whats-your-rpm

## What this is

Minigame 31, **What's Your RPM?** Free-for-all, a race down a feed.

Everybody has the same mini phone with the same sixty reels on it. **Scroll the
mouse wheel** to move through them, as fast as you can. Every few reels an
**ad** takes over the screen and your feed stops dead until you **click its
Skip Ad button** - which is somewhere different every time, and smaller the
further down the feed you are. **The first to the end of the feed wins, and
the game ends there.** Otherwise it ends at two minutes, or once everybody has
finished or left. Places go by who finished, soonest first, then by how far
down the feed everybody else got.

## The feed

`rules.ts` and `reels.ts`, all from the seed, so everybody's phone has the same
reels and the same ads in the same places.

- **Sixty reels.** Each is a colour, a big emoji, a handle, a caption and a
  like count. Nobody has time to watch any of them; that is the joke.
- **Up to twelve ads**, the first at reel 3 and then every 3 to 6 reels, none at
  the very end. An ad waits at the top of its reel: scrolling runs up to it and
  stops. Each has its skip button's middle somewhere in the middle 70% of the
  screen, and a size that shrinks from full to 55% from the first ad to the last.
- Each ad sells something silly with a big button of its own that does nothing
  - like every ad button you did not mean to press.

## The wheel

`Wheel` in `rules.ts`. A wheel event queues reels - 300 wheel pixels to a reel,
so about three notches of an ordinary mouse wheel - and each frame drains the
queue onto the feed at no more than **6 reels a second (360 rpm)**. So:

- the feed slides smoothly however lumpy the wheel is;
- a free-spinning wheel or a trackpad fling tops out rather than teleporting -
  past 1.5 reels queued, the rest is thrown away;
- one event counts for at most 240 px, so a page-at-a-time wheel is no shortcut;
- only scrolling down counts - the feed does not go back;
- an ad going up throws away whatever was queued.

The HUD and the phone both show your **rpm**: reels a minute over the last
second and a half.

## The screen

Two halves. On the left, **your phone**, drawn on the page - the feed as a
stack of reels sliding up as you scroll, *Reels* and your rpm along the top, a
progress bar along the bottom, and the ad over all of it when one is up. A
caption under it says what to do.

On the right, a canvas (`RpmScene.tsx`, camera fitted in `camera.ts`): the race
as a **running track**, a lane each in the player's colour, a line every ten
reels and a chequered finish. Everybody walks their lane as they scroll,
bobbing while they move, with their phone up on a stick. Its screen is the
colour of the reel they are on, and **flashes red while an ad has them stuck**,
so you can see who is.

## Networking

`useFeedNet.ts` and `wire.ts`. The host runs the clock and the stand-ins and
sends every player's progress, ads skipped and finish time ten times a second.
A guest has the whole feed from the seed, so it scrolls and skips on its own
screen at once and says how far it has got ten times a second - at once on a
skip or on reaching the end. The host puts that in its copy (`report`: never
backwards, never past an ad not said to be skipped) and is the only word on who
got to the end first, so a guest reaching the end waits to hear the game is
over. Stand-ins only when alone: each scrolls at its own seeded pace between
2.4 and 3.6 reels a second, with a wobble, and takes 0.45 to 1.3 s to find
each skip button.

## How to review

- Open **What's Your RPM?** (31) from the minigames dashboard and press play.
- Scroll the mouse wheel: the reels slide up, the rpm climbs, and your pill on
  the track walks to the right.
- Spin the wheel as hard as you can: the rpm tops out at about 360.
- At reel 4 an ad takes over. Scrolling does nothing. Your phone on the track
  flashes red. Click **Skip Ad** and the feed carries on.
- Later ads put the button somewhere else, and smaller.
- Watch the stand-ins walk their lanes, their phones going red at their ads.
- Get to the end first: *You're all caught up*, the game ends straight away and
  you top the podium.
- In a lobby of two browsers: each sees the other walk its lane and go red at
  ads, and the first to the end ends it for both.

## Non-goals

- No models: players are the island capsule, the phones are primitives and the
  feed is drawn on the page.
- No moving camera.
- No sound of its own.
