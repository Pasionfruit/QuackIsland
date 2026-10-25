/** A screen owns a lease, so releasing one overlay never unlocks another. */
const leases=new Set<symbol>()
const sources=new Set<()=>boolean>()
let evaluatingSources=false

export function claimPlayerInput(owner:string):()=>void {
  const token=Symbol(owner);leases.add(token)
  return ()=>{leases.delete(token)}
}
export function isPlayerInputLocked():boolean {
  if(leases.size)return true
  if(evaluatingSources)return false
  evaluatingSources=true
  try{for(const source of sources)if(source())return true;return false}
  finally{evaluatingSources=false}
}
/** PlayerProps supplies composition-root blocks; this registration is internal. */
export function registerPlayerInputBlocker(source:()=>boolean):()=>void {
  sources.add(source)
  return ()=>{sources.delete(source)}
}
