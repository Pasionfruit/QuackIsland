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
 * **Escape pauses.** It covers the board with a card offering to resume or to
 * leave, and stops this browser's own contribution to the round clock while
 * it is up - see `useRoundClock` below for what that does and does not mean
 * for everybody else.
 *
 * What is still not here is anything to defend against: no pests walk in, so
 * nothing is eaten, nothing fights and nothing is scored.
 */
import { useEffect, useRef, useState } from 'react'
import { leaveLobby, useNet, usePeers } from '../../09-net'
import { disbandParty, useParty } from '../../10-party'
import { useGameMode } from '../../13-modes'
import { GRID, everyCell, isLight } from './grid'
import { GOOFS, gardenPhase, handIsFull, waitingToPick, type Picked } from './goofs'
import { gardenModeById } from './modes'
import { DEFENDERS, defenderById, silhouette, type DefenderId, type Shape } from './pieces'
import { SEED, plantAt, refusePlant, waveAt, type Round } from './round'
import {
  ME,
  amDone,
  claim,
  clearHands,
  dig,
  forgetPicker,
  place,
  setDone,
  startRound,
  toggleAnimal,
  useGardenMode,
  useGoofs,
  useRoundClock,
} from './state'

/**
 * What a player has picked up, to drop onto the lawn: an animal from the
 * tray, or the trowel from the bar. One state for both, because they share
 * the same mechanics - grab it, drop it on a square, something happens - and
 * a square only ever has one thing landing on it at a time.
 */
type Holding = { tool: 'plant'; id: DefenderId } | { tool: 'trowel' }

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

  /**
   * What is picked up right now - an animal, or the trowel. Held here rather
   * than inside `Planting`, because the trowel is grabbed from the bar, above
   * it, and dropped on the lawn, inside it.
   */
  const [holding, setHolding] = useState<Holding | null>(null)
  useEffect(() => {
    if (phase !== 'planting') setHolding(null)
  }, [phase])

  /**
   * Escape opens this. Reset the moment the round is no longer up, so leaving
   * and coming back never finds the pause card still open.
   */
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (!playing) setPaused(false)
  }, [playing])

  useEffect(() => {
    if (!playing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return
      setPaused((was) => !was)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [playing])

  /**
   * The round runs while the lawn is up and this browser is not paused, and
   * stops otherwise. Everybody runs their own copy of it; only the host's
   * decides anything.
   *
   * **Pausing is personal, not shared** - there is no message for it, and that
   * is deliberate. A guest who pauses just stops advancing their own clock;
   * the round carries on without them and the next thing the host broadcasts
   * catches them straight back up. A host who pauses stops the one clock that
   * spawns and ages seeds at all, which is the honest consequence of being
   * the one running the round - not a special case, just what "the host runs
   * the clock" already meant.
   */
  useRoundClock(phase === 'planting' && !paused)

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

        {/* The trowel: top right, and only while there is a lawn to use it on.
            Drag it onto a planted square, or click it and then click one. */}
        {phase === 'planting' ? (
          <button
            type="button"
            draggable
            onDragStart={() => setHolding({ tool: 'trowel' })}
            onDragEnd={() => setHolding(null)}
            onClick={() =>
              setHolding((was) => (was?.tool === 'trowel' ? null : { tool: 'trowel' }))
            }
            title="Trowel — drag onto a planted square to dig it up. Seeds are not refunded."
            style={{
              ...trowelButton,
              ...(holding?.tool === 'trowel' ? trowelHeld : null),
            }}
          >
            <span style={trowelIcon}>
              <span style={trowelBlade} />
              <span style={trowelHandle} />
            </span>
          </button>
        ) : null}
      </div>

      {phase === 'picking' ? (
        <Picking hand={goofs.hand} picked={goofs.picked} everyone={everyone} />
      ) : (
        <Planting round={goofs.round} hand={goofs.hand} holding={holding} setHolding={setHolding} />
      )}

      {/* The wave, bottom right, for as long as there is a round to be in one. */}
      {phase === 'planting' ? (
        <div style={waveBadge}>wave {waveAt(goofs.round.elapsed)}</div>
      ) : null}

      {paused ? <Paused onResume={() => setPaused(false)} /> : null}
    </div>
  )
}

