/**
 * One game's own screen, before it starts.
 *
 * The title, one panel you flip between **how it plays** and **the controls**,
 * the three build stages underneath, and play at the bottom. Every game gets
 * this, built or not, out of its catalogue entry - which is what makes
 * forty-one briefings a thing that already exists rather than a thing to
 * generate.
 *
 * Two tabs rather than both at once, because they answer different questions
 * and you want one of them at a time: what is this, and what do I press. The
 * panel keeps one size either way, so flipping between them does not move the
 * play button out from under the cursor.
 */
import { useState } from 'react'
import { useNet } from '../../09-net'
import { BUILD_STEPS, minigameById, nextStep } from './catalogue'
import {
  FONT,
  ISLAND,
  KIND_COLOUR,
  RESERVED_LOOK,
  STEP_LOOK,
  bar,
  body,
  button,
  buttonOn,
  screen,
  wordmark,
} from './look'
import type { MinigameRun } from './registry'
import { backOut, playMinigame } from './state'

const KIND_LABEL = {
  'free-for-all': 'free-for-all · everybody at once',
  'one-vs-all': 'one vs all · one player, everybody else watching',
} as const

/** What each stage means, said once, on every game's screen. */
const STEP_MEANS: Record<(typeof BUILD_STEPS)[number], string> = {
  environment: 'The state this game keeps, and the place it happens in.',
  controls: 'The inputs wired into that state, and what each one does to it.',
  assets: 'Models, sprites and sound. Last, and never first.',
}

type Leaf = 'how' | 'controls'

export function Briefing({ run }: { run: MinigameRun }) {
  const game = minigameById(run.id)
  const net = useNet()
  const [leaf, setLeaf] = useState<Leaf>('how')
  const up = nextStep(game)
  // The briefing is only ever up until the black has come down over it - the
  // three-two-one is over the game, not here - so this is the only moment it
  // has to know about.
  const counting = run.phase === 'fading'
  // Only the host starts a round. A guest is here because the host brought
  // them, and a button that did nothing would be worse than no button.
  const isHost = net.host

  return (
    <div style={screen}>
      <div style={bar}>
        {/* The host's, like every button on this screen. */}
        {isHost ? (
          <button type="button" onClick={backOut} style={button}>
            back
          </button>
        ) : null}
        <span style={{ ...tileNumber, marginLeft: 4 }}>{game.number}</span>
        <span style={wordmark}>{game.reserved ? RESERVED_LOOK.label : game.title}</span>
        <span style={{ ...kindTag, background: KIND_COLOUR[game.kind] }}>
          {KIND_LABEL[game.kind]}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ color: ISLAND.fadedInk }}>
          {game.reserved ? RESERVED_LOOK.label : up ? `next: ${STEP_LOOK[up].label}` : 'playable'}
        </span>
      </div>

      <div style={body}>
        <div style={sheet}>
          {/* The one panel, and the two things it can be showing. */}
          <div style={tabs}>
            <button
              type="button"
              data-leaf="how"
              onClick={() => setLeaf('how')}
              style={{ ...button, ...(leaf === 'how' ? buttonOn : null) }}
            >
              how it plays
            </button>
            <button
              type="button"
              data-leaf="controls"
              onClick={() => setLeaf('controls')}
              style={{ ...button, ...(leaf === 'controls' ? buttonOn : null) }}
            >
              controls
            </button>
          </div>

          <div style={panel}>
            {leaf === 'how' ? <How game={game} /> : <Controls game={game} />}
          </div>

          {/* The three stages, in order, with the one owed next marked. The
              working checklist for whoever picks this game up. */}
          {game.reserved ? null : (
            <div style={stages}>
              {BUILD_STEPS.map((step) => {
                const done = game.done[step]
                const now = step === up
                return (
                  <span
                    key={step}
                    data-step={step}
                    title={STEP_MEANS[step]}
                    style={{
                      ...stage,
                      borderColor: STEP_LOOK[step].colour,
                      background: done ? STEP_LOOK[step].colour : 'transparent',
                      color: done ? ISLAND.sand : ISLAND.ink,
                      opacity: done || now ? 1 : 0.5,
                    }}
                  >
                    {done ? '✓ ' : now ? '→ ' : ''}
                    {STEP_LOOK[step].label}
                  </span>
                )
              })}
            </div>
          )}

          {/* Play, at the bottom, where a play button goes - the host's alone. */}
          {isHost ? (
            <button
              type="button"
              data-play
              onClick={playMinigame}
              disabled={counting}
              style={{ ...playButton, opacity: counting ? 0.6 : 1 }}
            >
              {counting ? 'starting…' : 'play'}
            </button>
          ) : (
            <div style={waiting} data-waiting>
              {counting ? 'starting…' : 'waiting for the host to start'}
            </div>
          )}

          <div style={note}>
            {isHost
              ? 'Play runs the three-two-one and starts the round for everybody in the lobby.'
              : 'The host brought you here, and the host starts it.'}
          </div>
        </div>
      </div>

    </div>
  )
}

