import { useState, useEffect, useCallback, useMemo } from 'react'
import { isAxiosError } from 'axios'
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom'
import { useUser } from '@/contexts/UserContext'
import { useAuth } from '@/contexts/AuthContext'
import { useEmployees } from '@/contexts/EmployeesContext'
import { api, formatAxiosError } from '@/api'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { Input } from '@/components/ui/Input'
import * as employeeDocumentsApi from '@/api/employeeDocuments'
import type { EmployeeDocumentRecord, EmployeeDocumentCategory } from '@/api/employeeDocuments'
import { fetchJobs, addLabourer, removeLabourer, addSupervisor, removeSupervisor } from '@/api/jobs'
import { useCertificates } from '@/contexts/CertificatesContext'
import * as certificateApi from '@/api/certificates'
import { fetchTimeOffEntries, fetchTimeOffTeamLabourers, type TimeOffEntryRecord } from '@/api/timeOff'
import { downloadBlob, quickViewBlob, downloadFromUrl } from '@/utils/fileActions'
import { CourseNameSelect } from '@/components/training/CourseNameSelect'
import { isPrimaryTrainingCertificate } from '@/constants/trainingCertificates'
import * as trainingCourseApi from '@/api/trainingCourseTypes'
import type { TrainingCourseType } from '@/api/trainingCourseTypes'
import type { Employee } from '@/types'

/** Job titles for edit: Worker / Office (spec). HR under Platform for admin assignment. */
const JOB_TITLE_GROUPS = [
  {
    category: 'Worker',
    titles: [
      'Plumber',
      'Pipefitter',
      'Welder',
      'General Labourer',
      'Gas Fitter',
      'Plumber – Apprentice',
      'Welder – Apprentice',
      'Gas Fitter – Apprentice',
    ],
  },
  { category: 'Office', titles: ['Engineer', 'Administration', 'Management'] },
] as const

const PLATFORM_JOB_TITLES = ['HR'] as const

const ALL_JOB_TITLES: readonly string[] = [
  ...JOB_TITLE_GROUPS.flatMap((g) => [...g.titles]),
  ...PLATFORM_JOB_TITLES,
]

function roleToLabel(r: string): string {
  if (!r) return ''
  const s = r.toLowerCase()
  if (s === 'owner') return 'Owner'
  if (s === 'hr') return 'HR'
  if (s === 'supervisor') return 'Supervisor'
  if (s === 'labourer') return 'Labourer'
  return r
}

function employmentStatusLabel(status: string): string {
  const s = status.toLowerCase()
  if (s === 'active') return 'Active'
  if (s === 'on-leave') return 'On leave'
  if (s === 'terminated') return 'Terminated'
  return status
}

const PLATFORM_ROLE_SLUGS = new Set(['labourer', 'supervisor', 'hr', 'owner'])

/** Owner has full access; use supervisor job APIs for assignments like a supervisor. */
function usesSupervisorJobLinks(role?: string) {
  const r = (role ?? '').toLowerCase()
  return r === 'supervisor' || r === 'owner'
}

/** Job title to show in UI — hide when API only stored the same value as platform role (legacy). */
function displayJobTitle(emp: { jobTitle?: string; role?: string }): string | null {
  const jt = (emp.jobTitle ?? '').trim()
  if (!jt) return null
  const jLower = jt.toLowerCase().replace(/\s+/g, ' ')
  const rLower = (emp.role ?? '').toLowerCase()
  if (jLower === rLower) return null
  if (PLATFORM_ROLE_SLUGS.has(jLower)) return null
  const rolePretty = roleToLabel(emp.role ?? '').toLowerCase()
  if (jLower === rolePretty) return null
  return jt
}

type TimeOffType = 'vacation' | 'time-off' | 'sick'
type TimeOffCompensation = 'paid' | 'unpaid'
type TimeOffEntryUi = {
  id: string
  type: TimeOffType
  startDate: string
  endDate: string
  notes: string
  compensation: TimeOffCompensation
}

function normalizeTimeOffType(raw: unknown): TimeOffType {
  const value = String(raw ?? '').trim().toLowerCase()
  if (value === 'vacation') return 'vacation'
  if (value === 'sick') return 'sick'
  return 'time-off'
}

function parseTimeOffTypeFilter(raw: unknown): 'all' | TimeOffType {
  const value = String(raw ?? '').trim().toLowerCase()
  if (!value || value === 'all') return 'all'
  return normalizeTimeOffType(value)
}

function toTimeOffDisplayLabel(type: TimeOffType) {
  if (type === 'vacation') return 'Vacation'
  if (type === 'sick') return 'Sick'
  return 'Time Off'
}

function normPersonName(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, ' ')
}

function getTimeOffDays(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0
  const diff = end.getTime() - start.getTime()
  return Math.floor(diff / (24 * 60 * 60 * 1000)) + 1
}

/** Name (relationship) · phone for read-only emergency lines */
function formatEmergencyContactDisplay(name?: string, phone?: string, relationship?: string): string | null {
  const n = name?.trim()
  const p = phone?.trim()
  const r = relationship?.trim()
  if (!n && !p && !r) return null
  const bits: string[] = []
  if (n) bits.push(r ? `${n} (${r})` : n)
  else if (r) bits.push(r)
  if (p) bits.push(p)
  return bits.join(' · ') || null
}

