import { describe, expect, it } from 'vitest'
import { ANGELINA_ASSETS } from '../src/client/assets.generated.ts'
import { ANGELINA_CSS } from '../src/client/style.ts'
import { ANGELINA_THEMES, ANGELINA_TOKEN_OVERRIDES, buildTokenOverrides } from '../src/themes.ts'

/**
 * The skin tokens live in a shared light+dark block followed by a scheme-specific
 * override, so only the *last* occurrence of the exact selector is the one the browser
 * resolves. Matching the first hit would read the shared defaults instead.
 */
function schemeTokens(scheme: string): string {
  const marker = `body[data-dsh-angelina-skin='${scheme}'] {`
  const at = ANGELINA_CSS.lastIndexOf(marker)
  if (at < 0) return ''
  const open = at + marker.length
  return ANGELINA_CSS.slice(open, ANGELINA_CSS.indexOf('\n}', open))
}

describe('theme payload', () => {
  it('ships two complete 114-token definitions', () => {
    expect(ANGELINA_THEMES.map(theme => [theme.id, theme.colorScheme])).toEqual([
      ['angelina-light', 'light'],
      ['angelina-dark', 'dark'],
    ])
    for (const theme of ANGELINA_THEMES) {
      expect(Object.keys(theme.tokens), theme.id).toHaveLength(114)
      expect(theme.tokens['--dsw-alias-bg-base']).toBeTruthy()
      expect(theme.tokens['--dsw-alias-label-primary']).toBeTruthy()
      expect(theme.tokens['--dsw-specific-input-major']).toBeTruthy()
    }
  })

  it('collapses both palettes into one {light, dark} token-override layer', () => {
    const overrides = buildTokenOverrides()
    const light = ANGELINA_THEMES.find(theme => theme.colorScheme === 'light')!.tokens
    const dark = ANGELINA_THEMES.find(theme => theme.colorScheme === 'dark')!.tokens
    expect(Object.keys(overrides)).toHaveLength(114)
    for (const [name, pair] of Object.entries(overrides)) {
      expect(pair.light, name).toBe(light[name as keyof typeof light])
      expect(pair.dark, name).toBe(dark[name as keyof typeof dark])
    }
    expect(overrides['--dsw-alias-bg-base']).toEqual({ light: '#ebe8e3', dark: '#080d13' })
    expect(ANGELINA_TOKEN_OVERRIDES).toEqual(overrides)
  })

  it('embeds every image locally as WebP', () => {
    expect(Object.keys(ANGELINA_ASSETS)).toHaveLength(5)
    for (const value of Object.values(ANGELINA_ASSETS)) {
      expect(value.startsWith('data:image/webp;base64,UklGR')).toBe(true)
    }
  })

  it('serves both schemes from one character layer at one position', () => {
    // Two per-scheme cut-outs placed the figure differently (measured 237px apart at
    // 929x861), so switching palette visibly moved her. Sharing the image *and* the
    // position makes the switch a no-op for the character; only the tone differs.
    expect(Object.keys(ANGELINA_ASSETS)).toEqual([
      'lightHero', 'darkHero',
      'lightParallaxBackground', 'lightParallaxForeground',
      'darkParallaxBackground',
    ])
    for (const scheme of ['light', 'dark']) {
      const tokens = schemeTokens(scheme)
      expect(tokens, scheme).toContain('--dsh-angelina-parallax-foreground-image: var(--dsh-angelina-parallax-character)')
      expect(tokens, scheme).not.toContain('--dsh-angelina-parallax-foreground-image: none')
    }
    // the artwork is anchored identically in both schemes, so the figure cannot slide
    expect(ANGELINA_CSS).not.toContain('74%')
    expect(ANGELINA_CSS).toContain('--dsh-angelina-hero-position: 68% 42%')
    // each scheme keeps its own backdrop; that is the point of the two palettes
    expect(schemeTokens('light')).toContain('--dsh-angelina-parallax-background-image: var(--dsh-angelina-parallax-background-light)')
    expect(schemeTokens('dark')).toContain('--dsh-angelina-parallax-background-image: var(--dsh-angelina-parallax-background-dark)')
    // dark re-tones the shared image instead of shipping a second one
    expect(schemeTokens('light')).toContain('--dsh-angelina-parallax-foreground-filter: none')
    expect(schemeTokens('dark')).toMatch(/--dsh-angelina-parallax-foreground-filter: brightness\(/)
    expect(ANGELINA_CSS).toContain("filter: var(--dsh-angelina-parallax-foreground-filter)")
  })

  it('paints the artwork through the slot names the running Host actually renders', () => {
    // The published Harness builds this version of the shell as
    // `[data-slot='main.conversation']` holding the `[data-phase]` element, and ships
    // NO `data-ds-app-frame` / `data-ds-conversation-column` hooks at all. Selectors
    // that only name the legacy `conversation` slot match nothing, the Host's own
    // opaque phase background survives, and the artwork never appears.
    expect(ANGELINA_CSS).toContain("[data-slot='main.conversation']")
    const hero = ANGELINA_CSS.match(
      /:is\(\[data-slot='conversation'\], \[data-slot='main\.conversation'\]\) > \[data-phase='hero'\],([\s\S]*?)\{([^}]*)\}/,
    )?.[2] ?? ''
    expect(hero).toContain('background-image: var(--dsh-angelina-app-scrim), var(--dsh-angelina-hero-image)')
    // The phase must give up its opaque fill, or it covers the parallax layers beneath.
    const phase = ANGELINA_CSS.match(
      /:is\(\[data-slot='conversation'\], \[data-slot='main\.conversation'\]\) > \[data-phase\] \{([^}]*)\}/s,
    )?.[1] ?? ''
    expect(phase).toContain('background-color: transparent')
  })

  it('keeps hero, settling, and active conversations on one artwork coordinate system', () => {
    expect(ANGELINA_CSS).toContain(`body[data-dsh-angelina-skin] [data-ds-conversation-column] [data-phase='hero'],
body[data-dsh-angelina-skin] [data-ds-conversation-column] [data-phase='settling'],
body[data-dsh-angelina-skin] [data-ds-conversation-column] [data-phase='active'] {
  background-image: var(--dsh-angelina-app-scrim), var(--dsh-angelina-hero-image);
}`)
    expect(ANGELINA_CSS).toContain(`body[data-dsh-angelina-parallax] [data-ds-conversation-column] [data-phase='hero'],
body[data-dsh-angelina-parallax] [data-ds-conversation-column] [data-phase='settling'],
body[data-dsh-angelina-parallax] [data-ds-conversation-column] [data-phase='active'] {
  background-image: var(--dsh-angelina-app-scrim);
}`)
    expect(ANGELINA_CSS).not.toContain('--dsh-angelina-thread-')
    expect(ANGELINA_CSS).toContain("[data-slot='root'] > :first-child")
    expect(ANGELINA_CSS).toMatch(
      /:is\(\[data-slot='conversation'\], \[data-slot='main\.conversation'\]\) > \[data-phase='hero'\]/,
    )
  })

  it('softens active artwork and gives interface copy readable theme tokens', () => {
    const active = ANGELINA_CSS.match(/\[data-phase='active'\] \[data-conversation-scroll\] \{([^}]*)\}/s)?.[1] ?? ''
    expect(active).toContain('background-color: var(--dsh-angelina-conversation-glass)')
    expect(active).toContain('-webkit-backdrop-filter: var(--dsh-angelina-conversation-filter)')
    expect(active).toContain('backdrop-filter: var(--dsh-angelina-conversation-filter)')
    expect(active).toContain('--dsw-alias-label-primary: var(--dsh-angelina-chat-text)')
    expect(active).toContain('--dsw-alias-label-secondary: var(--dsh-angelina-chat-secondary)')
    expect(active).toContain('--dsw-alias-label-tertiary: var(--dsh-angelina-chat-muted)')
    expect(active).toContain('--dsw-alias-label-caption: var(--dsh-angelina-chat-caption)')
  })

  it('uses the layered smoked-glass recipes from the Codex Angelina skin', () => {
    expect(ANGELINA_CSS).toContain('--dsh-angelina-glass-input: rgba(53, 60, 65, 0.58)')
    expect(ANGELINA_CSS).toContain('--dsh-angelina-glass-input: rgba(13, 21, 29, 0.72)')
    expect(ANGELINA_CSS).toContain('--dsh-angelina-glass-composer-filter: blur(16px) saturate(104%)')
    expect(ANGELINA_CSS).toContain('--dsh-angelina-glass-menu-filter: var(--dsh-angelina-glass-dialog-filter)')
    expect(ANGELINA_CSS).toContain('--dsh-angelina-glass-dialog-filter: blur(18px) saturate(104%)')
    expect(ANGELINA_CSS).toContain("[role='menu']")
    expect(ANGELINA_CSS).toContain("[role='listbox']")
    expect(ANGELINA_CSS).toContain("[role='dialog']")
    const composer = ANGELINA_CSS.match(/body\[data-dsh-angelina-skin\] \[data-composer-card\] \{([^}]*)\}/s)?.[1] ?? ''
    expect(composer).not.toContain('border-radius: 6px')
    expect(composer).not.toContain('inset 3px 0 0 var(--dsh-angelina-glass-accent)')
    expect(ANGELINA_CSS).not.toMatch(/body\[data-dsh-angelina-skin\] \[data-composer-card\]::after/)
    expect(ANGELINA_CSS).toMatch(/\[role='menu'\] section\[role='group'\] > div\[id\] \{\s*background: transparent;\s*\}/s)
    expect(ANGELINA_CSS).toContain(`[data-composer-card] textarea {
  color: transparent;
  caret-color: var(--dsh-angelina-glass-caret);`)
    expect(ANGELINA_CSS).not.toContain('rgba(251, 250, 248, 0.72)')
  })

  it('keeps the conversation header and scroll on one glass plane', () => {
    const header = ANGELINA_CSS.match(/\[data-phase='active'\] \[data-slot='conversation\.session\.header'\] > header \{([^}]*)\}/s)?.[1] ?? ''
    expect(header).toContain('background-color: var(--dsh-angelina-conversation-glass)')
    expect(header).toContain('-webkit-backdrop-filter: var(--dsh-angelina-conversation-filter)')
    expect(header).toContain('backdrop-filter: var(--dsh-angelina-conversation-filter)')
    expect(header).toContain('--dsw-alias-label-primary: var(--dsh-angelina-chat-text)')
    expect(ANGELINA_CSS).toContain('--dsh-angelina-conversation-glass: color-mix(in srgb, var(--dsw-alias-bg-base) 24%, transparent)')
    expect(ANGELINA_CSS).toContain('--dsh-angelina-conversation-filter: blur(3px)')
    expect(ANGELINA_CSS).toContain("input[aria-label='筛选选项']")
    expect(ANGELINA_CSS).toContain("input[aria-label='Filter options']")
    expect(ANGELINA_CSS).toContain(") > [role='listbox'] {")
    expect(ANGELINA_CSS).toContain('background: var(--dsh-angelina-glass-menu)')
    expect(ANGELINA_CSS).toContain('--dsh-angelina-glass-dialog: rgba(43, 51, 58, 0.66)')
    expect(ANGELINA_CSS).toContain('--dsh-angelina-glass-dialog: rgba(10, 17, 24, 0.78)')
    expect(ANGELINA_CSS).toContain('--dsh-angelina-glass-menu: var(--dsh-angelina-glass-dialog)')
    expect(ANGELINA_CSS).toContain('--dsh-angelina-glass-menu-border: var(--dsh-angelina-glass-dialog-border)')
    expect(ANGELINA_CSS).toContain('--dsh-angelina-glass-menu-highlight: var(--dsh-angelina-glass-dialog-highlight)')
    expect(ANGELINA_CSS).toContain('--dsh-angelina-glass-menu-shadow: var(--dsh-angelina-glass-dialog-shadow)')
    expect(ANGELINA_CSS).not.toMatch(/--dsh-angelina-glass-menu:\s*rgba/)
    expect(ANGELINA_CSS).not.toMatch(/--dsh-angelina-glass-menu-filter:\s*blur/)
    expect(ANGELINA_CSS).toContain('--dsh-angelina-glass-menu-text: #f5f3f0')
    expect(ANGELINA_CSS).toMatch(/\[role='dialog'\],[^}]*--dsw-alias-bg-module-platform: var\(--dsh-angelina-glass-control\)/s)
    expect(ANGELINA_CSS).toMatch(/\[role='dialog'\],[^}]*--dsw-specific-sidebar-nav-item-active: var\(--dsh-angelina-glass-control-selected\)/s)
  })

  it('restores the host-owned workspace search capsule', () => {
    expect(ANGELINA_CSS).toContain("input[placeholder='搜索会话…']")
    expect(ANGELINA_CSS).toContain("input[placeholder='Search sessions...']")
    const search = ANGELINA_CSS.match(/input\[placeholder='搜索会话…'\],[\s\S]*?\) \{([^}]*)\}/s)?.[1] ?? ''
    expect(search).toContain('background: transparent')
    expect(search).toContain('border: 0')
    expect(search).toContain('box-shadow: none')
    expect(search).toContain('-webkit-backdrop-filter: none')
    expect(search).toContain('backdrop-filter: none')
  })

  it('contains both motion fallbacks and the per-scheme backdrop assets', () => {
    expect(ANGELINA_CSS).toContain('@media (prefers-reduced-motion: reduce)')
    expect(ANGELINA_CSS).toContain('@media (max-width: 900px)')
    expect(ANGELINA_CSS).toContain('--dsh-angelina-parallax-background-light')
    expect(ANGELINA_CSS).toContain('--dsh-angelina-parallax-background-dark')
    expect(ANGELINA_CSS).toContain('--dsh-angelina-parallax-character')
  })

  it('keeps the parallax artwork visible beneath the application root', () => {
    const layers = ANGELINA_CSS.match(/\[data-dsh-angelina-parallax\] \{([^}]*)\}/s)?.[1] ?? ''
    const appRoot = ANGELINA_CSS.match(/body\[data-dsh-angelina-parallax\] > #root \{([^}]*)\}/s)?.[1] ?? ''
    expect(layers).toContain('z-index: 0')
    expect(appRoot).toContain('position: relative')
    expect(appRoot).toContain('z-index: 1')
  })

  it('gives question options and custom answers dedicated contrast and glass', () => {
    expect(ANGELINA_CSS).toContain('--dsh-angelina-question-text: #fffdfa')
    expect(ANGELINA_CSS).toContain("[data-question-key] > section {")
    expect(ANGELINA_CSS).toContain("[data-question-key] :is([role='radio'], [role='checkbox'])")
    expect(ANGELINA_CSS).toContain("[data-question-key] :has(> input[type='text'])")
    const input = ANGELINA_CSS.match(/\[data-question-key\] input\[type='text'\] \{([^}]*)\}/s)?.[1] ?? ''
    expect(input).toContain('background: transparent')
    expect(input).toContain('border: 0')
    expect(input).toContain('border-radius: 0')
    expect(input).toContain('color: var(--dsh-angelina-question-text)')
    expect(ANGELINA_CSS).toContain("[data-question-key] input[type='text']::placeholder")
    expect(ANGELINA_CSS).toContain('[data-question-key] textarea')
  })

  it('leaves composer placement and interface copy motion to the host', () => {
    expect(ANGELINA_CSS).not.toContain("[data-ds-composer-mode='hero']")
    expect(ANGELINA_CSS).not.toContain('--dsh-angelina-copy-parallax-')
  })
})
