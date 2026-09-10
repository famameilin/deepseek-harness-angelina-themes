import { ANGELINA_THEMES } from './themes.generated.ts'

export { ANGELINA_THEMES }
export type ThemeDefinition = (typeof ANGELINA_THEMES)[number]

/** Color scheme an Angelina palette belongs to; the Host's own theme axis. */
export type AngelinaScheme = 'light' | 'dark'

/** One token's value per Host color scheme, the shape `ThemeService.overrideTokens` accepts. */
export interface ThemeTokenOverride {
  light: string
  dark: string
}

/**
 * The Host persists only its built-in preferences (`light`/`dark`/`system`), so a
 * third-party theme id can never survive a reload. The skin therefore rides on the
 * Host's own axis: both palettes collapse into one token-override layer whose
 * per-scheme values the Host writes for whichever preference is active.
 * @returns token-name → `{ light, dark }` for every token both palettes declare.
 */
export function buildTokenOverrides(): Readonly<Record<string, ThemeTokenOverride>> {
  const light = ANGELINA_THEMES.find(theme => theme.colorScheme === 'light')?.tokens
  const dark = ANGELINA_THEMES.find(theme => theme.colorScheme === 'dark')?.tokens
  if (light === undefined || dark === undefined) {
    throw new Error('angelina-themes: the payload must ship one light and one dark palette')
  }
  const overrides: Record<string, ThemeTokenOverride> = {}
  for (const name of new Set([...Object.keys(light), ...Object.keys(dark)])) {
    const lightValue = light[name as keyof typeof light]
    const darkValue = dark[name as keyof typeof dark]
    if (lightValue === undefined || darkValue === undefined) {
      throw new Error(`angelina-themes: token "${name}" is missing from the light or the dark palette`)
    }
    overrides[name] = { light: lightValue, dark: darkValue }
  }
  return Object.freeze(overrides)
}

/** The token-override layer both palettes collapse into. */
export const ANGELINA_TOKEN_OVERRIDES = buildTokenOverrides()
