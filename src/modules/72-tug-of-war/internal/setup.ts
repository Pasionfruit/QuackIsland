import { oneVsAllSetup } from '../../68-minigame-kit'
import { createRound } from './rules'
export const kit=oneVsAllSetup({game:'tug-of-war',solo:5,standIn:(seat)=>`puller ${seat}`,createRound})
export const {newRound,waitingRound,nextSeed}=kit
export const gameRoster=kit.roster
