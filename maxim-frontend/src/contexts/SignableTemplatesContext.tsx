import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { SignableFormTemplate } from '@/types'
import { fetchSignableTemplates } from '@/api/library'

interface SignableTemplatesContextValue {
  loadData: () => void
  templates: SignableFormTemplate[]
  addTemplate: (t: SignableFormTemplate) => void
  updateTemplateBySourcePdf: (sourcePdfId: string, updates: Partial<SignableFormTemplate>) => void
  updateTemplate: (id: string, updates: Partial<SignableFormTemplate>) => void
  refetch: () => Promise<void>
  loading: boolean
}

function mapTemplate(t: any): SignableFormTemplate {
  return {
    id: t.id,
    name: t.name,
    description: t.description ?? '',
    assignedToRoles: t.assignedToRoles ?? [],
    assignedToUserIds: t.assignedToUserIds,
    schedule: t.schedule ?? 'daily',
    createdAt: t.createdAt,
    createdBy: t.createdBy ?? '',
    active: t.active ?? true,
    sourcePdfId: t.sourcePdfId,
    placedFields: t.placedFields ?? [],
  }
}

const SignableTemplatesContext = createContext<SignableTemplatesContextValue | null>(null)

export function SignableTemplatesProvider({ children }: { children: React.ReactNode }) {
  const [hasFetched, setHasFetched] = useState(false)
  const loadData = useCallback(() => setHasFetched(true), [])
  const [templates, setTemplates] = useState<SignableFormTemplate[]>([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    try {
      const list = await fetchSignableTemplates()
      setTemplates((list || []).map(mapTemplate))
    } catch {
      setTemplates([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!hasFetched) return;
    refetch()
  }, [refetch])

  const addTemplate = useCallback((t: SignableFormTemplate) => {
    setTemplates((prev) => (prev.some((x) => x.id === t.id) ? prev : [...prev, t]))
  }, [hasFetched])

  const updateTemplateBySourcePdf = useCallback((sourcePdfId: string, updates: Partial<SignableFormTemplate>) => {
    setTemplates((prev) =>
      prev.map((t) => (t.sourcePdfId === sourcePdfId ? { ...t, ...updates } : t))
    )
  }, [])

  const updateTemplate = useCallback((id: string, updates: Partial<SignableFormTemplate>) => {
    setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)))
  }, [])

  return (
    <SignableTemplatesContext.Provider value={{
      loadData,
      templates, addTemplate, updateTemplateBySourcePdf, updateTemplate, refetch, loading
    }}>
      {children}
    </SignableTemplatesContext.Provider>
  )
}

export function useSignableTemplates() {
  const ctx = useContext(SignableTemplatesContext)

  useEffect(() => {
    if (ctx && ctx.loadData) {
      ctx.loadData()
    }
  }, [ctx])

  if (!ctx)
    return {
      loadData: () => { },

      templates: [],
      addTemplate: () => { },
      updateTemplateBySourcePdf: () => { },
      updateTemplate: () => { },
      refetch: async () => { },
      loading: false,
    }

  return ctx
}
