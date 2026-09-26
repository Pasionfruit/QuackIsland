import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { BOARD_TILES, boardPosition, useBoardMovement, type BoardDieRoll } from '../../53-board-movement'
import { useParty } from '../../10-party'
import { useGameMode } from '../../13-modes'
import { minimapDots, spiralPoint, spiralRoute, type MinimapDot } from './layout'

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
    const lastMove = board.moves[board.moves.length - 1] ?? null
    root.current?.render(<MinimapOverlay dots={dots} dice={lastMove?.dice ?? []} rollKey={lastMove ? `${lastMove.playerId}:${lastMove.round}` : ''} visible={visible} />)
  }, [board.moves, dots, visible])

  return null
}

function MinimapOverlay({ dots, dice, rollKey, visible }: { dots: MinimapDot[]; dice: readonly BoardDieRoll[]; rollKey: string; visible: boolean }) {
  const [collapsed, setCollapsed] = useState(false)
  if (!visible) return null
  const route = spiralRoute(BOARD_TILES.length)
  return (
    <aside aria-label="Volcano Island player positions" style={styles.frame}>
      <style>{keyframes}</style>
      <button type="button" aria-expanded={!collapsed} aria-label={`${collapsed ? 'Show' : 'Hide'} summit route`} onClick={() => setCollapsed((was) => !was)} style={styles.caption}>
        <span>Summit route</span><small>{collapsed ? 'Show' : 'Hide'}</small>
      </button>
      {!collapsed && <div style={styles.route}>
          <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" style={styles.svg}>
            <polyline points={route.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke="#e4b66d" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.4" />
            <polyline points={route.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke="rgba(75,40,31,0.68)" strokeDasharray="1.5 3" strokeLinecap="round" strokeWidth="0.8" />
          </svg>
          <span aria-hidden="true" style={styles.start}>START</span>
          <span aria-hidden="true" style={styles.summit}>SUMMIT</span>
          {dots.map((dot) => <MapDot dot={dot} key={dot.id} />)}
        </div>}
      {dice.length > 0 ? <DiceRoll dice={dice} rollKey={rollKey} /> : null}
    </aside>
  )
}

function MapDot({ dot }: { dot: MinimapDot }) {
  const point = spiralPoint(dot.percent / 100 * (BOARD_TILES.length - 1), BOARD_TILES.length)
  return <span aria-label={`Player at ${Math.round(dot.percent)} percent of the route`} role="img" style={{ ...styles.dot, background: dot.colour, left: `${point.x}%`, top: `calc(${point.y}% + ${dot.lane * 10}px)` }} />
}

function DiceRoll({ dice, rollKey }: { dice: readonly BoardDieRoll[]; rollKey: string }) {
  const total = dice.reduce((sum, die) => sum + die.value, 0)
  return <div aria-label={`Latest roll: ${dice.map((die) => die.value).join(', ')}`} style={styles.roll}>
    <div style={styles.diceTray}>{dice.map((die, index) => <Die die={die} index={index} key={`${rollKey}:${index}:${die.value}`} />)}</div>
    <strong style={styles.rollResult}>Result {total}</strong>
    <span style={styles.rollBreakdown}>{dice.map((die) => `d${die.sides}: ${die.value}`).join(' + ')}</span>
  </div>
}

function d6Facing(value: number): string {
  switch (value) {
    case 2: return 'rotateY(-90deg)'
    case 3: return 'rotateX(90deg)'
    case 4: return 'rotateX(-90deg)'
    case 5: return 'rotateY(90deg)'
    case 6: return 'rotateY(180deg)'
    default: return ''
  }
}

function Die({ die, index }: { die: BoardDieRoll; index: number }) {
  const faces = die.sides === 6 ? [1, 6, 2, 5, 3, 4] : Array.from({ length: 6 }, () => die.value)
  const transforms = ['translateZ(18px)', 'rotateY(180deg) translateZ(18px)', 'rotateY(90deg) translateZ(18px)', 'rotateY(-90deg) translateZ(18px)', 'rotateX(90deg) translateZ(18px)', 'rotateX(-90deg) translateZ(18px)']
  return <div aria-label={`d${die.sides}, ${die.value}`} role="img" style={{ ...styles.die, animationDelay: `${index * 90}ms` }}>
    <div style={{ ...styles.cube, transform: `rotateX(-18deg) rotateY(28deg) ${die.sides === 6 ? d6Facing(die.value) : ''}` }}>
      {faces.map((face, faceIndex) => <span key={faceIndex} style={{ ...styles.face, transform: transforms[faceIndex] }}>{face}</span>)}
    </div>
    {die.sides !== 6 ? <small style={styles.sides}>d{die.sides}</small> : null}
  </div>
}

const keyframes = '@keyframes volcano-die-roll { 0% { transform: rotateX(0deg) rotateY(0deg) scale(.72); } 72% { transform: rotateX(720deg) rotateY(720deg) scale(1.12); } 100% { transform: rotateX(720deg) rotateY(720deg) scale(1); } }'

const styles: Record<string, React.CSSProperties> = {
  frame: {
    position: 'fixed', right: 18, top: 18, zIndex: 12,
    width: 'min(220px, calc(100vw - 36px))', padding: '10px 12px 11px', borderRadius: 16,
    background: 'rgba(10, 16, 25, 0.78)', border: '1px solid rgba(255, 255, 255, 0.18)',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.28)', pointerEvents: 'none', color: '#dce8ef',
    fontFamily: 'system-ui, sans-serif',
  },
  caption: { display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, padding: 0, border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.72, pointerEvents: 'auto' },
  route: { position: 'relative', height: 154, borderRadius: 12, background: 'radial-gradient(circle at 52% 45%, rgba(223,101,58,0.42), rgba(29,59,69,0.55) 46%, rgba(5,14,22,0.35) 76%)', overflow: 'hidden' },
  svg: { position: 'absolute', inset: 0, width: '100%', height: '100%' },
  start: { position: 'absolute', left: 5, bottom: 4, fontSize: 7, fontWeight: 800, opacity: 0.8 },
  summit: { position: 'absolute', left: '50%', top: '44%', transform: 'translate(-50%, -50%)', fontSize: 7, fontWeight: 800, color: '#fff2b0', textShadow: '0 1px 3px #3b1612' },
  dot: { position: 'absolute', width: 12, height: 12, borderRadius: '50%', transform: 'translate(-50%, -50%)', border: '2px solid rgba(255,255,255,0.95)', boxShadow: '0 1px 5px rgba(0,0,0,0.65)' },
  roll: { marginTop: 10, textAlign: 'center' },
  diceTray: { display: 'flex', justifyContent: 'center', gap: 10, minHeight: 42, perspective: 180 },
  die: { position: 'relative', width: 38, height: 38, transformStyle: 'preserve-3d', animation: 'volcano-die-roll 850ms cubic-bezier(.18,.8,.25,1) both' },
  cube: { position: 'absolute', inset: 0, transformStyle: 'preserve-3d', transform: 'rotateX(-18deg) rotateY(28deg)' },
  face: { position: 'absolute', inset: 1, display: 'grid', placeItems: 'center', borderRadius: 7, background: 'linear-gradient(145deg, #fff9e7, #d8d0bd)', border: '1px solid #8b765d', color: '#241b16', font: '800 15px/1 system-ui, sans-serif', boxShadow: 'inset 0 1px #fff' },
  sides: { position: 'absolute', right: -8, bottom: -7, padding: '1px 3px', borderRadius: 4, background: '#503018', color: '#fff5da', font: '700 8px/1 system-ui, sans-serif' },
  rollResult: { display: 'block', marginTop: 4, color: '#fff3c4', fontSize: 13, letterSpacing: '0.04em' },
  rollBreakdown: { display: 'block', marginTop: 1, fontSize: 9, opacity: 0.72 },
}
