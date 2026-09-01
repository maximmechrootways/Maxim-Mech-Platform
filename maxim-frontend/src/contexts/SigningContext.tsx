import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { SignatureRequest } from '@/types'
import { fetchSignatureRequests } from '@/api/library'

function mapRequest(r: any): SignatureRequest {
  return {
    id: r.id,
    documentName: r.documentName ?? '',
    requiredSigners: (r.requiredSigners ?? []).map((s: any) => ({
      id: s.id,
      name: s.name ?? '',
      role: s.role ?? '',
      status: s.status ?? 'pending',
      userId: s.userId,
      signedAt: s.signedAt,
    })),
    dueDate: r.dueDate ?? '',
    remindersSent: r.remindersSent ?? 0,
  }
}

interface SigningContextValue {
  loadData: () => void
  requests: SignatureRequest[]
  refetch: () => Promise<void>
  loading: boolean
}

const SigningContext = createContext<SigningContextValue | null>(null)

export function SigningProvider({ children }: { children: React.ReactNode }) {
  const [hasFetched, setHasFetched] = useState(false)
  const loadData = useCallback(() => setHasFetched(true), [])
  const [requests, setRequests] = useState<SignatureRequest[]>([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    try {
      const list = await fetchSignatureRequests()
      setRequests((list || []).map(mapRequest))
    } catch {
      setRequests([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!hasFetched) return;
    refetch()
  }, [hasFetched, refetch])

  return (
    <SigningContext.Provider value={{
      loadData,
      requests, refetch, loading
    }}>
      {children}
    </SigningContext.Provider>
  )
}

export function useSigning() {
  const ctx = useContext(SigningContext)

  useEffect(() => {
    if (ctx && ctx.loadData) {
      ctx.loadData()
    }
  }, [ctx])

  if (!ctx) return {
    loadData: () => { },
    requests: [], refetch: async () => { }, loading: false
  }

  return ctx
}