/** What Escape opens: a way back in, and a way out. */
function Paused({ onResume }: { onResume: () => void }) {
  return (
    <div style={pauseBackdrop}>
      <div style={pauseCard}>
        <div style={{ fontSize: 16, marginBottom: 6 }}>Paused</div>
        <div style={{ opacity: 0.55, marginBottom: 14 }}>
          The party carries on without you. Press escape again, or resume, to
          come back.
        </div>
        <button
          type="button"
          onClick={onResume}
          style={{ ...button, width: '100%', marginBottom: 8 }}
        >
          resume
        </button>
        <button
          type="button"
          onClick={() => leaveLobby()}
          style={{ ...button, width: '100%', opacity: 0.85 }}
        >
          leave the party
        </button>
      </div>
    </div>
  )
}

/**
 * The shelf: everything there is, laid out as one 7x7 grid - forty-nine
 * squares, forty-nine animals, no scrolling and no grouping to read through
 * first. Each card is an icon and a name; everything else - what it costs,
 * what it does - is a hover away, in the title.
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
        something out again. Hover a card to read what it does.
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
              title={describe(animal)}
              style={{ ...packet, borderColor: '#6fb6c8', background: 'rgba(111,182,200,0.16)' }}
            >
              <span style={shapeOf(animal.shape, animal.colour, 20)} />
              <span>{animal.name}</span>
            </button>
          )
        })}
      </div>

      <div style={shelfGrid}>
        {DEFENDERS.map((animal) => {
          const chosen = hand.includes(animal.id)
          const spare = !chosen && full
          return (
            <button
              key={animal.id}
              type="button"
              onClick={() => toggleAnimal(animal.id)}
              disabled={done || spare}
              title={describe(animal)}
              style={{
                ...tile,
                borderColor: chosen ? '#6fb6c8' : 'rgba(255,255,255,0.14)',
                background: chosen ? 'rgba(111,182,200,0.16)' : 'rgba(255,255,255,0.04)',
                opacity: spare ? 0.35 : 1,
                cursor: done || spare ? 'default' : 'pointer',
              }}
            >
              <span style={tileIcon}>
                <span style={shapeOf(animal.shape, animal.colour, 30)} />
              </span>
              <span style={tileName}>{animal.name}</span>
            </button>
          )
        })}
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
function Planting({
  round,
  hand,
  holding,
  setHolding,
}: {
  round: Round
  hand: readonly DefenderId[]
  holding: Holding | null
  setHolding: (next: Holding | null | ((was: Holding | null) => Holding | null)) => void
}) {
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

    if (holding.tool === 'trowel') {
      // Checked here as well as by the host, for the same reason planting is:
      // a refusal is a sentence on the screen, not a drop that does nothing.
      if (!plantAt(round, row, col)) {
        say('nothing to dig up')
        return
      }
      dig(row, col)
      setHolding(null)
      say(null)
      return
    }

    const no = refusePlant(round, hand, row, col, holding.id)
    if (no) {
      say(no)
      return
    }
    place(row, col, holding.id)
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
          const held = holding?.tool === 'plant' && holding.id === id
          return (
            <button
              key={id}
              type="button"
              draggable={afford}
              onDragStart={() => setHolding({ tool: 'plant', id })}
              onDragEnd={() => setHolding(null)}
              onClick={() => setHolding(held ? null : { tool: 'plant', id })}
              disabled={!afford}
              title={
                afford
                  ? `${describe(animal)} — drag onto the lawn, or click then click a square`
                  : `${describe(animal)} — not enough seeds`
              }
              style={{
                ...packet,
                cursor: afford ? 'grab' : 'default',
                borderColor: held ? '#e0a05a' : 'rgba(255,255,255,0.14)',
                background: held ? 'rgba(224,160,90,0.18)' : 'rgba(255,255,255,0.04)',
                opacity: afford ? 1 : 0.4,
              }}
            >
              <span style={shapeOf(animal.shape, animal.colour, 20)} />
              <span>{animal.name}</span>
            </button>
          )
        })}
        <span style={{ flex: 1 }} />
        <span style={{ opacity: 0.45, alignSelf: 'center' }}>
          {refused ??
            (holding?.tool === 'trowel'
              ? 'now click a planted square to dig it up'
              : holding
                ? 'now click a square'
                : 'drag an animal onto the lawn, or the trowel onto one to dig it up')}
        </span>
      </div>

      {/* The garden bed: a house to defend on the left, and the lawn itself. */}
      <div style={gardenBed}>
        <div style={lawnFrame}>
          <div
            style={houseEdge}
            title="Defend the house - the left edge is what you are protecting"
          >
            <span style={roof} />
            <span style={houseBody}>
              <span style={houseDoor} />
            </span>
            <span style={houseLabel}>HOUSE</span>
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
                    ...(isLight(cell.row, cell.col) ? grassLight : grassDark),
                    // The column against the house gets a warm edge of its own,
                    // so the one lane that matters most reads as the front line.
                    ...(cell.col === 0 ? frontLine : null),
                    cursor:
                      holding?.tool === 'trowel'
                        ? animal
                          ? 'pointer'
                          : 'not-allowed'
                        : holding
                          ? 'copy'
                          : 'default',
                  }}
                >
                  {animal ? (
                    <span
                      title={animal.name}
                      style={{ ...planted, ...shapeOf(animal.shape, animal.colour, null) }}
                    />
                  ) : null}

                  {/* A seed, shrinking as it runs out. Clicking it is the whole
                      of the economy: miss it and the pot does not grow. */}
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
        </div>
      </div>

      <div style={{ opacity: 0.4, marginTop: 8 }}>
        {GRID.rows} lanes, {GRID.cols} deep. Defend the house on the left;
        nothing comes in from the right yet.
      </div>
    </div>
  )
}

