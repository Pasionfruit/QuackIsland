/**
 * Every minigame there is going to be, twenty to a page.
 *
 * **Five across and four down, always**, and pages for the rest: the tiles are
 * big enough to read and to hit, and they stay that size whatever is on the
 * page. A page with fewer than twenty on it - the last one, or a filter down to
 * a handful - keeps the grid and leaves the rest of it empty rather than
 * stretching what is there to fill it. A slot nobody has named yet is drawn
 * faint rather than left out, so the gap between what is planned and what is
 * built is still the thing you see.
 *
 * **Paging**: the arrows under the grid, the dots between them, or the left and
 * right arrow keys. Picking a filter goes back to its first page. The page and
 * the filter are remembered while the screen is open - so stepping back out of a
 * game lands on the page it was picked from - and forgotten when it closes.
 *
 * **A tile is a number, a name and three pips, and nothing else.** No
 * description: the grid is for picking a game rather than for reading about
 * one. What a game is lives behind its own screen, one tab along.
 *
 * It never scrolls: the four rows share out whatever height is left under the
 * bar.
 */
import { useEffect, useState } from 'react'
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
import { builtMinigames } from './registry'
import { backOut, dashboardWas, openMinigame, rememberDashboard } from './state'
import { SELECT_GAME_SOUND, clicked } from './sound'

/** Five across and four down: twenty tiles to a page. */
export const COLUMNS = 5
export const ROWS = 4
export const PER_PAGE = COLUMNS * ROWS

type Filter = 'all' | MinigameKind

/** How many pages `count` tiles come to: always at least one, even with nothing on it. */
export function pageCount(count: number): number {
  return Math.max(1, Math.ceil(count / PER_PAGE))
}

/** What is on page `page` (from 0) of a list, and which page that really is once it is kept in range. */
export function pageOf<T>(list: readonly T[], page: number): { page: number; items: readonly T[] } {
  const at = Math.max(0, Math.min(pageCount(list.length) - 1, Math.floor(page)))
  return { page: at, items: list.slice(at * PER_PAGE, (at + 1) * PER_PAGE) }
}

