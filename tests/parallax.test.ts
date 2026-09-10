// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AngelinaParallaxController } from '../src/client/angelina-parallax.ts'

const frames: FrameRequestCallback[] = []

function flushFrame(): void {
  frames.splice(0).forEach(callback => { callback(0) })
}

function pointer(clientX: number, clientY: number, pointerType = 'mouse'): void {
  const event = new Event('pointermove') as PointerEvent
  Object.defineProperties(event, {
    clientX: { value: clientX },
    clientY: { value: clientY },
    pointerType: { value: pointerType },
  })
  window.dispatchEvent(event)
}

describe('AngelinaParallaxController', () => {
  const live: AngelinaParallaxController[] = []

  /** A failed assertion must not leave listeners behind for the next case. */
  const create = (): AngelinaParallaxController => {
    const controller = new AngelinaParallaxController()
    live.push(controller)
    return controller
  }

  beforeEach(() => {
    document.body.innerHTML = '<main data-ds-app-frame></main>'
    frames.length = 0
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback)
      return frames.length
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => true,
    } as MediaQueryList))
  })

  afterEach(() => {
    live.splice(0).forEach(controller => { controller.dispose() })
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
    document.body.removeAttribute('data-dsh-angelina-parallax')
    document.body.style.cssText = ''
  })

  it('matches the Codex light movement amplitudes', () => {
    const controller = create()
    controller.sync('angelina-light')
    pointer(window.innerWidth, window.innerHeight)
    flushFrame()
    expect(document.querySelector('[data-dsh-angelina-layer="background"]')?.getAttribute('style'))
      .toContain('translate3d(-5px, -3px, 0)')
    expect(document.querySelector('[data-dsh-angelina-layer="foreground"]')?.getAttribute('style'))
      .toContain('translate3d(10px, 6px, 0)')
    expect(document.body.style.getPropertyValue('--dsh-angelina-copy-parallax-x')).toBe('')
    expect(document.body.style.getPropertyValue('--dsh-angelina-copy-parallax-y')).toBe('')
  })

  it('moves both schemes identically and ignores touch input', () => {
    const controller = create()
    controller.sync('angelina-dark')
    pointer(window.innerWidth, window.innerHeight, 'touch')
    expect(frames).toHaveLength(0)
    pointer(window.innerWidth, window.innerHeight)
    flushFrame()
    // One character image and one position serve both schemes, so the amplitudes must
    // match: a per-mode profile would offset the figure for the same pointer position.
    expect(document.querySelector('[data-dsh-angelina-layer="background"]')?.getAttribute('style'))
      .toContain('translate3d(-5px, -3px, 0)')
    expect(document.querySelector('[data-dsh-angelina-layer="foreground"]')?.getAttribute('style'))
      .toContain('translate3d(10px, 6px, 0)')
    expect(document.body.style.getPropertyValue('--dsh-angelina-copy-parallax-x')).toBe('')
  })

  it('keeps driving the layers when the same scheme is synced repeatedly', () => {
    // Picking a theme raises `theme/change` and then projects once more, so `sync` runs
    // twice for one scheme. Treating the second call as "the fork owns these layers"
    // froze the artwork at the transform it happened to have.
    const controller = create()
    controller.sync('angelina-light')
    controller.sync('angelina-light')
    controller.sync('angelina-light')
    pointer(0, 0)
    flushFrame()
    expect(document.querySelector('[data-dsh-angelina-layer="background"]')?.getAttribute('style'))
      .toContain('translate3d(5px, 3px, 0)')

    pointer(window.innerWidth, window.innerHeight)
    flushFrame()
    expect(document.querySelector('[data-dsh-angelina-layer="foreground"]')?.getAttribute('style'))
      .toContain('translate3d(10px, 6px, 0)')
  })

  it('keeps driving the layers after switching schemes', () => {
    const controller = create()
    controller.sync('angelina-light')
    controller.sync('angelina-dark')
    controller.sync('angelina-dark')
    pointer(window.innerWidth, window.innerHeight)
    flushFrame()
    expect(document.querySelector('[data-dsh-angelina-layer="foreground"]')?.getAttribute('style'))
      .toContain('translate3d(10px, 6px, 0)')
    pointer(0, 0)
    flushFrame()
    expect(document.querySelector('[data-dsh-angelina-layer="background"]')?.getAttribute('style'))
      .toContain('translate3d(5px, 3px, 0)')
  })

  it('becomes passive when the fork already owns the layers', () => {
    document.body.setAttribute('data-dsh-angelina-parallax', 'light')
    document.body.innerHTML = `
      <div id="dsh-angelina-parallax" data-dsh-angelina-parallax-owner="angelina">
        <div data-dsh-angelina-layer="background"></div>
        <div data-dsh-angelina-layer="foreground"></div>
      </div>`
    const root = document.getElementById('dsh-angelina-parallax')
    const controller = create()
    controller.sync('angelina-light')
    pointer(window.innerWidth, window.innerHeight)
    expect(frames).toHaveLength(0)
    controller.dispose()
    expect(document.getElementById('dsh-angelina-parallax')).toBe(root)
    expect(document.body.getAttribute('data-dsh-angelina-parallax')).toBe('light')
  })

  it('reclaims a root left behind by an unloaded instance', () => {
    const previous = create()
    previous.sync('angelina-light')
    const stale = document.getElementById('dsh-angelina-parallax')
    // Simulate an unload that dropped the controller without removing its nodes.
    previous.dispose()
    document.body.append(stale as Node)

    const controller = create()
    controller.sync('angelina-light')
    pointer(window.innerWidth, window.innerHeight)
    flushFrame()
    expect(document.querySelector('[data-dsh-angelina-layer="foreground"]')?.getAttribute('style'))
      .toContain('translate3d(10px, 6px, 0)')
  })

  it('restores its body attribute without changing unrelated body styles', () => {
    document.body.setAttribute('data-dsh-angelina-parallax', 'legacy')
    document.body.style.setProperty('--dsh-angelina-copy-parallax-x', '9px')
    const controller = create()
    controller.sync('angelina-light')
    pointer(window.innerWidth, window.innerHeight)
    flushFrame()
    expect(document.body.style.getPropertyValue('--dsh-angelina-copy-parallax-x')).toBe('9px')
    controller.sync('system')
    expect(document.body.getAttribute('data-dsh-angelina-parallax')).toBe('legacy')
    expect(document.body.style.getPropertyValue('--dsh-angelina-copy-parallax-x')).toBe('9px')
    expect(document.getElementById('dsh-angelina-parallax')).toBeNull()
  })
})
