import { useMemo, useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { HazardRiskMatrixSnapshot } from '@/pages/hazard-review/HazardRiskMatrixSnapshot'
import { HazardRiskCategoryTable } from '@/pages/hazard-review/HazardRiskCategoryTable'
import { HierarchyOfControlsReference } from '@/pages/hazard-review/HierarchyOfControlsReference'
import { HazardTemplateMessageBoardPanel } from '@/pages/hazard-review/HazardTemplateMessageBoardPanel'
import { HazardDigitizedTemplateReference } from '@/pages/hazard-review/HazardDigitizedTemplateReference'
import {
  fetchHazardReviewCatalog,
  fetchHazardCustomDocuments,
  fetchHazardCustomDocumentViewUrl,
  fetchHazardStaticOverrideViewUrl,
} from '@/api/hazardReview'
import {
  getStaticHazardReviewDocument,
  mergeHazardReviewCatalog,
  findHazardReviewDocInMerged,
  looksLikeHazardCustomTemplateKey,
  hazardReviewCustomDocIdForApi,
  type HazardReviewDocumentDef,
} from '@/pages/hazard-review/hazardReviewDocuments'

function normalizeRouteTemplateKey(raw: string | undefined): string {
  if (!raw) return ''
  try {
    return decodeURIComponent(raw).trim()
  } catch {
    return raw.trim()
  }
}

/** When the catalog row is missing (stale client) but the URL is a custom doc id, still load PDF via API. */
function syntheticCustomDoc(id: string): HazardReviewDocumentDef {
  const key = id.trim()
  return {
    key,
    title: 'Hazard Risk Assessment',
    shortLabel: 'Assessment',
    description: 'Completed hazard risk assessment.',
    pdfPath: null,
    isCustom: true,
  }
}

export function HazardAssessmentDocument() {
  const params = useParams<{ templateKey: string }>()
  const templateKey = normalizeRouteTemplateKey(params.templateKey)
  const navigate = useNavigate()
  const location = useLocation()

  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof fetchHazardReviewCatalog>> | null>(null)
  const [catalogLoading, setCatalogLoading] = useState(true)

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true)
    try {
      const data = await fetchHazardReviewCatalog()
      setCatalog(data)
    } catch {
      try {
        const customDocuments = await fetchHazardCustomDocuments()
        setCatalog({
          customDocuments,
          staticHiddenTemplateKeys: [],
          staticOverrideTemplateKeys: [],
        })
      } catch {
        setCatalog(null)
      }
    } finally {
      setCatalogLoading(false)
    }
  }, [])

  useEffect(() => {
    loadCatalog()
  }, [loadCatalog])

  const hiddenStaticKeys = useMemo(() => catalog?.staticHiddenTemplateKeys ?? [], [catalog])

  const isHiddenBuiltIn = useMemo(() => {
    if (!templateKey) return false
    const staticDef = getStaticHazardReviewDocument(templateKey)
    if (!staticDef) return false
    return hiddenStaticKeys.some((k) => k.toLowerCase() === templateKey.toLowerCase())
  }, [templateKey, hiddenStaticKeys])

  const doc: HazardReviewDocumentDef | undefined = useMemo(() => {
    if (!templateKey) return undefined

    if (catalog) {
      const merged = mergeHazardReviewCatalog(catalog)
      const found = findHazardReviewDocInMerged(merged, templateKey)
      if (found) return found
      if (looksLikeHazardCustomTemplateKey(templateKey)) {
        return syntheticCustomDoc(templateKey)
      }
      return undefined
    }

    const staticDoc = getStaticHazardReviewDocument(templateKey)
    if (staticDoc) return staticDoc

    if (looksLikeHazardCustomTemplateKey(templateKey)) {
      return syntheticCustomDoc(templateKey)
    }

    return undefined
  }, [templateKey, catalog])

  const apiTemplateKey = hazardReviewCustomDocIdForApi(doc?.key ?? templateKey)

  const [pdfUrlLoading, setPdfUrlLoading] = useState(false)
  const [formSearch, setFormSearch] = useState('')

  useEffect(() => {
    if (location.hash !== '#messages') return
    const t = window.setTimeout(() => {
      document.getElementById('hazard-messages')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
    return () => clearTimeout(t)
  }, [location.pathname, location.hash, templateKey])

  async function resolvePdfUrl() {
    if (!doc) return null
    if (doc.pdfPath) return doc.pdfPath
    if (doc.hasStaticPdfOverride) {
      return fetchHazardStaticOverrideViewUrl(apiTemplateKey)
    }
    if (doc.isCustom) {
      return fetchHazardCustomDocumentViewUrl(apiTemplateKey)
    }
    return null
  }

  async function downloadPdf() {
    try {
      setPdfUrlLoading(true)
      const url = await resolvePdfUrl()
      if (!url) throw new Error('Could not resolve PDF URL')
      const a = document.createElement('a')
      a.href = url
      a.download = `${doc?.shortLabel || 'hazard-assessment'}.pdf`
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch {
      window.alert('Could not download PDF. Try again in a moment.')
    } finally {
      setPdfUrlLoading(false)
    }
  }

  if (!templateKey) {
    return (
      <div className="max-w-3xl mx-auto p-4 md:p-6">
        <p className="text-neutral-500">Missing assessment type.</p>
        <Button type="button" className="mt-4" onClick={() => navigate('/hazard-review')}>
          Back to Hazard Review
        </Button>
      </div>
    )
  }

  if (!catalogLoading && isHiddenBuiltIn) {
    const label = getStaticHazardReviewDocument(templateKey)?.shortLabel ?? templateKey
    return (
      <div className="max-w-3xl mx-auto p-4 md:p-6">
        <Card>
          <p className="text-neutral-700 dark:text-neutral-200">
            The assessment “{label}” has been removed from the hazard review library.
          </p>
          <Button type="button" className="mt-4" onClick={() => navigate('/hazard-review')}>
            Back to Hazard Review
          </Button>
        </Card>
      </div>
    )
  }

  if (!catalogLoading && !doc) {
    return (
      <div className="max-w-3xl mx-auto p-4 md:p-6">
        <Card>
          <p className="text-neutral-700 dark:text-neutral-200">No document is configured for this role.</p>
          <Button type="button" className="mt-4" onClick={() => navigate('/hazard-review')}>
            Back to Hazard Review
          </Button>
        </Card>
      </div>
    )
  }

  if (catalogLoading || !doc) {
    return <div className="max-w-5xl mx-auto p-4 md:p-6 text-neutral-500">Loading assessment…</div>
  }

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6 pb-24">
      <div>
        <button
          type="button"
          onClick={() => navigate('/hazard-review')}
          className="text-sm text-brand-600 dark:text-brand-400 hover:underline mb-2"
        >
          ← Hazard Review
        </button>
        <h1 className="text-2xl font-display font-semibold text-neutral-900 dark:text-white">{doc.title}</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
          Official completed assessment (read-only). Download the original PDF below. The full digitized version is shown
          under it, and the message board is at the bottom.
        </p>
      </div>

      <Card>
        <CardHeader title="Assessment document" subtitle="Download the original PDF supplied by HR." />
        <div className="flex flex-wrap gap-2 mb-4">
          <Button type="button" variant="outline" size="sm" onClick={() => downloadPdf()} disabled={pdfUrlLoading}>
            {pdfUrlLoading ? 'Preparing…' : 'Download PDF'}
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Digitized full assessment (official form layout)"
          subtitle="Full hazard table in coloured chart format with all tasks, hazards, controls, and risk values."
        />
        {doc.isCustom ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            This custom document does not have a predefined role table yet.
          </p>
        ) : null}
        <div className="space-y-4">
          <Input
            label="Search this digitized form"
            type="search"
            value={formSearch}
            onChange={(e) => setFormSearch(e.target.value)}
            placeholder="Search tasks, hazards, controls, or risk values…"
            className="w-full"
          />
          <HazardDigitizedTemplateReference templateKey={apiTemplateKey} query={formSearch} />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Scoring reference"
          subtitle="Likelihood, severity, risk category, and hierarchy of controls."
        />
        <div className="space-y-6">
          <HazardRiskMatrixSnapshot fields={[]} values={{}} referenceOnly />
          <HazardRiskCategoryTable fields={[]} values={{}} referenceOnly />
          <HierarchyOfControlsReference />
        </div>
      </Card>

      <HazardTemplateMessageBoardPanel templateKey={apiTemplateKey} roleLabel={doc.shortLabel} />
    </div>
  )
}
