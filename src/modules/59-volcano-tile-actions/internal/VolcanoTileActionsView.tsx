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
  VOLCANO_TILE_KINDS,
  VOLCANO_CHECKPOINTS,
  buildVolcanoTileActions,
  resolveVolcanoTileAction,
  type VolcanoTileAction,
  type VolcanoTileActionKind,
  type VolcanoCheckpoint,
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
  const colour = matching[0].colour
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, matching.length]} frustumCulled={false}>
      <cylinderGeometry args={[0.38, 0.38, 0.07, 18]} />
      <meshStandardMaterial
        color={colour}
        emissive={colour}
        emissiveIntensity={kind === 'regular' ? 0.08 : 0.42}
        roughness={0.64}
        metalness={0.08}
      />
    </instancedMesh>
  )
}

function CheckpointMarker({ checkpoint }: { checkpoint: VolcanoCheckpoint }): React.JSX.Element {
  const point = boardPointAt(checkpoint.tileIndex)
  const position: [number, number, number] = [point.x, point.y + 0.28, point.z]
  if (checkpoint.kind === 'crates_barrels') {
    return <group position={position} name={checkpoint.label}>
      <mesh position={[-0.22, 0.12, 0]}><boxGeometry args={[0.27, 0.27, 0.27]} /><meshStandardMaterial color="#8a4c26" roughness={0.82} /></mesh>
      <mesh position={[0.2, 0.13, 0]}><cylinderGeometry args={[0.12, 0.14, 0.31, 10]} /><meshStandardMaterial color="#a9572c" roughness={0.72} /></mesh>
    </group>
  }
  if (checkpoint.kind === 'wall') {
    return <mesh position={position} name={checkpoint.label} castShadow><boxGeometry args={[0.8, 0.42, 0.16]} /><meshStandardMaterial color="#71808a" roughness={0.9} /></mesh>
  }
  if (checkpoint.kind === 'treasure') {
    return <group position={position} name={checkpoint.label}>
      <mesh position={[0, 0.1, 0]}><boxGeometry args={[0.42, 0.24, 0.29]} /><meshStandardMaterial color="#865018" roughness={0.62} /></mesh>
      <mesh position={[0, 0.24, 0]}><boxGeometry args={[0.44, 0.05, 0.31]} /><meshStandardMaterial color="#f6c84a" emissive="#d88918" emissiveIntensity={0.45} /></mesh>
    </group>
  }
  return <group position={position} name={checkpoint.label}>
    <mesh position={[0, 0.16, 0]}><cylinderGeometry args={[0.15, 0.18, 0.34, 12]} /><meshStandardMaterial color="#fff0a6" roughness={0.68} /></mesh>
    <mesh position={[0, 0.38, 0]}><coneGeometry args={[0.3, 0.2, 12]} /><meshStandardMaterial color="#f5d04d" roughness={0.7} /></mesh>
  </group>
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
      {VOLCANO_TILE_KINDS.map((kind) => <ActionInstances actions={actions} kind={kind} key={kind} />)}
      {VOLCANO_CHECKPOINTS.map((checkpoint) => <CheckpointMarker checkpoint={checkpoint} key={checkpoint.tileIndex} />)}
    </group>
  )
}
