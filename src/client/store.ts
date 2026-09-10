import {
  defineStore,
  type BakedActions,
  type EngineStoreHandle,
} from '@deepseek-ai/dsh-client-store'
import type { PickerState } from './types.ts'

export type PickerStoreActions = {
  sync: (draft: PickerState, state: PickerState) => void
}

export function createPickerStore(): EngineStoreHandle<PickerState, PickerStoreActions> {
  return defineStore({
    init: (): PickerState => ({
      preference: 'light',
      scheme: 'light',
      enabled: false,
      revision: -1,
    }),
    actions: {
      sync: (draft, state) => {
        if (state.revision <= draft.revision) return
        draft.preference = state.preference
        draft.scheme = state.scheme
        draft.enabled = state.enabled
        draft.revision = state.revision
      },
    },
  })
}

export type PickerActions = BakedActions<PickerState, PickerStoreActions>
