# Running it, and putting it online

## Two people, two browsers, on your machine

You need two things running: Vite for the game, and the relay for the lobby.

```
npm install
npm run relay      # terminal 1 - the lobby relay on :8791
npm run dev        # terminal 2 - the game on :5173
```

Open `http://localhost:5173` in **two different browsers** — Chrome and Firefox,
or one normal window and one private window. Two tabs of the *same* browser also
works, but a background tab is throttled, so the other duck will move in steps
until you bring it forward.

In each window:

1. Open the **LOBBY** section of the panel.
2. In the first, press **new** for a code, then **join**.
3. In the second, type that same code and press **join**.

Both should say `CODE - 1 other`. Walk around and you will see the other duck.

Two people on your **home network** can do the same: run
`npm run dev -- --host`, and the second machine opens
`http://<your-ip>:5173`. The relay is found on the same host automatically.

## One machine, one process

For a production-shaped run — one server doing both jobs, which is what gets
deployed:

```
npm run build
npm start          # serves the built game and relays, on :8791
```

Open `http://localhost:8791`. There is no separate relay URL to configure: the
page connects back to wherever it was served from, which is the thing that
makes the whole deployment one service.

## Putting it on a free host

The build is static files and the relay is a small Node process, and
`server/relay.mjs` serves both. So this deploys as **one Node web service**,
anywhere that runs Node and allows WebSockets.

What a host needs to know:

| Setting | Value |
| --- | --- |
| Build command | `npm install && npm run build` |
| Start command | `npm start` |
| Health check path | `/healthz` |
| Port | Read from `PORT`; the host sets it |

The server already reads `process.env.PORT`, which is what every host expects,
and `/healthz` answers without needing the build to exist, so a host can tell
"still starting" from "broken".

### Render

The most direct of the free options.

1. Push this repository to GitHub.
2. On [render.com](https://render.com), **New → Web Service**, and point it at
   the repository.
3. Runtime **Node**, build `npm install && npm run build`, start `npm start`.
4. Choose the free instance type and create it.

You get an `https://something.onrender.com` URL. WebSockets work on it, and
because the page and the relay are the same service, `wss://` is automatic.

**The catch:** free instances sleep after about fifteen minutes idle and take
roughly a minute to wake. The first person to open the link waits; everyone
after that does not. For playing with friends, warn whoever opens it first.

### Fly.io

No sleeping, and a small free allowance. Needs the `fly` CLI.

```
fly launch --no-deploy      # answer: Node, port 8791, no database
fly deploy
```

`fly launch` writes a `fly.toml`. Set `internal_port` to `8791` in it, or set
`PORT` in the app's environment to whatever port it chose — either works, they
just have to agree.

### Anywhere else

Railway, Koyeb, Northflank and Google Cloud Run all take the same three
answers: Node, `npm install && npm run build`, `npm start`. Any of them is
fine. Cloud Run needs `--allow-unauthenticated` and does sleep between
requests, much like Render.

> Free tiers change often. Treat the specifics above as a starting point and
> the table as the thing that is actually true: this is one Node service that
> reads `PORT` and needs WebSockets.

### Splitting the game and the relay

If you would rather put the static build on a CDN — GitHub Pages, Netlify,
Vercel — and run only the relay as a service, set `VITE_RELAY_URL` at build
time:

```
VITE_RELAY_URL=wss://your-relay.onrender.com npm run build
```

Serving the page over `https` and the relay over plain `ws://` will not work:
browsers refuse the mixed connection. Both have to be secure, and every host
above gives you `wss://` for free.

## What the relay does and does not do

It knows about **rooms**, and how to pass a message to everyone else in one. It
does not know what a duck is, has never heard of a position, and does not need
changing when the game grows.

That means it is not authoritative. It relays what it is told, so a modified
client could put its duck anywhere — which for walking about an island with
friends is the right trade, and would not be if there were anything to win.

Limits are in `LIMITS` at the top of `server/relay.mjs`: sixteen to a lobby,
five hundred lobbies, four kilobytes a message, sixty messages a second per
client. Rooms are made by whoever asks for one first and disappear when the
last person leaves. Nothing is stored, anywhere.

## When it does not work

- **`not in a lobby` and nothing happens** — the relay is not running, or is on
  a different port. In development it is expected on `:8791`.
- **It worked locally and not when deployed** — check the page is on `https`
  and the browser console for a mixed-content refusal. If the game and the
  relay are separate services, `VITE_RELAY_URL` has to be `wss://`.
- **The other duck jumps rather than walks** — the other tab is in the
  background and throttled. Put the two windows side by side.
- **The other duck stands still** — they have gone quiet. The duck holds its
  last position rather than guessing, and disappears after eight seconds.
- **First load takes a minute** — a sleeping free instance waking up.
