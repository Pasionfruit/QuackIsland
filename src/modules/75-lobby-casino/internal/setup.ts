import { lobbyRoster, myId, seedDealer } from '../../68-minigame-kit'

export const nextCasinoSeed=seedDealer('lobby-casino')
export function casinoSeat(){
  const me=myId()
  return lobbyRoster({solo:1,standIn:seat=>`Casino seat ${seat}`}).find(p=>p.id===me&&!p.bot)??null
}
