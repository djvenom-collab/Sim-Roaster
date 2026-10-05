#!/usr/bin/env node
// AI scope tripwire. docs/ai-governance.md records that Sim-Roaster has no
// runtime AI. This check fails if an AI/ML dependency, import, or provider
// endpoint appears, so that scope statement cannot silently become false.
//
//   node scripts/ai/check-ai-scope.mjs          # exit 0 = still no AI, 1 = review required
//
// It is read-only and needs no credentials.
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const ROOT = new URL("../..", import.meta.url).pathname

const AI_PACKAGES = [
  /^ai$/, /^@ai-sdk\//, /^openai$/, /^@anthropic-ai\//, /^@google\/generative-ai$/, /^@google\/genai$/,
  /^@mistralai\//, /^cohere-ai$/, /^groq-sdk$/, /^@fal-ai\//, /^replicate$/, /^@huggingface\//,
  /^langchain$/, /^@langchain\//, /^llamaindex$/, /^@tensorflow\//, /^onnxruntime/, /^@xenova\/transformers$/,
  /^@vercel\/ai/, /^ollama$/, /^@pinecone-database\//, /^@upstash\/vector$/,
]
// Packages whose names contain "ai" but which were reviewed and do not call a model.
const REVIEWED_NOT_AI = new Set(["@autonoma-ai/sdk"])

const SOURCE_PATTERNS = [
  /from\s+["'](ai|openai|@ai-sdk\/[^"']+|@anthropic-ai\/[^"']+|@langchain\/[^"']+)["']/,
  /\b(generateText|streamText|generateObject|streamObject|embedMany)\s*\(/,
  /api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|ai-gateway\.vercel\.sh|api\.mistral\.ai|api\.groq\.com|fal\.run/,
  /process\.env\.(OPENAI|ANTHROPIC|AI_GATEWAY|GOOGLE_GENERATIVE_AI|MISTRAL|GROQ|FAL|XAI)_/,
]
const SCAN_DIRS = ["app", "components", "lib", "hooks", "proxy.ts", "scripts"]
const SKIP = new Set(["node_modules", ".next", ".git", "ai"])

const findings = []

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"))
for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies })) {
  if (REVIEWED_NOT_AI.has(name)) continue
  if (AI_PACKAGES.some((re) => re.test(name))) findings.push(`package.json: dependency "${name}"`)
}

function walk(path) {
  let st
  try { st = statSync(path) } catch { return }
  if (st.isDirectory()) {
    for (const entry of readdirSync(path)) if (!SKIP.has(entry)) walk(join(path, entry))
    return
  }
  if (!/\.(ts|tsx|js|mjs|cjs)$/.test(path)) return
  const lines = readFileSync(path, "utf8").split("\n")
  lines.forEach((line, i) => {
    if (SOURCE_PATTERNS.some((re) => re.test(line))) findings.push(`${relative(ROOT, path)}:${i + 1}: ${line.trim().slice(0, 120)}`)
  })
}
for (const d of SCAN_DIRS) walk(join(ROOT, d))

if (findings.length === 0) {
  console.log("AI scope check: no AI/ML dependency, import, or provider endpoint found. docs/ai-governance.md scope statement holds.")
  process.exit(0)
}
console.error("AI scope check: possible AI functionality detected. Before merging, follow docs/ai-governance.md section 5 (Introducing AI):")
for (const f of findings) console.error(`  - ${f}`)
process.exit(1)
