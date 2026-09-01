import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useUser } from '@/contexts/UserContext'
import { useDocuments } from '@/contexts/DocumentsContext'
import { formatAxiosError } from '@/api'
import { uploadLibraryDocument } from '@/api/library'
import type { DocumentVisibility, UserRole } from '@/types'

const DOC_TYPES = [
  'Health and Safety Manual',
  'Signed policy statement',
  'Policy',
  'Meeting Minutes',
  'Agenda',
  'SDS',
  'Inspection',
  'Incident',
  'Safety',
  'Other',
]
const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'owner', label: 'Owner' },
  { value: 'hr', label: 'HR' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'labourer', label: 'Labourer' },
]

export function LibraryDocumentUpload() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useUser()
  const { documents, refetch } = useDocuments()
  const [name, setName] = useState('')
  const [type, setType] = useState('Policy')
  const [siteName, setSiteName] = useState('')
  const [visibility, setVisibility] = useState<DocumentVisibility>('everyone')
  const [visibleToRoles, setVisibleToRoles] = useState<UserRole[]>(['owner', 'hr'])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fileDataUrl, setFileDataUrl] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const isOwnerOrHr = user?.role === 'owner' || user?.role === 'hr'
  if (!isOwnerOrHr) {
    navigate('/library?view=documents', { replace: true })
    return null
  }

  useEffect(() => {
    const forParam = searchParams.get('for')
    if (forParam === 'signed-policies') {
      setType('Signed policy statement')
    } else if (forParam === 'sds') {
      setType('SDS')
    } else if (forParam === 'meeting-minutes') {
      setType('Meeting Minutes')
    } else if (forParam === 'agenda') {
      setType('Agenda')
    }
  }, [searchParams])

  const uploadReturnTo = (() => {
    const forParam = searchParams.get('for')
    if (forParam === 'sds') return '/safety/sds'
    if (forParam === 'meeting-minutes' || forParam === 'agenda') return '/safety/meeting-minutes'
    if (forParam === 'signed-policies') return '/health-safety-manual'
    return '/library?view=documents'
  })()

  const uploadBackLabel = (() => {
    const forParam = searchParams.get('for')
    if (forParam === 'sds') return '← Back to SDS'
    if (forParam === 'meeting-minutes' || forParam === 'agenda') return '← Back to Meeting Minutes / Agendas'
    if (forParam === 'signed-policies') return '← Back to Health & Safety Manual'
    return '← Back to documents'
  })()

  const isMeetingDocsUpload =
    searchParams.get('for') === 'meeting-minutes' || searchParams.get('for') === 'agenda'

  const toggleRole = (role: UserRole) => {
    setVisibleToRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]))
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    setSelectedFile(file ?? null)
    if (!file) {
      setFileDataUrl(null)
      return
    }
    if (!name.trim()) {
      setName(file.name.replace(/\.pdf$/i, ''))
    }
    const reader = new FileReader()
    reader.onload = () => setFileDataUrl(reader.result as string)
    reader.readAsDataURL(file)
  }

  const save = async () => {
    if (!name.trim() || !selectedFile) {
      setError(selectedFile ? 'Document name is required.' : 'Please choose a PDF file to upload.')
      return
    }
    if (saving) return
    setError(null)
    const docName = name.trim().endsWith('.pdf') ? name.trim() : `${name.trim()}.pdf`
    const forParam = searchParams.get('for')
    const isSdsUpload = forParam === 'sds' || type === 'SDS'
    if (isSdsUpload) {
      const nameKey = docName.toLowerCase()
      const duplicates = documents.filter(
        (d) =>
          (d.type || '').trim().toLowerCase() === 'sds' &&
          (d.name || '').trim().toLowerCase() === nameKey
      )
      if (duplicates.length > 0) {
        const ok = window.confirm(
          `"${docName}" is already in the SDS library (${duplicates.length} existing). Upload another copy anyway?\n\nTip: delete the old copy from the SDS page first if you meant to replace it.`
        )
        if (!ok) return
      }
    }
    setSaving(true)
    try {
      await uploadLibraryDocument(selectedFile, {
        name: docName,
        type,
        date: new Date().toISOString().slice(0, 10),
        visibility,
        visibleToRoles: visibility === 'restricted' ? visibleToRoles : undefined,
      })
      await refetch()
      navigate(uploadReturnTo, { state: { message: 'Document uploaded. It has no fillable fields — view only.' } })
    } catch (e: unknown) {
      setError(formatAxiosError(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div className="flex items-center gap-4">
        <Link
          to={uploadReturnTo}
          className="no-print -ml-2 text-sm text-brand-600 dark:text-brand-400 hover:underline"
        >
          {uploadBackLabel}
        </Link>
      </div>
      <Card padding="lg">
        <CardHeader>
          {searchParams.get('for') === 'sds'
            ? 'Upload SDS'
            : searchParams.get('for') === 'meeting-minutes'
              ? 'Upload Meeting Minutes'
              : searchParams.get('for') === 'agenda'
                ? 'Upload Agenda'
                : 'Upload Document'}
        </CardHeader>
        <CardDescription>
          {searchParams.get('for') === 'sds'
            ? 'Upload a safety data sheet PDF. It will appear on the SDS bulletin board for the crew to view and download.'
            : isMeetingDocsUpload
              ? 'Upload a PDF for the Meeting Minutes / Agendas page on the bulletin board. Documents have no fillable fields — they are for viewing and distribution only.'
              : 'Same as templates: upload a PDF to the system. Documents have no fillable fields — they are for viewing and distribution only. Set visibility so everyone or only certain roles can see it.'}
        </CardDescription>
        <div className="mt-6 space-y-4">
          <div className="w-full min-h-[120px] rounded-xl border-2 border-dashed border-neutral-300 dark:border-neutral-600 flex flex-col items-center justify-center gap-2 bg-neutral-50/50 dark:bg-neutral-800/30 py-6">
            <input
              id="library-doc-upload"
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleFileChange}
              className="sr-only"
              aria-label="Choose PDF file"
            />
            <label htmlFor="library-doc-upload" className="cursor-pointer text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline">
              {selectedFile ? selectedFile.name : 'Choose PDF to upload'}
            </label>
            {selectedFile && (
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {selectedFile.name} · {(selectedFile.size / 1024).toFixed(1)} KB
                {selectedFile.size > 5 * 1024 * 1024
                  ? ' · Large file — upload may take a minute. Keep this tab open until it finishes.'
                  : ''}
              </p>
            )}
          </div>
          <Input label="Document name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Safety Handbook 2025.pdf" />
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1" id="library-doc-type-label">Type</label>
            <select id="library-doc-type" value={type} onChange={(e) => setType(e.target.value)} className="w-full min-h-[44px] px-3 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white" aria-labelledby="library-doc-type-label">
              {DOC_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <Input label="Site (optional)" value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="e.g. North Site" />
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1" id="library-doc-visibility-label">Visibility</label>
            <select id="library-doc-visibility" value={visibility} onChange={(e) => setVisibility(e.target.value as DocumentVisibility)} className="w-full min-h-[44px] px-3 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white" aria-labelledby="library-doc-visibility-label">
              <option value="everyone">Everyone</option>
              <option value="restricted">Restricted (selected roles only)</option>
            </select>
          </div>
          {visibility === 'restricted' && (
            <div>
              <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Roles that can view</p>
              <div className="flex flex-wrap gap-2">
                {ROLE_OPTIONS.map((r) => (
                  <label key={r.value} className="flex items-center gap-2 cursor-pointer text-sm">
                    <input type="checkbox" checked={visibleToRoles.includes(r.value)} onChange={() => toggleRole(r.value)} className="rounded border-neutral-300 text-brand-600" />
                    {r.label}
                  </label>
                ))}
              </div>
            </div>
          )}
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex gap-2 pt-2">
            <Button onClick={save} disabled={!name.trim() || !selectedFile || saving}>{saving ? 'Uploading...' : 'Upload document'}</Button>
            {selectedFile && (
              <button
                type="button"
                onClick={() => { setSelectedFile(null); setFileDataUrl(null); }}
                className="text-sm text-neutral-500 dark:text-neutral-400 hover:underline"
              >
                Clear file
              </button>
            )}
            <Link to={searchParams.get('for') === 'sds' ? '/safety/sds' : '/library?view=documents'}>
              <Button variant="ghost">Cancel</Button>
            </Link>
          </div>
        </div>
      </Card>
    </div>
  )
}
