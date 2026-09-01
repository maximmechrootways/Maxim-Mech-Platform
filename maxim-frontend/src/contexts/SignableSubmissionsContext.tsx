import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { SignableFormSubmission, DailyFormToComplete } from '@/types'
import { fetchSignableSubmissions, fetchDailyForms, fetchSignableSubmission as fetchSignableSubmissionApi } from '@/api/library'

function mapSignableSubmission(s: any): SignableFormSubmission {
  return {
    id: s.id,
    signableFormId: s.signableFormId,
    templateName: s.templateName ?? '',
    dailyFormId: s.dailyFormId ?? s.id,
    submittedById: s.submittedById,
    submittedBy: s.submittedBy ?? '',
    submittedAt: s.submittedAt,
    fieldValues: s.fieldValues ?? {},
    signatureText: s.signatureText ?? '',
    geoLat: s.geoLat,
    geoLng: s.geoLng,
    geoAddress: s.geoAddress,
    workflowType: s.workflowType,
    siteSignerIds: s.siteSignerIds,
    siteSignatures: s.siteSignatures ?? [],
    submittedToHrAt: s.submittedToHrAt,
    siteSignerNames: s.siteSignerNames,
  }
}

function mapDailyForm(f: any): DailyFormToComplete {
  return {
    id: f.id,
    signableFormId: f.signableFormId,
    templateName: f.templateName ?? '',
    dueDate: f.dueDate,
    status: f.status ?? 'pending',
    assignedToUserId: f.assignedToUserId,
    assignedToRole: f.assignedToRole ?? 'labourer',
    schedule: f.schedule,
    formDataSnapshot: f.formDataSnapshot,
    passedFromId: f.passedFromId,
  }
}

interface SignableSubmissionsContextValue {
  loadData: () => void
  submissions: SignableFormSubmission[]
  dailyForms: DailyFormToComplete[]
  getSubmission: (id: string) => SignableFormSubmission | undefined
  fetchSubmission: (id: string) => Promise<SignableFormSubmission | null>
  addSubmission: (submission: SignableFormSubmission) => void
  updateSubmission: (id: string, updates: Partial<SignableFormSubmission>) => void
  refetch: () => Promise<void>
  refetchDailyForms: () => Promise<void>
  loading: boolean
}

const SignableSubmissionsContext = createContext<SignableSubmissionsContextValue | null>(null)

export function SignableSubmissionsProvider({ children }: { children: React.ReactNode }) {
  const [hasFetched, setHasFetched] = useState(false)
  const loadData = useCallback(() => setHasFetched(true), [])
  const [submissions, setSubmissions] = useState<SignableFormSubmission[]>([])
  const [dailyForms, setDailyForms] = useState<DailyFormToComplete[]>([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    try {
      const list = await fetchSignableSubmissions()
      setSubmissions((list || []).map(mapSignableSubmission))
    } catch {
      setSubmissions([])
    } finally {
      setLoading(false)
    }
  }, [])

  const refetchDailyForms = useCallback(async () => {
    try {
      const list = await fetchDailyForms()
      setDailyForms((list || []).map(mapDailyForm))
    } catch {
      setDailyForms([])
    }
  }, [])

  useEffect(() => {
    if (!hasFetched) return;
    refetch()
  }, [refetch])

  useEffect(() => {
    if (!hasFetched) return;
    refetchDailyForms()
  }, [hasFetched, refetchDailyForms])

  const getSubmission = useCallback(
    (id: string) => submissions.find((s) => s.id === id),
    [submissions]
  )

  const fetchSubmission = useCallback(async (id: string): Promise<SignableFormSubmission | null> => {
    try {
      const s = await fetchSignableSubmissionApi(id)
      const mapped = mapSignableSubmission(s)
      setSubmissions((prev) => {
        const idx = prev.findIndex((x) => x.id === id)
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = mapped
          return next
        }
        return [...prev, mapped]
      })
      return mapped
    } catch {
      return null
    }
  }, [hasFetched])

  const addSubmission = useCallback((submission: SignableFormSubmission) => {
    setSubmissions((prev) => (prev.some((s) => s.id === submission.id) ? prev : [...prev, submission]))
  }, [])

  const updateSubmission = useCallback((id: string, updates: Partial<SignableFormSubmission>) => {
    setSubmissions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
    )
  }, [])

  return (
    <SignableSubmissionsContext.Provider value={{
      loadData,
      submissions, dailyForms, getSubmission, fetchSubmission, addSubmission, updateSubmission, refetch, refetchDailyForms, loading
    }}>
      {children}
    </SignableSubmissionsContext.Provider>
  )
}

export function useSignableSubmissions() {
  const ctx = useContext(SignableSubmissionsContext)

  useEffect(() => {
    if (ctx && ctx.loadData) {
      ctx.loadData()
    }
  }, [ctx])

  if (!ctx)
    return {
      loadData: () => { },

      submissions: [],
      dailyForms: [],
      getSubmission: (_: string) => undefined,
      fetchSubmission: async (_: string) => null,
      addSubmission: () => { },
      updateSubmission: () => { },
      refetch: async () => { },
      refetchDailyForms: async () => { },
      loading: false,
    }

  return ctx
}
