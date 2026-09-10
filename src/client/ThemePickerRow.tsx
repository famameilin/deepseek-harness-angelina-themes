import { DEFAULT_SELECTION, schemeOf, type AngelinaSelection } from '../preference.ts'
import type { PickerState } from './types.ts'

export interface ThemePickerRowProps {
  useStore: <T>(selector: (state: PickerState) => T) => T
  t: (key: string) => string
  select: (value: AngelinaSelection | typeof DEFAULT_SELECTION) => void
}

const CHOICES: readonly AngelinaSelection[] = ['angelina-light', 'angelina-dark']

/** A compact settings row that owns only the two Angelina choices and their off switch. */
export function ThemePickerRow({ useStore, t, select }: ThemePickerRowProps) {
  const scheme = useStore(state => state.scheme)
  const enabled = useStore(state => state.enabled)

  return (
    <div className="dsh-angelina-picker">
      <div className="dsh-angelina-picker-title">{t('picker.title')}</div>
      <div className="dsh-angelina-picker-grid">
        {CHOICES.map(id => {
          // The Host preference resolves to a scheme, so `system` highlights whichever
          // Angelina palette is actually on screen instead of showing nothing selected.
          const selected = enabled && scheme === schemeOf(id)
          return (
            <button
              key={id}
              type="button"
              className={`dsh-angelina-picker-choice${selected ? ' is-selected' : ''}`}
              aria-pressed={selected}
              onClick={() => { select(id) }}
            >
              <span className="dsh-angelina-picker-preview" data-preview={id} aria-hidden="true">
                <span className="dsh-angelina-picker-rail" />
                <span className="dsh-angelina-picker-panel" />
              </span>
              <span className="dsh-angelina-picker-label">{t(`theme.${id}`)}</span>
            </button>
          )
        })}
      </div>
      {enabled
        ? (
          <button
            type="button"
            className="dsh-angelina-picker-reset"
            onClick={() => { select(DEFAULT_SELECTION) }}
          >
            {t('picker.reset')}
          </button>
          )
        : null}
    </div>
  )
}
