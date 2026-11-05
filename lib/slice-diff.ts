// Keep fingerprints of the last server-confirmed state. A queued save only
// advances this baseline after success, so retries never omit unsaved edits.
export function sliceFingerprints(state: Record<string, unknown>) {
  return new Map(Object.entries(state).filter(([key]) => !key.startsWith("__")).map(([key,value]) => [key,JSON.stringify(value)]))
}
export function changedSlices(state: Record<string, unknown>, baseline: Map<string,string | undefined>) {
  const fingerprints=sliceFingerprints(state)
  const patch: Record<string,unknown>={}
  for(const [key,value] of Object.entries(state)) {
    if(!key.startsWith("__") && (!baseline.has(key)||baseline.get(key)!==fingerprints.get(key))) {
      Object.defineProperty(patch,key,{value,enumerable:true})
    }
  }
  return {patch,fingerprints}
}
