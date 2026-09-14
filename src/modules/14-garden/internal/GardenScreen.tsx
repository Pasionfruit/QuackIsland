/**
 * Garden Goofs, on the screen.
 *
 * A **2D** game, drawn in the DOM over the world rather than in it: a board of
 * squares, a menu in front of it, and nothing in three dimensions anywhere.
 * The world carries on behind, which is where everybody's body still is.
 *
 * Two screens, and which one you get is `gardenPhase`:
 *
 * - **Picking.** The host pressed start and everybody chooses the animals they
 *   are taking in. Nobody plays until everybody has finished choosing.
 * - **Planting.** The lawn, and the hand you chose. There is nothing to plant
 *   yet - the round does not begin, because there is no round.
 *
 * No game. Nothing walks in, nothing is eaten, nothing is scored. What is here
 * is the board, the menu, the shared pot and the two catalogues, which is what
 * all of that will be built on.
 */
import { useEffect } from 'react'
import { useNet, usePeers } from '../../09-net'
import { disbandParty, useParty } from '../../10-party'
import { useGameMode } from '../../13-modes'
import { GRID, everyCell, isLight } from './grid'
import {
  GOOFS,
  gardenPhase,
  handIsFull,
  waitingToPick,
  type Hands,
} from './goofs'
import { gardenModeById } from './modes'
import { DEFENDERS, PESTS, defenderById, type DefenderId } from './pieces'
import {
  ME,
  clearHands,
  forgetPicker,
  pickHand,
  resetSeeds,
  useGardenMode,
  useGoofs,
} from './state'
import { useState } from 'react'

export function GardenScreen() {
  const net = useNet()
  const peers = usePeers()
  const party = useParty()
  const mode = useGameMode()
  const way = useGardenMode()
  const goofs = useGoofs()

  /** The hand you are building. A draft: it is nobody else's business yet. */
  const [draft, setDraft] = useState<DefenderId[]>([])

  const playing = mode === 'garden' && party.phase === 'playing'
  const everyone = [...peers.map((p) => p.id), ME]
  const phase = gardenPhase(playing, everyone, goofs.hands)
  const mine = goofs.hands[ME] ?? null

  // Between rounds nobody has a hand. Clearing on the way *out* rather than on
  // the way in means a round always starts from an empty table, however it
  // ended - the host calling it off, or everybody leaving.
  useEffect(() => {
    if (!playing) {
      clearHands()
      setDraft([])
    }
  }, [playing])

  // The pot is the host's, and a round starts with a full one.
  useEffect(() => {
    if (playing && net.host) resetSeeds()
  }, [playing, net.host])

  // Nobody waits on a browser that has closed.
  useEffect(() => {
    const here = new Set(everyone)
    for (const id of Object.keys(goofs.hands)) if (!here.has(id)) forgetPicker(id)
  })

  if (!playing) return null

  const waiting = waitingToPick(everyone, goofs.hands)

  return (
    <div style={screen}>
      <div style={bar}>
        <span style={{ letterSpacing: 1, color: '#9fd8e6' }}>GARDEN GOOFS</span>
        <span style={{ opacity: 0.6 }}>{gardenModeById(way).title}</span>
        <span style={{ flex: 1 }} />
        <span title="The pot is shared by everybody in the lobby">
          <span style={{ opacity: 0.6 }}>shared seeds </span>
          <span style={{ color: '#e8d98a' }}>{goofs.seeds}</span>
        </span>
        {net.host ? (
          <button type="button" onClick={disbandParty} style={{ ...button, marginLeft: 10 }}>
            end the party
          </button>
        ) : null}
      </div>

      {phase === 'picking' ? (
        <Picking
          draft={draft}
          setDraft={setDraft}
          mine={mine}
          waiting={waiting}
          hands={goofs.hands}
          everyone={everyone}
        />
      ) : (
        <Planting hand={mine ?? []} />
      )}
    </div>
  )
}

