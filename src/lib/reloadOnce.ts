const KEY = 'cadence:updateReloadAt'
const WINDOW_MS = 30_000

/** A failed lazy import, as reported by the browser when a deploy has replaced the file. */
export function isChunkLoadError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(msg)
}

/**
 * Reloads to pick up a new deploy, at most once every 30 seconds so a genuinely broken deploy can't
 * loop. Returns false (and does nothing) inside that window, or if storage is unavailable to guard it.
 */
export function reloadOnce(to?: string): boolean {
  try {
    if (Date.now() - Number(sessionStorage.getItem(KEY) ?? 0) < WINDOW_MS) return false
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch {
    return false
  }
  if (to) window.location.assign(to)
  else window.location.reload()
  return true
}
