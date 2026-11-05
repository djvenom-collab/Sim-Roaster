export default function Loading() {
  return (
    <div role="status" className="space-y-4" aria-label="Loading page">
      <p className="text-sm text-muted-foreground">Loading page…</p>
      <div aria-hidden="true" className="space-y-4 motion-safe:animate-pulse">
        <div className="h-8 w-56 rounded-md bg-muted" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-24 rounded-xl bg-muted" />
          ))}
        </div>
        <div className="h-72 rounded-xl bg-muted" />
      </div>
    </div>
  )
}
