import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useUser } from '@/contexts/UserContext'
import { api } from '@/api'
import { createCustomPdfTemplate, getPdfTemplate, updatePdfTemplate } from '@/api/library'
import type { UserRole } from '@/types'

type BuilderFieldType = 'SECTION' | 'COLLECT_SIGNATURES' | 'TEXT' | 'NUMBER' | 'DATE' | 'CHECKBOX' | 'SIGNATURE' | 'DROPDOWN'

type BuilderField = {
  id: string
  type: BuilderFieldType
  label: string
  required: boolean
  options?: string
}

const ROLE_OPTIONS: Array<{ value: UserRole; label: string }> = [
  { value: 'owner', label: 'Owner' },
  { value: 'hr', label: 'HR' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'labourer', label: 'Labourer' },
]

function makeField(type: BuilderFieldType = 'TEXT'): BuilderField {
  const id = `f-${Date.now()}-${Math.round(Math.random() * 1e6)}`
  return {
    id,
    type,
    label: '',
    required: false,
    options: type === 'DROPDOWN' ? 'Yes,No' : '',
  }
}

function encodeSectionLabel(title: string): string {
  return `[SECTION]${title}`
}

function decodeSectionLabel(label?: string) {
  const raw = String(label ?? '').trim()
  if (!raw.startsWith('[SECTION]')) return null
  return { title: raw.replace(/^\[SECTION\]/, '').trim() }
}

function encodeCollectSignaturesLabel(): string {
  return `[COLLECT_SIGNATURES]`
}

function isCollectSignaturesLabel(label?: string) {
  const raw = String(label ?? '').trim()
  return raw === '[COLLECT_SIGNATURES]'
}

function encodeDropdownLabel(label: string, optionsText: string): string {
  const options = optionsText
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  return `[DROPDOWN]${label}::${options.join('|')}`
}

function decodeDropdownLabel(label?: string) {
  const raw = String(label ?? '').trim()
  if (!raw.startsWith('[DROPDOWN]')) return null
  const body = raw.replace(/^\[DROPDOWN\]/, '')
  const [question, optionsRaw = ''] = body.split('::')
  return {
    label: question?.trim() ?? '',
    options: optionsRaw.split('|').map((item) => item.trim()).filter(Boolean).join(','),
  }
}

