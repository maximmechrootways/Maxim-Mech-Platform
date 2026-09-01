import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { SafetyObservation } from '@/types'
import { listSafetyObservations } from '@/api/observations'

interface SafetyObservationsContextValue {
  observations: SafetyObservation[]
  addObservation: (obs: Omit<SafetyObservation, 'id'>) => void
  updateObservation: (id: string, updates: Partial<Omit<SafetyObservation, 'id'>>) => void
  removeObservation: (id: string) => void
}

const SafetyObservationsContext = createContext<SafetyObservationsContextValue | null>(null)

export function SafetyObservationsProvider({ children }: { children: React.ReactNode }) {
  const [observations, setObservations] = useState<SafetyObservation[]>([])
  useEffect(() => { listSafetyObservations().then(setObservations) }, [])

  const addObservation = useCallback((obs: Omit<SafetyObservation, 'id'>) => {
    setObservations((prev) => [...prev, { ...obs, id: `so-${Date.now()}` }])
  }, [])

  const updateObservation = useCallback((id: string, updates: Partial<Omit<SafetyObservation, 'id'>>) => {
    setObservations((prev) =>
      prev.map((o) => (o.id === id ? { ...o, ...updates } : o))
    )
  }, [])

  const removeObservation = useCallback((id: string) => {
    setObservations((prev) => prev.filter((o) => o.id !== id))
  }, [])

  return (
    <SafetyObservationsContext.Provider value={{ observations, addObservation, updateObservation, removeObservation }}>
      {children}
    </SafetyObservationsContext.Provider>
  )
}

export function useSafetyObservations() {
  const ctx = useContext(SafetyObservationsContext)
  if (!ctx)
    return {
      observations: [],
      addObservation: () => {},
      updateObservation: () => {},
      removeObservation: () => {},
    }
  return ctx
}
