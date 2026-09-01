import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { DocumentRecord } from '@/types'
import { fetchLibraryDocuments } from '@/api/library'
import { useAuth } from '@/contexts/AuthContext'

interface DocumentsContextValue {
  documents: DocumentRecord[]
  setDocuments: React.Dispatch<React.SetStateAction<DocumentRecord[]>>
  refetch: () => Promise<void>
  loading: boolean
  loadError: string | null
  loadData: () => void
}

const DocumentsContext = createContext<DocumentsContextValue | null>(null)

function mapDoc(d: any): DocumentRecord {
  return {
    id: d.id,
    name: d.name,
    type: typeof d.type === 'string' ? d.type.trim() : (d.type ?? 'other'),
    siteId: d.siteId,
    siteName: d.siteName,
    date: d.date ?? new Date().toISOString().slice(0, 10),
    uploadedBy: d.uploadedBy,
    visibility: d.visibility ?? 'everyone',
    visibleToRoles: d.visibleToRoles ?? [],
    visibleToUserIds: d.visibleToUserIds ?? [],
    tags: d.tags ?? [],
    version: d.version ?? 1,
    acknowledgedBy: d.acknowledgedBy ?? [],
    lastOpenedAt: d.lastOpenedAt,
    lastOpenedBy: d.lastOpenedBy,
    lastEditedAt: d.lastEditedAt,
    lastEditedBy: d.lastEditedBy,
    filePath: d.filePath,
  }
}

export function DocumentsProvider({ children }: { children: React.ReactNode }) {
  const { authReady } = useAuth()
  const [hasFetched, setHasFetched] = useState(false)
  const loadData = useCallback(() => setHasFetched(true), [])
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!authReady) return
    setLoading(true)
    setLoadError(null)
    try {
      const list = await fetchLibraryDocuments()
      const rows = Array.isArray(list) ? list : []
      setDocuments(rows.map(mapDoc))
    } catch {
      // Keep previously loaded docs so a timeout/401 does not blank the library screens.
      setLoadError('Could not refresh documents. Showing the last loaded list if available.')
    } finally {
      setLoading(false)
    }
  }, [authReady])

  useEffect(() => {
    if (!hasFetched) return
    if (!authReady) {
      setLoading(true)
      return
    }
    void refetch()
  }, [hasFetched, authReady, refetch])

  return (
    <DocumentsContext.Provider value={{ documents, setDocuments, refetch, loading, loadError, loadData }}>
      {children}
    </DocumentsContext.Provider>
  )
}

export function useDocuments() {
  const ctx = useContext(DocumentsContext)
  useEffect(() => {
    if (ctx?.loadData) {
      ctx.loadData()
    }
  }, [ctx])
  if (!ctx) {
    return {
      documents: [],
      setDocuments: () => {},
      refetch: async () => {},
      loading: false,
      loadError: null,
      loadData: () => {},
    }
  }
  return ctx
}
