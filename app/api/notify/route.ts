/* ===========================================================================
 * API ROUTE: POST /api/notify — actually send a notification email
 * ===========================================================================
 * This runs on the server (not in the browser). The app posts a recipient +
 * subject + body here and this route sends the email.
 *
 * DEMO MODE: if no email provider key is configured in the environment, it
 * does NOT really send — it logs and returns a "simulated" result so the app
 * keeps working. Wire your email provider's send call into the marked spot to
 * send for real. The message wording is built earlier in lib/notify.ts.
 * =========================================================================== */
import { NextResponse } from "next/server"
import { z } from "zod"
import { authorize, jsonError } from "@/lib/security/authz"

const notifySchema = z.object({
  to: z.string().trim().email().max(254),
  name: z.string().max(200).optional(),
  // Strip CR/LF so the subject can't inject extra mail headers.
  subject: z.string().trim().min(1).max(300).transform((s) => s.replace(/[\r\n]+/g, " ")),
  body: z.string().min(1).max(20_000),
})

export async function POST(req: Request) {
  const authz = await authorize(req, {
    anyPermission: ["notify_staff", "push_notifications"],
    rateLimit: { bucket: "notify", limit: 30, windowSec: 60 },
  })
  if (!authz.ok) return authz.response

  const parsed = notifySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(400, "invalid_request")
  }
  const { to, subject, body } = parsed.data

  const apiKey = process.env.RESEND_API_KEY
  // Demo-friendly: if no key is configured, don't fail — report that the email
  // was prepared so the UI flow still works end-to-end without external setup.
  if (!apiKey) {
    return NextResponse.json({ simulated: true })
  }

  try {
    const { Resend } = await import("resend")
    const resend = new Resend(apiKey)
    const from = process.env.NOTIFY_FROM_EMAIL || "Sim Scheduler <onboarding@resend.dev>"
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject,
      text: body,
    })
    if (error) {
      console.error("[notify] provider error:", error.message)
      return jsonError(502, "email_provider_error")
    }
    console.info(`[audit] email sent by user=${authz.ctx.userId}`)
    return NextResponse.json({ id: data?.id })
  } catch (e) {
    console.error("[notify] send error:", (e as Error).message)
    return jsonError(500, "send_failed")
  }
}
