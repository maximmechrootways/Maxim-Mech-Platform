import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { SafetyObservation } from '@/types'
import * as observationsApi from '@/api/observations'

interface SafetyObservationsContextValue {
  loadData: () => void
  observations: SafetyObservation[]
  loading: boolean
  refetch: () => Promise<void>
  addObservation: (obs: Omit<SafetyObservation, 'id'>) => Promise<void>
  updateObservation: (id: string, updates: Partial<Omit<SafetyObservation, 'id'>>) => Promise<void>
  removeObservation: (id: string) => Promise<void>
}

const SafetyObservationsContext = createContext<SafetyObservationsContextValue | null>(null)

export function SafetyObservationsProvider({ children }: { children: React.ReactNode }) {
  const [hasFetched, setHasFetched] = useState(false)
  const loadData = useCallback(() => setHasFetched(true), [])
  const [observations, setObservations] = useState<SafetyObservation[]>([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    try {
      setLoading(true)
      const list = await observationsApi.fetchObservations()
      setObservations(Array.isArray(list) ? list : [])
    } catch {
      setObservations([])
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    if (!hasFetched) return;
    refetch()
  }, [hasFetched, refetch])

  const addObservation = useCallback(async (obs: Omit<SafetyObservation, 'id'>) => {
    const created = await observationsApi.createObservation({
      siteName: obs.siteName,
      type: obs.type,
      description: obs.description,
      observedBy: obs.observedBy,
      observedAt: obs.observedAt,
    })
    setObservations((prev) => [created, ...prev])
  }, [])

  const updateObservation = useCallback(async (id: string, updates: Partial<Omit<SafetyObservation, 'id'>>) => {
    const updated = await observationsApi.updateObservation(id, {
      siteName: updates.siteName,
      type: updates.type,
      description: updates.description,
      observedBy: updates.observedBy,
      observedAt: updates.observedAt,
    })
    setObservations((prev) => prev.map((o) => (o.id === id ? updated : o)))
  }, [])

  const removeObservation = useCallback(async (id: string) => {
    await observationsApi.deleteObservation(id)
    setObservations((prev) => prev.filter((o) => o.id !== id))
  }, [])

  return (
    <SafetyObservationsContext.Provider value={{
      loadData,
      observations, loading, refetch, addObservation, updateObservation, removeObservation
    }}>
      {children}
    </SafetyObservationsContext.Provider>
  )
}

export function useSafetyObservations() {
  const ctx = useContext(SafetyObservationsContext)

  useEffect(() => {
    if (ctx && ctx.loadData) {
      ctx.loadData()
    }
  }, [ctx])

  if (!ctx)
    return {
      loadData: () => { },
      observations: [] as SafetyObservation[],
      loading: false,
      refetch: async () => { },
      addObservation: async () => { },
      updateObservation: async () => { },
      removeObservation: async () => { },
    }

  return ctx
}
