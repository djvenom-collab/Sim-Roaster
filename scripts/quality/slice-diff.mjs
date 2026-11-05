import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const compiled={exports:{}}
new Function('module','exports',ts.transpileModule(readFileSync(new URL('../../lib/slice-diff.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(compiled,compiled.exports)
const {sliceFingerprints,changedSlices}=compiled.exports
const original={staff:[{id:'s',rank:'before'}],history:Array.from({length:10000},(_,i)=>({id:String(i),text:'history'})),empty:[],__candidate:true}
const baseline=sliceFingerprints(original)
assert.deepEqual(changedSlices(original,baseline).patch,{})
original.staff[0].rank='after'
const result=changedSlices(original,baseline)
assert.deepEqual(Object.keys(result.patch),['staff'])
assert.ok(JSON.stringify(result.patch).length<JSON.stringify(original).length/1000)
assert.deepEqual(changedSlices(original,baseline).patch,result.patch,'Failed saves do not change the caller baseline')
assert.deepEqual(changedSlices(original,result.fingerprints).patch,{})
assert.deepEqual(changedSlices({...original,staff:[]},result.fingerprints).patch,{staff:[]})
assert.deepEqual(changedSlices({...original,added:[]},result.fingerprints).patch,{added:[]})
assert.ok(!Object.hasOwn(result.patch,'__candidate'))
console.log('PASS: only changed slices sent, metadata excluded, empty/new domains retained, success-only baseline, nested edits detected; synthetic payload reduced >1000x')
