import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { FormSubmission, FormAuditEvent } from '@/types'
import {
  fetchFormSubmissions,
  fetchFormSubmission,
} from '@/api/library'

function mapSubmission(s: any): FormSubmission {
  return {
    id: s.id,
    templateId: s.templateId,
    templateName: s.templateName,
    status: s.status,
    submittedAt: s.submittedAt,
    submittedBy: s.submittedBy,
    reviewedAt: s.reviewedAt,
    reviewedBy: s.reviewedBy,
    reviewComment: s.reviewComment,
    siteId: s.siteId,
    siteName: s.siteName,
    attachments: s.attachments,
    signatures: s.signatures,
    auditEvents: s.auditEvents ?? [],
    archivedAt: s.archivedAt,
    archivedBy: s.archivedBy,
    workflowType: s.workflowType,
    siteSignerIds: s.siteSignerIds,
    siteSignatures: s.siteSignatures,
    submittedToHrAt: s.submittedToHrAt,
    fieldValues: s.fieldValues ?? {},
    lastOpenedAt: s.lastOpenedAt,
    lastOpenedBy: s.lastOpenedBy,
    lastEditedAt: s.lastEditedAt,
    lastEditedBy: s.lastEditedBy,
  }
}

interface FormSubmissionsContextValue {
  loadData: () => void
  submissions: FormSubmission[]
  getSubmission: (id: string) => FormSubmission | undefined
  fetchSubmission: (id: string) => Promise<FormSubmission | null>
  updateSubmission: (id: string, updates: Partial<FormSubmission>) => void
  addSubmission: (submission: FormSubmission) => void
  addAuditEvent: (submissionId: string, event: Omit<FormAuditEvent, 'id'>) => void
  refetch: () => Promise<void>
  loading: boolean
}

const FormSubmissionsContext = createContext<FormSubmissionsContextValue | null>(null)

export function FormSubmissionsProvider({ children }: { children: React.ReactNode }) {
  const [hasFetched, setHasFetched] = useState(false)
  const loadData = useCallback(() => setHasFetched(true), [])
  const [submissions, setSubmissions] = useState<FormSubmission[]>([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    try {
      const list = await fetchFormSubmissions()
      setSubmissions((list || []).map(mapSubmission))
    } catch {
      setSubmissions([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!hasFetched) return;
    refetch()
  }, [refetch])

  const getSubmission = useCallback(
    (id: string) => submissions.find((s) => s.id === id),
    [submissions]
  )

  const fetchSubmission = useCallback(async (id: string): Promise<FormSubmission | null> => {
    try {
      const s = await fetchFormSubmission(id)
      const mapped = mapSubmission(s)
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

  const updateSubmission = useCallback((id: string, updates: Partial<FormSubmission>) => {
    setSubmissions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
    )
  }, [])

  const addSubmission = useCallback((submission: FormSubmission) => {
    setSubmissions((prev) => (prev.some((s) => s.id === submission.id) ? prev : [...prev, submission]))
  }, [])

  const addAuditEvent = useCallback((submissionId: string, event: Omit<FormAuditEvent, 'id'>) => {
    const newEvent: FormAuditEvent = { ...event, id: `ev-${Date.now()}` }
    setSubmissions((prev) =>
      prev.map((s) =>
        s.id === submissionId
          ? { ...s, auditEvents: [...(s.auditEvents ?? []), newEvent] }
          : s
      )
    )
  }, [])

  return (
    <FormSubmissionsContext.Provider value={{
      loadData,
      submissions, getSubmission, fetchSubmission, updateSubmission, addSubmission, addAuditEvent, refetch, loading
    }}>
      {children}
    </FormSubmissionsContext.Provider>
  )
}

export function useFormSubmissions() {
  const ctx = useContext(FormSubmissionsContext)

  useEffect(() => {
    if (ctx && ctx.loadData) {
      ctx.loadData()
    }
  }, [ctx])

  if (!ctx)
    return {
      loadData: () => { },
      submissions: [],
      getSubmission: (_: string) => undefined,
      fetchSubmission: async (_: string) => null,
      updateSubmission: () => { },
      addSubmission: () => { },
      addAuditEvent: () => { },
      refetch: async () => { },
      loading: false,
    }

  return ctx
}
