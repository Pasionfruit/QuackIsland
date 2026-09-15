/**
 * Garden Goofs, on the screen.
 *
 * A **2D** game, drawn in the DOM over the world rather than in it: a board of
 * squares, a shelf in front of it, and nothing in three dimensions anywhere.
 * The world carries on behind, which is where everybody's body still is.
 *
 * Two screens, and which one you get is `gardenPhase`:
 *
 * - **Picking.** The host pressed start and the party chooses its loadout
 *   together - one shelf, one set of packets, everybody clicking. Nobody
 *   plants until everybody has said they are done.
 * - **Planting.** The lawn. Seeds land on it and have to be clicked before
 *   they go; the shared pot pays for animals, which anybody drags out of the
 *   tray into any square.
 *
 * What is still not here is anything to defend against: no pests walk in, so
 * nothing is eaten, nothing fights and nothing is scored.
 */
import { useEffect, useRef, useState } from 'react'
import { useNet, usePeers } from '../../09-net'
import { disbandParty, useParty } from '../../10-party'
import { useGameMode } from '../../13-modes'
import { GRID, everyCell, isLight } from './grid'
import { GOOFS, gardenPhase, handIsFull, shelf, waitingToPick, type Picked } from './goofs'
import { gardenModeById } from './modes'
import { defenderById, type DefenderId } from './pieces'
import { SEED, plantAt, refusePlant, type Round } from './round'
import {
  ME,
  amDone,
  claim,
  clearHands,
  forgetPicker,
  place,
  setDone,
  startRound,
  toggleAnimal,
  useGardenMode,
  useGoofs,
  useRoundClock,
} from './state'

export function GardenScreen() {
  const net = useNet()
  const peers = usePeers()
  const party = useParty()
  const mode = useGameMode()
  const way = useGardenMode()
  const goofs = useGoofs()

  const playing = mode === 'garden' && party.phase === 'playing'
  const everyone = [...peers.map((p) => p.id), ME]
  const phase = gardenPhase(playing, everyone, goofs.picked, goofs.hand)

  // The round runs while the lawn is up, and stops when it is not. Everybody
  // runs it; only the host's copy decides anything.
  useRoundClock(phase === 'planting')

  // Between rounds the table is clear. Doing it on the way *out* means a round
  // always starts from nothing, however the last one ended.
  useEffect(() => {
    if (!playing) clearHands()
  }, [playing])

  // A fresh pot and an empty lawn, the moment the party finishes choosing.
  useEffect(() => {
    if (phase === 'planting' && net.host) startRound()
  }, [phase, net.host])

  // Nobody waits on a browser that has closed.
  useEffect(() => {
    const here = new Set(everyone)
    for (const id of goofs.picked) if (!here.has(id)) forgetPicker(id)
  })

  if (!playing) return null

  return (
    <div style={screen}>
      <div style={bar}>
        <span style={{ letterSpacing: 1, color: '#9fd8e6' }}>GARDEN GOOFS</span>
        <span style={{ opacity: 0.6 }}>{gardenModeById(way).title}</span>
        <span style={{ flex: 1 }} />
        <span title="One pot, shared by everybody in the party">
          <span style={{ opacity: 0.6 }}>seeds </span>
          <span style={{ color: '#e8d98a' }}>{goofs.round.seeds}</span>
        </span>
        {net.host ? (
          <button type="button" onClick={disbandParty} style={{ ...button, marginLeft: 10 }}>
            end the party
          </button>
        ) : null}
      </div>

      {phase === 'picking' ? (
        <Picking hand={goofs.hand} picked={goofs.picked} everyone={everyone} />
      ) : (
        <Planting round={goofs.round} hand={goofs.hand} />
      )}
    </div>
  )
}

/**
 * The shelf: everything there is, and the packets the party is taking in.
 *
 * Grouped by what an animal is for, because this is meant to hold fifty of
 * them one day and fifty in a flat list is a scroll rather than a choice.
 */
