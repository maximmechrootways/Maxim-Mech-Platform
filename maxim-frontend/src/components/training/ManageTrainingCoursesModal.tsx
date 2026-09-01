import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import * as courseApi from '@/api/trainingCourseTypes'
import type { TrainingCourseType } from '@/api/trainingCourseTypes'
import { formatAxiosError } from '@/api'

type ManageTrainingCoursesModalProps = {
  open: boolean
  onClose: () => void
  onChanged?: () => void
}

export function ManageTrainingCoursesModal({ open, onClose, onChanged }: ManageTrainingCoursesModalProps) {
  const [courses, setCourses] = useState<TrainingCourseType[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newIsPrimary, setNewIsPrimary] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [mergeFromId, setMergeFromId] = useState<string | null>(null)
  const [mergeIntoId, setMergeIntoId] = useState('')
  const [deleteMergeId, setDeleteMergeId] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await courseApi.fetchTrainingCourseTypes({ includeInactive: true })
      setCourses(list)
    } catch (e) {
      setError(formatAxiosError(e) || 'Could not load course list')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      void load()
      setSuccess(null)
      setError(null)
      setMergeFromId(null)
      setEditingId(null)
    }
  }, [open, load])

  const primary = useMemo(() => courses.filter((c) => c.isPrimary && c.isActive), [courses])
  const secondary = useMemo(() => courses.filter((c) => !c.isPrimary && c.isActive), [courses])

  const notifyChanged = () => {
    onChanged?.()
  }

  const handleAdd = async () => {
    const name = newName.trim()
    if (!name) return
    setSaving(true)
    setError(null)
    try {
      await courseApi.createTrainingCourseType({ name, isPrimary: newIsPrimary })
      setNewName('')
      setNewIsPrimary(false)
      setSuccess(`Added “${name}”`)
      await load()
      notifyChanged()
    } catch (e) {
      setError(formatAxiosError(e) || 'Could not add course')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveRename = async (id: string) => {
    const name = editName.trim()
    if (!name) return
    setSaving(true)
    setError(null)
    try {
      const result = await courseApi.updateTrainingCourseType(id, { name })
      const moved =
        (result.certificatesUpdated ?? 0) + (result.documentsUpdated ?? 0) > 0
          ? ` Updated ${(result.certificatesUpdated ?? 0) + (result.documentsUpdated ?? 0)} existing record(s).`
          : ''
      setSuccess(`Renamed to “${result.name}”.${moved}`)
      setEditingId(null)
      await load()
      notifyChanged()
    } catch (e) {
      setError(formatAxiosError(e) || 'Could not rename course')
    } finally {
      setSaving(false)
    }
  }

  const handleTogglePrimary = async (course: TrainingCourseType) => {
    setSaving(true)
    setError(null)
    try {
      await courseApi.updateTrainingCourseType(course.id, { isPrimary: !course.isPrimary })
      setSuccess(
        !course.isPrimary
          ? `“${course.name}” moved to Primary Training`
          : `“${course.name}” moved to All Training`,
      )
      await load()
      notifyChanged()
    } catch (e) {
      setError(formatAxiosError(e) || 'Could not update course')
    } finally {
      setSaving(false)
    }
  }

  const handleMerge = async () => {
    if (!mergeFromId || !mergeIntoId) return
    const from = courses.find((c) => c.id === mergeFromId)
    const into = courses.find((c) => c.id === mergeIntoId)
    if (!from || !into) return
    if (
      !window.confirm(
        `Merge “${from.name}” into “${into.name}”?\n\nAll certificates using the old name will be renamed, and “${from.name}” will be removed from the list.`,
      )
    ) {
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await courseApi.mergeTrainingCourseType(mergeFromId, mergeIntoId)
      setSuccess(
        `Merged into “${result.into.name}”. Updated ${result.certificatesUpdated + result.documentsUpdated} record(s).`,
      )
      setMergeFromId(null)
      setMergeIntoId('')
      await load()
      notifyChanged()
    } catch (e) {
      setError(formatAxiosError(e) || 'Could not merge courses')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (course: TrainingCourseType) => {
    const mergeInto = deleteMergeId[course.id]
    if (course.usageCount > 0 && !mergeInto) {
      setError(`“${course.name}” is used by ${course.usageCount} record(s). Choose a course to merge into, then delete.`)
      return
    }
    const msg =
      course.usageCount > 0
        ? `Delete “${course.name}” and merge ${course.usageCount} record(s) into the selected course?`
        : `Delete “${course.name}” from the list?`
    if (!window.confirm(msg)) return
    setSaving(true)
    setError(null)
    try {
      const result = await courseApi.deleteTrainingCourseType(course.id, mergeInto || undefined)
      const moved =
        (result.certificatesUpdated ?? 0) + (result.documentsUpdated ?? 0) > 0
          ? ` Merged ${(result.certificatesUpdated ?? 0) + (result.documentsUpdated ?? 0)} record(s).`
          : ''
      setSuccess(`Deleted “${course.name}”.${moved}`)
      await load()
      notifyChanged()
    } catch (e) {
      setError(formatAxiosError(e) || 'Could not delete course')
    } finally {
      setSaving(false)
    }
  }

  const handleRefreshDiscover = async () => {
    setSaving(true)
    setError(null)
    try {
      const list = await courseApi.refreshTrainingCourseCatalog()
      setCourses(list)
      setSuccess('Refreshed list from existing certificates')
      notifyChanged()
    } catch (e) {
      setError(formatAxiosError(e) || 'Could not refresh catalog')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  const renderRow = (course: TrainingCourseType) => {
    const isEditing = editingId === course.id
    const isMerging = mergeFromId === course.id
    return (
      <li
        key={course.id}
        className="py-3 border-b border-neutral-100 dark:border-neutral-700 last:border-0 space-y-2"
      >
        <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:justify-between">
          <div className="min-w-0 flex-1">
            {isEditing ? (
              <Input
                label=""
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                aria-label={`Rename ${course.name}`}
              />
            ) : (
              <>
                <p className="font-medium text-neutral-900 dark:text-white break-words">{course.name}</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                  Used by {course.usageCount} record{course.usageCount === 1 ? '' : 's'}
                  {course.isPrimary ? ' · Primary' : ' · All training'}
                </p>
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 shrink-0">
            {isEditing ? (
              <>
                <Button size="sm" disabled={saving || !editName.trim()} onClick={() => void handleSaveRename(course.id)}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" disabled={saving} onClick={() => setEditingId(null)}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={saving}
                  onClick={() => {
                    setEditingId(course.id)
                    setEditName(course.name)
                    setMergeFromId(null)
                  }}
                >
                  Rename
                </Button>
                <Button size="sm" variant="ghost" disabled={saving} onClick={() => void handleTogglePrimary(course)}>
                  {course.isPrimary ? 'Move to All' : 'Make Primary'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={saving}
                  onClick={() => {
                    setMergeFromId(course.id)
                    setMergeIntoId('')
                    setEditingId(null)
                  }}
                >
                  Merge
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600 hover:text-red-700 dark:text-red-400"
                  disabled={saving}
                  onClick={() => void handleDelete(course)}
                >
                  Delete
                </Button>
              </>
            )}
          </div>
        </div>

        {isMerging && (
          <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end bg-neutral-50 dark:bg-neutral-800/50 p-3 rounded-lg">
            <div className="flex-1">
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                Merge “{course.name}” into
              </label>
              <select
                value={mergeIntoId}
                onChange={(e) => setMergeIntoId(e.target.value)}
                className="w-full min-h-[40px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
                aria-label="Merge into course"
              >
                <option value="">Select target course…</option>
                {courses
                  .filter((c) => c.id !== course.id && c.isActive)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>
            <Button size="sm" disabled={saving || !mergeIntoId} onClick={() => void handleMerge()}>
              Confirm merge
            </Button>
            <Button size="sm" variant="ghost" disabled={saving} onClick={() => setMergeFromId(null)}>
              Cancel
            </Button>
          </div>
        )}

        {course.usageCount > 0 && !isMerging && !isEditing && (
          <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
            <select
              value={deleteMergeId[course.id] ?? ''}
              onChange={(e) =>
                setDeleteMergeId((prev) => ({ ...prev, [course.id]: e.target.value }))
              }
              className="flex-1 min-h-[36px] px-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-xs"
              aria-label={`Merge ${course.name} into before delete`}
            >
              <option value="">Before delete, merge into…</option>
              {courses
                .filter((c) => c.id !== course.id && c.isActive)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>
        )}
      </li>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 dark:bg-black/60"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="manage-courses-title"
    >
      <Card
        padding="lg"
        className="max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardHeader>
              <span id="manage-courses-title">Manage Training Courses</span>
            </CardHeader>
            <CardDescription>
              Rename, merge duplicates, add, or delete options. Merges update existing certificates automatically.
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            Close
          </Button>
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        )}
        {success && (
          <p className="mt-3 text-sm text-green-700 dark:text-green-400" role="status">
            {success}
          </p>
        )}

        <div className="mt-4 flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
          <Input
            label="Add course"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New course name"
            className="flex-1"
          />
          <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300 pb-2 shrink-0">
            <input
              type="checkbox"
              checked={newIsPrimary}
              onChange={(e) => setNewIsPrimary(e.target.checked)}
            />
            Primary
          </label>
          <Button size="sm" disabled={saving || !newName.trim()} onClick={() => void handleAdd()}>
            Add
          </Button>
          <Button size="sm" variant="outline" disabled={saving || loading} onClick={() => void handleRefreshDiscover()}>
            Discover from data
          </Button>
        </div>

        <div className="mt-4 overflow-y-auto flex-1 min-h-0 space-y-6 pr-1">
          {loading ? (
            <p className="text-sm text-neutral-500">Loading…</p>
          ) : (
            <>
              <section>
                <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 mb-1">
                  Primary Training Certificates ({primary.length})
                </h3>
                <ul>{primary.map(renderRow)}</ul>
                {primary.length === 0 && (
                  <p className="text-sm text-neutral-500 py-2">No primary courses yet.</p>
                )}
              </section>
              <section>
                <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 mb-1">
                  All Training Certificates ({secondary.length})
                </h3>
                <ul>{secondary.map(renderRow)}</ul>
                {secondary.length === 0 && (
                  <p className="text-sm text-neutral-500 py-2">No additional courses. Use Discover from data to pull names from existing certificates.</p>
                )}
              </section>
            </>
          )}
        </div>
      </Card>
    </div>
  )
}
