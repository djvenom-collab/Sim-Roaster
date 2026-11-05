// Single writer per mounted store. While a slow save is running, intermediate
// snapshots are superseded by the latest complete snapshot. Serial execution
// lets each request use the revision returned by its predecessor.
export function createLatestSaveQueue<T>(
  save: (value: T) => Promise<boolean>,
  onError: (error: unknown) => void,
) {
  let pending: { value: T } | null = null
  let running = false
  let stopped = false

  async function drain() {
    if (running || stopped) return
    running = true
    try {
      while (pending && !stopped) {
        const next = pending
        pending = null
        if (!(await save(next.value))) {
          stopped = true
          pending = null
        }
      }
    } catch (error) {
      // Unknown write outcome: do not automatically replay a request or send a
      // later snapshot with a possibly stale revision. Reload to recover.
      stopped = true
      pending = null
      onError(error)
    } finally {
      running = false
    }
  }

  return {
    enqueue(value: T) {
      if (stopped) return
      pending = { value }
      void drain()
    },
    stop() {
      stopped = true
      pending = null
    },
  }
}