export function LibraryUpload() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const templateId = searchParams.get('templateId')
  const { user } = useUser()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [assignedRoles, setAssignedRoles] = useState<UserRole[]>(['supervisor'])
  const [assignedUserIds, setAssignedUserIds] = useState<string[]>([])
  const [allUsers, setAllUsers] = useState<Array<{ id: string; name: string; role: string }>>([])
  const [fields, setFields] = useState<BuilderField[]>([
    makeField('TEXT'),
    makeField('CHECKBOX'),
    makeField('SIGNATURE'),
  ])
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [loadingTemplate, setLoadingTemplate] = useState(false)

  const isOwnerOrHr = user?.role === 'owner' || user?.role === 'hr'
  if (!isOwnerOrHr) {
    navigate('/library', { replace: true })
    return null
  }

  useEffect(() => {
    api
      .get('/users')
      .then((res) => {
        if (Array.isArray(res.data)) setAllUsers(res.data)
      })
      .catch(() => setAllUsers([]))
  }, [])

  useEffect(() => {
    if (!templateId) return
    setLoadingTemplate(true)
    getPdfTemplate(templateId)
      .then((template) => {
        if (!template) return
        setName(template.name ?? '')
        setDescription(template.description ?? '')
        setAssignedRoles((template.assignedRoles as UserRole[]) ?? [])
        setAssignedUserIds((template.assignedUserIds as string[]) ?? [])
        const sortedRawFields = (template.fields ?? [])
          .slice()
          .sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0))
        const mappedFields: BuilderField[] = sortedRawFields.map((field, idx) => {
          const section = decodeSectionLabel(field.label)
          if (section) {
            return {
              id: field.id || `loaded-${idx}`,
              type: 'SECTION',
              label: section.title,
              required: false,
              options: '',
            }
          }
          if (isCollectSignaturesLabel(field.label)) {
            return {
              id: field.id || `loaded-${idx}`,
              type: 'COLLECT_SIGNATURES',
              label: '',
              required: false,
              options: '',
            }
          }
          const dropdown = decodeDropdownLabel(field.label)
          const rawType = String(field.type ?? 'TEXT').toUpperCase() as BuilderFieldType
          const type: BuilderFieldType = dropdown
            ? 'DROPDOWN'
            : (rawType === 'TEXT' || rawType === 'NUMBER' || rawType === 'DATE' || rawType === 'CHECKBOX' || rawType === 'SIGNATURE'
              ? rawType
              : 'TEXT')
          return {
            id: field.id || `loaded-${idx}`,
            type,
            label: dropdown?.label ?? (field.label ?? ''),
            required: Boolean(field.required),
            options: dropdown?.options ?? '',
          }
        })
        if (mappedFields.length > 0) setFields(mappedFields)
      })
      .finally(() => setLoadingTemplate(false))
  }, [templateId])

  const canSave = useMemo(() => {
    if (!name.trim()) return false
    if (fields.length === 0) return false
    const hasSignature = fields.some((f) => f.type === 'SIGNATURE') || fields.some((f) => f.type === 'COLLECT_SIGNATURES')
    if (!hasSignature) return false
    return fields.every((f) => {
      if (f.type === 'SECTION') return Boolean(f.label.trim())
      if (f.type === 'COLLECT_SIGNATURES') return true
      if (!f.label.trim()) return false
      if (f.type !== 'DROPDOWN') return true
      return (f.options ?? '').split(',').map((item) => item.trim()).filter(Boolean).length >= 2
    })
  }, [fields, name])

  const updateField = (id: string, updates: Partial<BuilderField>) => {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)))
  }

  const removeField = (id: string) => {
    setFields((prev) => prev.filter((f) => f.id !== id))
  }

  const toggleRole = (role: UserRole) => {
    setAssignedRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]))
  }

  const toggleUser = (userId: string) => {
    setAssignedUserIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]))
  }

  const moveField = (fromIdx: number, toIdx: number) => {
    setFields((prev) => {
      if (fromIdx === toIdx) return prev
      if (fromIdx < 0 || toIdx < 0 || fromIdx >= prev.length || toIdx >= prev.length) return prev
      const next = prev.slice()
      const [moved] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, moved)
      return next
    })
  }

  const handleSave = async () => {
    if (!canSave) return
    setError(null)
    setSaving(true)
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        assignedRoles,
        assignedUserIds: assignedUserIds.length > 0 ? assignedUserIds : undefined,
        fields: fields.map((field, idx) => {
          if (field.type === 'SECTION') {
            return {
              type: 'TEXT',
              label: encodeSectionLabel(field.label.trim()),
              required: false,
              page: 1,
              x: 0.05,
              y: Math.max(0, Math.min(0.9, 0.05 + idx * 0.055)),
              width: 0.9,
              height: 0.04,
            }
          }
          if (field.type === 'COLLECT_SIGNATURES') {
            return {
              type: 'TEXT',
              label: encodeCollectSignaturesLabel(),
              required: false,
              page: 1,
              x: 0.05,
              y: Math.max(0, Math.min(0.9, 0.05 + idx * 0.055)),
              width: 0.9,
              height: 0.05,
            }
          }
          if (field.type === 'DROPDOWN') {
            return {
              type: 'TEXT',
              label: encodeDropdownLabel(field.label.trim(), field.options ?? ''),
              required: field.required,
              page: 1,
              x: 0.05,
              y: Math.max(0, Math.min(0.9, 0.05 + idx * 0.055)),
              width: 0.9,
              height: 0.05,
            }
          }
          return {
            type: field.type,
            label: field.label.trim(),
            required: field.required,
            page: 1,
            x: 0.05,
            y: Math.max(0, Math.min(0.9, 0.05 + idx * 0.055)),
            width: field.type === 'CHECKBOX' ? 0.06 : 0.9,
            height: field.type === 'CHECKBOX' ? 0.04 : 0.05,
          }
        }),
      }
      if (templateId) {
        await updatePdfTemplate(templateId, payload)
      } else {
        await createCustomPdfTemplate(payload)
      }
      navigate('/library', {
        replace: true,
        state: { message: templateId ? 'Custom form template updated.' : 'Custom form template created.' },
      })
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err?.response?.data?.message ?? err?.message ?? 'Failed to create template.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/library')} className="no-print -ml-2">
          ← Back
        </Button>
      </div>
      <Card padding="lg" className="space-y-4">
        <CardHeader>{templateId ? 'Edit Custom Form' : 'Create Custom Form'}</CardHeader>
        <CardDescription>
          Build this form with native fields (text, checkbox, dropdown, signature) like Daily Hazard Assessments. No PDF upload is needed.
        </CardDescription>
        {loadingTemplate && <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading template...</p>}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">Form Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Tool Box Talks Form"
              className="w-full min-h-[40px] px-3 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief instructions"
              className="w-full min-h-[40px] px-3 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm"
            />
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">Assign by role</p>
          <div className="flex flex-wrap gap-3">
            {ROLE_OPTIONS.map((role) => (
              <label key={role.value} className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={assignedRoles.includes(role.value)}
                  onChange={() => toggleRole(role.value)}
                  className="rounded border-neutral-300 text-brand-600"
                />
                {role.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">Or assign to specific people (optional)</p>
          <div className="max-h-32 overflow-y-auto rounded-xl border border-neutral-200 dark:border-neutral-700 p-2 flex flex-wrap gap-3">
            {allUsers.map((u) => (
              <label key={u.id} className="inline-flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={assignedUserIds.includes(u.id)}
                  onChange={() => toggleUser(u.id)}
                  className="rounded border-neutral-300 text-brand-600"
                />
                {u.name || u.id} ({u.role})
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">Form fields</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setFields((prev) => [...prev, makeField('SECTION')])}>+ Section</Button>
              <Button size="sm" variant="outline" onClick={() => setFields((prev) => [...prev, makeField('TEXT')])}>+ Text</Button>
              <Button size="sm" variant="outline" onClick={() => setFields((prev) => [...prev, makeField('DATE')])}>+ Date</Button>
              <Button size="sm" variant="outline" onClick={() => setFields((prev) => [...prev, makeField('DROPDOWN')])}>+ Dropdown</Button>
              <Button size="sm" variant="outline" onClick={() => setFields((prev) => [...prev, makeField('CHECKBOX')])}>+ Checkbox</Button>
              <Button size="sm" variant="outline" onClick={() => setFields((prev) => [...prev, makeField('SIGNATURE')])}>+ Signature</Button>
              <Button size="sm" variant="outline" onClick={() => setFields((prev) => [...prev, makeField('COLLECT_SIGNATURES')])}>+ Collect Signatures</Button>
            </div>
          </div>

          {fields.map((field, idx) => (
            <div
              key={field.id}
              className="rounded-xl border border-neutral-200 dark:border-neutral-700 p-3 space-y-2"
              onDragOver={(e) => {
                // Allow drop on field cards.
                e.preventDefault()
              }}
              onDrop={(e) => {
                e.preventDefault()
                if (dragIndex == null) return
                moveField(dragIndex, idx)
                setDragIndex(null)
              }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-neutral-500 dark:text-neutral-400">#{idx + 1}</span>
                <button
                  type="button"
                  aria-label={`Drag to reorder field ${idx + 1}`}
                  title="Drag to reorder"
                  draggable
                  onDragStart={(e) => {
                    setDragIndex(idx)
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/plain', field.id)
                  }}
                  onDragEnd={() => setDragIndex(null)}
                  className="shrink-0 min-w-[32px] min-h-[28px] rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300 flex items-center justify-center"
                >
                  <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path d="M7 3h2v2H7V3zm4 0h2v2h-2V3zM7 7h2v2H7V7zm4 0h2v2h-2V7zM7 11h2v2H7v-2zm4 0h2v2h-2v-2zM7 15h2v2H7v-2zm4 0h2v2h-2v-2z" />
                  </svg>
                </button>
                <select
                  value={field.type}
                  onChange={(e) => updateField(field.id, { type: e.target.value as BuilderFieldType })}
                  aria-label="Field type"
                  title="Field type"
                  className="min-h-[34px] px-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
                >
                  <option value="SECTION">Section header</option>
                  <option value="COLLECT_SIGNATURES">Collect Signatures</option>
                  <option value="TEXT">Text</option>
                  <option value="NUMBER">Number</option>
                  <option value="DATE">Date</option>
                  <option value="DROPDOWN">Dropdown</option>
                  <option value="CHECKBOX">Checkbox</option>
                  <option value="SIGNATURE">Signature</option>
                </select>
                {field.type !== 'SECTION' && field.type !== 'COLLECT_SIGNATURES' && (
                  <label className="inline-flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={(e) => updateField(field.id, { required: e.target.checked })}
                      className="rounded border-neutral-300 text-brand-600"
                    />
                    Required
                  </label>
                )}
                <button
                  type="button"
                  onClick={() => removeField(field.id)}
                  className="ml-auto shrink-0 min-h-[32px] px-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 text-xs"
                >
                  Remove
                </button>
              </div>
              <input
                type="text"
                value={field.label}
                onChange={(e) => updateField(field.id, { label: e.target.value })}
                placeholder={field.type === 'SECTION' ? 'Section header (e.g. Project Details)' : field.type === 'COLLECT_SIGNATURES' ? 'No label needed' : 'Field label'}
                className="w-full min-h-[36px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
                disabled={field.type === 'COLLECT_SIGNATURES'}
              />
              {field.type === 'DROPDOWN' && (
                <input
                  type="text"
                  value={field.options ?? ''}
                  onChange={(e) => updateField(field.id, { options: e.target.value })}
                  placeholder="Options, comma separated (e.g. Good,Fair,Poor)"
                  className="w-full min-h-[36px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-xs"
                />
              )}
            </div>
          ))}
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {!fields.some((f) => f.type === 'SIGNATURE') && !fields.some((f) => f.type === 'COLLECT_SIGNATURES') && (
          <p className="text-xs text-amber-600 dark:text-amber-400">Add at least one signature field to keep approval/sign-off flow.</p>
        )}

        <div className="flex items-center gap-2">
          <Button onClick={handleSave} disabled={!canSave || saving}>
            {saving ? 'Saving…' : templateId ? 'Save changes' : 'Save custom form'}
          </Button>
          <Button variant="outline" onClick={() => navigate('/library')} disabled={saving}>
            Cancel
          </Button>
        </div>
      </Card>
    </div>
  )
}
