"use client"

import { useCallback, useSyncExternalStore } from "react"

const LOCAL_CHANGE = "sim-roster:local-storage"

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange)
  window.addEventListener(LOCAL_CHANGE, onChange)
  return () => {
    window.removeEventListener("storage", onChange)
    window.removeEventListener(LOCAL_CHANGE, onChange)
  }
}

// Return a primitive snapshot: parsing JSON in getSnapshot would create a new
// object on every read and cause an infinite re-render loop.
export function useBrowserStorage(key: string) {
  const read = useCallback(() => {
    try {
      return window.localStorage.getItem(key)
    } catch {
      return null
    }
  }, [key])
  return useSyncExternalStore(subscribe, read, () => null)
}

export function writeBrowserStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // A blocked/full store must not prevent the in-memory user action.
  }
  window.dispatchEvent(new Event(LOCAL_CHANGE))
}

const subscribeHydration = () => () => {}
export function useHydrated() {
  return useSyncExternalStore(subscribeHydration, () => true, () => false)
}
