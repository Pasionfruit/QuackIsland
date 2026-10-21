import { expect,it } from 'vitest'
import { oneVsAllProblems } from '../../68-minigame-kit'
import { kit } from '../internal/setup'

it('conforms to kit one-vs-all setup',()=>{
  expect(oneVsAllProblems(kit,r=>r.players.find(p=>p.id===r.soloId),r=>r.players)).toEqual([])
})
