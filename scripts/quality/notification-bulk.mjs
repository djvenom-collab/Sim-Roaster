// Recipient-only bulk soft-delete; synthetic messages, no network/storage.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"
const source = readFileSync(new URL("../../lib/notification-actions.ts", import.meta.url), "utf8")
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } })
const compiled = { exports: {} }
new Function("module", "exports", outputText)(compiled, compiled.exports)
const { deleteOwnNotifications } = compiled.exports
const records = [
  { id: "a", staffId: "me", subject: "First", readAt: "read", flagged: true, attachments: [{ id: "file" }] },
  { id: "b", staffId: "me", subject: "Second" },
  { id: "c", staffId: "other", subject: "Not mine" },
  { id: "d", staffId: "me", deletedAt: "earlier" },
]
const before = structuredClone(records)
const after = deleteOwnNotifications(records, ["a", "a", "b", "c", "d", "missing"], "me", "now")
assert.equal(after.length, records.length, "Admin history remains intact")
assert.deepEqual(after.slice(0, 2), records.slice(0, 2).map((n) => ({ ...n, deletedAt: "now" })))
assert.equal(after[2], records[2], "Never change another recipient's notification")
assert.equal(after[3], records[3], "Do not overwrite earlier deletion timestamps")
assert.deepEqual(records, before, "Do not mutate input state")
assert.equal(deleteOwnNotifications(after, ["a", "b"], "me", "later"), after, "Idempotent repeats do not trigger autosave")
assert.equal(deleteOwnNotifications(records, [], "me", "now"), records)
assert.equal(deleteOwnNotifications(records, ["a"], undefined, "now"), records)
assert.equal(deleteOwnNotifications(records, ["c"], "me", "now"), records)
console.log("PASS: multi-delete retains history/metadata, respects recipient, ignores duplicates/stale IDs and is idempotent")

// Exercise actual page event handlers with a deterministic hook/store renderer.
const jsx = await import('react/jsx-runtime')
let slots = []
let index = 0
let deleted = []
const ui = new Proxy({}, { get: (_target, name) => name })
let inbox = records.slice(0, 2).map((n) => ({ ...n, body: '', sentBy: 'Test' }))
const pageSource = readFileSync(new URL('../../app/(authenticated)/notifications/page.tsx', import.meta.url), 'utf8')
const pageCode = ts.transpileModule(pageSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText
const pageModule = { exports: {} }
new Function('require', 'module', 'exports', pageCode)((name) => {
  if (name === 'react/jsx-runtime') return jsx
  if (name === 'react') return { useMemo: (fn) => fn(), useState: (initial) => { const slot = index++; if (!(slot in slots)) slots[slot] = initial; return [slots[slot], (next) => { slots[slot] = typeof next === 'function' ? next(slots[slot]) : next }] } }
  if (name === '@/lib/store') return { useStore: () => ({ notificationsReady: true, currentUser: { staffId: 'me', name: 'Test' }, notificationsForStaff: () => inbox, deleteNotifications: (ids) => { deleted.push(ids) }, markNotificationRead() {}, toggleNotificationFlag() {}, deleteNotification() {} }) }
  if (name === 'sonner') return { toast: { success() {} } }
  return ui
}, pageModule, pageModule.exports)
const render = () => { index = 0; return pageModule.exports.default() }
const elements = (node) => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(elements) : [node, ...elements(node.props?.children)]
const text = (node) => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : String(node ?? '')
const find = (predicate) => elements(render()).find(predicate)
const rows = () => elements(render()).filter((n) => n.type === 'InboxItem')
const button = (label) => find((n) => n.type === 'Button' && text(n).trim() === label)
rows()[0].props.onSelect(true)
assert.ok(rows()[0].props.selected)
rows()[1].props.onSelect(true)
assert.equal(button('Delete selected (2)').props.disabled, false)
button('Delete selected (2)').props.onClick()
assert.equal(deleted.length, 0, 'Requesting bulk delete only opens confirmation')
button('Cancel').props.onClick()
assert.equal(deleted.length, 0, 'Cancel never mutates messages')
button('Delete selected (2)').props.onClick()
button('Delete 2 notifications').props.onClick()
assert.deepEqual(deleted, [['a', 'b']])
assert.ok(rows().every((n) => !n.props.selected), 'Confirm clears selection')
rows()[0].props.onSelect(true)
find((n) => n.type === 'Input').props.onChange({ target: { value: 'First' } })
assert.ok(rows().every((n) => !n.props.selected), 'Search clears hidden selection')
const all = find((n) => n.type === 'Checkbox')
all.props.onCheckedChange(true)
assert.equal(button('Delete selected (1)').props.disabled, false)
button('Delete selected (1)').props.onClick()
button('Delete 1 notifications').props.onClick()
assert.deepEqual(deleted[1], ['a'], 'Select all only selects filtered results')
console.log('PASS: page multi-select, cancel/confirm, selection clearing and filtered select-all')
