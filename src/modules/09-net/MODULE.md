# 09-net

## What this is

Lobbies. Type a code, and everyone with the same code is on the same island and
can see each other's bodies move.

One WebSocket to a relay that knows about **rooms and nothing else**. The
server has never heard of a player. See `server/relay.mjs`, and `DEPLOY.md` for
how to run and host it.

This covers what the plan called `10-transport` and `11-world-sync`. They are
one module because the only thing being synced is a player, and two gates for
that would be ceremony rather than safety. If a second kind of thing ever needs
syncing, that is the moment to split them.

## Public contract

| Export | Meaning |
| --- | --- |
| `NetPlayers` | The scene entry: sends yours, draws everyone else's |
| `followWorld(dt)` | Brings a guest's clock and weather towards the host's |
| `isHost(myId, peerIds)` | Who drives the world. Pure |
| `encodeWorld` / `decodeWorld` | The clock and weather on the wire. Pure, validating |
| `dayCorrection(mine, theirs, dt)` | How far to move a guest's clock. Pure |
| `WorldState` | `{ day, scale, running, weather }` |
| `joinLobby(code, name)` / `leaveLobby()` | What the panel calls |
| `useNet()` / `getNet()` | Status, room, peer count. React-safe |
| `makeCode()` | A fresh lobby code |
| `normaliseCode(input)` | A code, or `null` if that is not one. Pure |
| `cleanName(input)` | A display name that is safe to render. Pure |
| `encodeState` / `decodeMessage` | The wire format. Pure, and validating |
| `createTrack` / `record` / `sampleTrack` / `stale` | Interpolation. Pure |
| `shortestAngle(from, to)` | The short way round. Pure |
| `peerAt(id, now)` / `peerTracks()` | Where a peer is right now, for the renderer |
| `relayUrl()` | Where the relay is |
| `relayProblem()` | Why it could not be reached, in words worth reading |
| `statusAfterClose(status)` | What a socket closing means. Pure |
| `NET` | Send rate, interpolation delay, timeout, history size |
| `DuckState`, `Peer`, `Track`, `Snapshot`, `NetInfo`, `NetStatus` | The shapes. `DuckState` is the wire name for a player's position and pose |

## Invariants you may rely on

- **A refused connection says why, and the reason stays.** A socket that never
  opens fires `error` and then `close`, in that order, and writing `offline`
  over the top of the error threw away the only explanation there was - leaving
  the panel saying exactly what it said before the button was pressed. Joining
  a relay nobody had started looked like a dead button for that reason alone.
  `statusAfterClose` is the rule, and it is tested.

- **Nothing that arrives from the network is trusted.** `decodeMessage`
  validates every field and returns `null` rather than throwing. A peer cannot
  put a player at `NaN`, at infinity, or a million metres away, and cannot put a
  control character into a name that ends up in the DOM.
- **Remote players never extrapolate.** They are drawn `NET.delay` behind live,
  so every position is between two snapshots that really happened. A peer who
  goes quiet stands still and then disappears; they never walk into the sea.
- **Turning takes the short way round**, so a body crossing the seam at π does
  not spin all the way back through zero.
- **Peer positions are never in React state.** They arrive fifteen times a
  second per player and are read every frame; React sees only the connection
  status and the peer count, which change rarely.
- **Remote bodies are built by `02-player`, same as yours.** Same shape, same
  size, same way up, positioned by the same `bodyPose` — so they cannot drift
  from the body you are driving, and changing how a body looks changes all of
  them at once.
- **The history is bounded.** `NET.history` snapshots per peer, oldest dropped.
- **Late packets are dropped, not sorted in.** A snapshot older than the newest
  would rewind the player.
- **Being offline changes nothing.** Not joining a lobby is the normal case and
  the world plays exactly the same.

## Deliberate non-goals

- **No authority.** The relay passes on what it is told, so a modified client
  can put its player anywhere. For walking about an island with friends that is
  the right trade; it would not be if there were anything to win.
- **No persistence.** Rooms exist while someone is in them. Nothing is stored,
  anywhere, ever.
- **No accounts, no matchmaking, no lobby list.** You share a code.
- **No voice or chat.**
- **No authority over the *world* either.** The host is trusted with the clock
  and the weather in the same way everyone is trusted with their own position.
- **No name labels above remote players** yet.
- **No shared anything else.** The shore, the footprints already on the beach
  when you join, and whose body is whose colour are all still local.
- **No reconnection.** Drop out and you press join again.

## The host owns the clock and the weather

Everyone in a lobby is in the same hour and the same weather. The tide follows
for free, because it is a function of the day.

