import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { SignableFormTemplate } from '@/types'
import { listSignableTemplates } from '@/api/signableTemplates'

const EMPTY_TEMPLATES: SignableFormTemplate[] = []

interface SignableTemplatesContextValue {
  templates: SignableFormTemplate[]
  addTemplate: (t: SignableFormTemplate) => void
  updateTemplateBySourcePdf: (sourcePdfId: string, updates: Partial<SignableFormTemplate>) => void
  updateTemplate: (id: string, updates: Partial<SignableFormTemplate>) => void
}

const SignableTemplatesContext = createContext<SignableTemplatesContextValue | null>(null)

export function SignableTemplatesProvider({ children }: { children: React.ReactNode }) {
  const [templates, setTemplates] = useState<SignableFormTemplate[]>([])

  useEffect(() => {
    listSignableTemplates().then(setTemplates)
  }, [])
  const addTemplate = useCallback((t: SignableFormTemplate) => {
    setTemplates((prev) => (prev.some((x) => x.id === t.id) ? prev : [...prev, t]))
  }, [])
  const updateTemplateBySourcePdf = useCallback((sourcePdfId: string, updates: Partial<SignableFormTemplate>) => {
    setTemplates((prev) =>
      prev.map((t) => (t.sourcePdfId === sourcePdfId ? { ...t, ...updates } : t))
    )
  }, [])
  const updateTemplate = useCallback((id: string, updates: Partial<SignableFormTemplate>) => {
    setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)))
  }, [])
  return (
    <SignableTemplatesContext.Provider value={{ templates, addTemplate, updateTemplateBySourcePdf, updateTemplate }}>
      {children}
    </SignableTemplatesContext.Provider>
  )
}

export function useSignableTemplates() {
  const ctx = useContext(SignableTemplatesContext)
  if (!ctx)
    return {
      templates: EMPTY_TEMPLATES,
      addTemplate: () => {},
      updateTemplateBySourcePdf: () => {},
      updateTemplate: () => {},
    }
  return ctx
}
