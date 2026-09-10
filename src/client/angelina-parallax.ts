const ROOT_ID = 'dsh-angelina-parallax'
const ROOT_ATTRIBUTE = 'data-dsh-angelina-parallax'
const ROOT_OWNER_ATTRIBUTE = 'data-dsh-angelina-parallax-owner'

/**
 * Back-reference to the live controller that built a root, so a second `sync()` for the
 * same scheme does not mistake this instance's own layers for the fork's and stand down.
 */
const ROOT_OWNER_FIELD = '__dshAngelinaParallaxOwner'

type AngelinaMode = 'light' | 'dark'

interface OwnedRoot extends HTMLDivElement {
  [ROOT_OWNER_FIELD]?: AngelinaParallaxController
}

/**
 * Accepts both the Host color scheme the skin now rides on (`light`/`dark`) and the
 * legacy Angelina theme ids, so either call convention resolves to a movement profile.
 */
function modeForTheme(themeId: string): AngelinaMode | undefined {
  if (themeId === 'light' || themeId === 'angelina-light') return 'light'
  if (themeId === 'dark' || themeId === 'angelina-dark') return 'dark'
  return undefined
}

const px = (value: number): string => `${Math.round(value * 100) / 100}px`

/**
 * Pointer-driven layers used by the standalone plugin. If the fork's built-in
 * controller already owns the root, this instance becomes a passive observer
 * and never adds a second listener or removes the fork's nodes on unload.
 */
