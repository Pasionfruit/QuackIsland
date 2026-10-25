// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { watchSitKeys } from '../internal/rest'

const cleanups:(()=>void)[]=[]
afterEach(()=>{cleanups.splice(0).forEach(f=>f());document.body.replaceChildren()})
const key=(type:string,code:string,target:EventTarget=window)=>target.dispatchEvent(new KeyboardEvent(type,{code,bubbles:true}))

describe('hold-Control sit input',()=>{
  it('waits until both Control keys are released and clears on blur',()=>{
    let seated=false
    cleanups.push(watchSitKeys(value=>{seated=value},()=>true))
    key('keydown','ControlLeft');expect(seated).toBe(true)
    key('keydown','ControlRight');key('keyup','ControlLeft');expect(seated).toBe(true)
    key('keyup','ControlRight');expect(seated).toBe(false)
    key('keydown','ControlLeft');window.dispatchEvent(new Event('blur'));expect(seated).toBe(false)
  })
  it('respects blocked input and text fields and removes its listeners',()=>{
    let seated=false,enabled=false
    const stop=watchSitKeys(value=>{seated=value},()=>enabled);cleanups.push(stop)
    key('keydown','ControlLeft');expect(seated).toBe(false)
    enabled=true
    const input=document.createElement('input');document.body.append(input)
    key('keydown','ControlLeft',input);expect(seated).toBe(false)
    key('keydown','ControlLeft');expect(seated).toBe(true)
    key('keyup','ControlLeft',input);expect(seated).toBe(false)
    stop();key('keydown','ControlLeft');expect(seated).toBe(false)
  })
})
