import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { UiPreferences } from '@/types'
import { useUser } from '@/contexts/UserContext'
import { fetchMyUiPreferences, updateMyUiPreferences } from '@/api/users'

const LOCAL_KEY = 'maxim-ui-preferences'

const DEFAULT_PREFERENCES: UiPreferences = {
  kissModeEnabled: false,
  kissPresetName: null,
  kissOptions: {
    largeTouchTargets: true,
    guidedStepMode: true,
    simplifiedNav: true,
    showOnlyRequiredFirst: true,
  },
  notificationPreferences: {
    forms_pending: true,
    incidents: true,
    digest: false,
    digest_hr_owner_8am: false,
    signatures: true,
    incidents_site: true,
    signature_required: true,
    announcements: true,
  },
}

function mergePreferences(base: UiPreferences, patch?: Partial<UiPreferences>): UiPreferences {
  if (!patch) return base
  return {
    ...base,
    ...patch,
    kissOptions: {
      ...base.kissOptions,
      ...(patch.kissOptions ?? {}),
    },
  }
}

interface UiPreferencesContextValue {
  preferences: UiPreferences
  kissModeEnabled: boolean
  updatePreferences: (patch: Partial<UiPreferences>) => Promise<void>
  setKissModeEnabled: (enabled: boolean) => Promise<void>
  applyKissPreset: (preset: 'Simple' | 'Very Simple' | 'Supervisor Simple') => Promise<void>
}

const UiPreferencesContext = createContext<UiPreferencesContextValue | null>(null)

export function UiPreferencesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser()
  const [preferences, setPreferences] = useState<UiPreferences>(DEFAULT_PREFERENCES)

  useEffect(() => {
    const fromSession = user?.uiPreferences ? mergePreferences(DEFAULT_PREFERENCES, user.uiPreferences) : DEFAULT_PREFERENCES
    setPreferences(fromSession)
  }, [user?.id, user?.uiPreferences])

  useEffect(() => {
    if (!user) return
    fetchMyUiPreferences()
      .then((data) => setPreferences((prev) => mergePreferences(prev, data)))
      .catch(() => {
        try {
          const raw = localStorage.getItem(LOCAL_KEY)
          if (!raw) return
          const parsed = JSON.parse(raw) as Partial<UiPreferences>
          setPreferences((prev) => mergePreferences(prev, parsed))
        } catch {
          // ignore parse errors
        }
      })
  }, [user?.id])

  const updatePreferences = useCallback(async (patch: Partial<UiPreferences>) => {
    setPreferences((prev) => {
      const next = mergePreferences(prev, patch)
      try {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(next))
      } catch {
        // ignore storage errors
      }
      return next
    })

    try {
      await updateMyUiPreferences(patch)
    } catch {
      // Keep optimistic state and local fallback even if API call fails.
    }
  }, [])

  const setKissModeEnabled = useCallback(
    async (enabled: boolean) => {
      await updatePreferences({ kissModeEnabled: enabled })
    },
    [updatePreferences]
  )

  const applyKissPreset = useCallback(
    async (preset: 'Simple' | 'Very Simple' | 'Supervisor Simple') => {
      const byPreset: Record<string, UiPreferences['kissOptions']> = {
        'Simple': {
          largeTouchTargets: true,
          guidedStepMode: true,
          simplifiedNav: true,
          showOnlyRequiredFirst: true,
        },
        'Very Simple': {
          largeTouchTargets: true,
          guidedStepMode: true,
          simplifiedNav: true,
          showOnlyRequiredFirst: true,
        },
        'Supervisor Simple': {
          largeTouchTargets: true,
          guidedStepMode: false,
          simplifiedNav: true,
          showOnlyRequiredFirst: false,
        },
      }
      await updatePreferences({
        kissModeEnabled: true,
        kissPresetName: preset,
        kissOptions: byPreset[preset],
      })
    },
    [updatePreferences]
  )

  const value = useMemo<UiPreferencesContextValue>(
    () => ({
      preferences,
      kissModeEnabled: preferences.kissModeEnabled,
      updatePreferences,
      setKissModeEnabled,
      applyKissPreset,
    }),
    [preferences, updatePreferences, setKissModeEnabled, applyKissPreset]
  )

  return <UiPreferencesContext.Provider value={value}>{children}</UiPreferencesContext.Provider>
}

export function useUiPreferences() {
  const ctx = useContext(UiPreferencesContext)
  if (!ctx) throw new Error('useUiPreferences must be used within UiPreferencesProvider')
  return ctx
}

