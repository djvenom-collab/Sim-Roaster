// Render the actual bell with deterministic store/UI doubles; no real saves.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import ts from "typescript"
const require = createRequire(import.meta.url)
let ready = false
let messages = Array.from({ length: 15 }, (_, i) => ({ id: `n${i}`, staffId: "me", subject: `Message ${i}`, body: "Body", sentAt: "2026-11-05", channel: "in_app", kind: "custom", sentBy: "Test" }))
let readCalls = 0
let selected = null
let open = false
let index
let popover
const store = {
  currentUser: { staffId: "me", name: "Test" },
  get notificationsReady() { return ready },
  notificationsForStaff: () => messages,
  markNotificationRead: (id) => { readCalls++; messages = messages.map((n) => n.id === id ? { ...n, readAt: "now" } : n) },
  toggleNotificationFlag() {}, deleteNotification() {},
}
const ui = ({ children, render, ...props }) => React.createElement("div", { "aria-label": props["aria-label"] }, render, children)
const source = readFileSync(new URL("../../components/user-notifications-bell.tsx", import.meta.url), "utf8")
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } })
const compiled = { exports: {} }
new Function("require", "module", "exports", outputText)((name) => {
  if (name === "react") return { useMemo: (fn) => fn(), useState: () => { const slot = index++; return [slot === 0 ? open : selected, (next) => { if (slot === 0) open = next; else selected = next }] } }
  if (name === "@/lib/store") return { useStore: () => store }
  if (name === "@/components/ui/popover") return { Popover: (props) => { popover = props; return React.createElement(ui, props) }, PopoverTrigger: ui, PopoverContent: ui }
  if (name === "@/components/notification-detail-dialog") return { NotificationDetailDialog: () => null }
  if (name === "@/lib/notification-meta") return { channelMeta: { in_app: { icon: () => null } }, kindMeta: { custom: { label: "Message", icon: () => null } }, relativeTime: () => "now", previewText: (n) => n.body, flaggedClassName: "" }
  if (name === "@/lib/utils") return { cn: () => "" }
  if (name.startsWith("@/components/ui/")) return new Proxy({}, { get: () => ui })
  if (name === "next/link") return { default: ui }
  return require(name)
}, compiled, compiled.exports)
const Bell = compiled.exports.UserNotificationsBell
const render = () => { index = 0; return renderToStaticMarkup(React.createElement(Bell)) }
assert.doesNotMatch(render(), /unread notifications|Message 0/, "Never show sample messages before saved data loads")
ready = true
messages = [ { ...messages[0], readAt: "yesterday" }, messages[1], { ...messages[2], deletedAt: "today" } ]
assert.match(render(), /1 unread notifications/)
popover.onOpenChange(true)
assert.equal(readCalls, 0, "Opening bell does not mark messages read")
assert.match(render(), /1 unread notifications/)
store.markNotificationRead(messages[1].id)
assert.doesNotMatch(render(), /unread notifications/, "Read receipt clears the badge")
assert.equal(messages.filter((n) => !n.deletedAt && !n.readAt).length, 0, "Same definition as inbox")
ready = false
assert.match(render(), /Notifications are not loaded yet/)
console.log("PASS: no seeded badge/rows, loaded unread excludes read/deleted, opening bell preserves receipts, reading clears badge")