const clamp = (n: number) => Math.max(0, Math.min(1, n))

/** What a card's hover says, since the card itself only shows an icon and a name. */
function describe(animal: { cost: number; blurb: string }): string {
  return `${animal.cost} seeds — ${animal.blurb}`
}

/**
 * A placeholder in the shape of the thing it stands for.
 *
 * Every creature is a coloured pill until the art is done, and forty-nine
 * pills of one size would be forty-nine things nobody can tell apart on a
 * lawn. The species carries its silhouette, so a Bamboo is tall and thin and a
 * Pumpkin Shield is wide and low **now** - and the same field is the brief for
 * whoever models them later.
 *
 * `box` is what it is drawn inside: a percentage of a square on the lawn, or a
 * pixel size in a card.
 */
function shapeOf(shape: Shape, colour: string, box: number | null): React.CSSProperties {
  const { width, height, radius } = silhouette(shape)
  // Rounded, or a third of a pixel arrives in the DOM as 18.919999999999998.
  const round = (n: number) => Math.round(n * 100) / 100
  const size = (fraction: number) =>
    box === null ? `${round(fraction * 100)}%` : `${round(fraction * box)}px`
  return {
    display: 'block',
    flex: '0 0 auto',
    background: colour,
    width: size(width),
    height: size(height),
    borderRadius: size(radius),
  }
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

/** The 7x7 selection grid: forty-nine squares, forty-nine animals. */
const shelfGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, 1fr)',
  gap: 7,
}

/** One card on the shelf: an icon, and a name at the bottom. Nothing else. */
const tile: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'space-between',
  aspectRatio: '1 / 1',
  padding: '6px 3px 5px',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 8,
  color: '#f2ece2',
  font: 'inherit',
}

