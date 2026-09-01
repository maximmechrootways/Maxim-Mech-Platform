import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { useUser } from '@/contexts/UserContext'
import {
  fetchHazardReviewCatalog,
  fetchHazardCustomDocuments,
  createHazardCustomDocument,
  updateHazardCustomDocumentLabel,
  replaceHazardCustomDocumentFile,
  deleteHazardCustomDocument,
  replaceHazardStaticTemplatePdf,
  hideHazardStaticTemplate,
  createHazardSubmission,
} from '@/api/hazardReview'
import { fetchSites } from '@/api/jobs'
import { mergeHazardReviewCatalog, type HazardReviewDocumentDef } from '@/pages/hazard-review/hazardReviewDocuments'

export function HazardReviewHub() {
  const navigate = useNavigate()
  const { user } = useUser()
  const isHr = user?.role === 'hr' || user?.role === 'owner'

  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof fetchHazardReviewCatalog>> | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const refreshCatalog = useCallback(async () => {
    setLoadError(null)
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
      } catch (e: unknown) {
        const err = e as { response?: { data?: { error?: string } } }
        setLoadError(err?.response?.data?.error || 'Could not load hazard review library')
        setCatalog(null)
      }
    }
  }, [])

  useEffect(() => {
    refreshCatalog()
  }, [refreshCatalog])

  const documents: HazardReviewDocumentDef[] = useMemo(
    () => (catalog ? mergeHazardReviewCatalog(catalog) : []),
    [catalog]
  )

  const [showAdd, setShowAdd] = useState(false)
  const [addName, setAddName] = useState('')
  const [addFile, setAddFile] = useState<File | null>(null)
  const [addFileInputKey, setAddFileInputKey] = useState(0)
  const [addSaving, setAddSaving] = useState(false)

  const [editDoc, setEditDoc] = useState<HazardReviewDocumentDef | null>(null)
  const [editName, setEditName] = useState('')
  const [editFile, setEditFile] = useState<File | null>(null)
  const [editSaving, setEditSaving] = useState(false)

  const [editStaticKey, setEditStaticKey] = useState<string | null>(null)
  const [editStaticLabel, setEditStaticLabel] = useState('')
  const [editStaticFile, setEditStaticFile] = useState<File | null>(null)
  const [editStaticFileKey, setEditStaticFileKey] = useState(0)
  const [editStaticSaving, setEditStaticSaving] = useState(false)

  const [sites, setSites] = useState<{ id: string; name: string }[]>([])
  const [sitesLoading, setSitesLoading] = useState(false)
  const [startingBlankRegister, setStartingBlankRegister] = useState(false)

  useEffect(() => {
    if (!isHr) return
    setSitesLoading(true)
    fetchSites(true)
      .then((list) => setSites(list.map((s) => ({ id: s.id, name: s.name }))))
      .catch(() => setSites([]))
      .finally(() => setSitesLoading(false))
  }, [isHr])

  useEffect(() => {
    if (showAdd) {
      setAddFile(null)
      setAddFileInputKey((k) => k + 1)
    }
  }, [showAdd])

  useEffect(() => {
    if (editStaticKey) {
      setEditStaticFile(null)
      setEditStaticFileKey((k) => k + 1)
    }
  }, [editStaticKey])

  async function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!addName.trim()) {
      window.alert('Please enter a name.')
      return
    }
    if (!addFile) {
      window.alert('Please choose a PDF file.')
      return
    }
    setAddSaving(true)
    try {
      await createHazardCustomDocument(addName.trim(), addFile)
      setShowAdd(false)
      setAddName('')
      setAddFile(null)
      await refreshCatalog()
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { error?: string } } }
      window.alert(e2?.response?.data?.error || 'Could not create assessment')
    } finally {
      setAddSaving(false)
    }
  }

  function openEdit(d: HazardReviewDocumentDef) {
    if (d.isStaticBuiltIn) {
      setEditStaticKey(d.key)
      setEditStaticLabel(d.shortLabel)
      return
    }
    if (!d.isCustom) return
    setEditDoc(d)
    setEditName(d.shortLabel)
    setEditFile(null)
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!editDoc?.isCustom) return
    const id = editDoc.key
    if (!editName.trim()) return
    setEditSaving(true)
    try {
      if (editName.trim() !== editDoc.shortLabel) {
        await updateHazardCustomDocumentLabel(id, editName.trim())
      }
      if (editFile) {
        await replaceHazardCustomDocumentFile(id, editFile)
      }
      setEditDoc(null)
      await refreshCatalog()
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { error?: string } } }
      window.alert(e2?.response?.data?.error || 'Could not update assessment')
    } finally {
      setEditSaving(false)
    }
  }

  async function handleStaticEditSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!editStaticKey) return
    if (!editStaticFile) {
      window.alert('Please choose a PDF file to upload.')
      return
    }
    setEditStaticSaving(true)
    try {
      await replaceHazardStaticTemplatePdf(editStaticKey, editStaticFile)
      setEditStaticKey(null)
      await refreshCatalog()
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { error?: string } } }
      window.alert(e2?.response?.data?.error || 'Could not update PDF')
    } finally {
      setEditStaticSaving(false)
    }
  }

  async function handleDelete(d: HazardReviewDocumentDef) {
    if (d.isStaticBuiltIn) {
      if (
        !window.confirm(
          `Remove “${d.shortLabel}” from the hazard review library? The default card will disappear for everyone; you can add a custom assessment later if needed.`
        )
      ) {
        return
      }
      try {
        await hideHazardStaticTemplate(d.key)
        await refreshCatalog()
      } catch (err: unknown) {
        const e2 = err as { response?: { data?: { error?: string } } }
        window.alert(e2?.response?.data?.error || 'Could not remove assessment')
      }
      return
    }
    if (!d.isCustom) return
    if (!window.confirm(`Delete “${d.shortLabel}” and its message board? This cannot be undone.`)) return
    try {
      await deleteHazardCustomDocument(d.key)
      await refreshCatalog()
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { error?: string } } }
      window.alert(e2?.response?.data?.error || 'Could not delete')
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-8 pb-24">
      <div>
        <h1 className="text-2xl font-display font-semibold text-neutral-900 dark:text-white">Hazard Review</h1>
        <p className="text-neutral-600 dark:text-neutral-400 mt-1 max-w-3xl">
          Choose a role to open the official completed hazard risk assessment (PDF), scoring reference, and message board
          on one page.
        </p>
        {isHr && (
          <div className="mt-4">
            <Button type="button" onClick={() => setShowAdd(true)}>
              Add more
            </Button>
          </div>
        )}
        {loadError && <p className="text-sm text-amber-700 dark:text-amber-300 mt-2">{loadError}</p>}
      </div>

      <section>
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-3">Assessment library</h2>
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {documents.map((t) => (
            <div
              key={t.key}
              className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900/50 p-4 flex flex-col gap-3"
            >
              <div>
                <p className="font-medium text-neutral-900 dark:text-white">{t.shortLabel}</p>
                <p className="text-sm text-neutral-500 mt-1 line-clamp-3">{t.description}</p>
              </div>
              <div className="mt-auto pt-1 flex flex-col gap-2">
                <Button
                  type="button"
                  className="w-full"
                  onClick={() => navigate(`/hazard-review/assess/${encodeURIComponent(t.key)}`)}
                >
                  View assessment
                </Button>
                {isHr && (t.isCustom || t.isStaticBuiltIn) && (
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => openEdit(t)}>
                      Edit
                    </Button>
                    <Button type="button" variant="danger" size="sm" className="flex-1" onClick={() => handleDelete(t)}>
                      Delete
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {isHr && (
        <section>
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-3">
            Critical Task Inventory &amp; Risk Register
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900/50 p-5 flex flex-col min-h-[200px]">
              <p className="font-medium text-neutral-900 dark:text-white">Completed hazards by job site</p>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-2">
                Select a site to view submitted hazard risk assessments linked to jobs on that site.
              </p>
              {sitesLoading ? (
                <p className="text-sm text-neutral-400 mt-4">Loading sites…</p>
              ) : sites.length === 0 ? (
                <p className="text-sm text-amber-600 dark:text-amber-400 mt-4">No active sites yet.</p>
              ) : (
                <ul className="mt-4 space-y-2 max-h-56 overflow-y-auto pr-1">
                  {sites.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => navigate(`/hazard-review/critical-register/site/${encodeURIComponent(s.id)}`)}
                        className="w-full text-left px-3 py-2.5 rounded-lg border border-neutral-200 dark:border-neutral-600 bg-neutral-50/80 dark:bg-neutral-800/50 text-neutral-900 dark:text-white text-sm hover:border-brand-400/70 hover:bg-brand-50/40 dark:hover:bg-brand-950/30 transition-colors"
                      >
                        {s.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button
              type="button"
              disabled={startingBlankRegister}
              onClick={async () => {
                setStartingBlankRegister(true)
                try {
                  const sub = await createHazardSubmission('general_labourer', null)
                  navigate(`/hazard-review/hra/${sub.id}`)
                } catch (err: unknown) {
                  const e2 = err as { response?: { data?: { error?: string } } }
                  window.alert(e2?.response?.data?.error ?? 'Could not start a new register entry.')
                } finally {
                  setStartingBlankRegister(false)
                }
              }}
              className="text-left rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900/50 p-5 hover:border-brand-400/60 hover:bg-brand-50/30 dark:hover:bg-brand-950/20 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/40 disabled:opacity-60"
            >
              <p className="font-medium text-neutral-900 dark:text-white">Add blank risk register form</p>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-2">
                Starts a new hazard risk assessment draft (General Labourer template) for you to complete and submit.
              </p>
              <p className="text-xs text-brand-600 dark:text-brand-400 mt-3 font-medium">
                {startingBlankRegister ? 'Opening…' : 'Click to begin'}
              </p>
            </button>
          </div>
        </section>
      )}

      {showAdd && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="hra-add-title"
        >
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-700 shadow-xl max-w-md w-full p-5 space-y-4">
            <h2 id="hra-add-title" className="text-lg font-semibold text-neutral-900 dark:text-white">
              Add hazard assessment
            </h2>
            <p className="text-sm text-neutral-500">Enter the name shown on the card and upload a completed PDF.</p>
            <form onSubmit={handleAddSubmit} className="space-y-3">
              <div>
                <label className="block text-sm text-neutral-600 dark:text-neutral-400 mb-1">Name</label>
                <input
                  type="text"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm"
                  placeholder="e.g. Electrician"
                  maxLength={120}
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-neutral-600 dark:text-neutral-400 mb-1">PDF file</label>
                <input
                  key={addFileInputKey}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="w-full text-sm"
                  aria-label="PDF file to upload"
                  onChange={(e) => setAddFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setShowAdd(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" disabled={addSaving}>
                  {addSaving ? 'Saving…' : 'Create'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editDoc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="hra-edit-title"
        >
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-700 shadow-xl max-w-md w-full p-5 space-y-4">
            <h2 id="hra-edit-title" className="text-lg font-semibold text-neutral-900 dark:text-white">
              Edit assessment
            </h2>
            <p className="text-sm text-neutral-500">Change the name and optionally replace the PDF.</p>
            <form onSubmit={handleEditSubmit} className="space-y-3">
              <div>
                <label className="block text-sm text-neutral-600 dark:text-neutral-400 mb-1">Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm"
                  placeholder="Role or assessment name"
                  maxLength={120}
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-neutral-600 dark:text-neutral-400 mb-1">
                  Replace PDF (optional)
                </label>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="w-full text-sm"
                  aria-label="Replacement PDF file"
                  onChange={(e) => setEditFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setEditDoc(null)}>
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" disabled={editSaving}>
                  {editSaving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editStaticKey && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="hra-static-edit-title"
        >
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-700 shadow-xl max-w-md w-full p-5 space-y-4">
            <h2 id="hra-static-edit-title" className="text-lg font-semibold text-neutral-900 dark:text-white">
              Replace PDF — {editStaticLabel}
            </h2>
            <p className="text-sm text-neutral-500">
              Upload a new completed PDF for this built-in role. Everyone will see this file instead of the default.
            </p>
            <form onSubmit={handleStaticEditSubmit} className="space-y-3">
              <div>
                <label className="block text-sm text-neutral-600 dark:text-neutral-400 mb-1">New PDF file</label>
                <input
                  key={editStaticFileKey}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="w-full text-sm"
                  aria-label="New PDF for built-in role"
                  onChange={(e) => setEditStaticFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setEditStaticKey(null)}>
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" disabled={editStaticSaving}>
                  {editStaticSaving ? 'Saving…' : 'Upload'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
