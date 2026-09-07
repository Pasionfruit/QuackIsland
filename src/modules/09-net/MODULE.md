# 09-net

## What this is

Lobbies. Type a code, and everyone with the same code is on the same island and
can see each other's ducks move.

One WebSocket to a relay that knows about **rooms and nothing else**. The
server has never heard of a duck. See `server/relay.mjs`, and `DEPLOY.md` for
how to run and host it.

This covers what the plan called `10-transport` and `11-world-sync`. They are
one module because the only thing being synced is a duck, and two gates for
that would be ceremony rather than safety. If a second kind of thing ever needs
syncing, that is the moment to split them.

## Public contract

| Export | Meaning |
| --- | --- |
| `NetPlayers` | The scene entry: sends yours, draws everyone else's |
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
| `NET` | Send rate, interpolation delay, timeout, history size |
| `DuckState`, `Peer`, `Track`, `Snapshot`, `NetInfo`, `NetStatus` | The shapes |

## Invariants you may rely on

- **Nothing that arrives from the network is trusted.** `decodeMessage`
  validates every field and returns `null` rather than throwing. A peer cannot
  put a duck at `NaN`, at infinity, or a million metres away, and cannot put a
  control character into a name that ends up in the DOM.
- **Remote ducks never extrapolate.** They are drawn `NET.delay` behind live,
  so every position is between two snapshots that really happened. A peer who
  goes quiet stands still and then disappears; they never walk into the sea.
- **Turning takes the short way round**, so a duck crossing the seam at π does
  not spin all the way back through zero.
- **Peer positions are never in React state.** They arrive fifteen times a
  second per player and are read every frame; React sees only the connection
  status and the peer count, which change rarely.
- **Remote ducks are clones of the local one.** Same model, same size, same way
  up, positioned by the same `bodyPose` — so they cannot drift from the duck
  you are driving.
- **The history is bounded.** `NET.history` snapshots per peer, oldest dropped.
- **Late packets are dropped, not sorted in.** A snapshot older than the newest
  would rewind the duck.
- **Being offline changes nothing.** Not joining a lobby is the normal case and
  the world plays exactly the same.

## Deliberate non-goals

- **No authority.** The relay passes on what it is told, so a modified client
  can put its duck anywhere. For walking about an island with friends that is
  the right trade; it would not be if there were anything to win.
- **No persistence.** Rooms exist while someone is in them. Nothing is stored,
  anywhere, ever.
- **No accounts, no matchmaking, no lobby list.** You share a code.
- **No voice or chat.**
- **No shared world state.** Everyone runs their own time of day, weather and
  tide. Two people in a lobby can be in different weather — see below.
- **No sound from remote players**, and no name labels above them yet.
- **No reconnection.** Drop out and you press join again.

## Everyone has their own weather

Only the duck is synced. The clock, the tide and the weather are each client's
own, so two people in a lobby can genuinely be standing in different weather at
different times of day.

That is deliberate for now rather than an oversight. Syncing them means
deciding who is in charge of the clock, what happens when they leave, and how a
joiner catches up — which is a real design with real failure modes, and none of
it is needed to see two ducks walk about. When it is wanted, the relay does not
change: the host sends its clock as another opaque message, and this module
learns one more message type.

## Why the relay is dumb

It knows how to put a client in a room and how to hand a message to everyone
else in that room. It does not parse the message. That is why it is a hundred
lines that will not need touching when the game grows a chat box, a scoreboard
or a thrown coconut — and it is why the protocol lives here rather than being
shared with the server.

## Why remote ducks are drawn in the past

Updates arrive fifteen times a second and the screen redraws sixty. Something
has to fill the gaps, and there are two options: guess where the duck is going,
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
- **No interest management.** A duck on the far side of the island is still sent.
- Names are carried but not yet drawn.
- A lost connection is not retried; the status goes to `offline`.
- Positions are absolute, so a client with a different terrain seed would see
  ducks walking through the ground. There is one seed, so this is theoretical.

## How to review

Two browsers, two lobbies, and `DEPLOY.md` has the commands.

- **Join with the same code in two browsers.** Both should say `1 other`.
- **Walk in one and watch the other.** The duck should move *smoothly*, not in
  fifteen visible steps a second, and it should face the way it is going.
- **Run in circles.** The remote duck should turn the short way, never spinning
  round the long way as it crosses due north.
- **Swim in one.** The other should see it tip and float, at the same height.
- **Join with the wrong code**, or a code with an O or an I in it — it should
  say so rather than sitting on "connecting".
- **Close one browser.** The duck should stand still and then vanish within
  about eight seconds, not walk off.
- **Press leave, then join again.** It should reconnect cleanly.
- **Have a third browser join a different code.** It must see nobody.
- **Stop the relay while joined.** The status should go offline and the game
  should carry on.
- **Check the perf HUD with several peers.** Each duck is six draw calls, the
  same as yours.
- **Play without joining anything at all.** Everything should be exactly as it
  was.

## Gate record

Filled in when the human passes it.

## Measured

Filled in from the perf HUD at gate time.
