import React, { createContext, useContext, useState, useCallback } from 'react'
import type { RootCauseAnalysis } from '@/types'
import * as api from '@/api/injuryReports'

interface RootCauseContextValue {
  loadData: () => void
  getByLinked: (linkedType: 'injury' | 'incident', linkedId: string) => RootCauseAnalysis | undefined
  fetchForInjury: (injuryId: string) => Promise<RootCauseAnalysis | null>
  saveForInjury: (injuryId: string, payload: api.RootCausePayload) => Promise<RootCauseAnalysis>
  loading: boolean
  error: string | null
}

const RootCauseContext = createContext<RootCauseContextValue | null>(null)

export function RootCauseProvider({ children }: { children: React.ReactNode }) {
  const [hasFetched, setHasFetched] = useState(false)
  const loadData = useCallback(() => setHasFetched(true), [])
  const [analyses, setAnalyses] = useState<RootCauseAnalysis[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const getByLinked = useCallback(
    (linkedType: 'injury' | 'incident', linkedId: string) =>
      analyses.find((a) => a.linkedType === linkedType && a.linkedId === linkedId),
    [analyses]
  )

  const fetchForInjury = useCallback(async (injuryId: string): Promise<RootCauseAnalysis | null> => {
    setLoading(true)
    setError(null)
    try {
      const root = await api.fetchRootCause(injuryId)
      if (root) {
        const analysis: RootCauseAnalysis = {
          id: root.id,
          linkedType: 'injury',
          linkedId: injuryId,
          immediateCause: root.immediateCause,
          contributingCauses: root.contributingCauses ?? [],
          underlyingCause: root.underlyingCause,
          analyzedBy: root.analyzedBy ?? '',
          analyzedAt: root.analyzedAt ?? new Date().toISOString(),
        }
        setAnalyses((prev) => {
          const rest = prev.filter((a) => !(a.linkedType === 'injury' && a.linkedId === injuryId))
          return [...rest, analysis]
        })
        return analysis
      }
      setAnalyses((prev) => prev.filter((a) => !(a.linkedType === 'injury' && a.linkedId === injuryId)))
      return null
    } catch (e: any) {
      if (e?.response?.status === 404) return null
      setError(e?.message ?? 'Failed to load root cause')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const saveForInjury = useCallback(async (injuryId: string, payload: api.RootCausePayload): Promise<RootCauseAnalysis> => {
    setError(null)
    const root = await api.putRootCause(injuryId, payload)
    const analysis: RootCauseAnalysis = {
      id: root.id,
      linkedType: 'injury',
      linkedId: injuryId,
      immediateCause: root.immediateCause,
      contributingCauses: root.contributingCauses ?? [],
      underlyingCause: root.underlyingCause,
      analyzedBy: root.analyzedBy ?? '',
      analyzedAt: root.analyzedAt ?? new Date().toISOString(),
    }
    setAnalyses((prev) => {
      const rest = prev.filter((a) => !(a.linkedType === 'injury' && a.linkedId === injuryId))
      return [...rest, analysis]
    })
    return analysis
  }, [])

  return (
    <RootCauseContext.Provider value={{
        loadData,
        getByLinked, fetchForInjury, saveForInjury, loading, error }}>
      {children}
    </RootCauseContext.Provider>
  )
}

const fallback: RootCauseContextValue = {
  loadData: () => {},
  getByLinked: () => undefined,
  fetchForInjury: async () => null,
  saveForInjury: async (_, payload) =>
    ({ id: '', linkedType: 'injury', linkedId: '', immediateCause: payload.immediateCause, contributingCauses: payload.contributingCauses ?? [], analyzedBy: '', analyzedAt: '' }),
  loading: false,
  error: null,
}

export function useRootCause() {
  const ctx = useContext(RootCauseContext)
  return ctx ?? fallback
}