function How({ game }: { game: ReturnType<typeof minigameById> }) {
  if (game.reserved) {
    return <p style={faded}>A number waiting for a game. Name it and it starts here.</p>
  }
  return (
    <>
      {game.description.map((para) => (
        <p key={para} style={paragraph}>
          {para}
        </p>
      ))}
    </>
  )
}

function Controls({ game }: { game: ReturnType<typeof minigameById> }) {
  if (game.controls.length === 0) {
    return (
      <p style={faded}>
        Not written down yet - this game arrived without them, and they get
        settled with its controls stage.
      </p>
    )
  }
  return (
    <div style={controlList}>
      {game.controls.map((control) => (
        <div key={control.input} style={controlRow} data-control={control.input}>
          <span style={keyCap}>{control.input}</span>
          <span>{control.does}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * The reading column.
 *
 * Capped and centred rather than run to the edges: this is prose and a short
 * table, and a line of text a whole monitor wide is a line nobody reads twice.
 * The page behind it is still the whole window.
 */
const sheet: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  width: '100%',
  maxWidth: 620,
  margin: '0 auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
}

const tabs: React.CSSProperties = {
  flex: '0 0 auto',
  display: 'flex',
  gap: 8,
}

/**
 * The panel the two tabs share.
 *
 * `flex: 1` with a zero minimum, so it is the part that gives when the window
 * is short - and so the two tabs are the same size as each other however much
 * either has to say.
 */
const panel: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'hidden',
  padding: '14px 18px',
  borderRadius: 18,
  background: ISLAND.sand,
  boxShadow: '0 3px 0 rgba(0,0,0,0.12)',
}

const paragraph: React.CSSProperties = {
  margin: '0 0 10px',
  lineHeight: 1.55,
}

const faded: React.CSSProperties = {
  margin: 0,
  color: ISLAND.fadedInk,
}

const controlList: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const controlRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
}

const keyCap: React.CSSProperties = {
  flex: '0 0 auto',
  minWidth: 150,
  padding: '4px 12px',
  borderRadius: 999,
  background: ISLAND.warmSand,
  font: `700 12px/1.4 ${FONT}`,
  textAlign: 'center',
}

const stages: React.CSSProperties = {
  flex: '0 0 auto',
  display: 'flex',
  gap: 6,
}

const stage: React.CSSProperties = {
  padding: '3px 12px',
  borderRadius: 999,
  border: '2px solid',
  font: `600 11px/1.5 ${FONT}`,
}

/** The big one. Sunny, round, and the widest thing on the page. */
const playButton: React.CSSProperties = {
  flex: '0 0 auto',
  width: '100%',
  padding: '12px 16px',
  borderRadius: 999,
  border: 'none',
  background: ISLAND.sun,
  boxShadow: '0 4px 0 #d79a22',
  color: ISLAND.ink,
  font: `700 18px/1.2 ${FONT}`,
  letterSpacing: 0.5,
  cursor: 'pointer',
}

/** What a guest gets where the host gets a button. Says why, rather than nothing. */
const waiting: React.CSSProperties = {
  flex: '0 0 auto',
  width: '100%',
  padding: '12px 16px',
  borderRadius: 999,
  boxSizing: 'border-box',
  background: 'rgba(0,0,0,0.06)',
  color: ISLAND.fadedInk,
  font: `700 16px/1.2 ${FONT}`,
  letterSpacing: 0.5,
  textAlign: 'center',
}

const note: React.CSSProperties = {
  flex: '0 0 auto',
  textAlign: 'center',
  font: `500 11px/1.45 ${FONT}`,
  color: ISLAND.deepSea,
  opacity: 0.85,
}

const tileNumber: React.CSSProperties = {
  font: `700 15px/1 ${FONT}`,
  color: ISLAND.fadedInk,
}

const kindTag: React.CSSProperties = {
  padding: '2px 10px',
  borderRadius: 999,
  color: '#fff',
  font: `600 11px/1.6 ${FONT}`,
}
