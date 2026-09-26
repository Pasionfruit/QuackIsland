import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { InstancedMesh, Matrix4 } from 'three'
import { useParty } from '../../10-party'
import { useGameMode } from '../../13-modes'
import {
  boardPointAt,
  setBoardLandingEffectResolver,
  useBoardMovement,
} from '../../53-board-movement'
import {
  VOLCANO_TILE_ACTIONS,
  buildVolcanoTileActions,
  resolveVolcanoTileAction,
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

  const active = mode === 'island' && party.phase === 'playing' && board.phase !== 'idle' && board.phase !== 'invalid'
  if (!active || actions.length === 0) return null
  return (
    <group name="volcano-tile-actions">
      <ActionInstances actions={actions} kind="lava_lift" />
      <ActionInstances actions={actions} kind="ash_slide" />
    </group>
  )
}
