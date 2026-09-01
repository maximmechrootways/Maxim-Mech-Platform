import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { InjuryReport } from '@/types'
import { useAuth } from '@/contexts/AuthContext'
import * as api from '@/api/injuryReports'

interface InjuryReportsContextValue {
  loadData: () => void
  reports: InjuryReport[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  getReport: (id: string) => InjuryReport | undefined
  fetchReport: (id: string) => Promise<InjuryReport | null>
  createReport: (payload: api.InjuryReportPayload) => Promise<InjuryReport>
  updateReport: (id: string, updates: Partial<Omit<InjuryReport, 'id'>>) => Promise<void>
  deleteReport: (id: string) => Promise<void>
}

const InjuryReportsContext = createContext<InjuryReportsContextValue | null>(null)

export function InjuryReportsProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth()
  const isAuthenticated = !!session
  const [hasFetched, setHasFetched] = useState(false)
  const loadData = useCallback(() => setHasFetched(true), [])
  const [reports, setReports] = useState<InjuryReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await api.fetchInjuryReports()
      setReports(Array.isArray(list) ? list : [])
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load injury reports')
      setReports([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isAuthenticated || !hasFetched) return
    refetch()
  }, [isAuthenticated, hasFetched, refetch])

  const getReport = useCallback((id: string) => reports.find((r) => r.id === id), [reports])

  const fetchReport = useCallback(async (id: string): Promise<InjuryReport | null> => {
    try {
      const report = await api.fetchInjuryReport(id)
      setReports((prev) => (prev.some((r) => r.id === id) ? prev.map((r) => (r.id === id ? report : r)) : [...prev, report]))
      return report
    } catch {
      return null
    }
  }, [hasFetched])

  const createReport = useCallback(async (payload: api.InjuryReportPayload): Promise<InjuryReport> => {
    const created = await api.createInjuryReport(payload)
    setReports((prev) => [created, ...prev])
    return created
  }, [])

  const updateReport = useCallback(async (id: string, updates: Partial<Omit<InjuryReport, 'id'>>) => {
    const updated = await api.updateInjuryReport(id, updates)
    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, ...updated } : r)))
  }, [])

  const deleteReport = useCallback(async (id: string) => {
    await api.deleteInjuryReport(id)
    setReports((prev) => prev.filter((r) => r.id !== id))
  }, [])

  return (
    <InjuryReportsContext.Provider
      value={{
        loadData,
        reports, loading, error, refetch, getReport, fetchReport, createReport, updateReport, deleteReport
      }}
    >
      {children}
    </InjuryReportsContext.Provider>
  )
}

const fallback: InjuryReportsContextValue = {
  loadData: () => { },
  reports: [],
  loading: false,
  error: null,
  refetch: async () => { },
  getReport: () => undefined,
  fetchReport: async () => null,
  createReport: async () => ({ id: '', siteName: '', reportedBy: '', reportedAt: '', status: 'draft', severity: 'minor', description: '' }),
  updateReport: async () => { },
  deleteReport: async () => { },
}

export function useInjuryReports() {
  const ctx = useContext(InjuryReportsContext)

  useEffect(() => {
    if (ctx && ctx.loadData) {
      ctx.loadData()
    }
  }, [ctx])

  if (!ctx) return fallback
  return ctx
}
