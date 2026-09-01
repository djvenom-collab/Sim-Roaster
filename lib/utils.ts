/* ===========================================================================
 * UTILS — tiny shared helper
 * ===========================================================================
 * `cn(...)` merges Tailwind CSS class names together and removes conflicts
 * (e.g. if two classes both set padding, the last one wins). You'll see it used
 * all over the components as `className={cn("base", condition && "extra")}`.
 * There's nothing to configure here — it's a standard utility.
 * =========================================================================== */
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Build fixed-length initials from a person's name for avatar fallbacks.
 * Defaults to 3 letters so every display picture is consistent. Uses the first
 * letter of each word, then tops up from the first word's remaining letters when
 * there aren't enough words (e.g. "Oliver Bennett" → "OBE", "Jo Ng" → "JON").
 * Prefer a staff member's dedicated `initials` code when one is available; use
 * this only as the fallback for names without a linked staff record.
 */
export function initialsFromName(name: string, count = 3): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ""
  const letters = words.map((w) => w[0])
  if (letters.length < count) {
    const extra = words[0].slice(1).split("")
    while (letters.length < count && extra.length) letters.push(extra.shift() as string)
  }
  return letters.join("").slice(0, count).toUpperCase()
}
