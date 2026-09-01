import React, { createContext, useContext, useState, useEffect } from 'react'
import type { DocumentRecord } from '@/types'
import { listDocuments } from '@/api/documents'

interface DocumentsContextValue {
  documents: DocumentRecord[]
  setDocuments: React.Dispatch<React.SetStateAction<DocumentRecord[]>>
}

const DocumentsContext = createContext<DocumentsContextValue | null>(null)

export function DocumentsProvider({ children }: { children: React.ReactNode }) {
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  useEffect(() => {
    listDocuments().then(setDocuments)
  }, [])
  return (
    <DocumentsContext.Provider value={{ documents, setDocuments }}>
      {children}
    </DocumentsContext.Provider>
  )
}

export function useDocuments() {
  const ctx = useContext(DocumentsContext)
  if (!ctx) return { documents: [], setDocuments: () => {} }
  return ctx
}
