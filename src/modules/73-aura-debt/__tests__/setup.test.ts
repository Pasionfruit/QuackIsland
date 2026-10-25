import { describe, expect, it } from 'vitest'
import { oneVsAllProblems } from '../../68-minigame-kit'
import { kit } from '../internal/setup'

describe('Aura Debt kit setup',()=>{
  it('keeps the human as the solo rider and holds joining clients without a result',()=>{
    expect(oneVsAllProblems(kit,r=>r.players.find(p=>p.id===r.oneId),r=>r.players)).toEqual([])
  })
})
