import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react'
import type { Certificate } from '@/types'
import * as api from '@/api/certificates'
import { formatAxiosError } from '@/api'
import { useAuth } from '@/contexts/AuthContext'

interface CertificatesContextValue {
  loadData: () => void
  certificates: Certificate[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  addCertificate: (payload: api.CertificatePayload | FormData) => Promise<Certificate>
  updateCertificate: (id: string, updates: Partial<Omit<Certificate, 'id'>> | FormData) => Promise<void>
  removeCertificate: (id: string) => Promise<void>
  markReminderSent: (id: string) => Promise<void>
}

const CertificatesContext = createContext<CertificatesContextValue | null>(null)

export function CertificatesProvider({ children }: { children: React.ReactNode }) {
  const { session, loading: authLoading } = useAuth()
  const sessionUserId = session?.userId ?? null
  const [hasFetched, setHasFetched] = useState(false)
  const loadData = useCallback(() => setHasFetched(true), [])
  const [certificates, setCertificates] = useState<Certificate[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  const refetch = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setLoading(true)
    setError(null)
    try {
      const list = await api.fetchCertificates()
      if (requestId !== requestIdRef.current) return
      setCertificates(Array.isArray(list) ? list : [])
    } catch (e: unknown) {
      if (requestId !== requestIdRef.current) return
      setError(formatAxiosError(e))
      // Keep prior data so KPIs don't flash to 0 on transient API failures.
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }, [])

  // Depend on stable sessionUserId — Auth clones `session` every second for TTL countdown.
  useEffect(() => {
    if (authLoading || !sessionUserId || !hasFetched) return
    void refetch()
  }, [refetch, hasFetched, authLoading, sessionUserId])

  const addCertificate = useCallback(async (payload: api.CertificatePayload | FormData): Promise<Certificate> => {
    const created = await api.createCertificate(payload)
    setCertificates((prev) => [...prev, created])
    return created
  }, [])

  const updateCertificate = useCallback(async (id: string, updates: Partial<Omit<Certificate, 'id'>> | FormData) => {
    const updated = await api.updateCertificate(id, updates)
    setCertificates((prev) => prev.map((c) => (c.id === id ? { ...c, ...updated } : c)))
  }, [])

  const removeCertificate = useCallback(async (id: string) => {
    await api.deleteCertificate(id)
    setCertificates((prev) => prev.filter((c) => c.id !== id))
  }, [])

  const markReminderSent = useCallback(async (id: string) => {
    await api.markCertificateReminderSent(id)
    const sentAt = new Date().toISOString()
    setCertificates((prev) => prev.map((c) => (c.id === id ? { ...c, expirationReminderSentAt: sentAt } : c)))
  }, [])

  const value = useMemo(
    () => ({
      loadData,
      certificates,
      loading,
      error,
      refetch,
      addCertificate,
      updateCertificate,
      removeCertificate,
      markReminderSent,
    }),
    [loadData, certificates, loading, error, refetch, addCertificate, updateCertificate, removeCertificate, markReminderSent]
  )

  return (
    <CertificatesContext.Provider value={value}>
      {children}
    </CertificatesContext.Provider>
  )
}

const fallback: CertificatesContextValue = {
  loadData: () => {},
  certificates: [],
  loading: false,
  error: null,
  refetch: async () => {},
  addCertificate: async () => ({ id: '', name: '', holderName: '', expirationDate: '', uploadedAt: '', uploadedBy: '' }),
  updateCertificate: async () => {},
  removeCertificate: async () => {},
  markReminderSent: async () => {},
}

export function useCertificates() {
  const ctx = useContext(CertificatesContext)
  const { session, loading: authLoading } = useAuth()
  const sessionUserId = session?.userId ?? null
  const loadData = ctx?.loadData

  useEffect(() => {
    if (authLoading || !sessionUserId || !loadData) return
    loadData()
  }, [loadData, authLoading, sessionUserId])

  return ctx ?? fallback
}
