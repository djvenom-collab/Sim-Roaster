"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { signIn } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Radar, Loader2, AlertCircle } from "lucide-react"

// The six demo accounts (level 1-6). All share the password "admin".
const DEMO_ACCOUNTS: { email: string; label: string; level: number }[] = [
  { email: "sp@sim.local", label: "SP · Sim Pilot", level: 1 },
  { email: "sup@sim.local", label: "SUP · Supervisor", level: 2 },
  { email: "soo@sim.local", label: "SOO · Ops Officer", level: 3 },
  { email: "sto@sim.local", label: "STO · Training Officer", level: 4 },
  { email: "tl@sim.local", label: "TL · Team Lead", level: 5 },
  { email: "admin@sim.local", label: "Admin", level: 6 },
]

export function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [msLoading, setMsLoading] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await signIn.email({ email, password })
    setLoading(false)
    if (error) {
      setError("Incorrect email or password.")
      return
    }
    router.push("/")
    router.refresh()
  }

  async function handleMicrosoft() {
    setError(null)
    setMsLoading(true)
    const { error } = await signIn.social({ provider: "microsoft", callbackURL: "/" })
    if (error) {
      setMsLoading(false)
      setError(
        "Microsoft sign-in isn't configured yet. Add MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET to enable it.",
      )
    }
  }

  // Convenience: create the six demo accounts if they don't exist yet.
  async function handleSeed() {
    setSeeding(true)
    setError(null)
    try {
      await fetch("/api/seed-users", { method: "POST" })
    } catch {
      // ignore — surfaced on next sign-in attempt
    }
    setSeeding(false)
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Radar className="size-6" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">SIM Roster</h1>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">
            Sign in to the simulator scheduling &amp; rostering system
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span className="text-pretty">{error}</span>
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@sim.local"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••"
          />
        </div>

        <Button type="submit" disabled={loading} className="mt-1 w-full">
          {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          Sign in
        </Button>
      </form>

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs uppercase tracking-wide text-muted-foreground">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={handleMicrosoft}
        disabled={msLoading}
        className="w-full gap-2"
      >
        {msLoading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <MicrosoftIcon className="size-4" />
        )}
        Sign in with Microsoft
      </Button>

      {/* Demo helper: quick account fill + first-run seeding. */}
      <div className="mt-8 rounded-lg border border-border bg-muted/30 p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium text-foreground">Demo accounts</p>
          <button
            type="button"
            onClick={handleSeed}
            disabled={seeding}
            className="text-xs text-primary underline-offset-2 hover:underline disabled:opacity-50"
          >
            {seeding ? "Creating…" : "Create accounts"}
          </button>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Password for all accounts: <code className="rounded bg-background px-1 py-0.5">admin</code>
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {DEMO_ACCOUNTS.map((a) => (
            <button
              key={a.email}
              type="button"
              onClick={() => {
                setEmail(a.email)
                setPassword("admin")
                setError(null)
              }}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:border-primary/50 hover:bg-primary/5"
            >
              <span className="block font-medium">{a.label}</span>
              <span className="text-[10px] text-muted-foreground">Level {a.level}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function MicrosoftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 23 23" aria-hidden="true" fill="none">
      <path fill="#f25022" d="M1 1h10v10H1z" />
      <path fill="#7fba00" d="M12 1h10v10H12z" />
      <path fill="#00a4ef" d="M1 12h10v10H1z" />
      <path fill="#ffb900" d="M12 12h10v10H12z" />
    </svg>
  )
}