**The host is the lowest id in the room.** That needs no election, no messages
and no tie-breaking: every client has the same list of who is here, so every
client reaches the same answer, and when the host leaves the next one takes
over on its own. Alone in a lobby you are the host, so joining takes nothing
away from you.

Ids are `p1`, `p2`, ... and are compared **as numbers**. Sorted as text, `p10`
comes before `p2` and the room would be handed to whoever happened to be tenth.

The host sends `{ day, scale, running, weather }` once a second. A guest adopts
the speed and the weather outright - neither is worth easing - and *eases* the
time of day, because a snap in the clock is visible as a jump in the light.
Guests run the same clock at the same speed, so there is only drift to correct.

Two things that are easy to get wrong and are therefore tested:

- **The day wraps.** A host at 0.99 and a guest at 0.01 are two hundredths
  apart, not ninety-eight. Correcting the long way round runs the guest
  backwards through a whole day every midnight.
- **A big difference snaps rather than eases.** Somebody who has just joined
  should arrive in the right hour, not watch a slow sunrise going the wrong
  way for half a minute.

A guest's time and weather controls are **disabled** in the panel rather than
left to fight the sync. A slider that snaps back once a second is worse than
one that plainly cannot be moved.

## Why the relay is dumb

It knows how to put a client in a room and how to hand a message to everyone
else in that room. It does not parse the message. That is why it is a hundred
lines that will not need touching when the game grows a chat box, a scoreboard
or a thrown coconut — and it is why the protocol lives here rather than being
shared with the server.

## Why remote players are drawn in the past

Updates arrive fifteen times a second and the screen redraws sixty. Something
has to fill the gaps, and there are two options: guess where the player is going,
or draw where it definitely was.

Guessing — extrapolation — is what makes other players skate past corners and
snap back. Drawing `NET.delay` in the past means there is always a snapshot on
each side of the moment being drawn, so it is an interpolation between two
things that actually happened. The cost is 120 ms of lag on other people, which
nobody notices, in exchange for movement that is never wrong.

## Known limitations

- **120 ms behind.** Fine for walking; it would not be for anything competitive.
- **Sixteen to a lobby**, and everyone gets everyone's updates — traffic grows
  with the square of the room. Fine at this size.
- **Joining does not catch you up on the beach.** You see prints made from the
  moment you arrive, not the ones already there.
- **The host handing over is not seamless.** The new host keeps its own clock,
  which is within a fraction of a second of the old one, so the change is
  invisible - but it is not coordinated.
- **No interest management.** A player on the far side of the island is still sent.
- Names are carried but not yet drawn.
- A lost connection is not retried; the status goes to `offline`.
- Positions are absolute, so a client with a different terrain seed would see
  players walking through the ground. There is one seed, so this is theoretical.

## How to review

Two browsers, two lobbies, and `DEPLOY.md` has the commands.

- **Join with the same code in two browsers.** Both should say `1 other`, and
  exactly one of them should say `you host`.
- **Change the time and the weather on the host.** The guest should follow
  within a second or so, easing rather than snapping, and its own time and
  weather controls should be greyed out.
- **Scrub the host's day slider hard.** The guest should arrive in the right
  hour quickly rather than crawling there.
- **Take the host through midnight** at 600x. The guest must follow forwards
  through the wrap, never run backwards through a day.
- **Close the host's browser.** The remaining player should become the host
  within a few seconds and get its controls back.
- **Walk near another player.** You should hear their footsteps, quietly, and
  in the correct ear - walk a circle round them and the sound should cross
  over. Walk away and it should fade out rather than stop.
- **Look at the sand behind another player.** Their footprints should be there,
  same as yours, fading at the same rate.
- **Walk in one and watch the other.** The other body should move *smoothly*, not in
  fifteen visible steps a second, and it should face the way it is going.
- **Run in circles.** The remote body should turn the short way, never spinning
  round the long way as it crosses due north.
- **Swim in one.** The other should see it tip and float, at the same height.
- **Join with the wrong code**, or a code with an O or an I in it — it should
  say so rather than sitting on "connecting".
- **Close one browser.** The body should stand still and then vanish within
  about eight seconds, not walk off.
- **Press leave, then join again.** It should reconnect cleanly.
- **Have a third browser join a different code.** It must see nobody.
- **Stop the relay while joined.** The status should go offline and the game
  should carry on.
- **Check the perf HUD with several peers.** Each body is two draw calls, the
  same as yours.
- **Play without joining anything at all.** Everything should be exactly as it
  was.

## Gate record

Filled in when the human passes it.

## Measured

Filled in from the perf HUD at gate time.
