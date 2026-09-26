import { useEffect, useMemo, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { BOARD_TILES, boardPosition, useBoardMovement } from '../../53-board-movement'
import { useParty } from '../../10-party'
import { useGameMode } from '../../13-modes'
import { minimapDots, type MinimapDot } from './layout'

/** A DOM overlay mounted beside the canvas so it adds no WebGL work. */
export function VolcanoMinimap() {
  const root = useRef<Root | null>(null)
  const mount = useRef<HTMLDivElement | null>(null)
  const party = useParty()
  const mode = useGameMode()
  const board = useBoardMovement()
  const dots = useMemo(() => {
    const players = board.players.flatMap((player) => {
      const position = boardPosition(board, player.id)
      return position === null ? [] : [{ id: player.id, position }]
    })
    return minimapDots(players, BOARD_TILES.length)
  }, [board])
  const visible = party.phase === 'playing' && mode === 'island' && dots.length > 0

  useEffect(() => {
    const host = document.createElement('div')
    host.dataset.volcanoMinimap = ''
    document.body.append(host)
    mount.current = host
    root.current = createRoot(host)
    return () => {
      root.current?.unmount()
      root.current = null
      mount.current?.remove()
      mount.current = null
    }
  }, [])

  useEffect(() => {
    root.current?.render(<MinimapOverlay dots={dots} visible={visible} />)
  }, [dots, visible])

  return null
}

function MinimapOverlay({ dots, visible }: { dots: MinimapDot[]; visible: boolean }) {
  if (!visible) return null
  return (
    <aside aria-label="Volcano Island player positions" style={styles.frame}>
      <span style={styles.caption}>Summit route</span>
      <div style={styles.route}>
        <span aria-hidden="true" style={styles.start}>START</span>
        <span aria-hidden="true" style={styles.summit}>SUMMIT</span>
        {dots.map((dot) => (
          <span
            aria-label={`Player at ${Math.round(dot.percent)} percent of the route`}
            key={dot.id}
            role="img"
            style={{ ...styles.dot, background: dot.colour, left: `${dot.percent}%`, top: `calc(50% + ${dot.lane * 11}px)` }}
          />
        ))}
      </div>
    </aside>
  )
}

const styles: Record<string, React.CSSProperties> = {
  frame: {
    position: 'fixed', left: '50%', bottom: 18, transform: 'translateX(-50%)', zIndex: 12,
    width: 'min(560px, calc(100vw - 48px))', padding: '10px 14px 13px', borderRadius: 12,
    background: 'rgba(10, 16, 25, 0.78)', border: '1px solid rgba(255, 255, 255, 0.18)',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.28)', pointerEvents: 'none', color: '#dce8ef',
    fontFamily: 'system-ui, sans-serif',
  },
  caption: { display: 'block', marginBottom: 8, fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.72 },
  route: { position: 'relative', height: 18, margin: '0 18px', borderRadius: 99, background: 'linear-gradient(90deg, #396d72, #967448 42%, #cf5a35 76%, #f5d06f)' },
  start: { position: 'absolute', left: -18, top: 25, fontSize: 8, fontWeight: 800, opacity: 0.7 },
  summit: { position: 'absolute', right: -22, top: 25, fontSize: 8, fontWeight: 800, opacity: 0.7 },
  dot: { position: 'absolute', width: 13, height: 13, borderRadius: '50%', transform: 'translate(-50%, -50%)', border: '2px solid rgba(255,255,255,0.95)', boxShadow: '0 1px 5px rgba(0,0,0,0.65)' },
}
