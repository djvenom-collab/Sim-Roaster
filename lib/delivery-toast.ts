import { toast } from "sonner"
import type { DeliveryResult } from "./use-notify"

/** Toast for a single in-app delivery, warning when the recipient has no login to read it. */
export function deliveryToast(firstName: string, res: DeliveryResult) {
  if (res.hasAccount) {
    toast.success(`Delivered to ${firstName}'s in-app inbox`)
  } else {
    toast.warning(`Saved for ${firstName}, but they have no app login to read it yet`)
  }
}

/** Toast summarising a bulk in-app send. */
export function bulkDeliveryToast(ok: number, fail: number, noAccount: number, noun = "notification") {
  const plural = ok === 1 ? noun : `${noun}s`
  if (ok === 0) {
    toast.error(`Could not send ${noun}s`)
    return
  }
  const extra = [
    fail > 0 ? `${fail} failed` : null,
    noAccount > 0 ? `${noAccount} recipient(s) have no app login yet` : null,
  ]
    .filter(Boolean)
    .join(" · ")
  if (extra) toast.warning(`Delivered ${ok} ${plural} in-app — ${extra}`)
  else toast.success(`Delivered ${ok} ${plural} to in-app inboxes`)
}
