import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { RootCauseAnalysis } from '@/types'
import { listRootCauseAnalyses } from '@/api/rootCause'

interface RootCauseContextValue {
  analyses: RootCauseAnalysis[]
  getByLinked: (linkedType: 'injury' | 'incident', linkedId: string) => RootCauseAnalysis | undefined
  addAnalysis: (analysis: Omit<RootCauseAnalysis, 'id'>) => void
  updateAnalysis: (id: string, updates: Partial<Omit<RootCauseAnalysis, 'id'>>) => void
}

const RootCauseContext = createContext<RootCauseContextValue | null>(null)

export function RootCauseProvider({ children }: { children: React.ReactNode }) {
  const [analyses, setAnalyses] = useState<RootCauseAnalysis[]>([])
  useEffect(() => {
    listRootCauseAnalyses().then(setAnalyses)
  }, [])

  const getByLinked = useCallback(
    (linkedType: 'injury' | 'incident', linkedId: string) =>
      analyses.find((a) => a.linkedType === linkedType && a.linkedId === linkedId),
    [analyses]
  )

  const addAnalysis = useCallback((analysis: Omit<RootCauseAnalysis, 'id'>) => {
    setAnalyses((prev) => [...prev, { ...analysis, id: `rc-${Date.now()}` }])
  }, [])

  const updateAnalysis = useCallback((id: string, updates: Partial<Omit<RootCauseAnalysis, 'id'>>) => {
    setAnalyses((prev) => prev.map((a) => (a.id === id ? { ...a, ...updates } : a)))
  }, [])

  return (
    <RootCauseContext.Provider value={{ analyses, getByLinked, addAnalysis, updateAnalysis }}>
      {children}
    </RootCauseContext.Provider>
  )
}

export function useRootCause() {
  const ctx = useContext(RootCauseContext)
  if (!ctx)
    return {
      analyses: [],
      getByLinked: (_: 'injury' | 'incident', __: string) => undefined,
      addAnalysis: () => {},
      updateAnalysis: () => {},
    }
  return ctx
}
