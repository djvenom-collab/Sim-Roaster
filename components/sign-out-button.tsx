"use client"

/* ===========================================================================
 * SIGN OUT BUTTON — ends the Better Auth session and returns to /login
 * =========================================================================== */
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { authClient } from "@/lib/auth-client"
import { LogOut } from "lucide-react"

export function SignOutButton() {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function handleSignOut() {
    setPending(true)
    try {
      await authClient.signOut()
      router.push("/login")
      router.refresh()
    } catch {
      // Even if the network call fails, send the user to the login screen.
      router.push("/login")
    } finally {
      setPending(false)
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-8 shrink-0"
      onClick={handleSignOut}
      disabled={pending}
      aria-label="Sign out"
      title="Sign out"
    >
      <LogOut className="size-4" />
    </Button>
  )
}
