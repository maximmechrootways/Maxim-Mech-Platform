import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { SafetyAlert } from '@/types'
import * as safetyAlertsApi from '@/api/safetyAlerts'

interface SafetyAlertsContextValue {
  loadData: () => void
  alerts: SafetyAlert[]
  loading: boolean
  refetch: () => Promise<void>
  addAlert: (alert: Omit<SafetyAlert, 'id'>) => Promise<void>
  updateAlert: (id: string, updates: Partial<Omit<SafetyAlert, 'id'>>) => Promise<void>
  removeAlert: (id: string) => Promise<void>
  markAlertRead: (id: string) => Promise<void>
  acknowledgeAlert: (id: string) => Promise<void>
}

const SafetyAlertsContext = createContext<SafetyAlertsContextValue | null>(null)

export function SafetyAlertsProvider({ children }: { children: React.ReactNode }) {
  const [hasFetched, setHasFetched] = useState(false)
  const loadData = useCallback(() => setHasFetched(true), [])
  const [alerts, setAlerts] = useState<SafetyAlert[]>([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    try {
      setLoading(true)
      const list = await safetyAlertsApi.fetchSafetyAlerts()
      setAlerts(Array.isArray(list) ? list : [])
    } catch {
      setAlerts([])
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    if (!hasFetched) return;
    refetch()
  }, [hasFetched, refetch])

  const addAlert = useCallback(async (alert: Omit<SafetyAlert, 'id'>) => {
    const created = await safetyAlertsApi.createSafetyAlert({
      title: alert.title,
      body: alert.body,
      siteNames: alert.siteNames,
      roles: alert.roles,
      expiresAt: alert.expiresAt,
    })
    setAlerts((prev) => [created, ...prev])
  }, [])

  const updateAlert = useCallback(async (id: string, updates: Partial<Omit<SafetyAlert, 'id'>>) => {
    const updated = await safetyAlertsApi.updateSafetyAlert(id, {
      title: updates.title,
      body: updates.body,
      siteNames: updates.siteNames,
      roles: updates.roles,
      expiresAt: updates.expiresAt,
    })
    setAlerts((prev) => prev.map((a) => (a.id === id ? updated : a)))
  }, [])

  const removeAlert = useCallback(async (id: string) => {
    await safetyAlertsApi.deleteSafetyAlert(id)
    setAlerts((prev) => prev.filter((a) => a.id !== id))
  }, [])

  const markAlertRead = useCallback(async (id: string) => {
    const updated = await safetyAlertsApi.markSafetyAlertRead(id)
    setAlerts((prev) => prev.map((a) => (a.id === id ? updated : a)))
  }, [])

  const acknowledgeAlert = useCallback(async (id: string) => {
    const updated = await safetyAlertsApi.acknowledgeSafetyAlert(id)
    setAlerts((prev) => prev.map((a) => (a.id === id ? updated : a)))
  }, [])

  return (
    <SafetyAlertsContext.Provider value={{
      loadData,
      alerts, loading, refetch, addAlert, updateAlert, removeAlert, markAlertRead, acknowledgeAlert
    }}>
      {children}
    </SafetyAlertsContext.Provider>
  )
}

export function useSafetyAlerts() {
  const ctx = useContext(SafetyAlertsContext)

  useEffect(() => {
    if (ctx && ctx.loadData) {
      ctx.loadData()
    }
  }, [ctx])

  if (!ctx)
    return {
      loadData: () => { },
      alerts: [] as SafetyAlert[],
      loading: false,
      refetch: async () => { },
      addAlert: async () => { },
      updateAlert: async () => { },
      removeAlert: async () => { },
      markAlertRead: async () => { },
      acknowledgeAlert: async () => { },
    }

  return ctx
}
