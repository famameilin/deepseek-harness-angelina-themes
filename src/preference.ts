/**
 * Browser-local record of whether the Angelina skin is selected. The light/dark axis
 * itself is NOT stored here: the Host preference owns it and persists it in
 * `settings.yaml`, so the skin rides on the value the Host already guarantees across
 * reloads. Keeping one authority per axis is what keeps the two from overwriting
 * each other — the previous design stored the palette here while the Host silently
 * overwrote it back to `system` on every page load.
 */
export const THEME_STORAGE_KEY = 'dsh-angelina-themes.selection'

/** Sentinel recorded when the user turns the skin off and the Host look applies. */
export const DEFAULT_SELECTION = 'system'

/** The two Angelina palettes, as stored. */
export type AngelinaSelection = 'angelina-light' | 'angelina-dark'

export const ANGELINA_SELECTIONS: readonly AngelinaSelection[] = ['angelina-light', 'angelina-dark']

/** Host color scheme each Angelina selection rides on. */
export function schemeOf(selection: AngelinaSelection): 'light' | 'dark' {
  return selection === 'angelina-dark' ? 'dark' : 'light'
}

/** The Angelina selection matching a resolved Host color scheme. */
export function selectionOf(scheme: 'light' | 'dark'): AngelinaSelection {
  return scheme === 'dark' ? 'angelina-dark' : 'angelina-light'
}

/** Whether a stored value names one of the Angelina palettes. */
export function isAngelinaSelection(value: unknown): value is AngelinaSelection {
  return value === 'angelina-light' || value === 'angelina-dark'
}

function readRaw(): string | null {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY)
  } catch {
    // Private browsing or a locked-down embedding can deny storage. The skin still
    // applies for the current page; only reload persistence degrades.
    return null
  }
}

/** Persist the skin choice; storage denial degrades persistence, never the session. */
export function writeSelection(value: AngelinaSelection | typeof DEFAULT_SELECTION): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, value)
  } catch {
    // See readRaw: persistence is best-effort by design.
  }
}

/**
 * Whether the stored record asks for the skin. Only the explicit off sentinel turns it
 * off: an absent record is a fresh install (installing a theme package is the intent),
 * and the pre-fix `angelina-light`/`angelina-dark` values keep selecting it too.
 * @returns true when the Angelina token layer should be installed.
 */
export function readSkinEnabled(): boolean {
  return readRaw() !== DEFAULT_SELECTION
}

/**
 * Keep the local record aligned with the palette the Host actually resolved, so the
 * stored value never claims a palette the user is not looking at. Written only while
 * the skin is on; the off sentinel is the user's decision and is never overwritten.
 */
export function alignSelection(scheme: 'light' | 'dark'): void {
  const wanted = selectionOf(scheme)
  if (readRaw() !== wanted) writeSelection(wanted)
}
