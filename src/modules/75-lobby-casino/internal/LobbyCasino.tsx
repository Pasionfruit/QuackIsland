import { useEffect, useMemo } from 'react'
import { MeshBasicMaterial, MeshStandardMaterial } from 'three'
import { sampleAt } from '../../01-terrain'
import { claimPlayerInput } from '../../02-player'
import { useParty } from '../../10-party'
import { getSolidRocks } from '../../12-rocks'
import { useMinigameScreen } from '../../15-minigames'
import { casinoAtlas } from './atlas'
import { casinoGeometry } from './geometry'
import { layoutCasino, stationMatrix } from './layout'
import { casinoOverlayGeometry } from './overlays'
import { CasinoInteraction } from './CasinoInteraction'

export const getCasinoStations=()=>layoutCasino(sampleAt,getSolidRocks())

export function LobbyCasino(){
  const stations=useMemo(getCasinoStations,[])
  const pieces=useMemo(()=>stations.map(station=>({station,matrix:stationMatrix(station),geometry:casinoGeometry(station.kind)})),[stations])
  const atlas=useMemo(casinoAtlas,[])
  const graphics=useMemo(()=>casinoOverlayGeometry(stations),[stations])
  const material=useMemo(()=>new MeshStandardMaterial({vertexColors:true,roughness:.7,flatShading:true}),[])
  const ink=useMemo(()=>new MeshBasicMaterial({map:atlas,transparent:true,depthWrite:false,toneMapped:false}),[atlas])
  const party=useParty(),screen=useMinigameScreen()
  useEffect(()=>()=>{
    pieces.forEach(p=>p.geometry.dispose());graphics.dispose();material.dispose();ink.dispose();atlas.dispose()
  },[pieces,graphics,material,ink,atlas])
  return <group name="lobby-casino" visible={party.phase!=='playing'&&screen.at!=='game'} dispose={null}>
    {pieces.map(({station,matrix,geometry})=><group key={station.kind} name={`station-${station.kind}`} matrix={matrix} matrixAutoUpdate={false}>
      <mesh geometry={geometry} material={material} castShadow receiveShadow/>
    </group>)}
    <mesh name="casino-printing" geometry={graphics} material={ink}/>
    <CasinoInteraction stations={stations} enabled={party.phase!=='playing'&&screen.at==='closed'} lockInput={claimPlayerInput}/>
  </group>
}
