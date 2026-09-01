import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import * as courseApi from '@/api/trainingCourseTypes'
import type { TrainingCourseType } from '@/api/trainingCourseTypes'
import { PRIMARY_TRAINING_CERTIFICATE_TYPES } from '@/constants/trainingCertificates'

const ADD_NEW_VALUE = '__add_new__'

type CourseNameSelectProps = {
  value: string
  onChange: (value: string) => void
  /** Extra course names shown until catalog refresh picks them up. */
  additionalOptions?: string[]
  /** Preloaded catalog (skips fetch when provided). */
  courses?: TrainingCourseType[]
  /** Persist new courses to the shared catalog (owner/hr). */
  persistNew?: boolean
  label?: string
  ariaLabel?: string
  className?: string
  onCatalogChanged?: () => void
}

function normalizeKey(s: string) {
  return s.trim().toLowerCase()
}

export function CourseNameSelect({
  value,
  onChange,
  additionalOptions = [],
  courses: coursesProp,
  persistNew = true,
  label = 'Course name',
  ariaLabel = 'Course name',
  className,
  onCatalogChanged,
}: CourseNameSelectProps) {
  const [fetchedCourses, setFetchedCourses] = useState<TrainingCourseType[]>([])
  const [showAddNew, setShowAddNew] = useState(false)
  const [newCourseName, setNewCourseName] = useState('')
  const [newIsPrimary, setNewIsPrimary] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (coursesProp) return
    let cancelled = false
    courseApi
      .fetchTrainingCourseTypes()
      .then((list) => {
        if (!cancelled) setFetchedCourses(list)
      })
      .catch(() => {
        if (!cancelled) {
          setFetchedCourses(
            PRIMARY_TRAINING_CERTIFICATE_TYPES.map((name, i) => ({
              id: `fallback-${i}`,
              name,
              isPrimary: true,
              sortOrder: i,
              isActive: true,
              usageCount: 0,
              createdAt: '',
              updatedAt: '',
            })),
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [coursesProp])

  const courses = coursesProp ?? fetchedCourses

  const primaryOptions = useMemo(() => {
    const fromCatalog = courses.filter((c) => c.isActive && c.isPrimary).map((c) => c.name)
    if (fromCatalog.length > 0) return fromCatalog
    return [...PRIMARY_TRAINING_CERTIFICATE_TYPES]
  }, [courses])

  const allTrainingOptions = useMemo(() => {
    const primaryKeys = new Set(primaryOptions.map(normalizeKey))
    const merged = new Set<string>()
    for (const c of courses) {
      if (!c.isActive || c.isPrimary) continue
      merged.add(c.name.trim())
    }
    for (const opt of additionalOptions) {
      const trimmed = opt.trim()
      if (!trimmed || primaryKeys.has(normalizeKey(trimmed))) continue
      merged.add(trimmed)
    }
    if (value.trim() && !primaryKeys.has(normalizeKey(value))) {
      merged.add(value.trim())
    }
    return [...merged].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  }, [courses, additionalOptions, value, primaryOptions])

  const isPrimary = primaryOptions.some((t) => normalizeKey(t) === normalizeKey(value))
  const selectValue = showAddNew
    ? ADD_NEW_VALUE
    : value
      ? isPrimary || allTrainingOptions.some((t) => normalizeKey(t) === normalizeKey(value))
        ? (
            primaryOptions.find((t) => normalizeKey(t) === normalizeKey(value)) ||
            allTrainingOptions.find((t) => normalizeKey(t) === normalizeKey(value)) ||
            value
          )
        : ADD_NEW_VALUE
      : ''

  const commitNewCourse = async () => {
    const trimmed = newCourseName.trim()
    if (!trimmed) return
    setSaving(true)
    setError(null)
    try {
      if (persistNew) {
        const created = await courseApi.createTrainingCourseType({
          name: trimmed,
          isPrimary: newIsPrimary,
        })
        onChange(created.name)
        onCatalogChanged?.()
        if (!coursesProp) {
          setFetchedCourses((prev) =>
            prev.some((p) => normalizeKey(p.name) === normalizeKey(created.name))
              ? prev
              : [...prev, created],
          )
        }
      } else {
        onChange(trimmed)
      }
      setShowAddNew(false)
      setNewCourseName('')
      setNewIsPrimary(false)
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? String((e as { response?: { data?: { error?: string } } }).response?.data?.error || '')
          : ''
      // If it already exists, still select that name
      if (msg.toLowerCase().includes('already exists')) {
        onChange(trimmed)
        setShowAddNew(false)
        setNewCourseName('')
        onCatalogChanged?.()
      } else {
        setError(msg || 'Could not add course')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={className}>
      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
        {label}
      </label>
      <select
        value={selectValue}
        onChange={(e) => {
          const v = e.target.value
          if (v === ADD_NEW_VALUE) {
            setShowAddNew(true)
            setNewCourseName('')
            onChange('')
            return
          }
          setShowAddNew(false)
          setNewCourseName('')
          setError(null)
          onChange(v)
        }}
        className="w-full min-h-[40px] px-3 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm"
        aria-label={ariaLabel}
      >
        <option value="">Select course…</option>
        <optgroup label="Primary Training Certificates">
          {primaryOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </optgroup>
        {allTrainingOptions.length > 0 && (
          <optgroup label="All Training Certificates">
            {allTrainingOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </optgroup>
        )}
        <option value={ADD_NEW_VALUE}>Add new…</option>
      </select>

      {showAddNew && (
        <div className="mt-2 space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              label=""
              value={newCourseName}
              onChange={(e) => setNewCourseName(e.target.value)}
              placeholder="Enter new course name"
              className="flex-1"
              aria-label="New course name"
            />
            <Button
              type="button"
              size="sm"
              className="shrink-0 self-end"
              onClick={() => void commitNewCourse()}
              disabled={!newCourseName.trim() || saving}
            >
              Add new
            </Button>
          </div>
          {persistNew && (
            <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
              <input
                type="checkbox"
                checked={newIsPrimary}
                onChange={(e) => setNewIsPrimary(e.target.checked)}
              />
              Add as primary training course
            </label>
          )}
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
      )}
    </div>
  )
}
