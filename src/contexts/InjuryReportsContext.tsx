import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { InjuryReport } from '@/types'
import { listInjuryReports } from '@/api/injuryReports'

interface InjuryReportsContextValue {
  reports: InjuryReport[]
  getReport: (id: string) => InjuryReport | undefined
  updateReport: (id: string, updates: Partial<Omit<InjuryReport, 'id'>>) => void
}

const InjuryReportsContext = createContext<InjuryReportsContextValue | null>(null)

export function InjuryReportsProvider({ children }: { children: React.ReactNode }) {
  const [reports, setReports] = useState<InjuryReport[]>([])
  useEffect(() => { listInjuryReports().then(setReports) }, [])

  const getReport = useCallback((id: string) => reports.find((r) => r.id === id), [reports])

  const updateReport = useCallback((id: string, updates: Partial<Omit<InjuryReport, 'id'>>) => {
    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, ...updates } : r)))
  }, [])

  return (
    <InjuryReportsContext.Provider value={{ reports, getReport, updateReport }}>
      {children}
    </InjuryReportsContext.Provider>
  )
}

export function useInjuryReports() {
  const ctx = useContext(InjuryReportsContext)
  if (!ctx)
    return {
      reports: [],
      getReport: (_id: string) => undefined,
      updateReport: () => {},
    }
  return ctx
}
