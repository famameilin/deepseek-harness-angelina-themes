import type { BakedActions } from '@deepseek-ai/dsh-client-store'
import { ANGELINA_THEMES, ANGELINA_TOKEN_OVERRIDES, type AngelinaScheme } from '../themes.ts'
import {
  alignSelection,
  DEFAULT_SELECTION,
  readSkinEnabled,
  schemeOf,
  writeSelection,
  type AngelinaSelection,
} from '../preference.ts'
import { AngelinaParallaxController } from './angelina-parallax.ts'
import { en, SETTINGS_NS, zh } from './locales.ts'
import { createPickerStore } from './store.ts'
import { installAngelinaStyles } from './style.ts'
import { ThemePickerRow } from './ThemePickerRow.tsx'
import type { ClientContext, PickerState, ThemeSnapshot } from './types.ts'

export type { ClientContext } from './types.ts'
export { ANGELINA_THEMES } from '../themes.ts'
export { buildTokenOverrides } from '../themes.ts'
export { AngelinaParallaxController } from './angelina-parallax.ts'

/** Services required from the host's immediately-available web composition. */
export const inject = [
  'theme',
  'slots',
  'locale',
] as const

/** Layer identity (the runner pins this for dynamic packages) and CSS hook. */
const SKIN_SOURCE = 'dsh-angelina-themes'
const SKIN_ATTRIBUTE = 'data-dsh-angelina-skin'

/**
 * Upstream Harness registers these ids; a composition that already ships them owns the
 * complete presentation, so this standalone plugin stays passive rather than stacking a
 * second layer over the fork's newer glass and parallax implementation.
 */
function hostOwnsAngelinaThemes(ctx: ClientContext): boolean {
  const known = new Set(ctx.theme.getTheme().themes.map(theme => theme.id))
  return ANGELINA_THEMES.every(theme => known.has(theme.id))
}

/**
 * The skin itself: one token-override layer stacked over whichever Host theme is active,
 * plus the body attribute the stylesheet scopes on. The Host persists `light`/`dark`/
 * `system` on its own, so nothing here has to write a preference to survive a reload.
 *
 * Both transitions publish synchronously from inside the Host call (it re-emits on every
 * registry change), so `installed` is flipped *before* the call and restored if the call
 * throws. A re-entrant listener that ran while the handle was still unassigned would see
 * the skin in the wrong state and project a stale snapshot to the row.
 */
function createSkin(ctx: ClientContext) {
  let installed = false
  let remove: (() => void) | undefined
  let presented: string | null = null

  const present = (scheme: AngelinaScheme | undefined): void => {
    if (typeof document === 'undefined' || document.body === null) return
    const next = scheme ?? null
    if (next === presented) return
    presented = next
    if (next === null) document.body.removeAttribute(SKIN_ATTRIBUTE)
    else document.body.setAttribute(SKIN_ATTRIBUTE, next)
  }

  return {
    get installed(): boolean {
      return installed
    },
    enable(scheme: AngelinaScheme): void {
      if (!installed) {
        installed = true
        try {
          remove = ctx.theme.overrideTokens(SKIN_SOURCE, ANGELINA_TOKEN_OVERRIDES)
        } catch (error) {
          installed = false
          throw error
        }
      }
      present(scheme)
    },
    /** Retraction re-enters synchronously too: clear the flag and the handle first. */
    disable(): void {
      installed = false
      const dispose = remove
      remove = undefined
      dispose?.()
      present(undefined)
    },
    present,
  }
}

/** Browser plugin face mounted by the dsh Loader. */
export function apply(ctx: ClientContext): void {
  // See hostOwnsAngelinaThemes: the fork owns the complete presentation.
  if (hostOwnsAngelinaThemes(ctx)) return

  const skin = createSkin(ctx)
  const store = createPickerStore()
  const parallax = new AngelinaParallaxController()
  let bound: BakedActions<PickerState, ReturnType<typeof createPickerStore>['spec']['actions']> | undefined

  /**
   * Project the current state onto every consumer. Every mutation funnels through here
   * instead of relying on the Host's re-entrant `theme/change`: a pick that lands on the
   * preference already in effect emits nothing at all, so an emit-driven design would
   * silently skip the parallax and the settings row in that case.
   */
  const refresh = (): void => {
    const snapshot = ctx.theme.getTheme()
    if (skin.installed) {
      skin.present(snapshot.active.colorScheme)
      alignSelection(snapshot.active.colorScheme)
    }
    parallax.sync(skin.installed ? snapshot.active.colorScheme : DEFAULT_SELECTION)
    bound?.sync({
      preference: snapshot.preference,
      scheme: snapshot.active.colorScheme,
      enabled: skin.installed,
      revision: snapshot.revision,
    })
  }

  /** One pick from the settings row: it both selects the skin and names its palette. */
  const select = (value: AngelinaSelection | typeof DEFAULT_SELECTION): void => {
    if (value === DEFAULT_SELECTION) {
      writeSelection(DEFAULT_SELECTION)
      skin.disable()
      refresh()
      return
    }
    const scheme = schemeOf(value)
    writeSelection(value)
    skin.enable(scheme)
    // The Host owns and persists the light/dark axis, so the pick is routed through its
    // one preference write entry; the guard keeps a redundant write off the wire.
    if (ctx.theme.getTheme().preference !== scheme) ctx.theme.setTheme(scheme)
    refresh()
  }

  ctx.effect(() => {
    if (readSkinEnabled()) skin.enable(ctx.theme.getTheme().active.colorScheme)
    else skin.disable()

    const offChange = ctx.on('theme/change', payload => {
      void payload
      refresh()
    })
    refresh()
    return () => {
      offChange()
      skin.disable()
      parallax.dispose()
    }
  }, 'dsh-angelina-themes: skin lifecycle')

  ctx.effect(() => {
    const dispose = ctx.locale.register(SETTINGS_NS, { en, zh })
    return typeof dispose === 'function' ? dispose : undefined
  }, 'dsh-angelina-themes: locale')

  ctx.effect(() => installAngelinaStyles(), 'dsh-angelina-themes: glass stylesheet')

  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'angelina-themes',
    order: 12,
    store,
    locale: SETTINGS_NS,
    inject: (actions: BakedActions<PickerState, ReturnType<typeof createPickerStore>['spec']['actions']>) => {
      bound = actions
      refresh()
      return { select }
    },
  }, ThemePickerRow))
}
