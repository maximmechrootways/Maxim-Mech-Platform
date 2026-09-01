import { useState, useEffect } from 'react'
import { api } from '@/api'

/**
 * Fetches a time-limited SAS URL for a PDF template stored in Azure Blob Storage.
 * Usage: const { pdfUrl, loading, error } = usePdfUrl(templateId)
 */
export function usePdfUrl(templateId: string | undefined) {
    const [pdfUrl, setPdfUrl] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!templateId) return
        let cancelled = false
        setLoading(true)
        setError(null)

        api.get(`/pdf-templates/${templateId}/file-url`)
            .then(res => {
                if (!cancelled) setPdfUrl(res.data.url)
            })
            .catch(err => {
                if (!cancelled) setError(err?.response?.data?.error || err.message || 'Could not load PDF')
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })

        return () => { cancelled = true }
    }, [templateId])

    return { pdfUrl, loading, error }
}
