import type { AngelinaScheme, ThemeTokenOverride } from '../themes.ts'

export interface ThemeSnapshot {
  preference: string
  fontSize?: number
  active: HostThemeDefinition
  themes: readonly HostThemeDefinition[]
  revision: number
}

export interface HostThemeDefinition {
  id: string
  colorScheme: AngelinaScheme
  tokens: Readonly<Record<string, string>>
}

export interface ThemeService {
  getTheme(): ThemeSnapshot
  register(definition: { id: string; colorScheme: AngelinaScheme; tokens: Readonly<Record<string, string>> }): () => void
  setTheme(id: string): void
  /** Stack a token layer over whichever Host theme is active; returns its remover. */
  overrideTokens(source: string, tokens: Record<string, ThemeTokenOverride>): () => void
}

export interface ClientContext {
  effect(thunk: () => unknown, label?: string): void
  on(event: string, listener: (payload: unknown) => void): () => void
  theme: ThemeService
  slots: {
    inject(name: string, factory: () => unknown): void
    register(options: unknown, component: unknown): unknown
  }
  locale: {
    register(
      namespace: string,
      dict: Record<string, Record<string, string>>,
    ): (() => void) | void
  }
}

export interface PickerState {
  /** Host preference the skin rides on (`light`/`dark`/`system`), persisted by the Host. */
  preference: string
  /** Color scheme the Host currently resolves that preference to. */
  scheme: AngelinaScheme
  /** Whether the Angelina token layer is installed. */
  enabled: boolean
  revision: number
}
