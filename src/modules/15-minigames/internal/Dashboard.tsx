/**
 * Every minigame there is going to be, on one screen.
 *
 * Forty-one tiles in a seven-wide grid, which is the whole point: the plan is
 * legible at a glance, including the parts of it that do not exist. A slot
 * nobody has named yet is drawn dim rather than left out, so the gap between
 * what is planned and what is built is the thing you actually see.
 *
 * It never scrolls. The rows share out whatever height is left under the bar,
 * so filtering to eleven games makes the tiles taller rather than making the
 * page shorter.
 */
import { useState } from 'react'
import {
  BUILD_STEPS,
  MINIGAMES,
  MINIGAME_TARGET,
  minigamesOfKind,
  nextStep,
  progress,
  type Minigame,
  type MinigameKind,
} from './catalogue'
import { KIND_COLOUR, RESERVED_LOOK, STEP_LOOK, bar, body, button, buttonOn, screen } from './look'
import { builtMinigames } from './registry'
import { backOut, openMinigame } from './state'

/** Seven across, the same as the shelf next door. Forty-one comes to six rows. */
const COLUMNS = 7

type Filter = 'all' | MinigameKind

export function Dashboard() {
  const [filter, setFilter] = useState<Filter>('all')

  const games = filter === 'all' ? MINIGAMES : minigamesOfKind(filter)
  const far = progress(games)
  const rows = Math.max(1, Math.ceil(games.length / COLUMNS))
  const built = builtMinigames().length

  return (
    <div style={screen}>
      <div style={bar}>
        <span style={{ letterSpacing: 1, color: '#b39ddb' }}>MINIGAMES</span>
        <span style={{ opacity: 0.6 }}>Volcano Island</span>

        <span style={{ flex: 1 }} />

        <Tab now={filter} is="all" onPick={setFilter}>
          all {MINIGAMES.length}
        </Tab>
        <Tab now={filter} is="free-for-all" onPick={setFilter}>
          free-for-all {MINIGAME_TARGET['free-for-all']}
        </Tab>
        <Tab now={filter} is="one-vs-all" onPick={setFilter}>
          one vs all {MINIGAME_TARGET['one-vs-all']}
        </Tab>

        <button type="button" onClick={backOut} style={{ ...button, marginLeft: 10 }}>
          close
        </button>
      </div>

      <div style={body}>
        <div style={{ ...grid, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
          {games.map((game) => (
            <Tile key={game.id} game={game} />
          ))}
        </div>

        {/* The progress report, which is what a dashboard of templates is for:
            how many slots, how many named, and how far the three stages have
            got across all of them. */}
        <div style={footer}>
          <span style={{ opacity: 0.45 }}>
            {far.slots} slots · {far.named} named · {far.reserved} free
          </span>
          <span style={{ flex: 1 }} />
          {BUILD_STEPS.map((step) => (
            <span key={step} style={{ opacity: 0.55 }}>
              <span style={{ ...pip, background: STEP_LOOK[step].colour, opacity: 0.9 }} />
              {STEP_LOOK[step].label} {far.steps[step]}/{far.named}
            </span>
          ))}
          <span style={{ opacity: 0.45 }}>· {built} registered</span>
        </div>
      </div>
    </div>
  )
}

/** One of the three filters along the bar. */
function Tab({
  now,
  is,
  onPick,
  children,
}: {
  now: Filter
  is: Filter
  onPick: (next: Filter) => void
  children: React.ReactNode
}) {
  const on = now === is
  return (
    <button
      type="button"
      onClick={() => onPick(is)}
      style={{ ...button, ...(on ? buttonOn : null) }}
    >
      {children}
    </button>
  )
}

/**
 * One game on the grid: its number, its name, and how far along it is.
 *
 * A reserved slot is a tile like any other and opens like one - it has a
 * number, and the panel behind it is where its name will go.
 */
function Tile({ game }: { game: Minigame }) {
  const up = nextStep(game)
  const says = game.reserved
    ? RESERVED_LOOK.label
    : up
      ? `next: ${STEP_LOOK[up].label}`
      : 'playable'

  return (
    <button
      type="button"
      onClick={() => openMinigame(game.id)}
      title={`${game.number}. ${game.title} — ${says}`}
      data-minigame={game.id}
      style={{
        ...tile,
        opacity: game.reserved ? RESERVED_LOOK.fade : 1,
        borderLeft: `3px solid ${KIND_COLOUR[game.kind]}`,
      }}
    >
      <span style={tileTop}>
        <span style={{ opacity: 0.4 }}>{game.number}</span>
        {/* Three pips, one per stage, filled as each is finished. A tile is
            readable as a progress bar without anybody reading a word of it. */}
        {game.reserved ? (
          <span style={{ color: RESERVED_LOOK.colour, fontSize: 9 }}>{RESERVED_LOOK.label}</span>
        ) : (
          <span style={pips} title={says}>
            {BUILD_STEPS.map((step) => (
              <span
                key={step}
                style={{
                  ...pip,
                  background: game.done[step] ? STEP_LOOK[step].colour : 'transparent',
                  border: `1px solid ${STEP_LOOK[step].colour}`,
                  opacity: game.done[step] ? 1 : 0.35,
                }}
              />
            ))}
          </span>
        )}
      </span>
      <span style={tileTitle}>{game.title}</span>
      <span style={tilePitch}>{game.pitch}</span>
    </button>
  )
}

const grid: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: 'grid',
  gridTemplateColumns: `repeat(${COLUMNS}, 1fr)`,
  gap: 7,
}

const tile: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  gap: 3,
  minHeight: 0,
  overflow: 'hidden',
  padding: '6px 8px',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 8,
  background: 'rgba(255,255,255,0.04)',
  color: '#f2ece2',
  font: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
}

const tileTop: React.CSSProperties = {
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 6,
}

const tileTitle: React.CSSProperties = {
  flex: '0 0 auto',
  fontSize: 12,
  lineHeight: 1.25,
}

const tilePitch: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'hidden',
  fontSize: 9,
  lineHeight: 1.35,
  opacity: 0.5,
}

const footer: React.CSSProperties = {
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  marginTop: 8,
}

/** The three stage lights on a tile, and in the footer's legend. */
const pips: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 3,
}

const pip: React.CSSProperties = {
  display: 'inline-block',
  width: 6,
  height: 6,
  borderRadius: '50%',
  marginRight: 4,
  boxSizing: 'border-box',
}
