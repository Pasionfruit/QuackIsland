import type { PlayerState } from './controller'

/** Fold the feet and settle the belly smoothly, on water or on land. */
export function advanceRest(amount: number, state: Pick<PlayerState, 'swimming'|'sitting'|'stun'|'grounded'>, delta: number): number {
  if (!Number.isFinite(delta) || delta <= 0) return amount
  const seated = state.stun <= 0 && (state.swimming || (state.grounded && !!state.sitting))
  const next = amount + ((seated ? 1 : 0) - amount) * (1 - Math.exp(-12 * Math.min(delta,.1)))
  if (next < .0001) return 0
  if (next > .9999) return 1
  return next
}

/** Separate held-key listener so both Control keys release reliably. */
export function watchSitKeys(set: (held: boolean)=>void, enabled: ()=>boolean): ()=>void {
  const held = new Set<string>()
  const isControl = (code: string)=>code==='ControlLeft'||code==='ControlRight'
  const clear = ()=>{held.clear();set(false)}
  const down = (event: KeyboardEvent)=>{
    if (!isControl(event.code) || !enabled()) return
    const target=event.target as HTMLElement|null
    if (target && (target.tagName==='INPUT'||target.tagName==='TEXTAREA'||target.isContentEditable)) return
    held.add(event.code);set(true)
  }
  const up = (event: KeyboardEvent)=>{
    if (!isControl(event.code)) return
    held.delete(event.code);set(held.size>0 && enabled())
  }
  window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',clear)
  document.addEventListener('visibilitychange',clear)
  return ()=>{
    window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',clear)
    document.removeEventListener('visibilitychange',clear);clear()
  }
}