export function Dashboard() {
  // Where it was left, if a game was opened from it and stepped back out of.
  const was = dashboardWas()
  const [filter, setFilterNow] = useState<Filter>(was.filter as Filter)
  const [asked, setAsked] = useState(was.page)

  const games = filter === 'all' ? MINIGAMES : minigamesOfKind(filter)
  const far = progress(games)
  const pages = pageCount(games.length)
  const { page, items } = pageOf(games, asked)
  const built = builtMinigames().length

  const setFilter = (next: Filter) => {
    rememberDashboard({ filter: next, page: 0 })
    setFilterNow(next)
    setAsked(0)
  }

  const turnTo = (next: number) => {
    const to = Math.max(0, Math.min(pages - 1, next))
    rememberDashboard({ filter, page: to })
    setAsked(to)
  }

  // The left and right arrow keys turn the page too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'ArrowLeft' && e.code !== 'ArrowRight') return
      e.preventDefault()
      turnTo(page + (e.code === 'ArrowRight' ? 1 : -1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div style={screen}>
      <div style={bar}>
        <span style={wordmark}>Minigames</span>
        <span style={{ color: ISLAND.fadedInk }}>Volcano Island</span>

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

        <button type="button" onClick={clicked(backOut)} style={{ ...button, marginLeft: 8 }}>
          close
        </button>
      </div>

      <div style={body}>
        <div style={grid} data-grid={`${COLUMNS}x${ROWS}`}>
          {items.map((game) => (
            <Tile key={game.id} game={game} />
          ))}
        </div>

        {/* The pages: back, where you are, on. Drawn even when there is only one,
            so the grid above it never moves. */}
        <div style={pager} data-page={`${page + 1}/${pages}`}>
          <button
            type="button"
            onClick={clicked(() => turnTo(page - 1))}
            disabled={page === 0}
            aria-label="previous page"
            data-page-prev
            style={{ ...button, ...arrow, opacity: page === 0 ? 0.35 : 1 }}
          >
            &lsaquo;
          </button>

          <span style={dots}>
            {Array.from({ length: pages }, (_, k) => (
              <button
                key={k}
                type="button"
                onClick={clicked(() => turnTo(k))}
                aria-label={`page ${k + 1}`}
                data-page-dot={k + 1}
                style={{ ...dot, background: k === page ? ISLAND.deepSea : 'transparent' }}
              />
            ))}
          </span>

          <span style={pageLabel}>
            page {page + 1} of {pages}
          </span>

          <button
            type="button"
            onClick={clicked(() => turnTo(page + 1))}
            disabled={page >= pages - 1}
            aria-label="next page"
            data-page-next
            style={{ ...button, ...arrow, opacity: page >= pages - 1 ? 0.35 : 1 }}
          >
            &rsaquo;
          </button>
        </div>

        {/* The progress report, which is what a dashboard of templates is for:
            how many slots, how many named, and how far the three stages have
            got across all of them. */}
        <div style={footer}>
          <span>
            {far.slots} slots · {far.named} named · {far.reserved} free
          </span>
          <span style={{ flex: 1 }} />
          {BUILD_STEPS.map((step) => (
            <span key={step}>
              <span style={{ ...pip, background: STEP_LOOK[step].colour }} />
              {STEP_LOOK[step].label} {far.steps[step]}/{far.named}
            </span>
          ))}
          <span>· {built} registered</span>
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
      onClick={clicked(() => onPick(is))}
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
 * number, and the screen behind it is where its name will go.
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
      onClick={clicked(() => openMinigame(game.id), SELECT_GAME_SOUND)}
      title={`${game.number}. ${game.title} — ${says}`}
      data-minigame={game.id}
      style={{
        ...tile,
        opacity: game.reserved ? RESERVED_LOOK.fade : 1,
        borderBottom: `4px solid ${KIND_COLOUR[game.kind]}`,
      }}
    >
      <span style={tileTop}>
        <span style={tileNumber}>{game.number}</span>
        {/* Three pips, one per stage, filled as each is finished. A tile is
            readable as a progress bar without anybody reading a word of it. */}
        {game.reserved ? null : (
          <span style={pips} title={says}>
            {BUILD_STEPS.map((step) => (
              <span
                key={step}
                style={{
                  ...pip,
                  marginRight: 0,
                  background: game.done[step] ? STEP_LOOK[step].colour : 'transparent',
                  border: `2px solid ${STEP_LOOK[step].colour}`,
                  opacity: game.done[step] ? 1 : 0.4,
                }}
              />
            ))}
          </span>
        )}
      </span>
      <span style={tileTitle}>{game.reserved ? RESERVED_LOOK.label : game.title}</span>
    </button>
  )
}

const grid: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: 'grid',
  gridTemplateColumns: `repeat(${COLUMNS}, 1fr)`,
  // Four rows whatever is on the page, so a short page keeps its tiles the size of a full one's.
  gridTemplateRows: `repeat(${ROWS}, 1fr)`,
  gap: 12,
}

const pager: React.CSSProperties = {
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 14,
  marginTop: 10,
}

const arrow: React.CSSProperties = { padding: '2px 16px', font: `700 20px/1.2 ${FONT}` }

const dots: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 }

const dot: React.CSSProperties = {
  width: 12,
  height: 12,
  padding: 0,
  borderRadius: '50%',
  border: `2px solid ${ISLAND.deepSea}`,
  cursor: 'pointer',
}

const pageLabel: React.CSSProperties = {
  font: `600 13px/1.4 ${FONT}`,
  color: ISLAND.deepSea,
  minWidth: 92,
  textAlign: 'center',
}

const tile: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  justifyContent: 'space-between',
  gap: 4,
  minHeight: 0,
  overflow: 'hidden',
  padding: '12px 14px 10px',
  border: 'none',
  borderRadius: 14,
  background: ISLAND.sand,
  boxShadow: '0 3px 0 rgba(0,0,0,0.12)',
  color: ISLAND.ink,
  font: `600 13px/1.25 ${FONT}`,
  textAlign: 'left',
  cursor: 'pointer',
}

const tileTop: React.CSSProperties = {
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 6,
}

const tileNumber: React.CSSProperties = {
  font: `700 18px/1 ${FONT}`,
  color: ISLAND.fadedInk,
}

const tileTitle: React.CSSProperties = {
  flex: '0 0 auto',
  display: '-webkit-box',
  WebkitLineClamp: 3,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  fontSize: 17,
  lineHeight: 1.2,
}

const footer: React.CSSProperties = {
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  marginTop: 10,
  font: `500 12px/1.4 ${FONT}`,
  color: ISLAND.deepSea,
}

/** The three stage lights on a tile, and in the footer's legend. */
const pips: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
}

const pip: React.CSSProperties = {
  display: 'inline-block',
  width: 8,
  height: 8,
  borderRadius: '50%',
  marginRight: 5,
  boxSizing: 'border-box',
  verticalAlign: 'middle',
}
