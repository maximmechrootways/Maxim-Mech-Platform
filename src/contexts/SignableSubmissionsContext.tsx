import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { SignableFormSubmission } from '@/types'
import { listSignableSubmissions } from '@/api/signableSubmissions'

const EMPTY_SUBMISSIONS: SignableFormSubmission[] = []

interface SignableSubmissionsContextValue {
  submissions: SignableFormSubmission[]
  getSubmission: (id: string) => SignableFormSubmission | undefined
  addSubmission: (submission: SignableFormSubmission) => void
  updateSubmission: (id: string, updates: Partial<SignableFormSubmission>) => void
}

const SignableSubmissionsContext = createContext<SignableSubmissionsContextValue | null>(null)

export function SignableSubmissionsProvider({ children }: { children: React.ReactNode }) {
  const [submissions, setSubmissions] = useState<SignableFormSubmission[]>([])

  useEffect(() => {
    listSignableSubmissions().then(setSubmissions)
  }, [])

  const getSubmission = useCallback(
    (id: string) => submissions.find((s) => s.id === id),
    [submissions]
  )

  const addSubmission = useCallback((submission: SignableFormSubmission) => {
    setSubmissions((prev) => (prev.some((s) => s.id === submission.id) ? prev : [...prev, submission]))
  }, [])

  const updateSubmission = useCallback((id: string, updates: Partial<SignableFormSubmission>) => {
    setSubmissions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
    )
  }, [])

  return (
    <SignableSubmissionsContext.Provider value={{ submissions, getSubmission, addSubmission, updateSubmission }}>
      {children}
    </SignableSubmissionsContext.Provider>
  )
}

export function useSignableSubmissions() {
  const ctx = useContext(SignableSubmissionsContext)
  if (!ctx)
    return {
      submissions: EMPTY_SUBMISSIONS,
      getSubmission: (_: string) => undefined,
      addSubmission: () => {},
      updateSubmission: () => {},
    }
  return ctx
}