function Picking({
  draft,
  setDraft,
  mine,
  waiting,
  hands,
  everyone,
}: {
  draft: DefenderId[]
  setDraft: (next: DefenderId[]) => void
  mine: readonly DefenderId[] | null
  waiting: number
  hands: Hands
  everyone: string[]
}) {
  const toggle = (id: DefenderId) => {
    if (mine) return
    if (draft.includes(id)) setDraft(draft.filter((d) => d !== id))
    else if (!handIsFull(draft)) setDraft([...draft, id])
  }

  return (
    <div style={card}>
      <div style={{ fontSize: 15, marginBottom: 2 }}>
        {mine ? 'Your animals are in' : `Pick ${GOOFS.handSize} animals to take in`}
      </div>
      <div style={{ opacity: 0.5, marginBottom: 10 }}>
        {mine
          ? waiting > 0
            ? `waiting on ${waiting} of ${everyone.length}`
            : 'everybody has picked'
          : 'The lawn is shared, and so is the seed pot. Bring what the others did not.'}
      </div>

      <div style={shelf}>
        {DEFENDERS.map((animal) => {
          const chosen = (mine ?? draft).includes(animal.id)
          const spare = !mine && !chosen && handIsFull(draft)
          return (
            <button
              key={animal.id}
              type="button"
              onClick={() => toggle(animal.id)}
              disabled={!!mine || spare}
              style={{
                ...packet,
                borderColor: chosen ? '#6fb6c8' : 'rgba(255,255,255,0.14)',
                background: chosen ? 'rgba(111,182,200,0.16)' : 'rgba(255,255,255,0.04)',
                opacity: spare ? 0.35 : 1,
                cursor: mine || spare ? 'default' : 'pointer',
              }}
            >
              <span style={{ ...pill, background: animal.colour }} />
              <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span>{animal.name}</span>
                <span style={{ color: '#e8d98a' }}>{animal.cost}</span>
              </span>
              <span style={{ display: 'block', opacity: 0.55, marginTop: 3 }}>{animal.blurb}</span>
              <span style={{ display: 'block', opacity: 0.4, marginTop: 4 }}>
                {animal.role} · {animal.health} health · {animal.recharge}s
              </span>
            </button>
          )
        })}
      </div>

      <button
        type="button"
        onClick={() => pickHand(draft)}
        disabled={!!mine || draft.length === 0}
        style={{
          ...button,
          width: '100%',
          marginTop: 12,
          padding: '7px 8px',
          background: mine ? 'rgba(255,255,255,0.06)' : draft.length ? '#e0a05a' : 'none',
          color: mine || !draft.length ? '#f2ece2' : '#20222a',
          opacity: mine || !draft.length ? 0.55 : 1,
          cursor: mine || !draft.length ? 'default' : 'pointer',
        }}
      >
        {mine ? 'waiting for the others' : `take ${draft.length || 'these'} in`}
      </button>

      {/* Who is still reading. Their hands are nobody's business until the
          round starts, so this is a count and not a list of picks. */}
      <div style={{ ...row, marginTop: 8, flexWrap: 'wrap', gap: 6 }}>
        {everyone.map((id) => (
          <span
            key={id}
            style={{
              ...tag,
              borderColor: hands[id] ? '#6fb6c8' : 'rgba(255,255,255,0.14)',
              opacity: hands[id] ? 1 : 0.5,
            }}
          >
            {id === ME ? 'you' : id}
            {hands[id] ? ' · in' : ' · choosing'}
          </span>
        ))}
      </div>

      <div style={{ opacity: 0.35, marginTop: 10 }}>
        coming for it: {PESTS.map((p) => p.name.toLowerCase()).join(', ')}
      </div>
    </div>
  )
}

function Planting({ hand }: { hand: readonly DefenderId[] }) {
  return (
    <div style={{ ...card, width: 'min(94vw, 1080px)' }}>
      {/* Your hand, along the top, the way a seed tray sits above a lawn. */}
      <div style={{ ...row, marginBottom: 10 }}>
        {hand.map((id) => {
          const animal = defenderById(id)
          return (
            <span key={id} style={tray}>
              <span style={{ ...pill, background: animal.colour }} />
              <span>{animal.name}</span>
              <span style={{ color: '#e8d98a' }}>{animal.cost}</span>
            </span>
          )
        })}
        <span style={{ flex: 1 }} />
        <span style={{ opacity: 0.4, alignSelf: 'center' }}>
          {GRID.rows} lanes · nothing to plant yet
        </span>
      </div>

      <div style={lawn}>
        {everyCell().map((cell) => (
          <div
            key={`${cell.row},${cell.col}`}
            style={{
              ...square,
              background: isLight(cell.row, cell.col) ? '#5d9145' : '#4c7c39',
            }}
          />
        ))}
      </div>

      <div style={{ opacity: 0.4, marginTop: 8 }}>
        The house is on the left; they come in from the right.
      </div>
    </div>
  )
}

const screen: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 40,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 12,
  background: 'rgba(8, 10, 14, 0.82)',
  color: '#f2ece2',
  font: '12px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace',
  userSelect: 'none',
}

const bar: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 12px',
  background: 'rgba(20, 22, 26, 0.9)',
  borderBottom: '1px solid rgba(255,255,255,0.1)',
}

const card: React.CSSProperties = {
  width: 'min(94vw, 760px)',
  maxHeight: 'calc(100vh - 90px)',
  overflowY: 'auto',
  padding: '14px 16px',
  borderRadius: 10,
  background: 'rgba(20, 22, 26, 0.94)',
  border: '1px solid rgba(255,255,255,0.12)',
  boxShadow: '0 18px 50px rgba(0,0,0,0.5)',
  marginTop: 34,
}

const shelf: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
  gap: 8,
}

const packet: React.CSSProperties = {
  display: 'block',
  textAlign: 'left',
  padding: '8px 10px',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 6,
  color: '#f2ece2',
  font: 'inherit',
}

/** Every creature is a pill until the art is done. */
const pill: React.CSSProperties = {
  display: 'block',
  width: 14,
  height: 22,
  borderRadius: 7,
  marginBottom: 6,
}

const lawn: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: `repeat(${GRID.cols}, 1fr)`,
  gap: 3,
  padding: 6,
  borderRadius: 8,
  background: '#3c2f21',
}

const square: React.CSSProperties = {
  aspectRatio: '1 / 1',
  borderRadius: 4,
}

const row: React.CSSProperties = { display: 'flex', gap: 8 }

const tray: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 8px',
  borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.14)',
  background: 'rgba(255,255,255,0.04)',
}

const tag: React.CSSProperties = {
  padding: '2px 7px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,0.14)',
}

const button: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 4,
  color: '#f2ece2',
  font: 'inherit',
  padding: '3px 8px',
  cursor: 'pointer',
}
