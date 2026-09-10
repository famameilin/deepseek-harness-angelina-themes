// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apply } from '../src/client/index.ts'
import { createPickerStore } from '../src/client/store.ts'
import { ANGELINA_THEMES, ANGELINA_TOKEN_OVERRIDES } from '../src/themes.ts'
import type { ClientContext, ThemeSnapshot } from '../src/client/types.ts'

const STORAGE_KEY = 'dsh-angelina-themes.selection'

/** Host preferences that survive a reload; a third-party theme id is never persisted. */
const HOST_PREFERENCE = 'dsh-test.host-preference'
/** Token override layers, mirroring the Host's stacking behaviour. */
const HOST_LAYERS = new Map<string, Record<string, { light: string; dark: string }>>()

/**
 * Models the real `@deepseek-ai/dsh-client-ui-theme` surface: `overrideTokens` stacks a
 * layer that the published snapshot composes per active color scheme, and `setTheme`
 * only writes through for the built-in preferences. Deliberately does NOT persist a
 * third-party theme id — that Host limitation is the bug this design works around.
 */
function makeContext(options: { fork?: boolean; storedPreference?: string } = {}) {
  const effectDisposers: Array<() => void> = []
  const eventListeners = new Set<(snapshot: ThemeSnapshot) => void>()
  const register = vi.fn()
  const slotRegistrations: Array<{ options: Record<string, unknown>; component: unknown }> = []
  const light = { id: 'light', colorScheme: 'light' as const, tokens: {} }
  const dark = { id: 'dark', colorScheme: 'dark' as const, tokens: {} }
  let themes = options.fork ? [light, dark, ...ANGELINA_THEMES] : [light, dark]
  let preference = options.storedPreference ?? localStorage.getItem(HOST_PREFERENCE) ?? 'system'
  let revision = 0

  const snapshot = (): ThemeSnapshot => {
    const base = preference === 'dark' ? dark : light
    const tokens: Record<string, string> = {}
    for (const layer of HOST_LAYERS.values()) {
      for (const [name, value] of Object.entries(layer)) tokens[name] = value[base.colorScheme]
    }
    return {
      preference,
      active: { ...base, tokens } as (typeof light),
      themes,
      revision,
    }
  }
  const emit = (): void => {
    revision += 1
    const current = snapshot()
    eventListeners.forEach(listener => { listener(current) })
  }

  const theme = {
    getTheme: snapshot,
    register: (definition: (typeof ANGELINA_THEMES)[number]) => {
      register(definition)
      themes = [...themes, definition]
      emit()
      return () => {
        themes = themes.filter(theme => theme.id !== definition.id)
        emit()
      }
    },
    setTheme: (id: string) => {
      if (id !== 'system' && !themes.some(theme => theme.id === id)) throw new Error(`unknown theme ${id}`)
      if (preference === id) return
      preference = id
      // Only the built-in preferences reach durable storage, exactly like the Host.
      if (id === 'light' || id === 'dark' || id === 'system') localStorage.setItem(HOST_PREFERENCE, id)
      emit()
    },
    overrideTokens: (source: string, tokens: Record<string, { light: string; dark: string }>) => {
      HOST_LAYERS.set(source, tokens)
      emit()
      return () => {
        HOST_LAYERS.delete(source)
        emit()
      }
    },
  }

  const ctx: ClientContext = {
    theme,
    effect: (thunk) => {
      const dispose = thunk()
      if (typeof dispose === 'function') effectDisposers.push(dispose as () => void)
    },
    on: (_event, listener) => {
      const typed = listener as (snapshot: ThemeSnapshot) => void
      eventListeners.add(typed)
      return () => { eventListeners.delete(typed) }
    },
    slots: {
      inject: (_name, factory) => { factory() },
      register: (slotOptions, component) => {
        slotRegistrations.push({ options: slotOptions as Record<string, unknown>, component })
        return () => {}
      },
    },
    locale: {
      register: () => () => {},
    },
  }

  const store = createPickerStore().create()

  return {
    ctx,
    register,
    slots: slotRegistrations,
    snapshot,
    /** The plugin's real store instance, so assertions read the state the row renders from. */
    store,
    /** Drive the settings row exactly as the Host does, returning the actions it exposes. */
    actions: () => {
      const inject = slotRegistrations[0]?.options.inject as
        | ((actions: unknown) => { select: (value: string) => void })
      return inject(store.actions)
    },
    dispose: () => {
      for (const disposer of effectDisposers.reverse()) disposer()
    },
  }
}

