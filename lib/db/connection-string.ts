// pg 8 treats these legacy SSL modes as verify-full, but warns that pg 9 will
// weaken them to libpq semantics. Make today's certificate + hostname checks
// explicit without changing the integration-managed environment variable.
export function explicitPostgresTls(connectionString: string | undefined): string | undefined {
  if (!connectionString) return connectionString
  try {
    const url = new URL(connectionString)
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") return connectionString
    // An explicit libpq opt-in has different semantics; do not override it.
    if (url.searchParams.get("uselibpqcompat") === "true") return connectionString
  } catch {
    // Leave invalid input to pg's own validation; never log credential URLs.
    return connectionString
  }

  // Avoid serializing the URL, which can change encoding in credentials or
  // unrelated query options. Only replace literal legacy sslmode parameters.
  return connectionString.replace(
    /([?&]sslmode=)(prefer|require|verify-ca)(?=&|#|$)/g,
    "$1verify-full",
  )
}