export function EmployeeDetail() {
  const navigate = useNavigate()
  const location = useLocation()
  const { id } = useParams()
  const { user } = useUser()
  const { getEmployee, updateEmployee, deleteEmployee } = useEmployees()
  const { certificates, removeCertificate, refetch: refetchCertificates } = useCertificates()
  const employee = id ? getEmployee(id) : undefined
  const isOwnerOrHr = user?.role === 'owner' || user?.role === 'hr'
  const isSupervisorViewer = user?.role === 'supervisor'
  const [supervisedLabourerIds, setSupervisedLabourerIds] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [regeneratingInvite, setRegeneratingInvite] = useState(false)
  const [inviteFeedback, setInviteFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [latestInviteCode, setLatestInviteCode] = useState<{ code: string; expiresAt?: string } | null>(null)
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    birthday: '',
    emergencyContact1Name: '',
    emergencyContact1Phone: '',
    emergencyContact1Relationship: '',
    emergencyContact2Name: '',
    emergencyContact2Phone: '',
    emergencyContact2Relationship: '',
    emergencyNotes: '',
    jobTitle: '',
    isSupervisor: false,
    department: '',
    status: 'active' as 'active' | 'on-leave' | 'terminated',
    hireDate: '',
    onLeaveStartedAt: '',
    terminatedAt: '',
  })
  const [employeeDocs, setEmployeeDocs] = useState<EmployeeDocumentRecord[]>([])
  const employeeLicenses = useMemo(
    () => employeeDocs.filter((d) => d.category === 'license'),
    [employeeDocs],
  )
  const employeeTrainingDocs = useMemo(
    () => employeeDocs.filter((d) => d.category === 'training'),
    [employeeDocs],
  )
  const employeeCertificates = useMemo(() => {
    if (!employee?.id) return []
    const fullName = normPersonName(`${employee.firstName} ${employee.lastName}`)
    return certificates.filter(
      (c) => c.holderUserId === employee.id || (!c.holderUserId && normPersonName(c.holderName) === fullName),
    )
  }, [certificates, employee])
  const trainingDocByCertificateId = useMemo(() => {
    const map = new Map<string, EmployeeDocumentRecord>()
    for (const doc of employeeTrainingDocs) {
      if (doc.certificateId) map.set(doc.certificateId, doc)
    }
    return map
  }, [employeeTrainingDocs])
  const orphanTrainingDocs = useMemo(
    () => employeeTrainingDocs.filter((d) => !d.certificateId),
    [employeeTrainingDocs],
  )
  const additionalCourseNames = useMemo(() => {
    const names = new Set<string>()
    for (const c of certificates) {
      const n = c.name.trim()
      if (n && !isPrimaryTrainingCertificate(n)) names.add(n)
    }
    for (const d of employeeTrainingDocs) {
      const n = (d.name ?? '').trim()
      if (n && !isPrimaryTrainingCertificate(n)) names.add(n)
    }
    return [...names]
  }, [certificates, employeeTrainingDocs])
  const [courseCatalog, setCourseCatalog] = useState<TrainingCourseType[]>([])

  useEffect(() => {
    let cancelled = false
    trainingCourseApi
      .fetchTrainingCourseTypes()
      .then((list) => {
        if (!cancelled) setCourseCatalog(list)
      })
      .catch(() => {
        /* CourseNameSelect has constant fallback */
      })
    return () => {
      cancelled = true
    }
  }, [])

  const [docsLoading, setDocsLoading] = useState(false)
  const [uploadingCategory, setUploadingCategory] = useState<EmployeeDocumentCategory | null>(null)
  const [docsError, setDocsError] = useState<string | null>(null)
  const [licenseForm, setLicenseForm] = useState({
    name: '',
    licenseNumber: '',
    achievedAt: '',
  })
  const [licenseUploadFile, setLicenseUploadFile] = useState<File | null>(null)
  const [licenseError, setLicenseError] = useState<string | null>(null)
  const [trainingForm, setTrainingForm] = useState({
    courseName: '',
    completedAt: new Date().toISOString().slice(0, 10),
    expiresAt: '',
    hoursCompleted: '',
    facility: '',
  })
  const [trainingUploadFile, setTrainingUploadFile] = useState<File | null>(null)
  const [trainingError, setTrainingError] = useState<string | null>(null)
  const initialTimeOffTypeFilter = parseTimeOffTypeFilter(new URLSearchParams(location.search).get('timeOffType'))
  const [localTimeOff, setLocalTimeOff] = useState<TimeOffEntryUi[]>([])
  const [syncedTimeOff, setSyncedTimeOff] = useState<TimeOffEntryUi[]>([])
  const [showTimeOffForm, setShowTimeOffForm] = useState(false)
  const [timeOffForm, setTimeOffForm] = useState<{ type: TimeOffType; startDate: string; endDate: string; notes: string; compensation: TimeOffCompensation }>({
    type: initialTimeOffTypeFilter === 'all' ? 'vacation' : initialTimeOffTypeFilter,
    startDate: '',
    endDate: '',
    notes: '',
    compensation: 'paid',
  })
  const [timeOffTypeFilter, setTimeOffTypeFilter] = useState<'all' | TimeOffType>(initialTimeOffTypeFilter)
  const [timeOffCompFilter, setTimeOffCompFilter] = useState<'all' | TimeOffCompensation>('all')

  const [jobs, setJobs] = useState<{ id: string; title: string; siteName?: string }[]>([])
  useEffect(() => {
    fetchJobs().then(setJobs).catch(() => {})
  }, [])

  useEffect(() => {
    if (!isSupervisorViewer) {
      setSupervisedLabourerIds(new Set())
      return
    }
    let cancelled = false
    void fetchTimeOffTeamLabourers()
      .then((team) => {
        if (!cancelled) setSupervisedLabourerIds(new Set(team.map((t) => t.id)))
      })
      .catch(() => {
        if (!cancelled) setSupervisedLabourerIds(new Set())
      })
    return () => {
      cancelled = true
    }
  }, [isSupervisorViewer])

  useEffect(() => {
    const next = parseTimeOffTypeFilter(new URLSearchParams(location.search).get('timeOffType'))
    setTimeOffTypeFilter(next)
  }, [location.search])

  useEffect(() => {
    if (!employee?.id || !isOwnerOrHr) return
    let cancelled = false
    const currentYear = new Date().getFullYear()
    const years = [currentYear - 1, currentYear, currentYear + 1]
    Promise.all(
      years.map((year) =>
        fetchTimeOffEntries({ year, labourerId: employee.id })
          .then((data) => (Array.isArray(data?.entries) ? data.entries : []))
          .catch(() => [])
      )
    )
      .then((rowsByYear) => {
        if (cancelled) return
        const flat = rowsByYear.flat()
        const mapped: TimeOffEntryUi[] = flat.map((entry: TimeOffEntryRecord) => ({
          id: entry.id,
          type: normalizeTimeOffType(entry.reason),
          startDate: String(entry.startDate ?? ''),
          endDate: String(entry.endDate ?? ''),
          notes: String(entry.notes ?? ''),
          compensation:
            entry.compensation === 'unpaid' || entry.isPaid === false ? 'unpaid' : 'paid',
        }))
        const deduped = new Map<string, TimeOffEntryUi>()
        for (const row of mapped) deduped.set(row.id, row)
        setSyncedTimeOff(Array.from(deduped.values()))
      })
      .catch(() => {
        if (!cancelled) setSyncedTimeOff([])
      })
    return () => {
      cancelled = true
    }
  }, [employee?.id, isOwnerOrHr])

  const loadEmployeeDocs = useCallback(() => {
    if (!employee?.id) return
    setDocsLoading(true)
    setDocsError(null)
    employeeDocumentsApi.fetchEmployeeDocuments(employee.id)
      .then(setEmployeeDocs)
      .catch(() => { setDocsError('Failed to load documents'); setEmployeeDocs([]) })
      .finally(() => setDocsLoading(false))
  }, [employee?.id])

  useEffect(() => {
    loadEmployeeDocs()
  }, [loadEmployeeDocs])

  const { session, loading: authLoading } = useAuth()

  useEffect(() => {
    if (authLoading || !session || !employee?.id || !isOwnerOrHr) return
    void refetchCertificates()
  }, [employee?.id, isOwnerOrHr, refetchCertificates, authLoading, session])

  useEffect(() => {
    if (location.hash === '#training-certificates') {
      const el = document.getElementById('training-certificates')
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [location.hash, docsLoading])

  const handleUploadDoc = async (
    category: EmployeeDocumentCategory,
    file: File,
    options?: {
      expiresAt?: string
      completedAt?: string
      displayName?: string
      licenseNumber?: string
      hoursCompleted?: string
      trainingFacility?: string
    }
  ) => {
    if (!employee?.id) return
    setUploadingCategory(category)
    setDocsError(null)
    try {
      const added = await employeeDocumentsApi.uploadEmployeeDocument(employee.id, file, category, options)
      setEmployeeDocs((prev) => [added, ...prev])
      if (category === 'training') {
        await refetchCertificates()
        await loadEmployeeDocs()
      }
    } catch {
      setDocsError('Upload failed. Only PDF and images are allowed.')
    } finally {
      setUploadingCategory(null)
    }
  }

  const handleQuickViewDoc = (docId: string) => {
    employeeDocumentsApi.fetchEmployeeDocumentBlob(docId)
      .then((blob) => quickViewBlob(blob))
      .catch(async () => {
        try {
          const { url } = await employeeDocumentsApi.getEmployeeDocumentFileUrl(docId)
          window.open(url, '_blank', 'noopener,noreferrer')
        } catch (e: unknown) {
          const message = e && typeof e === 'object' && 'response' in e
            ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
            : undefined
          setDocsError(message || 'Could not open file')
        }
      })
  }

  const handleDownloadDoc = async (doc: EmployeeDocumentRecord) => {
    try {
      const blob = await employeeDocumentsApi.fetchEmployeeDocumentBlob(doc.id, { download: true })
      downloadBlob(blob, doc.name)
    } catch (e: unknown) {
      try {
        const { url } = await employeeDocumentsApi.getEmployeeDocumentFileUrl(doc.id)
        await downloadFromUrl(url, doc.name)
      } catch {
        const message = e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
        setDocsError(message || 'Could not download file')
      }
    }
  }

  const handleDeleteDoc = async (docId: string) => {
    if (!docId?.trim()) return
    if (!window.confirm('Delete this document?')) return
    setDocsError(null)
    try {
      await employeeDocumentsApi.deleteEmployeeDocument(docId.trim())
      await loadEmployeeDocs()
    } catch (e: unknown) {
      setDocsError(formatAxiosError(e))
    }
  }

  const handleSaveTrainingRecord = async () => {
    setTrainingError(null)
    if (!trainingForm.courseName.trim()) {
      setTrainingError('Course name is required.')
      return
    }
    if (!trainingForm.hoursCompleted.trim() || Number(trainingForm.hoursCompleted) <= 0) {
      setTrainingError('Hours completed must be greater than 0.')
      return
    }
    if (!trainingForm.facility.trim()) {
      setTrainingError('Training facility is required.')
      return
    }
    const expiresAt = trainingForm.expiresAt.trim() || undefined
    try {
      if (trainingUploadFile) {
        await handleUploadDoc('training', trainingUploadFile, {
          displayName: trainingForm.courseName.trim(),
          completedAt: trainingForm.completedAt || new Date().toISOString().slice(0, 10),
          expiresAt,
          hoursCompleted: trainingForm.hoursCompleted.trim(),
          trainingFacility: trainingForm.facility.trim(),
        })
      } else if (employee?.id) {
        const added = await employeeDocumentsApi.uploadEmployeeDocument(
          employee.id,
          null,
          'training',
          {
            displayName: trainingForm.courseName.trim(),
            completedAt: trainingForm.completedAt || new Date().toISOString().slice(0, 10),
            expiresAt,
            hoursCompleted: trainingForm.hoursCompleted.trim(),
            trainingFacility: trainingForm.facility.trim(),
          }
        )
        setEmployeeDocs((prev) => [added, ...prev])
        await refetchCertificates()
        await loadEmployeeDocs()
      }
      setTrainingUploadFile(null)
      setTrainingForm({
        courseName: '',
        completedAt: new Date().toISOString().slice(0, 10),
        expiresAt: '',
        hoursCompleted: '',
        facility: '',
      })
    } catch {
      setTrainingError('Could not save training record.')
    }
  }

  const handleQuickViewCertificate = async (certificateId: string) => {
    try {
      const blob = await certificateApi.fetchCertificateFileBlob(certificateId)
      quickViewBlob(blob)
    } catch {
      setDocsError('Could not open certificate file')
    }
  }

  const handleDownloadCertificate = async (certificateId: string, fallbackName: string) => {
    try {
      const blob = await certificateApi.fetchCertificateFileBlob(certificateId, { download: true })
      downloadBlob(blob, fallbackName || 'certificate.pdf')
    } catch {
      setDocsError('Could not download certificate file')
    }
  }

  const handleRemoveCertificate = async (certificateId: string) => {
    if (!window.confirm('Remove this certificate?')) return
    try {
      await removeCertificate(certificateId)
      await loadEmployeeDocs()
    } catch {
      setDocsError('Could not remove certificate')
    }
  }

  const handleSaveLicense = async () => {
    setLicenseError(null)
    if (!licenseForm.name.trim()) {
      setLicenseError('License name is required.')
      return
    }
    if (!licenseForm.achievedAt) {
      setLicenseError('Date achieved is required.')
      return
    }
    if (!employee?.id) return
    const meta = {
      displayName: licenseForm.name.trim(),
      licenseNumber: licenseForm.licenseNumber.trim() || undefined,
      completedAt: licenseForm.achievedAt,
    }
    try {
      if (licenseUploadFile) {
        await handleUploadDoc('license', licenseUploadFile, meta)
      } else {
        const added = await employeeDocumentsApi.uploadEmployeeDocument(
          employee.id,
          null,
          'license',
          meta,
        )
        setEmployeeDocs((prev) => [added, ...prev])
      }
      setLicenseUploadFile(null)
      setLicenseForm({ name: '', licenseNumber: '', achievedAt: '' })
    } catch {
      setLicenseError('Could not save licence.')
    }
  }

  function certificateStatusLabel(expirationDate?: string): { label: string; variant: 'success' | 'warning' | 'danger' } | null {
    if (!expirationDate?.trim()) return null
    const exp = new Date(`${expirationDate}T00:00:00`)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const daysLeft = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (daysLeft < 0) return { label: 'Expired', variant: 'danger' }
    if (daysLeft <= 30) return { label: '< 30 Days', variant: 'warning' }
    if (daysLeft <= 60) return { label: '< 60 Days', variant: 'warning' }
    return { label: 'Current', variant: 'success' }
  }

  const normalizedServerTimeOff = useMemo<TimeOffEntryUi[]>(() => {
    return (employee?.timeOffEntries ?? []).map((entry) => ({
      id: entry.id,
      type: normalizeTimeOffType(entry.type),
      startDate: entry.startDate,
      endDate: entry.endDate,
      notes: entry.notes ?? '',
      compensation: entry.compensation === 'unpaid' ? 'unpaid' : 'paid',
    }))
  }, [employee?.timeOffEntries])

  const allTimeOffEntries = useMemo<TimeOffEntryUi[]>(() => {
    const merged = new Map<string, TimeOffEntryUi>()
    for (const row of [...normalizedServerTimeOff, ...syncedTimeOff, ...localTimeOff]) {
      merged.set(row.id, row)
    }
    return Array.from(merged.values())
  }, [normalizedServerTimeOff, syncedTimeOff, localTimeOff])

  const filteredTimeOffEntries = useMemo(
    () =>
      allTimeOffEntries.filter((entry) => {
        if (timeOffTypeFilter !== 'all' && entry.type !== timeOffTypeFilter) return false
        if (timeOffCompFilter !== 'all' && entry.compensation !== timeOffCompFilter) return false
        return true
      }),
    [allTimeOffEntries, timeOffTypeFilter, timeOffCompFilter],
  )

  const timeOffTotals = useMemo(() => {
    const totals = {
      entries: allTimeOffEntries.length,
      paidEntries: 0,
      unpaidEntries: 0,
      vacationDays: 0,
      timeOffDays: 0,
      sickDays: 0,
      totalDays: 0,
    }
    for (const entry of allTimeOffEntries) {
      const days = getTimeOffDays(entry.startDate, entry.endDate)
      totals.totalDays += days
      if (entry.compensation === 'paid') totals.paidEntries += 1
      else totals.unpaidEntries += 1
      if (entry.type === 'vacation') totals.vacationDays += days
      else if (entry.type === 'time-off') totals.timeOffDays += days
      else totals.sickDays += days
    }
    return totals
  }, [allTimeOffEntries])

  if (!isOwnerOrHr) return null
  if (!employee) {
    return (
      <div className="space-y-4 animate-fade-in">
        <p className="text-neutral-500 dark:text-neutral-400">Employee not found.</p>
        <Link to="/employees" className="text-brand-600 dark:text-brand-400 hover:underline">Back to employees</Link>
      </div>
    )
  }

  const fullName = `${employee.firstName} ${employee.lastName}`
  const shownJobTitle = displayJobTitle(employee)
  const employeeIsOwner = (employee.role ?? '').toLowerCase() === 'owner'

  const startEditing = () => {
    const roleLower = (employee.role ?? '').toLowerCase()
    const jt = (employee.jobTitle ?? '').trim()
    const legacyRoleLabels = ['Labourer', 'Supervisor', 'HR']
    let jobTitle = ''
    let isSupervisor = roleLower === 'supervisor'

    if (ALL_JOB_TITLES.includes(jt)) {
      jobTitle = jt
    } else if (roleLower === 'hr') {
      jobTitle = 'HR'
    } else if (legacyRoleLabels.includes(jt)) {
      if (jt === 'HR') jobTitle = 'HR'
      if (jt === 'Supervisor') isSupervisor = true
    } else if (jt) {
      jobTitle = jt
    }

    setForm({
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email ?? '',
      phone: employee.phone ?? '',
      birthday: employee.birthday ?? '',
      emergencyContact1Name: employee.emergencyContact1Name ?? '',
      emergencyContact1Phone: employee.emergencyContact1Phone ?? '',
      emergencyContact1Relationship: employee.emergencyContact1Relationship ?? '',
      emergencyContact2Name: employee.emergencyContact2Name ?? '',
      emergencyContact2Phone: employee.emergencyContact2Phone ?? '',
      emergencyContact2Relationship: employee.emergencyContact2Relationship ?? '',
      emergencyNotes: employee.emergencyNotes ?? '',
      jobTitle,
      isSupervisor,
      department: employee.department ?? '',
      status: employee.status,
      hireDate: employee.hireDate ?? '',
      onLeaveStartedAt: employee.onLeaveStartedAt ?? '',
      terminatedAt: employee.terminatedAt ?? '',
    })
    setEditing(true)
  }

  const handleSave = async () => {
    if (!employee.id) return
    setSaving(true)
    try {
      const nextEmail = form.email.trim()
      if (!nextEmail) {
        alert('Email is required.')
        setSaving(false)
        return
      }
      const title = form.jobTitle.trim()
      const updates: Partial<Omit<Employee, 'id'>> = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: nextEmail,
        phone: form.phone.trim() || undefined,
        birthday: form.birthday.trim(),
        emergencyContact1Name: form.emergencyContact1Name.trim(),
        emergencyContact1Phone: form.emergencyContact1Phone.trim(),
        emergencyContact1Relationship: form.emergencyContact1Relationship.trim(),
        emergencyContact2Name: form.emergencyContact2Name.trim(),
        emergencyContact2Phone: form.emergencyContact2Phone.trim(),
        emergencyContact2Relationship: form.emergencyContact2Relationship.trim(),
        emergencyNotes: form.emergencyNotes.trim(),
        department: form.department.trim() || undefined,
        status: form.status,
        hireDate: form.hireDate.trim() || undefined,
        onLeaveStartedAt: form.onLeaveStartedAt.trim() || undefined,
        terminatedAt: form.terminatedAt.trim() || undefined,
      }
      if (title) {
        updates.jobTitle = title
        // Never change platform role for the account owner (saving job title used to overwrite with labourer).
        if (!employeeIsOwner) {
          if (title === 'HR') {
            updates.role = 'hr'
          } else {
            updates.role = form.isSupervisor ? 'supervisor' : 'labourer'
          }
        }
      }

      await updateEmployee(employee.id, updates)
      setEditing(false)
    } catch {
      // error already shown by context
    } finally {
      setSaving(false)
    }
  }

  const handleDeactivate = async () => {
    if (!employee.id) return
    setSaving(true)
    try {
      await updateEmployee(employee.id, { status: 'terminated', terminatedAt: new Date().toISOString().slice(0, 10) })
      setShowDeactivateConfirm(false)
      setEditing(false)
    } catch {
      // error already shown by context
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteProfile = async () => {
    if (!employee.id) return
    setDeleting(true)
    try {
      await deleteEmployee(employee.id)
      navigate('/employees')
    } finally {
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  const handleRegenerateInviteCode = async () => {
    if (regeneratingInvite) return
    if (!employee?.email?.trim()) {
      setInviteFeedback({
        type: 'error',
        message: 'This employee does not have an email address on file. Add an email first, then regenerate an invite code.',
      })
      return
    }

    setInviteFeedback(null)
    setRegeneratingInvite(true)
    try {
      const { data } = await api.post('/invite/regenerate', { email: employee.email })
      setLatestInviteCode({
        code: data?.code ?? '',
        expiresAt: data?.expiresAt,
      })
      const expiresText = data?.expiresAt ? new Date(data.expiresAt).toLocaleDateString() : '30 days from now'
      if (data?.code && navigator?.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(data.code)
        } catch {
          // Ignore clipboard failures (browser permissions, insecure context, etc.)
        }
      }
      setInviteFeedback({
        type: 'success',
        message: `Invite code regenerated for ${employee.email}. A login code email has been sent. Expires ${expiresText}.`,
      })
    } catch (err: unknown) {
      let message = 'Failed to regenerate invite code'
      if (isAxiosError(err)) {
        const d = err.response?.data as { error?: string; message?: string } | undefined
        message = d?.error ?? d?.message ?? message
      }
      setLatestInviteCode(null)
      setInviteFeedback({ type: 'error', message })
    } finally {
      setRegeneratingInvite(false)
    }
  }

  const handleAssignJob = async (jobId: string) => {
    if (!employee.id || !jobId) return
    try {
      if (usesSupervisorJobLinks(employee.role)) {
        await addSupervisor(jobId, employee.id)
      } else {
        await addLabourer(jobId, employee.id)
      }
      window.location.reload() // For simplicity in this demo, hard reload to refresh contexts
    } catch {
      alert('Failed to assign job')
    }
  }

  const handleRemoveJob = async (jobId: string) => {
    if (!employee.id || !jobId) return
    if (!window.confirm('Remove employee from this job?')) return
    try {
      if (usesSupervisorJobLinks(employee.role)) {
        await removeSupervisor(jobId, employee.id)
      } else {
        await removeLabourer(jobId, employee.id)
      }
      window.location.reload()
    } catch {
      alert('Failed to remove job')
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <Breadcrumbs
        items={[
          { label: 'Employees', to: '/employees' },
          { label: fullName },
        ]}
      />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            to="/employees"
            className="touch-target p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="font-display font-bold text-display-xl text-neutral-900 dark:text-white tracking-tight">
              {fullName}
            </h1>
            <p className="text-neutral-500 dark:text-neutral-400 mt-0.5">
              <Badge variant={employee.status === 'active' ? 'success' : employee.status === 'on-leave' ? 'warning' : 'default'}>
                {employmentStatusLabel(employee.status)}
              </Badge>
              {shownJobTitle && ` · ${shownJobTitle}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
              <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={startEditing}>Edit</Button>
              {employee.id &&
              (isOwnerOrHr ||
                (isSupervisorViewer && supervisedLabourerIds.has(employee.id))) ? (
                <Link
                  to={`/hr/time-tracking?userId=${encodeURIComponent(employee.id)}`}
                  className="inline-flex items-center justify-center rounded-xl font-medium tracking-tight px-4 py-2.5 text-sm min-h-[44px] touch-target bg-transparent border-2 border-brand-500/80 text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/50 hover:border-brand-500 transition-all duration-200"
                >
                  Time entries
                </Link>
              ) : null}
            </>
          )}
          {!editing && (
            <Button variant="outline" onClick={handleRegenerateInviteCode} disabled={regeneratingInvite}>
              {regeneratingInvite ? 'Regenerating…' : 'Regenerate Invite Code'}
            </Button>
          )}
          {!editing && employee.status !== 'terminated' && !employeeIsOwner && (
            <Button variant="outline" className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300" onClick={() => setShowDeactivateConfirm(true)}>
              Deactivate
            </Button>
          )}
        </div>
      </div>
      {inviteFeedback && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            inviteFeedback.type === 'success'
              ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/25 text-emerald-900 dark:text-emerald-100'
              : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/25 text-red-900 dark:text-red-100'
          }`}
        >
          <p>{inviteFeedback.message}</p>
          {inviteFeedback.type === 'success' && latestInviteCode?.code && (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <code className="text-sm font-mono bg-white/70 dark:bg-black/30 px-2 py-1 rounded">{latestInviteCode.code}</code>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(latestInviteCode.code)
                    setInviteFeedback({
                      type: 'success',
                      message: `Invite code regenerated for ${employee.email}. Code copied to clipboard.`,
                    })
                  } catch {
                    setInviteFeedback({
                      type: 'error',
                      message: 'Could not copy invite code automatically. Please copy it manually.',
                    })
                  }
                }}
              >
                Copy code
              </Button>
            </div>
          )}
        </div>
      )}

      <Card padding="lg">
        <CardHeader>Contact Information</CardHeader>
        <CardDescription>Email, phone, birthday, emergency contact, job title, department.</CardDescription>
        {editing ? (
          <div className="mt-4 space-y-4 max-w-xl">
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
            <p className="text-xs text-neutral-500 dark:text-neutral-400 -mt-2">
              This is their login email. After you save, they must sign in with the new address. If they have not set a password yet, regenerate their invite code so it goes to the new inbox.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="First name" value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} />
              <Input label="Last name" value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} />
            </div>
            <Input label="Phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="Optional" />
            <Input
              label="Birthday (optional)"
              type="date"
              value={form.birthday}
              onChange={(e) => setForm((f) => ({ ...f, birthday: e.target.value }))}
            />
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 p-3 bg-neutral-50 dark:bg-neutral-900/30 space-y-3">
              <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase">Emergency information (optional)</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Input
                  label="Emergency contact 1 name"
                  value={form.emergencyContact1Name}
                  onChange={(e) => setForm((f) => ({ ...f, emergencyContact1Name: e.target.value }))}
                  placeholder="Optional"
                />
                <Input
                  label="Emergency contact 1 phone"
                  value={form.emergencyContact1Phone}
                  onChange={(e) => setForm((f) => ({ ...f, emergencyContact1Phone: e.target.value }))}
                  placeholder="Optional"
                />
                <Input
                  label="Relationship to employee"
                  value={form.emergencyContact1Relationship}
                  onChange={(e) => setForm((f) => ({ ...f, emergencyContact1Relationship: e.target.value }))}
                  placeholder="e.g. Spouse, parent"
                />
                <Input
                  label="Emergency contact 2 name"
                  value={form.emergencyContact2Name}
                  onChange={(e) => setForm((f) => ({ ...f, emergencyContact2Name: e.target.value }))}
                  placeholder="Optional"
                />
                <Input
                  label="Emergency contact 2 phone"
                  value={form.emergencyContact2Phone}
                  onChange={(e) => setForm((f) => ({ ...f, emergencyContact2Phone: e.target.value }))}
                  placeholder="Optional"
                />
                <Input
                  label="Relationship to employee"
                  value={form.emergencyContact2Relationship}
                  onChange={(e) => setForm((f) => ({ ...f, emergencyContact2Relationship: e.target.value }))}
                  placeholder="e.g. Sibling, friend"
                />
              </div>
              <textarea
                value={form.emergencyNotes}
                onChange={(e) => setForm((f) => ({ ...f, emergencyNotes: e.target.value }))}
                rows={3}
                maxLength={1000}
                placeholder="Optional notes (allergies, medical info, etc.)"
                className="w-full min-h-[72px] px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
                aria-label="Emergency notes"
              />
            </div>
            <div>
              {employeeIsOwner ? (
                <>
                  <p className="text-sm rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/25 text-amber-950 dark:text-amber-100 px-3 py-2 mb-3">
                    <strong>Account owner</strong> — full platform permissions always. Optional job title below is only for
                    display (it does not change access).
                  </p>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Job title (optional)</label>
                  <select
                    aria-label="Job title (optional)"
                    value={ALL_JOB_TITLES.includes(form.jobTitle) ? form.jobTitle : form.jobTitle || ''}
                    onChange={(e) => setForm((f) => ({ ...f, jobTitle: e.target.value }))}
                    className="w-full min-h-[40px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm"
                  >
                    <option value="">Select job title</option>
                    {form.jobTitle && !ALL_JOB_TITLES.includes(form.jobTitle) ? (
                      <option value={form.jobTitle}>{form.jobTitle} (current)</option>
                    ) : null}
                    {JOB_TITLE_GROUPS.map((group) => (
                      <optgroup key={group.category} label={group.category}>
                        {group.titles.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                    <optgroup label="Platform">
                      {PLATFORM_JOB_TITLES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </>
              ) : (
                <>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Role (Job Title)</label>
                  <select
                    aria-label="Role (Job Title)"
                    value={ALL_JOB_TITLES.includes(form.jobTitle) ? form.jobTitle : form.jobTitle || ''}
                    onChange={(e) => {
                      const v = e.target.value
                      setForm((f) => ({
                        ...f,
                        jobTitle: v,
                        isSupervisor: v === 'HR' ? false : f.isSupervisor,
                      }))
                    }}
                    className="w-full min-h-[40px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm"
                  >
                    <option value="">Select job title</option>
                    {form.jobTitle && !ALL_JOB_TITLES.includes(form.jobTitle) ? (
                      <option value={form.jobTitle}>{form.jobTitle} (current)</option>
                    ) : null}
                    {JOB_TITLE_GROUPS.map((group) => (
                      <optgroup key={group.category} label={group.category}>
                        {group.titles.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                    <optgroup label="Platform">
                      {PLATFORM_JOB_TITLES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                    Job title describes their trade or office role. Use <span className="font-medium">Supervisor</span> below for
                    supervisor permissions on jobs. Select <span className="font-medium">HR</span> under Office for HR access.
                  </p>
                  <label className="mt-3 flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={form.isSupervisor}
                      disabled={form.jobTitle === 'HR'}
                      onChange={(e) => setForm((f) => ({ ...f, isSupervisor: e.target.checked }))}
                      className="w-4 h-4 rounded border-neutral-300 text-brand-600 focus:ring-brand-500"
                      aria-label="Supervisor"
                    />
                    <span className="text-sm text-neutral-800 dark:text-neutral-200">Supervisor</span>
                  </label>
                </>
              )}
            </div>
            <Input label="Department" value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} placeholder="Optional" />
          </div>
        ) : (
          <ul className="mt-4 space-y-2 text-sm">
            <li><span className="text-neutral-500 dark:text-neutral-400">Email:</span> {employee.email}</li>
            <li>
              <span className="text-neutral-500 dark:text-neutral-400">Phone:</span>{' '}
              {employee.phone?.trim() ? employee.phone : <span className="text-neutral-400 dark:text-neutral-500">—</span>}
            </li>
            <li>
              <span className="text-neutral-500 dark:text-neutral-400">Birthday:</span>{' '}
              {employee.birthday?.trim() ? employee.birthday : <span className="text-neutral-400 dark:text-neutral-500">—</span>}
            </li>
            <li>
              <span className="text-neutral-500 dark:text-neutral-400">Emergency contact 1:</span>{' '}
              {(() => {
                const text = formatEmergencyContactDisplay(
                  employee.emergencyContact1Name,
                  employee.emergencyContact1Phone,
                  employee.emergencyContact1Relationship
                )
                return text ? (
                  <span className="text-neutral-900 dark:text-white">{text}</span>
                ) : (
                  <span className="text-neutral-400 dark:text-neutral-500">—</span>
                )
              })()}
            </li>
            <li>
              <span className="text-neutral-500 dark:text-neutral-400">Emergency contact 2:</span>{' '}
              {(() => {
                const text = formatEmergencyContactDisplay(
                  employee.emergencyContact2Name,
                  employee.emergencyContact2Phone,
                  employee.emergencyContact2Relationship
                )
                return text ? (
                  <span className="text-neutral-900 dark:text-white">{text}</span>
                ) : (
                  <span className="text-neutral-400 dark:text-neutral-500">—</span>
                )
              })()}
            </li>
            {employee.emergencyNotes?.trim() && (
              <li>
                <span className="text-neutral-500 dark:text-neutral-400">Emergency notes:</span>{' '}
                <span className="text-neutral-900 dark:text-white">{employee.emergencyNotes}</span>
              </li>
            )}
            <li>
              <span className="text-neutral-500 dark:text-neutral-400">Job title:</span>{' '}
              {shownJobTitle ?? <span className="text-neutral-400 dark:text-neutral-500">—</span>}
            </li>
            <li>
              <span className="text-neutral-500 dark:text-neutral-400">Platform access:</span>{' '}
              {roleToLabel(employee.role ?? '') || '—'}
            </li>
            <li>
              <span className="text-neutral-500 dark:text-neutral-400">Department:</span>{' '}
              {employee.department?.trim() ? employee.department : <span className="text-neutral-400 dark:text-neutral-500">—</span>}
            </li>
          </ul>
        )}
      </Card>

      <Card padding="lg">
        <CardHeader>Hiring</CardHeader>
        <CardDescription>Hire date, status, status dates, and hiring documents (offer letter, I-9, TD1, etc.).</CardDescription>
        {editing ? (
          <div className="mt-4 space-y-4 max-w-xl">
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Hire date</label>
              <input
                type="date"
                aria-label="Hire date"
                value={form.hireDate}
                onChange={(e) => setForm((f) => ({ ...f, hireDate: e.target.value }))}
                className="w-full min-h-[40px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm"
              />
              <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">When they started (HR record).</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Status</label>
              <select
                aria-label="Employee status"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as 'active' | 'on-leave' | 'terminated' }))}
                className="w-full min-h-[40px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm"
              >
                <option value="active">Active</option>
                <option value="on-leave">On leave</option>
                <option value="terminated">Terminated</option>
              </select>
            </div>
            {form.status === 'on-leave' && (
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Date Went on Leave</label>
                <input
                  type="date"
                  aria-label="Date went on leave"
                  value={form.onLeaveStartedAt}
                  onChange={(e) => setForm((f) => ({ ...f, onLeaveStartedAt: e.target.value }))}
                  className="w-full min-h-[40px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm"
                />
              </div>
            )}
            {form.status === 'terminated' && (
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Date of Termination</label>
                <input
                  type="date"
                  aria-label="Date of termination"
                  value={form.terminatedAt}
                  onChange={(e) => setForm((f) => ({ ...f, terminatedAt: e.target.value }))}
                  className="w-full min-h-[40px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm"
                />
              </div>
            )}
          </div>
        ) : (
          <ul className="mt-4 space-y-2 text-sm border-b border-slate-200 dark:border-slate-700 pb-4">
            <li><span className="text-neutral-500 dark:text-neutral-400">Hire date:</span> {employee.hireDate}</li>
            <li><span className="text-neutral-500 dark:text-neutral-400">Status:</span> {employmentStatusLabel(employee.status)}</li>
            {employee.status === 'on-leave' && employee.onLeaveStartedAt && (
              <li><span className="text-neutral-500 dark:text-neutral-400">Went on leave:</span> {employee.onLeaveStartedAt}</li>
            )}
            {employee.status === 'terminated' && employee.terminatedAt && (
              <li><span className="text-neutral-500 dark:text-neutral-400">Date of termination:</span> {employee.terminatedAt}</li>
            )}
          </ul>
        )}
        
        {/* Hiring Documents integrated into this section */}
        <div className="mt-4">
          <h4 className="text-sm font-medium text-neutral-900 dark:text-white mb-2">Documents</h4>
          {docsLoading ? (
            <p className="text-sm text-neutral-500">Loading…</p>
          ) : (
            <>
              <ul className="space-y-2">
                {employeeDocs.filter((d) => d.category === 'hiring').length === 0 && (
                  <li className="text-sm text-neutral-500 dark:text-neutral-400">None on file.</li>
                )}
                {employeeDocs.filter((d) => d.category === 'hiring').map((doc) => (
                  <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 py-2 px-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 text-sm">
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-neutral-900 dark:text-white truncate block text-left">{doc.name}</span>
                      <span className="text-neutral-500 dark:text-neutral-400">Uploaded {doc.uploadedAt}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button variant="outline" size="sm" onClick={() => handleQuickViewDoc(doc.id)} disabled={!doc.hasFile}>
                        Quick view
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleDownloadDoc(doc)} disabled={!doc.hasFile}>
                        Download
                      </Button>
                      {isOwnerOrHr && (
                        <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => handleDeleteDoc(doc.id)}>Remove</Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {isOwnerOrHr && (
                <div className="mt-3 max-w-sm">
                  <input
                    type="file"
                    accept=".pdf,image/*"
                    aria-label="Upload hiring document file"
                    className="block w-full text-sm text-neutral-600 dark:text-neutral-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-100 file:text-brand-700 dark:file:bg-brand-900/40 dark:file:text-brand-300"
                    disabled={uploadingCategory !== null}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      handleUploadDoc('hiring', file)
                      e.target.value = ''
                    }}
                  />
                  {uploadingCategory === 'hiring' && <p className="mt-1 text-xs text-neutral-500">Uploading…</p>}
                </div>
              )}
            </>
          )}
        </div>
      </Card>

      {docsError && (
        <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-2 text-sm text-red-800 dark:text-red-200">
          {docsError}
        </div>
      )}

      <Card padding="lg">
        <CardHeader>Licences</CardHeader>
        <CardDescription>
          Trade licences for this employee only (not linked to company-wide training certificates).
        </CardDescription>
        {docsLoading ? (
          <p className="mt-4 text-sm text-neutral-500">Loading…</p>
        ) : (
          <>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-neutral-200 dark:border-neutral-600">
                    <th className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400">License Name</th>
                    <th className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400">Licence or Certificate #</th>
                    <th className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400">Date Achieved</th>
                    {isOwnerOrHr && <th className="py-2 font-medium text-neutral-600 dark:text-neutral-400">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {employeeLicenses.length === 0 && (
                    <tr>
                      <td colSpan={isOwnerOrHr ? 4 : 3} className="py-4 text-neutral-500 dark:text-neutral-400">
                        None on file.
                      </td>
                    </tr>
                  )}
                  {employeeLicenses.map((lic) => (
                    <tr key={lic.id} className="border-b border-neutral-100 dark:border-neutral-700">
                      <td className="py-2 pr-4 font-medium text-neutral-900 dark:text-white">{lic.name}</td>
                      <td className="py-2 pr-4 text-neutral-700 dark:text-neutral-300">{lic.licenseNumber || '—'}</td>
                      <td className="py-2 pr-4 text-neutral-700 dark:text-neutral-300">{lic.completedAt || '—'}</td>
                      {isOwnerOrHr && (
                        <td className="py-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleQuickViewDoc(lic.id)}
                              disabled={!lic.hasFile}
                              title={!lic.hasFile ? 'No file uploaded for this licence' : undefined}
                            >
                              Quick view
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDownloadDoc(lic)}
                              disabled={!lic.hasFile}
                              title={!lic.hasFile ? 'No file uploaded for this licence' : undefined}
                            >
                              Download
                            </Button>
                            <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => handleDeleteDoc(lic.id)}>
                              Remove
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {isOwnerOrHr && (
              <div className="mt-4 p-4 rounded-xl border border-neutral-200 dark:border-neutral-700 space-y-3 max-w-xl">
                <h4 className="text-sm font-medium text-neutral-900 dark:text-white">Add Licence</h4>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">License Name</label>
                  <input
                    type="text"
                    value={licenseForm.name}
                    onChange={(e) => setLicenseForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. Gas Fitter, Plumber"
                    className="w-full min-h-[40px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm"
                    aria-label="License name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Licence or Certificate #</label>
                  <input
                    type="text"
                    value={licenseForm.licenseNumber}
                    onChange={(e) => setLicenseForm((prev) => ({ ...prev, licenseNumber: e.target.value }))}
                    placeholder="e.g. 123456"
                    className="w-full min-h-[40px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm"
                    aria-label="Licence or certificate number"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Date Achieved</label>
                  <input
                    type="date"
                    value={licenseForm.achievedAt}
                    onChange={(e) => setLicenseForm((prev) => ({ ...prev, achievedAt: e.target.value }))}
                    className="w-full min-h-[40px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm"
                    aria-label="Date achieved"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Upload File</label>
                  <input
                    type="file"
                    accept=".pdf,image/*"
                    aria-label="Upload licence document"
                    className="block w-full text-sm text-neutral-600 dark:text-neutral-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-100 file:text-brand-700 dark:file:bg-brand-900/40 dark:file:text-brand-300"
                    disabled={uploadingCategory !== null}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      setLicenseUploadFile(file)
                    }}
                  />
                  {licenseUploadFile && (
                    <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                      Selected: {licenseUploadFile.name}
                    </p>
                  )}
                  {!licenseUploadFile && (
                    <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                      File upload is optional.
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Button size="sm" onClick={handleSaveLicense} disabled={uploadingCategory !== null}>
                    Save Licence
                  </Button>
                  {licenseUploadFile && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLicenseUploadFile(null)}
                      disabled={uploadingCategory !== null}
                    >
                      Clear file
                    </Button>
                  )}
                </div>
                {licenseError && <p className="text-xs text-red-600 dark:text-red-400">{licenseError}</p>}
              </div>
            )}
          </>
        )}
      </Card>

      <div id="training-certificates" className="scroll-mt-6">
      <Card padding="lg">
        <CardHeader>Training &amp; Certificates</CardHeader>
        <CardDescription>
          Training certificates sync with the company{' '}
          <Link to="/admin/certificates" className="text-brand-600 dark:text-brand-400 hover:underline">
            Training &amp; Certificates
          </Link>{' '}
          page. Uploads from either location appear here.
        </CardDescription>
        {docsLoading ? (
          <p className="mt-4 text-sm text-neutral-500">Loading…</p>
        ) : (
          <>
            <h4 className="mt-4 text-sm font-medium text-neutral-900 dark:text-white">Training certificates</h4>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Linked to the company Training &amp; Certificates register.
            </p>
            <ul className="mt-2 space-y-2">
              {employeeCertificates.length === 0 && orphanTrainingDocs.length === 0 && (
                <li className="text-sm text-neutral-500 dark:text-neutral-400">None on file.</li>
              )}
              {employeeCertificates.map((c) => {
                const status = certificateStatusLabel(c.expirationDate)
                const linkedTraining = trainingDocByCertificateId.get(c.id)
                return (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 px-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 text-sm">
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-neutral-900 dark:text-white">{c.name}</span>
                      {c.expirationDate ? (
                        <>
                          <span className="text-neutral-500 dark:text-neutral-400 ml-2">Expires: {c.expirationDate}</span>
                          {status && <Badge variant={status.variant} className="ml-2 text-xs">{status.label}</Badge>}
                        </>
                      ) : (
                        <span className="text-neutral-500 dark:text-neutral-400 ml-2">No expiry</span>
                      )}
                      {linkedTraining && (
                        <div className="text-neutral-500 dark:text-neutral-400 mt-1 space-y-0.5">
                          {linkedTraining.completedAt && <p>Completed: {linkedTraining.completedAt}</p>}
                          {typeof linkedTraining.hoursCompleted === 'number' && (
                            <p>Hours: {linkedTraining.hoursCompleted}</p>
                          )}
                          {linkedTraining.trainingFacility && <p>Facility: {linkedTraining.trainingFacility}</p>}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button variant="outline" size="sm" onClick={() => handleQuickViewCertificate(c.id)} disabled={!c.filePath}>
                        Quick view
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleDownloadCertificate(c.id, c.fileName || `${c.name}.pdf`)} disabled={!c.filePath}>
                        Download
                      </Button>
                      {isOwnerOrHr && (
                        <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => handleRemoveCertificate(c.id)}>
                          Remove
                        </Button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>

            {orphanTrainingDocs.length > 0 && (
              <>
            <h4 className="mt-6 text-sm font-medium text-neutral-900 dark:text-white">Training records pending sync</h4>
            <ul className="mt-2 space-y-2">
              {orphanTrainingDocs.map((doc) => (
                <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 py-2 px-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 text-sm">
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-neutral-900 dark:text-white truncate block text-left">{doc.name}</span>
                    <div className="text-neutral-500 dark:text-neutral-400 mt-1 space-y-0.5">
                      <p>{doc.completedAt ? `Completed ${doc.completedAt}` : `Uploaded ${doc.uploadedAt}`}</p>
                      {doc.expiresAt && <p>Expiry: {doc.expiresAt}</p>}
                      {typeof doc.hoursCompleted === 'number' && <p>Hours completed: {doc.hoursCompleted}</p>}
                      {doc.trainingFacility && <p>Training facility: {doc.trainingFacility}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleQuickViewDoc(doc.id)}
                      disabled={!doc.hasFile}
                      title={!doc.hasFile ? 'No file uploaded for this training record' : undefined}
                    >
                      Quick view
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownloadDoc(doc)}
                      disabled={!doc.hasFile}
                      title={!doc.hasFile ? 'No file uploaded for this training record' : undefined}
                    >
                      Download
                    </Button>
                    {isOwnerOrHr && (
                      <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => handleDeleteDoc(doc.id)}>Remove</Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
              </>
            )}
            {isOwnerOrHr && (
              <div className="mt-4 p-4 rounded-xl border border-neutral-200 dark:border-neutral-700 space-y-3 max-w-xl">
                <h4 className="text-sm font-medium text-neutral-900 dark:text-white">Add Training Record</h4>
                <CourseNameSelect
                  label="Course name"
                  ariaLabel="Training course name"
                  value={trainingForm.courseName}
                  onChange={(courseName) => setTrainingForm((prev) => ({ ...prev, courseName }))}
                  additionalOptions={additionalCourseNames}
                  courses={courseCatalog}
                  persistNew={isOwnerOrHr}
                  onCatalogChanged={() => {
                    void trainingCourseApi.fetchTrainingCourseTypes().then(setCourseCatalog).catch(() => {})
                    void refetchCertificates()
                  }}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Completed date</label>
                    <input
                      type="date"
                      value={trainingForm.completedAt}
                      onChange={(e) => setTrainingForm((prev) => ({ ...prev, completedAt: e.target.value }))}
                      className="w-full min-h-[40px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm"
                      aria-label="Training completed date"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Expiry (optional)</label>
                    <input
                      type="date"
                      value={trainingForm.expiresAt}
                      onChange={(e) => setTrainingForm((prev) => ({ ...prev, expiresAt: e.target.value }))}
                      className="w-full min-h-[40px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm"
                      aria-label="Training expiry date"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Hours completed</label>
                    <input
                      type="number"
                      min="0"
                      step="0.25"
                      value={trainingForm.hoursCompleted}
                      onChange={(e) => setTrainingForm((prev) => ({ ...prev, hoursCompleted: e.target.value }))}
                      placeholder="e.g. 8"
                      className="w-full min-h-[40px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm"
                      aria-label="Training hours completed"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Training facility</label>
                    <input
                      type="text"
                      value={trainingForm.facility}
                      onChange={(e) => setTrainingForm((prev) => ({ ...prev, facility: e.target.value }))}
                      placeholder="e.g. ABC Safety Training"
                      className="w-full min-h-[40px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm"
                      aria-label="Training facility"
                    />
                  </div>
                </div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Upload File</label>
                <input
                  type="file"
                  accept=".pdf,image/*"
                  aria-label="Upload training completed file"
                  className="block w-full text-sm text-neutral-600 dark:text-neutral-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-100 file:text-brand-700 dark:file:bg-brand-900/40 dark:file:text-brand-300"
                  disabled={uploadingCategory !== null}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    setTrainingUploadFile(file)
                  }}
                />
                {trainingUploadFile && (
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Selected: {trainingUploadFile.name}
                  </p>
                )}
                {!trainingUploadFile && (
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    File upload is optional.
                  </p>
                )}
                <div className="flex items-center gap-3">
                  <Button size="sm" onClick={handleSaveTrainingRecord} disabled={uploadingCategory !== null}>
                    Save Training Record
                  </Button>
                  {trainingUploadFile && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setTrainingUploadFile(null)}
                      disabled={uploadingCategory !== null}
                    >
                      Clear file
                    </Button>
                  )}
                </div>
                {trainingError && (
                  <p className="text-xs text-red-600 dark:text-red-400">{trainingError}</p>
                )}
                {uploadingCategory === 'training' && <p className="mt-1 text-xs text-neutral-500">Uploading…</p>}
              </div>
            )}
          </>
        )}
      </Card>
      </div>

      <div id="time-off">
      <Card padding="lg">
        <CardHeader>Vacation / time off / sick</CardHeader>
        <CardDescription>
          Track vacation, sick days, and other time off, including paid and unpaid leave.
        </CardDescription>

        <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 p-3">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Total entries</p>
            <p className="text-xl font-semibold text-neutral-900 dark:text-white">{timeOffTotals.entries}</p>
          </div>
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/25 p-3">
            <p className="text-xs text-emerald-700 dark:text-emerald-300">Paid entries</p>
            <p className="text-xl font-semibold text-emerald-700 dark:text-emerald-300">{timeOffTotals.paidEntries}</p>
          </div>
          <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/25 p-3">
            <p className="text-xs text-red-700 dark:text-red-300">Unpaid entries</p>
            <p className="text-xl font-semibold text-red-700 dark:text-red-300">{timeOffTotals.unpaidEntries}</p>
          </div>
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 p-3">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Total days booked</p>
            <p className="text-xl font-semibold text-neutral-900 dark:text-white">{timeOffTotals.totalDays}</p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
          <div className="rounded-lg bg-neutral-50 dark:bg-neutral-800/50 px-3 py-2">
            <span className="text-neutral-500 dark:text-neutral-400">Vacation days:</span>{' '}
            <span className="font-medium text-neutral-900 dark:text-white">{timeOffTotals.vacationDays}</span>
          </div>
          <div className="rounded-lg bg-neutral-50 dark:bg-neutral-800/50 px-3 py-2">
            <span className="text-neutral-500 dark:text-neutral-400">Time off days:</span>{' '}
            <span className="font-medium text-neutral-900 dark:text-white">{timeOffTotals.timeOffDays}</span>
          </div>
          <div className="rounded-lg bg-neutral-50 dark:bg-neutral-800/50 px-3 py-2">
            <span className="text-neutral-500 dark:text-neutral-400">Sick days:</span>{' '}
            <span className="font-medium text-neutral-900 dark:text-white">{timeOffTotals.sickDays}</span>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 items-center">
          {(['all', 'vacation', 'time-off', 'sick'] as Array<'all' | TimeOffType>).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTimeOffTypeFilter(t)}
              className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                timeOffTypeFilter === t
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 border-neutral-300 dark:border-neutral-600'
              }`}
            >
              {t === 'all' ? 'All types' : toTimeOffDisplayLabel(t)}
            </button>
          ))}
          <select
            aria-label="Filter by paid or unpaid"
            value={timeOffCompFilter}
            onChange={(e) => setTimeOffCompFilter(e.target.value as 'all' | TimeOffCompensation)}
            className="min-h-[36px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-white"
          >
            <option value="all">All compensation</option>
            <option value="paid">Paid only</option>
            <option value="unpaid">Unpaid only</option>
          </select>
        </div>

        <ul className="mt-4 space-y-2">
          {filteredTimeOffEntries.length === 0 && (
            <li className="text-sm text-neutral-500 dark:text-neutral-400">No entries match the selected filters.</li>
          )}
          {filteredTimeOffEntries.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-2 px-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 text-sm">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="default">{toTimeOffDisplayLabel(entry.type)}</Badge>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${
                    entry.compensation === 'paid'
                      ? 'border-emerald-200 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                      : 'border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                  }`}
                >
                  {entry.compensation === 'paid' ? 'Paid' : 'Unpaid'}
                </span>
                <span className="text-neutral-900 dark:text-white">
                  {entry.startDate} - {entry.endDate} ({getTimeOffDays(entry.startDate, entry.endDate)} day{getTimeOffDays(entry.startDate, entry.endDate) === 1 ? '' : 's'})
                </span>
              </div>
              {entry.notes && <span className="text-neutral-500 dark:text-neutral-400">{entry.notes}</span>}
            </li>
          ))}
        </ul>
        {isOwnerOrHr && (
          <div className="mt-4">
            {!showTimeOffForm ? (
              <Button variant="outline" size="sm" onClick={() => setShowTimeOffForm(true)}>Add vacation / time off / sick entry</Button>
            ) : (
              <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700 space-y-3 max-w-md">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Type</label>
                  <select
                    aria-label="Time off type"
                    value={timeOffForm.type}
                    onChange={(e) => setTimeOffForm((f) => ({ ...f, type: e.target.value as TimeOffType }))}
                    className="w-full min-h-[40px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm"
                  >
                    <option value="vacation">Vacation</option>
                    <option value="time-off">Time off</option>
                    <option value="sick">Sick</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Paid / Unpaid</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setTimeOffForm((f) => ({ ...f, compensation: 'paid' }))}
                      className={`min-h-[40px] rounded-lg border text-sm font-medium transition-colors ${
                        timeOffForm.compensation === 'paid'
                          ? 'border-emerald-500 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                          : 'border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200'
                      }`}
                    >
                      Paid
                    </button>
                    <button
                      type="button"
                      onClick={() => setTimeOffForm((f) => ({ ...f, compensation: 'unpaid' }))}
                      className={`min-h-[40px] rounded-lg border text-sm font-medium transition-colors ${
                        timeOffForm.compensation === 'unpaid'
                          ? 'border-red-500 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                          : 'border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200'
                      }`}
                    >
                      Unpaid
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Start date" type="date" value={timeOffForm.startDate} onChange={(e) => setTimeOffForm((f) => ({ ...f, startDate: e.target.value }))} />
                  <Input label="End date" type="date" value={timeOffForm.endDate} onChange={(e) => setTimeOffForm((f) => ({ ...f, endDate: e.target.value }))} />
                </div>
                <Input label="Notes (optional)" value={timeOffForm.notes} onChange={(e) => setTimeOffForm((f) => ({ ...f, notes: e.target.value }))} placeholder="e.g. Annual leave" />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      if (timeOffForm.startDate && timeOffForm.endDate) {
                        setLocalTimeOff((prev) => [...prev, { id: `local-to-${Date.now()}`, ...timeOffForm }])
                        setTimeOffForm({ type: 'vacation', startDate: '', endDate: '', notes: '', compensation: 'paid' })
                        setShowTimeOffForm(false)
                      }
                    }}
                    disabled={!timeOffForm.startDate || !timeOffForm.endDate}
                  >
                    Save entry
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowTimeOffForm(false)
                      setTimeOffForm({ type: 'vacation', startDate: '', endDate: '', notes: '', compensation: 'paid' })
                    }}
                  >
                    Cancel
                  </Button>
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">HR Time Off records are synced here. Entries added in this card are local helper notes.</p>
              </div>
            )}
          </div>
        )}
      </Card>
      </div>

      <Card padding="lg">
        <CardHeader>Assigned Jobs / Sites</CardHeader>
        <CardDescription>Jobs this employee is currently assigned to.</CardDescription>
        <ul className="mt-4 space-y-2">
          {((usesSupervisorJobLinks(employee.role) ? employee.jobSupervisorLinks : employee.jobAssignments) || []).length === 0 && !editing && (
            <li className="text-sm text-neutral-500 dark:text-neutral-400">Not assigned to any jobs yet.</li>
          )}
          {((usesSupervisorJobLinks(employee.role) ? employee.jobSupervisorLinks : employee.jobAssignments) || []).map((assignment) => (
            <li key={assignment.id} className="flex flex-wrap items-center justify-between gap-2 py-2 px-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 text-sm">
              <div>
                <Link to={`/jobs/${assignment.jobId}`} className="font-medium text-brand-600 hover:underline">
                  {assignment.jobTitle || 'Unknown Job'}
                </Link>
                {assignment.siteName && <span className="ml-2 text-neutral-500 dark:text-neutral-400">({assignment.siteName})</span>}
              </div>
              {editing && (
                <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 shrink-0" onClick={() => handleRemoveJob(assignment.jobId)}>
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
        {editing && (
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Assign to Job</label>
            <select
              aria-label="Assign employee to job"
              className="w-full min-h-[40px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm"
              onChange={(e) => {
                const jobId = e.target.value
                if (jobId) {
                  handleAssignJob(jobId)
                  e.target.value = ''
                }
              }}
            >
              <option value="">Select a job...</option>
              {jobs.filter(j => !((usesSupervisorJobLinks(employee.role) ? employee.jobSupervisorLinks : employee.jobAssignments) || []).some(a => a.jobId === j.id)).map(j => (
                <option key={j.id} value={j.id}>{j.title} {j.siteName ? `(${j.siteName})` : ''}</option>
              ))}
            </select>
          </div>
        )}
        {!editing && !employeeIsOwner && (
          <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
            <Button
              variant="danger"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleting}
            >
              Delete Employee Profile
            </Button>
          </div>
        )}
      </Card>

      {showDeactivateConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 dark:bg-black/60 animate-fade-in"
          onClick={() => !saving && setShowDeactivateConfirm(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="deactivate-title"
        >
          <Card padding="lg" className="max-w-md w-full shadow-xl animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <h2 id="deactivate-title" className="font-display font-bold text-xl text-neutral-900 dark:text-white">Deactivate Employee?</h2>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
              This will deactivate <strong>{fullName}</strong>. They will no longer be able to log in. A verification flow can be added later.
            </p>
            <div className="mt-6 flex gap-3 justify-end">
              <Button type="button" variant="ghost" onClick={() => setShowDeactivateConfirm(false)} disabled={saving}>Cancel</Button>
              <Button type="button" variant="danger" onClick={handleDeactivate} disabled={saving}>{saving ? 'Deactivating…' : 'Deactivate'}</Button>
            </div>
          </Card>
        </div>
      )}

      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 dark:bg-black/60 animate-fade-in"
          onClick={() => !deleting && setShowDeleteConfirm(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-employee-title"
        >
          <Card padding="lg" className="max-w-md w-full shadow-xl animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <h2 id="delete-employee-title" className="font-display font-bold text-xl text-neutral-900 dark:text-white">Delete Employee Profile?</h2>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
              Are you sure you want to delete this profile? Once deleted all information will be removed permanently.
            </p>
            <div className="mt-6 flex gap-3 justify-end">
              <Button type="button" variant="ghost" onClick={() => setShowDeleteConfirm(false)} disabled={deleting}>Cancel</Button>
              <Button type="button" variant="danger" onClick={handleDeleteProfile} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete Profile'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
