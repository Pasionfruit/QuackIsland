/**
 * One game's own screen, before it starts.
 *
 * The title, one panel you flip between **how it plays**, **the controls** and - for a
 * one-vs-all game - **the party**, where the host says who the 1 is,
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
import { useEffect, useState } from 'react'
import { getMyName, useNet, usePeers } from '../../09-net'
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
import { chooseTheOne, isInParty, partyOf, randomOne, useTheOne, type Member } from './party'
import type { MinigameRun } from './registry'
import { backOut, playMinigame } from './state'
import { clicked } from './sound'

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

type Leaf = 'how' | 'controls' | 'party'

export function Briefing({ run }: { run: MinigameRun }) {
  const game = minigameById(run.id)
  const net = useNet()
  // A one-vs-all game opens on its party: the first thing the host has to settle is who the 1 is.
  const oneVsAll = game.kind === 'one-vs-all'
  const [leaf, setLeaf] = useState<Leaf>(oneVsAll ? 'party' : 'how')
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
          <button type="button" onClick={clicked(backOut)} style={button}>
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
              onClick={clicked(() => setLeaf('how'))}
              style={{ ...button, ...(leaf === 'how' ? buttonOn : null) }}
            >
              how it plays
            </button>
            <button
              type="button"
              data-leaf="controls"
              onClick={clicked(() => setLeaf('controls'))}
              style={{ ...button, ...(leaf === 'controls' ? buttonOn : null) }}
            >
              controls
            </button>
            {oneVsAll ? (
              <button
                type="button"
                data-leaf="party"
                onClick={clicked(() => setLeaf('party'))}
                style={{ ...button, ...(leaf === 'party' ? buttonOn : null) }}
              >
                the party
              </button>
            ) : null}
          </div>

          <div style={panel}>
            {leaf === 'how' ? <How game={game} /> : leaf === 'controls' ? <Controls game={game} /> : <Party isHost={isHost} />}
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
              onClick={clicked(playMinigame)}
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

/**
 * The party, for a one-vs-all game: everybody in the lobby, the host first, with
 * the 1 marked. **The host clicks a name to say who the 1 is**, or rolls the dice for
 * somebody at random; a guest sees who it is and cannot change it.
 */
function Party({ isHost }: { isHost: boolean }) {
  const net = useNet()
  const peers = usePeers()
  const chosen = useTheOne()
  const party = partyOf({ id: net.id ?? 'you', name: getMyName() }, peers)
  const one = isInParty(party, chosen) ? chosen : null
  const first = party[0]?.id ?? null

  // Until the host says, or when the one has left: the host is.
  useEffect(() => {
    if (isHost && first !== null && one === null) chooseTheOne(first)
  }, [isHost, first, one])

  return (
    <div data-party>
      <p style={paragraph}>
        {isHost ? 'Who is the 1? Everybody else plays against them. Click a name, or roll the dice.' : 'The host says who the 1 is: everybody else plays against them.'}
      </p>
      <div style={partyRow}>
        {party.map((member) => (
          <PartyChip key={member.id} member={member} isOne={member.id === one} canPick={isHost} />
        ))}
        {isHost ? (
          <button
            type="button"
            onClick={clicked(() => {
              const id = randomOne(party)
              if (id) chooseTheOne(id)
            })}
            aria-label="pick the 1 at random"
            title="Pick the 1 at random"
            data-one-dice
            style={{ ...button, ...diceButton }}
          >
            🎲
          </button>
        ) : null}
      </div>
    </div>
  )
}

function PartyChip({ member, isOne, canPick }: { member: Member; isOne: boolean; canPick: boolean }) {
  return (
    <button
      type="button"
      disabled={!canPick}
      onClick={clicked(() => chooseTheOne(member.id))}
      data-member={member.id}
      data-one={isOne ? 'yes' : 'no'}
      style={{ ...button, ...(isOne ? buttonOn : null), cursor: canPick ? 'pointer' : 'default', opacity: canPick || isOne ? 1 : 0.75 }}
    >
      {member.name}
      {member.you ? ' (you)' : ''}
      {member.host ? ' · host' : ''}
      {isOne ? ' · the 1' : ''}
    </button>
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
          <span style={controlDoes}>{control.does}</span>
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

const partyRow: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }

const diceButton: React.CSSProperties = { fontSize: 18, lineHeight: 1, padding: '4px 10px' }

const faded: React.CSSProperties = {
  margin: 0,
  color: ISLAND.fadedInk,
}

const controlList: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
}

const controlRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
}

/** What the control does: the largest text on the panel, since it is the part read at a glance. */
const controlDoes: React.CSSProperties = {
  font: `600 19px/1.3 ${FONT}`,
}

const keyCap: React.CSSProperties = {
  flex: '0 0 auto',
  minWidth: 190,
  padding: '6px 14px',
  borderRadius: 999,
  background: ISLAND.warmSand,
  font: `700 17px/1.4 ${FONT}`,
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
