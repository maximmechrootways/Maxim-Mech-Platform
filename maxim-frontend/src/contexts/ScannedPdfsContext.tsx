import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { ScannedPdfDocument } from '@/types'
import { fetchScannedPdfs } from '@/api/library'

interface ScannedPdfsContextValue {
  loadData: () => void
  pdfs: ScannedPdfDocument[]
  addPdf: (doc: ScannedPdfDocument) => void
  getPdf: (id: string) => ScannedPdfDocument | undefined
  refetch: () => Promise<void>
  loading: boolean
}

const ScannedPdfsContext = createContext<ScannedPdfsContextValue | null>(null)

export function ScannedPdfsProvider({ children }: { children: React.ReactNode }) {
  const [hasFetched, setHasFetched] = useState(false)
  const loadData = useCallback(() => setHasFetched(true), [])
  const [pdfs, setPdfs] = useState<ScannedPdfDocument[]>([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    try {
      const list = await fetchScannedPdfs()
      setPdfs((list || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        uploadedAt: p.uploadedAt,
        uploadedBy: p.uploadedBy ?? '',
      })))
    } catch {
      setPdfs([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!hasFetched) return;
    refetch()
  }, [refetch])

  const addPdf = useCallback((doc: ScannedPdfDocument) => {
    setPdfs((prev) => (prev.some((p) => p.id === doc.id) ? prev : [...prev, doc]))
  }, [hasFetched])

  const getPdf = useCallback(
    (id: string) => pdfs.find((p) => p.id === id),
    [pdfs]
  )

  return (
    <ScannedPdfsContext.Provider value={{
        loadData, pdfs, addPdf, getPdf, refetch, loading }}>
      {children}
    </ScannedPdfsContext.Provider>
  )
}

export function useScannedPdfs() {
  const ctx = useContext(ScannedPdfsContext)
  if (!ctx) return {
      loadData: () => {}, pdfs: [], addPdf: () => {}, getPdf: (_: string) => undefined, refetch: async () => {}, loading: false }
  return ctx
}