function Picking({
  hand,
  picked,
  everyone,
}: {
  hand: readonly DefenderId[]
  picked: Picked
  everyone: string[]
}) {
  const done = amDone()
  const waiting = waitingToPick(everyone, picked)
  const full = handIsFull(hand)

  return (
    <div style={card}>
      <div style={{ fontSize: 15, marginBottom: 2 }}>
        Pick {GOOFS.handSize} animals, between you
      </div>
      <div style={{ opacity: 0.5, marginBottom: 10 }}>
        One lawn, one pot of seeds, one loadout - anybody can add to it or take
        something out again.
      </div>

      {/* The loadout, always in the same place, so a party can see what it has
          agreed on without reading the shelf back. */}
      <div style={{ ...tray, marginBottom: 10, flexWrap: 'wrap' }}>
        {Array.from({ length: GOOFS.handSize }, (_, slot) => {
          const id = hand[slot]
          if (!id) return <span key={`slot${slot}`} style={emptySlot} />
          const animal = defenderById(id)
          return (
            <button
              key={id}
              type="button"
              onClick={() => toggleAnimal(id)}
              disabled={done}
              title="Take it out again"
              style={{ ...packet, borderColor: '#6fb6c8', background: 'rgba(111,182,200,0.16)' }}
            >
              <span style={{ ...pill, background: animal.colour }} />
              <span>{animal.name}</span>
              <span style={{ color: '#e8d98a' }}>{animal.cost}</span>
            </button>
          )
        })}
      </div>

      <div style={shelfBox}>
        {shelf().map((group) => (
          <div key={group.role} style={{ marginBottom: 8 }}>
            <div style={{ opacity: 0.4, marginBottom: 4 }}>{group.role}</div>
            <div style={grid}>
              {group.animals.map((animal) => {
                const chosen = hand.includes(animal.id)
                const spare = !chosen && full
                return (
                  <button
                    key={animal.id}
                    type="button"
                    onClick={() => toggleAnimal(animal.id)}
                    disabled={done || spare}
                    style={{
                      ...shelfCard,
                      borderColor: chosen ? '#6fb6c8' : 'rgba(255,255,255,0.14)',
                      background: chosen ? 'rgba(111,182,200,0.16)' : 'rgba(255,255,255,0.04)',
                      opacity: spare ? 0.35 : 1,
                      cursor: done || spare ? 'default' : 'pointer',
                    }}
                  >
                    <span style={{ ...pill, background: animal.colour }} />
                    <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span>{animal.name}</span>
                      <span style={{ color: '#e8d98a' }}>{animal.cost}</span>
                    </span>
                    <span style={{ display: 'block', opacity: 0.55, marginTop: 3 }}>
                      {animal.blurb}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setDone(!done)}
        disabled={hand.length === 0 && !done}
        style={{
          ...button,
          width: '100%',
          marginTop: 10,
          padding: '7px 8px',
          background: done ? '#6fb6c8' : hand.length ? '#e0a05a' : 'rgba(255,255,255,0.06)',
          color: done || hand.length ? '#16202a' : '#f2ece2',
          opacity: hand.length === 0 && !done ? 0.5 : 1,
        }}
      >
        {done ? 'done - waiting for the others' : 'done choosing'}
      </button>

      <div style={{ ...tray, marginTop: 8, flexWrap: 'wrap' }}>
        {everyone.map((id) => (
          <span
            key={id}
            style={{
              ...tag,
              borderColor: picked.includes(id) ? '#6fb6c8' : 'rgba(255,255,255,0.14)',
              opacity: picked.includes(id) ? 1 : 0.5,
            }}
          >
            {id === ME ? 'you' : id}
            {picked.includes(id) ? ' · in' : ' · choosing'}
          </span>
        ))}
      </div>

      <div style={{ opacity: 0.4, marginTop: 8 }}>
        {waiting === 0 ? 'everybody is in' : `waiting on ${waiting}`}
      </div>
    </div>
  )
}

/**
 * The lawn: seeds to click, and animals to drag onto it.
 *
 * Dragging is the way in, and clicking the tray then a square does the same
 * thing - a trackpad makes a long drag across twelve columns miserable, and a
 * click-then-click is also the only version of this a test can drive.
 */
function Planting({ round, hand }: { round: Round; hand: readonly DefenderId[] }) {
  /** The animal being dragged, or the one picked up with a click. */
  const [holding, setHolding] = useState<DefenderId | null>(null)
  const [refused, setRefused] = useState<string | null>(null)
  const clearRefusal = useRef(0)

  const say = (why: string | null) => {
    setRefused(why)
    window.clearTimeout(clearRefusal.current)
    if (why) clearRefusal.current = window.setTimeout(() => setRefused(null), 2200)
  }

  useEffect(() => () => window.clearTimeout(clearRefusal.current), [])

  const drop = (row: number, col: number) => {
    if (!holding) return
    // Checked here as well as by the host, so a refusal is a sentence on the
    // screen rather than a drop that quietly does nothing.
    const no = refusePlant(round, hand, row, col, holding)
    if (no) {
      say(no)
      return
    }
    place(row, col, holding)
    setHolding(null)
    say(null)
  }

  return (
    <div style={{ ...card, width: 'min(96vw, 1180px)' }}>
      {/* The tray: what the party brought, and what it can afford right now. */}
      <div style={{ ...tray, marginBottom: 10, flexWrap: 'wrap' }}>
        {hand.map((id) => {
          const animal = defenderById(id)
          const afford = round.seeds >= animal.cost
          const held = holding === id
          return (
            <button
              key={id}
              type="button"
              draggable={afford}
              onDragStart={() => setHolding(id)}
              onDragEnd={() => setHolding(null)}
              onClick={() => setHolding(held ? null : id)}
              disabled={!afford}
              title={afford ? 'Drag onto the lawn, or click then click a square' : 'Not enough seeds'}
              style={{
                ...packet,
                cursor: afford ? 'grab' : 'default',
                borderColor: held ? '#e0a05a' : 'rgba(255,255,255,0.14)',
                background: held ? 'rgba(224,160,90,0.18)' : 'rgba(255,255,255,0.04)',
                opacity: afford ? 1 : 0.4,
              }}
            >
              <span style={{ ...pill, background: animal.colour }} />
              <span>{animal.name}</span>
              <span style={{ color: '#e8d98a' }}>{animal.cost}</span>
            </button>
          )
        })}
        <span style={{ flex: 1 }} />
        <span style={{ opacity: 0.45, alignSelf: 'center' }}>
          {refused ?? (holding ? 'now click a square' : 'drag an animal onto the lawn')}
        </span>
      </div>

      <div style={lawn}>
        {everyCell().map((cell) => {
          const here = plantAt(round, cell.row, cell.col)
          const seed = round.loose.find((s) => s.row === cell.row && s.col === cell.col)
          const animal = here ? defenderById(here.id) : null
          return (
            <div
              key={`${cell.row},${cell.col}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                drop(cell.row, cell.col)
              }}
              onClick={() => drop(cell.row, cell.col)}
              data-cell={`${cell.row},${cell.col}`}
              style={{
                ...square,
                background: isLight(cell.row, cell.col) ? '#5d9145' : '#4c7c39',
                cursor: holding ? 'copy' : 'default',
              }}
            >
              {animal ? <span style={{ ...planted, background: animal.colour }} /> : null}

              {/* A seed, shrinking as it runs out. Clicking it is the whole of
                  the economy: miss it and the pot does not grow. */}
              {seed ? (
                <button
                  type="button"
                  title={`${seed.worth} seeds`}
                  onClick={(e) => {
                    e.stopPropagation()
                    claim(seed.id)
                  }}
                  data-seed={seed.id}
                  style={{
                    ...token,
                    transform: `scale(${0.55 + 0.45 * clamp(seed.left / SEED.life)})`,
                    opacity: seed.left < 2 ? 0.55 + 0.45 * clamp(seed.left / 2) : 1,
                  }}
                />
              ) : null}
            </div>
          )
        })}
      </div>

      <div style={{ opacity: 0.4, marginTop: 8 }}>
        {GRID.rows} lanes, {GRID.cols} deep. The house is on the left; nothing
        comes in from the right yet.
      </div>
    </div>
  )
}

const clamp = (n: number) => Math.max(0, Math.min(1, n))

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
  width: 'min(94vw, 820px)',
  maxHeight: 'calc(100vh - 90px)',
  overflowY: 'auto',
  padding: '14px 16px',
  borderRadius: 10,
  background: 'rgba(20, 22, 26, 0.94)',
  border: '1px solid rgba(255,255,255,0.12)',
  boxShadow: '0 18px 50px rgba(0,0,0,0.5)',
  marginTop: 34,
}

/** The shelf scrolls; the loadout above it and the button below it do not. */
const shelfBox: React.CSSProperties = {
  maxHeight: '42vh',
  overflowY: 'auto',
  paddingRight: 4,
}

const grid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
  gap: 8,
}

const shelfCard: React.CSSProperties = {
  display: 'block',
  textAlign: 'left',
  padding: '8px 10px',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 6,
  color: '#f2ece2',
  font: 'inherit',
}

const tray: React.CSSProperties = { display: 'flex', gap: 6, alignItems: 'center' }

const packet: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 8px',
  borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.14)',
  background: 'rgba(255,255,255,0.04)',
  color: '#f2ece2',
  font: 'inherit',
}

const emptySlot: React.CSSProperties = {
  width: 86,
  height: 30,
  borderRadius: 6,
  border: '1px dashed rgba(255,255,255,0.14)',
}

/** Every creature is a pill until the art is done. */
const pill: React.CSSProperties = {
  display: 'block',
  width: 12,
  height: 19,
  borderRadius: 6,
  flex: '0 0 auto',
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
  position: 'relative',
  aspectRatio: '1 / 1',
  borderRadius: 4,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const planted: React.CSSProperties = {
  display: 'block',
  width: '38%',
  height: '62%',
  borderRadius: 999,
  boxShadow: '0 2px 5px rgba(0,0,0,0.35)',
}

const token: React.CSSProperties = {
  position: 'absolute',
  right: '8%',
  top: '8%',
  width: '42%',
  height: '42%',
  padding: 0,
  borderRadius: '50%',
  border: '2px solid #fff6c9',
  background: 'radial-gradient(circle at 35% 30%, #ffe9a3, #d9a441)',
  boxShadow: '0 0 10px rgba(255, 220, 130, 0.65)',
  cursor: 'pointer',
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
