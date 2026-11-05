import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const source = readFileSync(new URL('../../lib/repository/migration-test.ts',import.meta.url),'utf8')
const js = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
const compiled={exports:{}}
let configs=[]
new Function('require','module','exports',js)((name)=>{
 if(name==='server-only')return {}
 if(name==='pg')return {Pool:class{constructor(config){configs.push(config)}}}
 if(name==='@/lib/db/connection-string')return {explicitPostgresTls:(s)=>s}
 throw Error(name)
},compiled,compiled.exports)
const keys=['VERCEL_ENV','VERCEL_GIT_COMMIT_REF','DATABASE_URL','MIGRATION_TEST_DATABASE_URL']
const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]))
try{
 process.env.VERCEL_ENV='production'
 process.env.VERCEL_GIT_COMMIT_REF='storage/migration-candidate'
 process.env.DATABASE_URL='postgresql://synthetic:fake@live.invalid/db'
 process.env.MIGRATION_TEST_DATABASE_URL='postgresql://synthetic:fake@test.invalid/db'
 assert.throws(()=>compiled.exports.migrationTestPool(),/disabled/)
 process.env.VERCEL_ENV='preview';process.env.VERCEL_GIT_COMMIT_REF='main'
 assert.throws(()=>compiled.exports.migrationTestPool(),/disabled/)
 process.env.VERCEL_GIT_COMMIT_REF='storage/migration-candidate'
 delete process.env.MIGRATION_TEST_DATABASE_URL
 assert.throws(()=>compiled.exports.migrationTestPool(),/missing/)
 process.env.MIGRATION_TEST_DATABASE_URL='postgresql://synthetic:fake@live.invalid/db'
 assert.throws(()=>compiled.exports.migrationTestPool(),/not isolated/)
 process.env.MIGRATION_TEST_DATABASE_URL='postgresql://synthetic:fake@live-pooler.invalid/db'
 assert.throws(()=>compiled.exports.migrationTestPool(),/not isolated/)
 process.env.MIGRATION_TEST_DATABASE_URL='postgresql://synthetic:fake@test.invalid/db'
 compiled.exports.migrationTestPool()
 assert.equal(configs.length,1)
 assert.equal(configs[0].max,3)
 assert.ok(configs[0].connectionString.includes('test.invalid'))
}finally{for(const k of keys){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k]}}
console.log('PASS: rehearsal denied in production, wrong branch, missing test credentials or matching endpoint; no live fallback')