const tileIcon: React.CSSProperties = {
  flex: 1,
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const tileName: React.CSSProperties = {
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  textAlign: 'center',
  fontSize: 9,
  lineHeight: 1.2,
  opacity: 0.85,
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
  width: 76,
  height: 30,
  borderRadius: 6,
  border: '1px dashed rgba(255,255,255,0.14)',
}

/**
 * The garden bed: a wooden crate the lawn sits in, so the board reads as a
 * planter rather than a spreadsheet. One frame round both the house and the
 * grid, so they read as one place rather than two things bolted together.
 */
const gardenBed: React.CSSProperties = {
  padding: 9,
  borderRadius: 14,
  background: 'linear-gradient(180deg, #6b4a30, #4a3220)',
  boxShadow: 'inset 0 0 0 3px rgba(0,0,0,0.22), 0 10px 26px rgba(0,0,0,0.4)',
}

const lawnFrame: React.CSSProperties = {
  display: 'flex',
  alignItems: 'stretch',
  gap: 7,
}

/** The house, at the edge the party is defending. */
const houseEdge: React.CSSProperties = {
  flex: '0 0 58px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
  borderRadius: 8,
  background: 'linear-gradient(180deg, #3a2a1c, #2a1d13)',
  boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
}

const roof: React.CSSProperties = {
  width: 0,
  height: 0,
  borderLeft: '17px solid transparent',
  borderRight: '17px solid transparent',
  borderBottom: '14px solid #b5493a',
}

const houseBody: React.CSSProperties = {
  position: 'relative',
  width: 30,
  height: 24,
  background: '#e8d3a0',
  borderRadius: '1px 1px 0 0',
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
}

const houseDoor: React.CSSProperties = {
  width: 8,
  height: 14,
  background: '#6b4a30',
  borderRadius: '2px 2px 0 0',
}

const houseLabel: React.CSSProperties = {
  fontSize: 8,
  letterSpacing: 1,
  opacity: 0.6,
}

const lawn: React.CSSProperties = {
  flex: 1,
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

/** The checkerboard, as a soft grass gradient rather than a flat fill. */
const grassLight: React.CSSProperties = {
  background: 'linear-gradient(160deg, #6aa04f, #558a3d)',
}

const grassDark: React.CSSProperties = {
  background: 'linear-gradient(160deg, #578239, #466c30)',
}

/** The lane against the house: a warm edge, marking the line that matters. */
const frontLine: React.CSSProperties = {
  boxShadow: 'inset 3px 0 0 rgba(224, 160, 90, 0.55)',
}

/** What `shapeOf` does not decide: everything on the lawn casts a little shade. */
const planted: React.CSSProperties = {
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

const pauseBackdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 60,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(4, 5, 7, 0.7)',
}

const pauseCard: React.CSSProperties = {
  width: 260,
  padding: '16px 18px',
  borderRadius: 10,
  background: 'rgba(20, 22, 26, 0.96)',
  border: '1px solid rgba(255,255,255,0.14)',
  boxShadow: '0 18px 50px rgba(0,0,0,0.55)',
  color: '#f2ece2',
  font: '12px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace',
}

/** The trowel, top right of the bar. Square, so it does not read as text. */
const trowelButton: React.CSSProperties = {
  ...button,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 30,
  height: 26,
  padding: 0,
  cursor: 'grab',
}

const trowelHeld: React.CSSProperties = {
  borderColor: '#e0a05a',
  background: 'rgba(224,160,90,0.18)',
}

const trowelIcon: React.CSSProperties = {
  position: 'relative',
  width: 16,
  height: 16,
}

/** Rotated as one, so a rounded blade and a straight handle read as one tool. */
const trowelShapeCommon: React.CSSProperties = {
  position: 'absolute',
  left: '50%',
  top: '50%',
}

const trowelBlade: React.CSSProperties = {
  ...trowelShapeCommon,
  width: 9,
  height: 11,
  background: '#c3cbd1',
  borderRadius: '2px 2px 7px 7px',
  boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.18)',
  transform: 'translate(-50%, -85%) rotate(-40deg)',
}

const trowelHandle: React.CSSProperties = {
  ...trowelShapeCommon,
  width: 4,
  height: 8,
  background: '#8a5a34',
  borderRadius: 2,
  transform: 'translate(-50%, 25%) rotate(-40deg)',
}

/** The wave count, bottom right, for as long as there is a round to be in one. */
const waveBadge: React.CSSProperties = {
  position: 'fixed',
  right: 14,
  bottom: 14,
  zIndex: 45,
  padding: '6px 12px',
  borderRadius: 8,
  background: 'rgba(20, 22, 26, 0.85)',
  border: '1px solid rgba(255,255,255,0.14)',
  color: '#f2ece2',
  font: '12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace',
  letterSpacing: 0.4,
}