export class AngelinaParallaxController {
  private mode: AngelinaMode | undefined
  private root: HTMLDivElement | undefined
  private background: HTMLDivElement | undefined
  private foreground: HTMLDivElement | undefined
  private frame = 0
  private targetX = 0
  private targetY = 0
  private listenersAttached = false
  private passiveOwner = false
  private bodyStateCaptured = false
  private previousAttribute: string | null = null
  private reducedMotion: MediaQueryList | undefined
  private reducedMotionListenerAttached = false
  /** Set once this instance is torn down, so its leftover root can be reclaimed. */
  private disposed = false

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (this.passiveOwner || event.pointerType === 'touch' || this.mode === undefined || this.isReducedMotion()) return
    const width = Math.max(1, window.innerWidth || 1)
    const height = Math.max(1, window.innerHeight || 1)
    this.schedule(
      Math.max(-1, Math.min(1, (event.clientX / width) * 2 - 1)),
      Math.max(-1, Math.min(1, (event.clientY / height) * 2 - 1)),
    )
  }

  private readonly resetPointer = (): void => {
    if (!this.passiveOwner) this.schedule(0, 0)
  }

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') this.resetPointer()
  }

  private readonly onReducedMotionChange = (): void => {
    if (this.mode === undefined || this.passiveOwner) return
    if (this.isReducedMotion()) {
      this.detachPointerListeners()
      this.writeParallax(0, 0, true)
    } else {
      this.attachPointerListeners()
    }
  }

  sync(themeId: string): void {
    const nextMode = modeForTheme(themeId)
    if (nextMode === undefined) {
      this.disable()
      return
    }
    if (typeof document === 'undefined' || document.body === null) return

    const existing = document.getElementById(ROOT_ID)
    const owner = existing instanceof HTMLDivElement ? (existing as OwnedRoot)[ROOT_OWNER_FIELD] : undefined

    // The Host emits on every registry change AND the picker projects once more, so the
    // same scheme arrives here repeatedly. Re-entering for a root this instance built is
    // normal: keep the active role instead of mistaking it for the fork's layers.
    if (existing instanceof HTMLDivElement && owner === this && existing.isConnected) {
      this.mode = nextMode
      this.passiveOwner = false
      this.root = existing
      this.background = existing.querySelector<HTMLDivElement>('[data-dsh-angelina-layer="background"]') ?? undefined
      this.foreground = existing.querySelector<HTMLDivElement>('[data-dsh-angelina-layer="foreground"]') ?? undefined
      document.body.setAttribute(ROOT_ATTRIBUTE, nextMode)
      this.ensureReducedMotionListener()
      if (this.isReducedMotion()) {
        this.detachPointerListeners()
        this.writeParallax(0, 0, true)
      } else {
        this.attachPointerListeners()
        this.writeParallax(this.targetX, this.targetY, true)
      }
      return
    }

    // A root built by someone else: either the fork's own controller (no back-reference
    // at all) or a sibling instance still alive. Stay a passive observer so we never add
    // a second pointer listener or tear down foreign nodes.
    if (
      existing instanceof HTMLDivElement
      && existing.getAttribute(ROOT_OWNER_ATTRIBUTE) === 'angelina'
      && (owner === undefined || !owner.disposed)
      && existing.querySelector('[data-dsh-angelina-layer="background"]') !== null
    ) {
      this.mode = nextMode
      this.passiveOwner = true
      this.root = existing
      this.background = existing.querySelector<HTMLDivElement>('[data-dsh-angelina-layer="background"]') ?? undefined
      this.foreground = existing.querySelector<HTMLDivElement>('[data-dsh-angelina-layer="foreground"]') ?? undefined
      return
    }

    // A root carrying our marker that nobody live owns is a leftover from an unloaded
    // instance: drop it so this one can take over.
    if (existing instanceof HTMLDivElement && existing.getAttribute(ROOT_OWNER_ATTRIBUTE) === 'angelina') {
      existing.remove()
    }

    this.captureBodyState()
    this.passiveOwner = false
    this.mode = nextMode
    document.body.setAttribute(ROOT_ATTRIBUTE, nextMode)
    this.ensureRoot()
    this.ensureReducedMotionListener()
    if (this.isReducedMotion()) {
      this.detachPointerListeners()
      this.writeParallax(0, 0, true)
    } else {
      this.attachPointerListeners()
      this.writeParallax(this.targetX, this.targetY, true)
    }
  }

  dispose(): void {
    this.disable()
    this.disposed = true
    if (this.reducedMotion !== undefined && this.reducedMotionListenerAttached) {
      this.reducedMotion.removeEventListener('change', this.onReducedMotionChange)
      this.reducedMotionListenerAttached = false
    }
    this.reducedMotion = undefined
  }

  private captureBodyState(): void {
    if (this.bodyStateCaptured || typeof document === 'undefined' || document.body === null) return
    this.bodyStateCaptured = true
    this.previousAttribute = document.body.getAttribute(ROOT_ATTRIBUTE)
  }

  private ensureRoot(): void {
    if (this.root?.isConnected && this.root.parentElement === document.body) return
    const existing = document.getElementById(ROOT_ID)
    if (existing instanceof HTMLDivElement && existing.getAttribute(ROOT_OWNER_ATTRIBUTE) === 'angelina') {
      this.root = existing
      this.background = existing.querySelector<HTMLDivElement>('[data-dsh-angelina-layer="background"]') ?? undefined
      this.foreground = existing.querySelector<HTMLDivElement>('[data-dsh-angelina-layer="foreground"]') ?? undefined
      if (this.background !== undefined && this.foreground !== undefined) return
      existing.remove()
    }

    const root = document.createElement('div')
    root.id = ROOT_ID
    root.setAttribute(ROOT_ATTRIBUTE, 'layers')
    root.setAttribute(ROOT_OWNER_ATTRIBUTE, 'angelina')
    root.setAttribute('aria-hidden', 'true')
    ;(root as OwnedRoot)[ROOT_OWNER_FIELD] = this
    const background = document.createElement('div')
    background.dataset.dshAngelinaLayer = 'background'
    const foreground = document.createElement('div')
    foreground.dataset.dshAngelinaLayer = 'foreground'
    root.append(background, foreground)
    document.body.append(root)
    this.root = root
    this.background = background
    this.foreground = foreground
  }

  private ensureReducedMotionListener(): void {
    if (this.reducedMotion !== undefined || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    this.reducedMotion.addEventListener('change', this.onReducedMotionChange)
    this.reducedMotionListenerAttached = true
  }

  private isReducedMotion(): boolean {
    return this.reducedMotion?.matches === true
  }

  private attachPointerListeners(): void {
    if (this.listenersAttached || typeof window === 'undefined') return
    window.addEventListener('pointermove', this.onPointerMove, { passive: true })
    window.addEventListener('pointerleave', this.resetPointer)
    window.addEventListener('blur', this.resetPointer)
    document.addEventListener('visibilitychange', this.onVisibilityChange)
    this.listenersAttached = true
  }

  private detachPointerListeners(): void {
    if (!this.listenersAttached || typeof window === 'undefined') return
    window.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('pointerleave', this.resetPointer)
    window.removeEventListener('blur', this.resetPointer)
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    this.listenersAttached = false
  }

  private schedule(x: number, y: number): void {
    this.targetX = x
    this.targetY = y
    if (typeof window.requestAnimationFrame !== 'function') {
      this.writeParallax(x, y)
      return
    }
    if (this.frame !== 0) return
    this.frame = window.requestAnimationFrame(() => {
      this.frame = 0
      this.writeParallax(this.targetX, this.targetY)
    })
  }

  private writeParallax(x: number, y: number, force = false): void {
    if (!force && x === this.targetX && y === this.targetY && this.frame !== 0) return
    if (this.passiveOwner || this.root === undefined || this.background === undefined || this.foreground === undefined) return
    const foregroundX = this.mode === 'light' ? x * 10 : x * 8
    const foregroundY = this.mode === 'light' ? y * 6 : y * 5
    const backgroundX = this.mode === 'light' ? x * -5 : x * -4
    const backgroundY = this.mode === 'light' ? y * -3 : y * -2.4
    this.background.style.transform = `translate3d(${px(backgroundX)}, ${px(backgroundY)}, 0)`
    this.foreground.style.transform = `translate3d(${px(foregroundX)}, ${px(foregroundY)}, 0)`
  }

  private disable(): void {
    this.detachPointerListeners()
    if (this.frame !== 0 && typeof window !== 'undefined') window.cancelAnimationFrame?.(this.frame)
    this.frame = 0
    this.targetX = 0
    this.targetY = 0
    this.mode = undefined
    if (!this.passiveOwner) this.root?.remove()
    this.root = undefined
    this.background = undefined
    this.foreground = undefined
    const wasPassive = this.passiveOwner
    this.passiveOwner = false
    if (wasPassive || !this.bodyStateCaptured || typeof document === 'undefined' || document.body === null) return
    if (this.previousAttribute === null) document.body.removeAttribute(ROOT_ATTRIBUTE)
    else document.body.setAttribute(ROOT_ATTRIBUTE, this.previousAttribute)
    this.bodyStateCaptured = false
  }
}
