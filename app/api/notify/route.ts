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

interface NotifyBody {
  to?: string
  name?: string
  subject?: string
  body?: string
}

export async function POST(req: Request) {
  let payload: NotifyBody
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const { to, subject, body } = payload
  if (!to || !subject || !body) {
    return NextResponse.json({ error: "Missing recipient, subject, or body" }, { status: 400 })
  }

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
      return NextResponse.json({ error: error.message || "Email provider error" }, { status: 502 })
    }
    return NextResponse.json({ id: data?.id })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to send email" },
      { status: 500 },
    )
  }
}
