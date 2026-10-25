import { afterEach, describe, expect, it } from 'vitest'
import { claimPlayerInput, isPlayerInputLocked, registerPlayerInputBlocker } from '../internal/inputLock'

const releases:(()=>void)[]=[]
afterEach(()=>{releases.splice(0).forEach(release=>release())})

describe('player input leases',()=>{
  it('keeps input locked until every independent lease is released',()=>{
    const a=claimPlayerInput('casino'),b=claimPlayerInput('casino');releases.push(a,b)
    expect(isPlayerInputLocked()).toBe(true)
    a();a();expect(isPlayerInputLocked()).toBe(true)
    b();expect(isPlayerInputLocked()).toBe(false)
  })
  it('also respects composition-root input blocks and unregisters them on unmount',()=>{
    let blocked=true
    const source=registerPlayerInputBlocker(()=>blocked);releases.push(source)
    expect(isPlayerInputLocked()).toBe(true)
    const lease=claimPlayerInput('test');releases.push(lease)
    blocked=false;expect(isPlayerInputLocked()).toBe(true)
    lease();expect(isPlayerInputLocked()).toBe(false)
    blocked=true;expect(isPlayerInputLocked()).toBe(true)
    source();expect(isPlayerInputLocked()).toBe(false)
  })
  it('does not recurse if a composition callback also asks for the lock state',()=>{
    releases.push(registerPlayerInputBlocker(isPlayerInputLocked))
    expect(isPlayerInputLocked()).toBe(false)
    const lease=claimPlayerInput('nested');releases.push(lease)
    expect(isPlayerInputLocked()).toBe(true)
    lease();expect(isPlayerInputLocked()).toBe(false)
  })
})
