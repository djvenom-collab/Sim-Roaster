import { NextResponse, type NextRequest } from "next/server"
import { getSessionCookie } from "better-auth/cookies"

// Optimistic gate: if there is no Better Auth session cookie, bounce to /login.
// This is a fast redirect only — real authorization happens on the server in
// the root layout and in each server action (getSession / getUserId).
export function middleware(request: NextRequest) {
  const sessionCookie = getSessionCookie(request)
  if (!sessionCookie) {
    const url = new URL("/login", request.url)
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  // Run on everything except the login page, the auth + seed API routes,
  // Next internals, and static assets.
  matcher: [
    "/((?!login|api/auth|api/seed-users|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|glb|gltf|mp3)$).*)",
  ],
}