describe('client plugin', () => {
  beforeEach(() => {
    localStorage.clear()
    HOST_LAYERS.clear()
  })

  afterEach(() => {
    document.head.querySelectorAll('[data-dsh-angelina-themes]').forEach(node => { node.remove() })
    document.body.innerHTML = ''
    document.body.removeAttribute('data-dsh-angelina-skin')
    document.body.removeAttribute('data-dsh-angelina-parallax')
    document.body.style.cssText = ''
  })

  it('registers no theme ids and stacks the token layer instead', () => {
    const harness = makeContext()
    apply(harness.ctx)
    expect(harness.register).not.toHaveBeenCalled()
    expect(harness.snapshot().themes.map(theme => theme.id)).toEqual(['light', 'dark'])
    expect(HOST_LAYERS.get('dsh-angelina-themes')).toBe(ANGELINA_TOKEN_OVERRIDES)
    expect(document.body.getAttribute('data-dsh-angelina-skin')).toBe('light')
    expect(document.head.querySelector('[data-dsh-angelina-themes]')).not.toBeNull()
    expect(harness.slots).toHaveLength(1)
    expect(harness.slots[0]?.options).toMatchObject({ id: 'angelina-themes', order: 12 })
    harness.dispose()
    expect(document.head.querySelector('[data-dsh-angelina-themes]')).toBeNull()
    expect(HOST_LAYERS.size).toBe(0)
  })

  it('never writes a non-built-in preference to the Host', () => {
    const harness = makeContext()
    apply(harness.ctx)
    // The Host snapshot keeps a persistable preference; the skin rides on its scheme.
    expect(harness.snapshot().preference).toBe('system')
    expect(harness.snapshot().active.tokens['--dsw-alias-bg-base'])
      .toBe(ANGELINA_TOKEN_OVERRIDES['--dsw-alias-bg-base']?.light)
  })

  it('survives a reload: the Host preference alone restores the skin', () => {
    const first = makeContext()
    apply(first.ctx)
    first.actions().select('angelina-dark')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('angelina-dark')
    expect(localStorage.getItem(HOST_PREFERENCE)).toBe('dark')
    first.dispose()

    // Reload: a fresh page with only durable storage carried over, no live state.
    HOST_LAYERS.clear()
    const second = makeContext()
    apply(second.ctx)
    expect(second.snapshot().active.colorScheme).toBe('dark')
    expect(document.body.getAttribute('data-dsh-angelina-skin')).toBe('dark')
    expect(HOST_LAYERS.get('dsh-angelina-themes')).toBe(ANGELINA_TOKEN_OVERRIDES)
  })

  it('keeps the skin off when the user reset it, across a reload', () => {
    localStorage.setItem(STORAGE_KEY, 'system')
    const harness = makeContext()
    apply(harness.ctx)
    expect(HOST_LAYERS.size).toBe(0)
    expect(document.body.getAttribute('data-dsh-angelina-skin')).toBeNull()
    expect(localStorage.getItem(STORAGE_KEY)).toBe('system')
  })

  it('routes a pick through the Host preference and re-enables after a reset', () => {
    const harness = makeContext()
    apply(harness.ctx)
    const { select } = harness.actions()

    select('system')
    expect(HOST_LAYERS.size).toBe(0)
    expect(document.body.getAttribute('data-dsh-angelina-skin')).toBeNull()

    select('angelina-dark')
    expect(harness.snapshot().preference).toBe('dark')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('angelina-dark')
    expect(document.body.getAttribute('data-dsh-angelina-skin')).toBe('dark')
  })

  it('follows the Host scheme while the preference stays on system', () => {
    const harness = makeContext({ storedPreference: 'system' })
    apply(harness.ctx)
    expect(document.body.getAttribute('data-dsh-angelina-skin')).toBe('light')
    harness.ctx.theme.setTheme('dark')
    expect(document.body.getAttribute('data-dsh-angelina-skin')).toBe('dark')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('angelina-dark')
  })

  it('stays passive when the fork already owns both themes', () => {
    const harness = makeContext({ fork: true })
    apply(harness.ctx)
    expect(harness.register).not.toHaveBeenCalled()
    expect(HOST_LAYERS.size).toBe(0)
    expect(harness.slots).toHaveLength(0)
    expect(document.head.querySelector('[data-dsh-angelina-themes]')).toBeNull()
    expect(document.body.getAttribute('data-dsh-angelina-skin')).toBeNull()
  })

  it('restores the body attribute on dispose', () => {
    const harness = makeContext()
    apply(harness.ctx)
    expect(document.body.getAttribute('data-dsh-angelina-skin')).toBe('light')
    harness.dispose()
    expect(document.body.getAttribute('data-dsh-angelina-skin')).toBeNull()
  })

  it('drives the parallax layers from the Host color scheme', () => {
    const harness = makeContext()
    apply(harness.ctx)
    expect(document.body.getAttribute('data-dsh-angelina-parallax')).toBe('light')
    harness.actions().select('angelina-dark')
    expect(document.body.getAttribute('data-dsh-angelina-parallax')).toBe('dark')
    harness.dispose()
  })
})
