import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { InstancedMesh, Matrix4 } from 'three'
import { useParty } from '../../10-party'
import { useGameMode } from '../../13-modes'
import {
  boardPointAt,
  boardPosition,
  setBoardLandingEffectResolver,
  useBoardMovement,
} from '../../53-board-movement'
import {
  VOLCANO_TILE_ACTIONS,
  buildVolcanoTileActions,
  resolveVolcanoTileAction,
  volcanoTileActionAt,
  type VolcanoTileAction,
  type VolcanoTileActionKind,
} from './rules'
import './volcano-tile-actions.css'

function ActionInstances({ actions, kind }: {
  actions: readonly VolcanoTileAction[]
  kind: VolcanoTileActionKind
}): React.JSX.Element | null {
  const matching = useMemo(() => actions.filter((action) => action.kind === kind), [actions, kind])
  const mesh = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    if (!mesh.current) return
    const matrix = new Matrix4()
    matching.forEach((action, index) => {
      const point = boardPointAt(action.tileIndex)
      matrix.makeTranslation(point.x, point.y + 0.08, point.z)
      mesh.current?.setMatrixAt(index, matrix)
    })
    mesh.current.instanceMatrix.needsUpdate = true
  }, [matching])
  if (matching.length === 0) return null
  const colour = kind === 'lava_lift'
    ? VOLCANO_TILE_ACTIONS.lavaLift.colour
    : VOLCANO_TILE_ACTIONS.ashSlide.colour
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, matching.length]} frustumCulled={false}>
      <cylinderGeometry args={[0.38, 0.38, 0.07, 18]} />
      <meshStandardMaterial
        color={colour}
        emissive={colour}
        emissiveIntensity={kind === 'lava_lift' ? 0.48 : 0.18}
        roughness={0.64}
        metalness={0.08}
      />
    </instancedMesh>
  )
}

function VolcanoTileActionOverlay(): React.JSX.Element | null {
  const mode = useGameMode()
  const party = useParty()
  const board = useBoardMovement()
  const actions = useMemo(
    () => buildVolcanoTileActions(board.tileCount, board.seed),
    [board.seed, board.tileCount],
  )
  const lastMove = board.moves[board.moves.length - 1]
  const action = lastMove ? volcanoTileActionAt(actions, lastMove.toTile) : null
  const finalTile = lastMove ? boardPosition(board, lastMove.playerId) : null
  const triggered = Boolean(
    action &&
    lastMove?.round === board.round &&
    finalTile !== null &&
    finalTile !== lastMove.toTile,
  )
  const playerName = lastMove
    ? board.players.find((player) => player.id === lastMove.playerId)?.name ?? lastMove.playerId
    : ''
  const active = mode === 'island' && party.phase === 'playing' && board.phase !== 'idle' && board.phase !== 'invalid'
  if (!active) return null
  return (
    <aside className="volcano-tile-actions-hud" aria-label="Volcano tile actions">
      <div className="volcano-tile-actions-legend">
        <strong>Action tiles</strong>
        <span data-kind="lava_lift"><i /> Lava Lift <b>+3</b></span>
        <span data-kind="ash_slide"><i /> Ash Slide <b>−2</b></span>
      </div>
      {triggered && action && (
        <div className="volcano-tile-actions-result" data-kind={action.kind} aria-live="polite">
          <strong>{action.label}</strong>
          <span>{playerName} {action.effect.moveBy > 0 ? 'surges forward' : 'slides backward'} {Math.abs(action.effect.moveBy)} tiles</span>
        </div>
      )}
    </aside>
  )
}

export function VolcanoTileActions(): React.JSX.Element | null {
  const mode = useGameMode()
  const party = useParty()
  const board = useBoardMovement()
  const actions = useMemo(
    () => buildVolcanoTileActions(board.tileCount, board.seed),
    [board.seed, board.tileCount],
  )

  useEffect(() => {
    setBoardLandingEffectResolver(resolveVolcanoTileAction)
    return () => setBoardLandingEffectResolver(null)
  }, [])

  useEffect(() => {
    const mount = document.createElement('div')
    mount.dataset.volcanoTileActionsRoot = 'true'
    document.body.append(mount)
    const root = createRoot(mount)
    root.render(<VolcanoTileActionOverlay />)
    return () => {
      root.unmount()
      mount.remove()
    }
  }, [])

  const active = mode === 'island' && party.phase === 'playing' && board.phase !== 'idle' && board.phase !== 'invalid'
  if (!active || actions.length === 0) return null
  return (
    <group name="volcano-tile-actions">
      <ActionInstances actions={actions} kind="lava_lift" />
      <ActionInstances actions={actions} kind="ash_slide" />
    </group>
  )
}
