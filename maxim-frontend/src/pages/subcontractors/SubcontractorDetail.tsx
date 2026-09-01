import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useUser } from '@/contexts/UserContext'
import { useSubcontractors } from '@/contexts/SubcontractorsContext'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { useInjuryReports } from '@/contexts/InjuryReportsContext'
import { calculateSubcontractorCompliance } from '@/utils/compliance'
import {
  fetchSubcontractorDetail,
  addSubcontractorCertification,
  updateSubcontractorCertification,
  removeSubcontractorCertification,
  addSubcontractorPersonnel,
  updateSubcontractorPersonnel,
  deleteSubcontractorPersonnel,
  addPersonnelCertification as apiAddPersonnelCert,
  removePersonnelCertification as apiRemovePersonnelCert,
  addPersonnelJobAssignment as apiAddPersonnelJob,
  removePersonnelJobAssignment as apiRemovePersonnelJob,
  addSubcontractorContract,
  removeSubcontractorContract,
  fetchSubcontractorFileBlob,
  uploadSubcontractorHSManualPdf,
  uploadSubcontractorWsibInjuryReportPdf,
  uploadSubcontractorHrSafetyAgreementPdf,
  uploadSubcontractorForm1000Pdf,
  addSubcontractorInsurance,
  deleteSubcontractorInsurance,
} from '@/api/subcontractors'
import type { Subcontractor, SubcontractorCertification, SubcontractorContract } from '@/types'
import { quickViewBlob, downloadBlob } from '@/utils/fileActions'

interface SubcontractorDetailData {
  id: string
  companyName: string
  officeContactName: string
  officeContactEmail: string
  officeContactPhone?: string
  siteContactName?: string
  siteContactEmail?: string
  siteContactPhone?: string
  status: string
  notes?: string
  usingMaximHSManual?: boolean
  hsPdfFilePath?: string
  hsPdfOriginalName?: string
  wsibInjuryReportPath?: string
  wsibInjuryReportOriginalName?: string
  wsibInjuryReportOptional?: boolean
  wsibClearanceOptional?: boolean
  hrSafetyAgreementPath?: string
  hrSafetyAgreementOriginalName?: string
  form1000Path?: string
  form1000OriginalName?: string
  form1000Optional?: boolean
  insurances?: any[]
  certifications: (SubcontractorCertification & { filePath?: string })[]
  jobAssignments: { id: string; jobId: string; jobTitle?: string; jobStatus?: string; siteId?: string; assignedAt?: string }[]
  injuryReports: { id: string; siteName: string; reportedAt?: string; status: string; severity?: string; description?: string }[]
  contracts: SubcontractorContract[]
}

const emptyEditForm = (sub?: any) => ({
  companyName: sub?.companyName ?? '',
  status: sub?.status ?? 'active',
  officeContactName: sub?.officeContactName ?? '',
  officeContactEmail: sub?.officeContactEmail ?? '',
  officeContactPhone: sub?.officeContactPhone ?? '',
  siteContactName: sub?.siteContactName ?? '',
  siteContactEmail: sub?.siteContactEmail ?? '',
  siteContactPhone: sub?.siteContactPhone ?? '',
  notes: sub?.notes ?? '',
})

export function SubcontractorDetail() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { user } = useUser()
  const {
    subcontractors,
    certifications,
    jobAssignments,
    updateSubcontractor,
    deleteSubcontractorProfile,
    addJobAssignment,
    removeJobAssignment,
    personnel,
    personnelCertifications,
    personnelJobAssignments,
    personnelCheckIns,
    loadPersonnelForSubcontractor,
    jobsList,
    apiCheckInSubcontractorPersonnel,
    apiCheckOutSubcontractorPersonnel,
  } = useSubcontractors()
  const isOwnerOrHr = user?.role === 'owner' || user?.role === 'hr'
  const [detail, setDetail] = useState<SubcontractorDetailData | null>(null)
  const [detailLoading, setDetailLoading] = useState(true)

  const refetchDetail = useCallback(async () => {
    if (!id) return
    setDetailLoading(true)
    try {
      const d = await fetchSubcontractorDetail(id)
      setDetail(d as SubcontractorDetailData)
      await loadPersonnelForSubcontractor(id)
    } catch {
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }, [id])

  useEffect(() => {
    if (!id) {
      setDetail(null)
      setDetailLoading(false)
      return
    }
    refetchDetail()
  }, [id, refetchDetail])

  // Context provides jobsList now

  const subFromList = id ? subcontractors.find((s) => s.id === id) : undefined
  const sub: Subcontractor | undefined = useMemo(() => {
    if (detail) {
      return {
        id: detail.id,
        companyName: detail.companyName,
        officeContactName: detail.officeContactName,
        officeContactEmail: detail.officeContactEmail,
        officeContactPhone: detail.officeContactPhone,
        siteContactName: detail.siteContactName,
        siteContactEmail: detail.siteContactEmail,
        siteContactPhone: detail.siteContactPhone,
        status: detail.status as 'active' | 'inactive',
        notes: detail.notes,
        usingMaximHSManual: detail.usingMaximHSManual ?? false,
        hsPdfFilePath: detail.hsPdfFilePath,
        hsPdfOriginalName: detail.hsPdfOriginalName,
        wsibInjuryReportPath: detail.wsibInjuryReportPath,
        wsibInjuryReportOriginalName: detail.wsibInjuryReportOriginalName,
        wsibInjuryReportOptional: detail.wsibInjuryReportOptional ?? false,
        wsibClearanceOptional: detail.wsibClearanceOptional ?? false,
        form1000Optional: detail.form1000Optional ?? false,
        hrSafetyAgreementPath: (detail as any).hrSafetyAgreementPath,
        hrSafetyAgreementOriginalName: detail.hrSafetyAgreementOriginalName,
        form1000Path: detail.form1000Path,
        form1000OriginalName: detail.form1000OriginalName,
        insurances: detail.insurances ?? [],
        contracts: (detail as any).contracts ?? [],
      }
    }
    return subFromList
  }, [detail, subFromList])
  const certs = detail ? detail.certifications : (sub ? certifications.filter((c) => c.subcontractorId === sub.id) : [])
  const jobAssignmentsForSub = detail
    ? detail.jobAssignments
    : sub
      ? jobAssignments.filter((a) => a.subcontractorId === sub.id)
      : []
  const jobs = detail
    ? []
    : jobAssignmentsForSub.map((a) => jobsList.find((j) => j.id === a.jobId)).filter(Boolean) as { id: string; title: string; siteName?: string }[]
  const { reports: injuryReportsFromContext } = useInjuryReports()
  const injuries = detail ? detail.injuryReports : sub ? injuryReportsFromContext.filter((r) => r.subcontractorId === sub.id) : []

  const [isEditing, setIsEditing] = useState(false)
  const [savingDetails, setSavingDetails] = useState(false)
  const [detailsError, setDetailsError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletingProfile, setDeletingProfile] = useState(false)
  const [form, setForm] = useState(() => emptyEditForm(sub))
  const [editingCertId, setEditingCertId] = useState<string | null>(null)
  const [certForm, setCertForm] = useState({ name: '', issuedAt: '', expiresAt: '' })
  const [newCert, setNewCert] = useState({ name: '', issuedAt: '', expiresAt: '' })
  const [newCertPdfFile, setNewCertPdfFile] = useState<File | null>(null)

  const [newContract, setNewContract] = useState({ startDate: '', endDate: '', personnelId: '' })
  const [newContractFile, setNewContractFile] = useState<File | null>(null)

  // Multi-insurance state
  const [newInsuranceType, setNewInsuranceType] = useState('COI')
  const [newInsurancePolicy, setNewInsurancePolicy] = useState('')
  const [newInsuranceExpiry, setNewInsuranceExpiry] = useState('')
  const [newInsuranceFile, setNewInsuranceFile] = useState<File | null>(null)
  const [newInsuranceError, setNewInsuranceError] = useState<string | null>(null)
  const [newInsuranceUploading, setNewInsuranceUploading] = useState(false)

  const [hsPdfFile, setHsPdfFile] = useState<File | null>(null)
  const [hsPdfUploading, setHsPdfUploading] = useState(false)
  const [hsPdfError, setHsPdfError] = useState<string | null>(null)
  const [hsManualCheckboxSaving, setHsManualCheckboxSaving] = useState(false)

  // WSIB Injury Report state
  const [wsibPdfFile, setWsibPdfFile] = useState<File | null>(null)
  const [wsibPdfUploading, setWsibPdfUploading] = useState(false)
  const [wsibPdfError, setWsibPdfError] = useState<string | null>(null)
  const [wsibOptionalSaving, setWsibOptionalSaving] = useState(false)
  const [wsibClearanceOptionalSaving, setWsibClearanceOptionalSaving] = useState(false)

  // HR Safety Agreement state
  const [hrPdfFile, setHrPdfFile] = useState<File | null>(null)
  const [hrPdfUploading, setHrPdfUploading] = useState(false)
  const [hrPdfError, setHrPdfError] = useState<string | null>(null)

  // FORM 1000 state
  const [form1000PdfFile, setForm1000PdfFile] = useState<File | null>(null)
  const [form1000PdfUploading, setForm1000PdfUploading] = useState(false)
  const [form1000PdfError, setForm1000PdfError] = useState<string | null>(null)
  const [form1000OptionalSaving, setForm1000OptionalSaving] = useState(false)

  const [editingPersonnelId, setEditingPersonnelId] = useState<string | null>(null)
  const [personnelForm, setPersonnelForm] = useState({ name: '', email: '', orientationCompletedAt: '', orientationLocation: '' })
  const [newPersonnel, setNewPersonnel] = useState({ name: '', email: '' })
  const [addingCertForPersonnelId, setAddingCertForPersonnelId] = useState<string | null>(null)
  const [newPersonnelCert, setNewPersonnelCert] = useState({ name: '', issuedAt: '', expiresAt: '' })
  const [showAllPersonnel, setShowAllPersonnel] = useState(false)

  useEffect(() => {
    if (sub) setForm(emptyEditForm(sub))
  }, [sub, isEditing])


  if (!isOwnerOrHr) return null
  if (detailLoading && !detail && !subFromList) {
    return (
      <div className="space-y-4 animate-fade-in">
        <Breadcrumbs items={[{ label: 'Subcontractors', to: '/subcontractors' }, { label: '…' }]} />
        <p className="text-neutral-500 dark:text-neutral-400">Loading…</p>
      </div>
    )
  }
  if (!sub) {
    return (
      <div className="space-y-4 animate-fade-in">
        <Breadcrumbs items={[{ label: 'Subcontractors', to: '/subcontractors' }, { label: 'Not found' }]} />
        <p className="text-neutral-500 dark:text-neutral-400">Subcontractor not found.</p>
        <Link to="/subcontractors" className="text-brand-600 dark:text-brand-400 hover:underline">
          Back to subcontractors
        </Link>
      </div>
    )
  }

  const handleSave = async () => {
    const companyName = form.companyName.trim()
    const officeContactName = form.officeContactName.trim()
    const officeContactEmail = form.officeContactEmail.trim()
    if (!companyName || !officeContactName || !officeContactEmail) {
      setDetailsError('Company name, office contact name, and office contact email are required.')
      return
    }

    setDetailsError(null)
    setSavingDetails(true)
    try {
      await updateSubcontractor(sub.id, {
        companyName,
        status: form.status,
        officeContactName,
        officeContactEmail,
        officeContactPhone: form.officeContactPhone.trim() || undefined,
        siteContactName: form.siteContactName.trim() || undefined,
        siteContactEmail: form.siteContactEmail.trim() || undefined,
        siteContactPhone: form.siteContactPhone.trim() || undefined,
        notes: form.notes.trim() || undefined,
      })
      await refetchDetail()
      setIsEditing(false)
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.response?.data?.message || 'Failed to save subcontractor changes.'
      setDetailsError(msg)
    } finally {
      setSavingDetails(false)
    }
  }

  const handleCancel = () => {
    setForm(emptyEditForm(sub))
    setEditingCertId(null)
    setNewCert({ name: '', issuedAt: '', expiresAt: '' })
    setEditingPersonnelId(null)
    setNewPersonnel({ name: '', email: '' })
    setAddingCertForPersonnelId(null)
    setNewPersonnelCert({ name: '', issuedAt: '', expiresAt: '' })
    setNewInsuranceFile(null)
    setNewInsuranceError(null)
    setNewInsuranceType('COI')
    setNewInsurancePolicy('')
    setNewInsuranceExpiry('')
    setIsEditing(false)
    setDetailsError(null)
  }

  // Multi-insurance handlers
  const handleAddInsurance = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sub || !newInsuranceType) return
    setNewInsuranceUploading(true)
    setNewInsuranceError(null)
    try {
      await addSubcontractorInsurance(
        sub.id,
        { type: newInsuranceType, policyNumber: newInsurancePolicy || undefined, expiresAt: newInsuranceExpiry || undefined },
        newInsuranceFile,
      )
      setNewInsuranceType('COI')
      setNewInsurancePolicy('')
      setNewInsuranceExpiry('')
      setNewInsuranceFile(null)
      await refetchDetail()
    } catch (e: any) {
      setNewInsuranceError(e?.response?.data?.error ?? e?.response?.data?.message ?? e?.message ?? 'Failed to add insurance.')
    } finally {
      setNewInsuranceUploading(false)
    }
  }

  const handleRemoveInsurance = async (insuranceId: string) => {
    if (!sub) return
    if (!window.confirm('Remove this insurance entry?')) return
    try {
      await deleteSubcontractorInsurance(sub.id, insuranceId)
      await refetchDetail()
    } catch (e: any) {
      alert(e?.response?.data?.error ?? e?.message ?? 'Failed to remove insurance.')
    }
  }

  // WSIB Injury Report upload
  const handleUploadWsibPdf = async () => {
    if (!sub || !wsibPdfFile) return
    setWsibPdfUploading(true)
    setWsibPdfError(null)
    try {
      await uploadSubcontractorWsibInjuryReportPdf(sub.id, wsibPdfFile)
      setWsibPdfFile(null)
      await refetchDetail()
    } catch (e: any) {
      setWsibPdfError(e?.response?.data?.error ?? e?.response?.data?.message ?? e?.message ?? 'Upload failed.')
    } finally {
      setWsibPdfUploading(false)
    }
  }

  const handleToggleWsibOptional = async (value: boolean) => {
    if (!sub) return
    setWsibOptionalSaving(true)
    setWsibPdfError(null)
    try {
      await updateSubcontractor(sub.id, { wsibInjuryReportOptional: value })
      await refetchDetail()
    } catch (e: any) {
      setWsibPdfError(e?.response?.data?.error ?? e?.response?.data?.message ?? e?.message ?? 'Failed to update WSIB requirement.')
    } finally {
      setWsibOptionalSaving(false)
    }
  }

  const handleToggleWsibClearanceOptional = async (value: boolean) => {
    if (!sub) return
    setWsibClearanceOptionalSaving(true)
    setNewInsuranceError(null)
    try {
      await updateSubcontractor(sub.id, { wsibClearanceOptional: value })
      await refetchDetail()
    } catch (e: any) {
      setNewInsuranceError(e?.response?.data?.error ?? e?.response?.data?.message ?? e?.message ?? 'Failed to update WSIB Clearance option.')
    } finally {
      setWsibClearanceOptionalSaving(false)
    }
  }

  const handleToggleForm1000Optional = async (value: boolean) => {
    if (!sub) return
    setForm1000OptionalSaving(true)
    setForm1000PdfError(null)
    try {
      await updateSubcontractor(sub.id, { form1000Optional: value })
      await refetchDetail()
    } catch (e: any) {
      setForm1000PdfError(e?.response?.data?.error ?? e?.response?.data?.message ?? e?.message ?? 'Failed to update FORM 1000 option.')
    } finally {
      setForm1000OptionalSaving(false)
    }
  }

  // HR Safety Agreement upload
  const handleUploadHrPdf = async () => {
    if (!sub || !hrPdfFile) return
    setHrPdfUploading(true)
    setHrPdfError(null)
    try {
      await uploadSubcontractorHrSafetyAgreementPdf(sub.id, hrPdfFile)
      setHrPdfFile(null)
      await refetchDetail()
    } catch (e: any) {
      setHrPdfError(e?.response?.data?.error ?? e?.response?.data?.message ?? e?.message ?? 'Upload failed.')
    } finally {
      setHrPdfUploading(false)
    }
  }

  // FORM 1000 upload
  const handleUploadForm1000Pdf = async () => {
    if (!sub || !form1000PdfFile) return
    setForm1000PdfUploading(true)
    setForm1000PdfError(null)
    try {
      await uploadSubcontractorForm1000Pdf(sub.id, form1000PdfFile)
      setForm1000PdfFile(null)
      await refetchDetail()
    } catch (e: any) {
      setForm1000PdfError(e?.response?.data?.error ?? e?.response?.data?.message ?? e?.message ?? 'Upload failed.')
    } finally {
      setForm1000PdfUploading(false)
    }
  }

  // Profile deactivation
  const handleDeactivateProfile = async () => {
    if (!sub) return
    if (!window.confirm('Are you sure you want to deactivate this subcontractor profile?')) return
    try {
      await updateSubcontractor(sub.id, { status: 'inactive' })
      await refetchDetail()
    } catch (e: any) {
      alert(e?.response?.data?.error ?? e?.message ?? 'Failed to deactivate.')
    }
  }

  const handleToggleHSManual = async (value: boolean) => {
    if (!sub) return
    setHsManualCheckboxSaving(true)
    try {
      await updateSubcontractor(sub.id, { usingMaximHSManual: value })
      await refetchDetail()
    } catch {
      // ignore
    } finally {
      setHsManualCheckboxSaving(false)
    }
  }

  const handleUploadHSManualPdf = async () => {
    if (!sub || !hsPdfFile) return
    setHsPdfUploading(true)
    setHsPdfError(null)
    try {
      await uploadSubcontractorHSManualPdf(sub.id, hsPdfFile)
      setHsPdfFile(null)
      await refetchDetail()
    } catch (e: any) {
      setHsPdfError(e?.response?.data?.error ?? e?.response?.data?.message ?? e?.message ?? 'Upload failed.')
    } finally {
      setHsPdfUploading(false)
    }
  }

  const handleDeleteProfile = async () => {
    if (!sub?.id) return
    setDeletingProfile(true)
    try {
      await deleteSubcontractorProfile(sub.id)
      navigate('/subcontractors')
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.response?.data?.message || 'Failed to delete subcontractor profile.'
      setDetailsError(msg)
    } finally {
      setDeletingProfile(false)
      setShowDeleteConfirm(false)
    }
  }

  const handleSavePersonnel = async (personnelId: string) => {
    if (!sub) return
    await updateSubcontractorPersonnel(sub.id, personnelId, {
      name: personnelForm.name.trim(),
      email: personnelForm.email.trim() || undefined,
      orientationCompletedAt: personnelForm.orientationCompletedAt.trim()
        ? new Date(personnelForm.orientationCompletedAt.trim()).toISOString()
        : null,
    })
    await loadPersonnelForSubcontractor(sub.id)
    setEditingPersonnelId(null)
  }

  const handleUpdatePersonnelStatus = async (personnelId: string, status: string) => {
    if (!sub) return
    if (status === 'terminated' && !window.confirm('Setting status to Terminated will hide this person\'s certificates from the Certificates page. Continue?')) return
    try {
      await updateSubcontractorPersonnel(sub.id, personnelId, { status })
      await loadPersonnelForSubcontractor(sub.id)
    } catch (e: any) {
      console.error('Failed to update personnel status', e)
      alert(e?.response?.data?.message || e?.message || 'Failed to update status')
    }
  }

  const handleAddPersonnel = async () => {
    if (!newPersonnel.name.trim() || !sub) return
    await addSubcontractorPersonnel(sub.id, {
      name: newPersonnel.name.trim(),
      email: newPersonnel.email.trim() || undefined,
    })
    await loadPersonnelForSubcontractor(sub.id)
    setNewPersonnel({ name: '', email: '' })
  }

  const handleAddPersonnelCert = async (personnelId: string) => {
    if (!newPersonnelCert.name.trim() || !newPersonnelCert.expiresAt || !sub) return
    await apiAddPersonnelCert(sub.id, personnelId, {
      name: newPersonnelCert.name.trim(),
      issuedAt: newPersonnelCert.issuedAt,
      expiresAt: newPersonnelCert.expiresAt,
    })
    await loadPersonnelForSubcontractor(sub.id)
    setAddingCertForPersonnelId(null)
    setNewPersonnelCert({ name: '', issuedAt: '', expiresAt: '' })
  }

  const handleAddContract = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sub || !newContract.startDate || !newContractFile) return
    const formData = new FormData()
    formData.append('startDate', newContract.startDate)
    if (newContract.endDate) formData.append('endDate', newContract.endDate)
    if (newContract.personnelId) formData.append('personnelId', newContract.personnelId)
    formData.append('file', newContractFile)

    await addSubcontractorContract(sub.id, formData)
    await refetchDetail()
    setNewContract({ startDate: '', endDate: '', personnelId: '' })
    setNewContractFile(null)
  }

  const handleRemoveContract = async (contractId: string) => {
    if (!sub) return
    if (!window.confirm('Delete this contract?')) return
    await removeSubcontractorContract(sub.id, contractId)
    await refetchDetail()
  }

  const handleQuickViewSubFile = async (filePath?: string) => {
    if (!filePath) return
    const blob = await fetchSubcontractorFileBlob(filePath)
    quickViewBlob(blob)
  }

  const handleDownloadSubFile = async (filePath: string | undefined, fallbackName: string) => {
    if (!filePath) return
    const blob = await fetchSubcontractorFileBlob(filePath)
    downloadBlob(blob, fallbackName)
  }

  const handleRemovePersonnel = async (personnelId: string) => {
    if (!sub) return
    await deleteSubcontractorPersonnel(sub.id, personnelId)
    await loadPersonnelForSubcontractor(sub.id)
  }

  const handleRemovePersonnelCert = async (personnelId: string, certId: string) => {
    if (!sub) return
    await apiRemovePersonnelCert(sub.id, personnelId, certId)
    await loadPersonnelForSubcontractor(sub.id)
  }

  const handleAddPersonnelJob = async (personnelId: string, jobId: string) => {
    if (!sub) return
    try {
      await apiAddPersonnelJob(sub.id, personnelId, { jobId, assignedAt: new Date().toISOString().slice(0, 10) })
      await loadPersonnelForSubcontractor(sub.id)
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || 'Could not assign this worker to the job.'
      window.alert(msg)
    }
  }

  const handleRemovePersonnelJob = async (personnelId: string, assignmentId: string) => {
    if (!sub) return
    await apiRemovePersonnelJob(sub.id, personnelId, assignmentId)
    await loadPersonnelForSubcontractor(sub.id)
  }

  const handleSaveCert = async (certId: string) => {
    if (!id) return
    await updateSubcontractorCertification(id, certId, {
      name: certForm.name.trim(),
      issuedAt: certForm.issuedAt,
      expiresAt: certForm.expiresAt,
    })
    setEditingCertId(null)
    await refetchDetail()
  }

  const handleAddCert = async () => {
    if (!id || !newCert.name.trim() || !newCert.expiresAt) return
    let payload: any = {
      name: newCert.name.trim(),
      issuedAt: newCert.issuedAt,
      expiresAt: newCert.expiresAt,
    }
    if (newCertPdfFile) {
      payload = new FormData()
      payload.append('name', newCert.name.trim())
      payload.append('issuedAt', newCert.issuedAt)
      payload.append('expiresAt', newCert.expiresAt)
      payload.append('file', newCertPdfFile)
    }
    await addSubcontractorCertification(id, payload)
    setNewCert({ name: '', issuedAt: '', expiresAt: '' })
    setNewCertPdfFile(null)
    await refetchDetail()
  }

  const handleRemoveCert = async (certId: string) => {
    if (!id) return
    await removeSubcontractorCertification(id, certId)
    await refetchDetail()
  }

  const assignedJobIds = jobAssignmentsForSub.map((a) => a.jobId)
  const displayJobs = detail
    ? jobAssignmentsForSub.map((a) => ({
      id: a.jobId,
      title: (a as { jobTitle?: string }).jobTitle ?? a.jobId,
      siteName: (a as { siteId?: string }).siteId ?? '—',
    }))
    : jobs
  const availableJobs = jobsList.filter((j) => !assignedJobIds.includes(j.id))

  return (
    <div className="space-y-6 animate-fade-in">
      <Breadcrumbs items={[{ label: 'Subcontractors', to: '/subcontractors' }, { label: sub.companyName }]} />
      <p className="text-sm text-neutral-500 dark:text-neutral-400">Only Owner and HR can view and edit subcontractor information.</p>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            to="/subcontractors"
            className="touch-target p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            {!isEditing ? (
              <>
                <h1 className="font-display font-bold text-display-xl text-neutral-900 dark:text-white tracking-tight">
                  {sub.companyName}
                </h1>
                <p className="text-neutral-500 dark:text-neutral-400 mt-0.5">
                  <Badge variant={sub.status === 'active' ? 'success' : 'default'}>{sub.status}</Badge>
                </p>
              </>
            ) : (
              <div className="flex flex-wrap items-end gap-3">
                <Input
                  label="Company name"
                  value={form.companyName}
                  onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
                  className="min-w-[200px]"
                />
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Status</span>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as 'active' | 'inactive' }))}
                    className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  >
                    <option value="active">active</option>
                    <option value="inactive">inactive</option>
                  </select>
                </label>
              </div>
            )}
          </div>
        </div>
        {!isEditing ? (
          <Button onClick={() => setIsEditing(true)} aria-label="Edit subcontractor (Owner and HR only)">Edit</Button>
        ) : (
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={savingDetails}>{savingDetails ? 'Saving…' : 'Save'}</Button>
            <Button variant="ghost" onClick={handleCancel} disabled={savingDetails}>Cancel</Button>
          </div>
        )}
      </div>
      {detailsError && (
        <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-2 text-sm text-red-800 dark:text-red-200">
          {detailsError}
        </div>
      )}


      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card padding="md">
          <CardHeader className="text-base">Compliance Score</CardHeader>
          <CardDescription>Overall compliance health (certs + insurance + contract)</CardDescription>
          {(() => {
            const allPersonnelCerts = personnelCertifications.filter(c =>
              personnel.filter(p => p.subcontractorId === sub.id).map(p => p.id).includes(c.personnelId)
            )
            const comp = calculateSubcontractorCompliance(sub, certs, allPersonnelCerts, (sub as any).contracts || [], (sub as any).insurances || [])
            const scoreColor = comp.score === 100 ? 'green' : comp.score > 50 ? 'amber' : 'red'
            return (
              <div className="mt-3">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <span className={`inline-flex h-12 w-12 rounded-full items-center justify-center text-lg font-bold ${scoreColor === 'green' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : scoreColor === 'amber' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'}`}>
                      {comp.score}%
                    </span>
                    {(comp.missing.length > 0 || comp.score < 100) && (
                      <svg className="absolute -top-1 -right-1 w-5 h-5 text-red-600 dark:text-red-400 bg-white dark:bg-neutral-900 rounded-full" fill="currentColor" viewBox="0 0 20 20" aria-label="Compliance issues">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                  <div className="flex flex-col">
                    <span className="font-medium text-neutral-900 dark:text-white">{comp.status}</span>
                  </div>
                </div>
                {comp.missing.length > 0 && (
                  <p className="mt-3 text-sm text-red-600 dark:text-red-400">
                    <span className="font-medium">Missing:</span> {comp.missing.join(', ')}
                  </p>
                )}
                {comp.expiringSoon.length > 0 && (
                  <p className="mt-1 text-sm text-amber-600 dark:text-amber-400">
                    <span className="font-medium">Expiring soon:</span> {comp.expiringSoon.join(', ')}
                  </p>
                )}
              </div>
            )
          })()}
        </Card>
        <Card padding="md">
          <CardHeader className="text-base">Pre-Qualification Checklist</CardHeader>
          <CardDescription>Before marking active</CardDescription>
          {(() => {
            const allPersonnelCerts = personnelCertifications.filter(c =>
              personnel.filter(p => p.subcontractorId === sub.id).map(p => p.id).includes(c.personnelId)
            )
            const comp = calculateSubcontractorCompliance(sub, certs, allPersonnelCerts, (sub as any).contracts || [], (sub as any).insurances || [])

            const hasCOI = (sub as any).insurances?.some((i: any) => i.type === 'COI')
            const hasWSIBIns = (sub as any).insurances?.some((i: any) => i.type === 'WSIB')
            const hasWSIBRep = !!(sub as any).wsibInjuryReportPath
            const wsibReportOptional = !!(sub as any).wsibInjuryReportOptional
            const wsibClearanceOptional = !!(sub as any).wsibClearanceOptional
            const hasHR = !!(sub as any).hrSafetyAgreementPath
            const hasHS = (sub as any).usingMaximHSManual || !!(sub as any).hsPdfFilePath
            const hasContract = (sub as any).contracts && (sub as any).contracts.length > 0
            const hasForm1000 = !!(sub as any).form1000Path
            const form1000Optional = !!(sub as any).form1000Optional

            const reqs = [
              { label: 'Certificate of Liability (COI)', met: !!hasCOI },
              { label: wsibClearanceOptional ? 'WSIB Clearance (Optional)' : 'WSIB Clearance', met: wsibClearanceOptional || !!hasWSIBIns },
              { label: wsibReportOptional ? 'WSIB Injury Summary Report (Optional)' : 'WSIB Injury Summary Report', met: wsibReportOptional || !!hasWSIBRep },
              { label: 'Sub-Contractor H&R Safety Agreement', met: !!hasHR },
              { label: 'Health and Safety Manual', met: !!hasHS },
              { label: 'Signed Contract', met: !!hasContract },
              { label: form1000Optional ? 'FORM 1000 (Optional)' : 'FORM 1000', met: form1000Optional || !!hasForm1000 },
            ]

            return (
              <>
                <ul className="mt-4 space-y-2 mb-4">
                  {reqs.map(r => (
                    <li key={r.label} className="flex items-center gap-2">
                      {r.met ? (
                        <svg className="w-5 h-5 text-green-600 dark:text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                      ) : (
                        <svg className="w-5 h-5 text-red-600 dark:text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                      )}
                      <span className={`text-sm font-medium ${r.met ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>{r.label}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-2.5">
                  <div className="bg-brand-600 h-2.5 rounded-full" style={{ width: `${comp.score}%` }}></div>
                </div>
                <p className="text-sm mt-2 text-neutral-600 dark:text-neutral-400">
                  {comp.score}% Complete
                </p>
                <Button size="sm" variant="secondary" className="mt-3" onClick={() => alert('Request certificate renewal would be sent to the subcontractor.')}>Request Cert Renewal</Button>
              </>
            )
          })()}
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card padding="lg" className="flex flex-col h-full">
          <CardHeader>Contacts</CardHeader>
          <div className="mt-4 flex-1 flex flex-col gap-6">
            {/* Office Contact */}
            <div>
              <h4 className="text-sm font-semibold text-neutral-900 dark:text-white mb-2 pb-1 border-b border-slate-100 dark:border-slate-800">
                Office Contact
              </h4>
              {!isEditing ? (
                <div className="space-y-1 text-sm">
                  <p className="font-medium text-neutral-900 dark:text-white">{sub.officeContactName}</p>
                  <p className="text-neutral-600 dark:text-neutral-400">
                    <a href={`mailto:${sub.officeContactEmail}`} className="text-brand-600 dark:text-brand-400 hover:underline">
                      {sub.officeContactEmail}
                    </a>
                  </p>
                  {sub.officeContactPhone && (
                    <p className="text-neutral-600 dark:text-neutral-400">{sub.officeContactPhone}</p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <Input
                    label="Contact name *"
                    value={form.officeContactName}
                    onChange={(e) => setForm((f) => ({ ...f, officeContactName: e.target.value }))}
                  />
                  <Input
                    label="Email *"
                    type="email"
                    value={form.officeContactEmail}
                    onChange={(e) => setForm((f) => ({ ...f, officeContactEmail: e.target.value }))}
                  />
                  <Input
                    label="Phone"
                    value={form.officeContactPhone}
                    onChange={(e) => setForm((f) => ({ ...f, officeContactPhone: e.target.value }))}
                  />
                </div>
              )}
            </div>

            {/* Site Contact */}
            <div>
              <h4 className="text-sm font-semibold text-neutral-900 dark:text-white mb-2 pb-1 border-b border-slate-100 dark:border-slate-800">
                Site Contact
              </h4>
              {!isEditing ? (
                <div className="space-y-1 text-sm">
                  {sub.siteContactName ? (
                    <>
                      <p className="font-medium text-neutral-900 dark:text-white">{sub.siteContactName}</p>
                      {sub.siteContactEmail && (
                        <p className="text-neutral-600 dark:text-neutral-400">
                          <a href={`mailto:${sub.siteContactEmail}`} className="text-brand-600 dark:text-brand-400 hover:underline">
                            {sub.siteContactEmail}
                          </a>
                        </p>
                      )}
                      {sub.siteContactPhone && (
                        <p className="text-neutral-600 dark:text-neutral-400">{sub.siteContactPhone}</p>
                      )}
                    </>
                  ) : (
                    <p className="text-neutral-400 dark:text-neutral-500 italic">No site contact assigned</p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <Input
                    label="Contact name"
                    value={form.siteContactName}
                    onChange={(e) => setForm((f) => ({ ...f, siteContactName: e.target.value }))}
                  />
                  <Input
                    label="Email"
                    type="email"
                    value={form.siteContactEmail}
                    onChange={(e) => setForm((f) => ({ ...f, siteContactEmail: e.target.value }))}
                  />
                  <Input
                    label="Phone"
                    value={form.siteContactPhone}
                    onChange={(e) => setForm((f) => ({ ...f, siteContactPhone: e.target.value }))}
                  />
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card padding="lg">
          <CardHeader>Contracts</CardHeader>
          <div className="mt-4 space-y-4">
            {detail?.contracts && detail.contracts.length > 0 ? (
              <ul className="space-y-3">
                {detail.contracts.map((c: SubcontractorContract) => {
                  const worker = c.personnelId ? personnel.find((p) => p.id === c.personnelId) : null
                  return (
                    <li key={c.id} className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 p-3 border border-slate-200 dark:border-slate-700 rounded-lg">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-neutral-900 dark:text-white flex items-center gap-2">
                          {c.originalName}
                          {worker && <Badge variant="default">For: {worker.name}</Badge>}
                        </div>
                        <p className="text-sm text-neutral-500 mt-1">
                          Start: {c.startDate} {c.endDate ? `· End: ${c.endDate}` : ''}
                        </p>
                        <p className="text-xs text-neutral-400 mt-1">Uploaded: {new Date(c.uploadedAt).toLocaleDateString()}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {c.filePath && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => handleQuickViewSubFile(c.filePath)}>Quick View</Button>
                            <Button size="sm" variant="outline" onClick={() => handleDownloadSubFile(c.filePath, c.originalName || 'contract')}>Download</Button>
                          </>
                        )}
                        {isEditing && (
                          <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleRemoveContract(c.id)}>
                            Remove
                          </Button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">No contracts uploaded yet.</p>
            )}

            {isEditing && (
              <form onSubmit={handleAddContract} className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 space-y-3">
                <h4 className="text-sm font-medium text-neutral-900 dark:text-white">Upload New Contract</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input label="Start Date" type="date" required value={newContract.startDate} onChange={(e) => setNewContract((prev) => ({ ...prev, startDate: e.target.value }))} />
                  <Input label="End Date" type="date" value={newContract.endDate} onChange={(e) => setNewContract((prev) => ({ ...prev, endDate: e.target.value }))} />
                </div>
                <div>
                  <label className="flex flex-col gap-1.5 mb-3">
                    <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Assign to Specific Worker (Optional)</span>
                    <select
                      className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                      value={newContract.personnelId}
                      onChange={(e) => setNewContract((prev) => ({ ...prev, personnelId: e.target.value }))}
                    >
                      <option value="">General Company Contract</option>
                      {personnel.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Contract File (PDF/Image)*</span>
                    <input
                      type="file"
                      required
                      accept=".pdf,image/jpeg,image/png"
                      className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 dark:file:bg-brand-900/50 dark:file:text-brand-300 text-sm"
                      onChange={(e) => setNewContractFile(e.target.files?.[0] || null)}
                    />
                  </label>
                </div>
                <Button type="submit" variant="primary" size="sm" disabled={!newContract.startDate || !newContractFile}>
                  Upload Contract
                </Button>
              </form>
            )}
          </div>
        </Card>
      </div>

      <Card padding="lg">
        <CardHeader>Insurance</CardHeader>
        <CardDescription>Upload and manage multiple insurance policies. Types: COI, WSIB, Other.</CardDescription>
        <div className="mt-4 space-y-4">
          <label className="flex items-start gap-3 cursor-pointer group">
            <div className="relative mt-0.5">
              <input
                type="checkbox"
                className="sr-only"
                checked={sub.wsibClearanceOptional ?? false}
                disabled={wsibClearanceOptionalSaving}
                onChange={(e) => handleToggleWsibClearanceOptional(e.target.checked)}
              />
              <div
                className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                  sub.wsibClearanceOptional
                    ? 'bg-brand-600 border-brand-600'
                    : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-neutral-800 group-hover:border-brand-400'
                }`}
              >
                {sub.wsibClearanceOptional && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-900 dark:text-white">Make WSIB Clearance optional</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                When checked, WSIB Clearance is excluded from the prequalification/compliance calculation.
              </p>
            </div>
            {wsibClearanceOptionalSaving && (
              <span className="ml-auto text-xs text-neutral-400 animate-pulse">Saving…</span>
            )}
          </label>
          {sub.wsibClearanceOptional && !(sub.insurances ?? []).some((i: { type: string }) => i.type === 'WSIB') && (
            <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 -mt-1">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>WSIB Clearance marked optional — excluded from prequalification scoring</span>
            </div>
          )}
          {/* Existing insurances list */}
          {(sub.insurances ?? []).length > 0 ? (
            <ul className="space-y-3">
              {(sub.insurances as any[]).map((ins: any) => (
                <li key={ins.id} className="rounded-xl border border-slate-200 dark:border-slate-600 bg-neutral-50/50 dark:bg-neutral-800/50 p-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-neutral-900 dark:text-white flex items-center gap-2">
                      <Badge variant="default">{ins.type === 'COI' ? 'Certificate of Liability (COI)' : ins.type === 'WSIB' ? 'WSIB Clearance' : ins.type}</Badge>
                      {ins.policyNumber && <span className="text-sm text-neutral-600 dark:text-neutral-400">Certificate/Policy: {ins.policyNumber}</span>}
                    </p>
                    {ins.expiresAt && (
                      <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                        Expires: {ins.expiresAt}
                        {new Date(ins.expiresAt) <= new Date() && <Badge variant="danger" className="ml-2">Expired</Badge>}
                      </p>
                    )}
                    {ins.filePath && (
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <Button size="sm" variant="outline" onClick={() => handleQuickViewSubFile(ins.filePath)}>Quick View</Button>
                        <Button size="sm" variant="outline" onClick={() => handleDownloadSubFile(ins.filePath, ins.originalName ?? 'insurance.pdf')}>Download</Button>
                      </div>
                    )}
                  </div>
                  {isEditing && (
                    <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700 dark:text-red-400" onClick={() => handleRemoveInsurance(ins.id)}>
                      Remove
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">No insurance policies on file.</p>
          )}

          {/* Add Insurance form */}
          {isEditing && (
            <form onSubmit={handleAddInsurance} className="pt-4 border-t border-slate-200 dark:border-slate-600 space-y-3">
              <h4 className="text-sm font-medium text-neutral-900 dark:text-white">Add Insurance</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Type*</span>
                  <select
                    className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                    value={newInsuranceType}
                    onChange={(e) => setNewInsuranceType(e.target.value)}
                  >
                    <option value="COI">Certificate of Liability (COI)</option>
                    <option value="WSIB">WSIB Clearance</option>
                    <option value="Other">Other</option>
                  </select>
                </label>
                <Input label="Certificate/Policy Number" value={newInsurancePolicy} onChange={(e) => setNewInsurancePolicy(e.target.value)} placeholder="e.g. LIAB-ABC-001" />
                <Input label="Expires" type="date" value={newInsuranceExpiry} onChange={(e) => setNewInsuranceExpiry(e.target.value)} />
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Insurance PDF (optional)</span>
                <input
                  type="file"
                  accept=".pdf,application/pdf,image/png,image/jpeg"
                  onChange={(e) => { setNewInsuranceError(null); setNewInsuranceFile(e.target.files?.[0] || null) }}
                  className="block w-full text-sm text-neutral-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 dark:file:bg-brand-900/30 dark:file:text-brand-300 border border-slate-200 dark:border-slate-600 rounded-xl px-2 py-1.5"
                />
              </label>
              {newInsuranceError && <p className="text-xs text-red-600 dark:text-red-400">{newInsuranceError}</p>}
              <Button type="submit" size="sm" disabled={!newInsuranceType || newInsuranceUploading}>
                {newInsuranceUploading ? 'Uploading…' : 'Add Insurance'}
              </Button>
            </form>
          )}
        </div>
      </Card>

      {/* ========= Health & Safety Manual ========= */}
      <Card padding="lg">
        <CardHeader>Health &amp; Safety Manual</CardHeader>
        <CardDescription>The subcontractor must either use Maxim&apos;s H&amp;S Manual or upload their own. This is required for prequalification.</CardDescription>
        <div className="mt-4 space-y-4">
          {/* Using Maxim manual checkbox — always visible, saves immediately */}
          <label className="flex items-start gap-3 cursor-pointer group">
            <div className="relative mt-0.5">
              <input
                type="checkbox"
                className="sr-only"
                checked={sub.usingMaximHSManual ?? false}
                disabled={hsManualCheckboxSaving}
                onChange={(e) => handleToggleHSManual(e.target.checked)}
              />
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${sub.usingMaximHSManual
                ? 'bg-brand-600 border-brand-600'
                : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-neutral-800 group-hover:border-brand-400'
                }`}>
                {sub.usingMaximHSManual && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-900 dark:text-white">
                Using Maxim Health &amp; Safety Manual
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                Check this if the subcontractor is operating under Maxim&apos;s H&amp;S Manual. This automatically passes the prequalification requirement.
              </p>
            </div>
            {hsManualCheckboxSaving && (
              <span className="ml-auto text-xs text-neutral-400 animate-pulse">Saving…</span>
            )}
          </label>

          {/* Status badge */}
          {sub.usingMaximHSManual ? (
            <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-medium">Passes prequalification — using Maxim H&amp;S Manual</span>
            </div>
          ) : sub.hsPdfFilePath ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-medium">Custom H&amp;S Manual uploaded — {sub.hsPdfOriginalName}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={() => handleQuickViewSubFile(sub.hsPdfFilePath)}>Quick View</Button>
                <Button size="sm" variant="outline" onClick={() => handleDownloadSubFile(sub.hsPdfFilePath, sub.hsPdfOriginalName ?? 'hs-manual.pdf')}>Download</Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>No H&amp;S Manual on file — required for prequalification</span>
            </div>
          )}

          {/* Upload own H&S Manual (only show if not using Maxim's) */}
          {!sub.usingMaximHSManual && (
            <div className="pt-3 border-t border-slate-200 dark:border-slate-700 space-y-2">
              <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Upload Custom H&amp;S Manual</p>
              <input
                type="file"
                accept=".pdf,application/pdf"
                onChange={(e) => {
                  setHsPdfError(null)
                  setHsPdfFile(e.target.files?.[0] || null)
                }}
                className="block w-full text-sm text-neutral-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 dark:file:bg-brand-900/30 dark:file:text-brand-300 border border-slate-200 dark:border-slate-600 rounded-xl px-2 py-1.5"
              />
              {hsPdfFile && (
                <p className="text-xs text-neutral-500 dark:text-neutral-400">Selected: {hsPdfFile.name}</p>
              )}
              {hsPdfError && (
                <p className="text-xs text-red-600 dark:text-red-400">{hsPdfError}</p>
              )}
              <Button
                type="button"
                size="sm"
                onClick={handleUploadHSManualPdf}
                disabled={!hsPdfFile || hsPdfUploading}
              >
                {hsPdfUploading ? 'Uploading…' : 'Upload PDF'}
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* ========= WSIB Injury Summary Report ========= */}
      <Card padding="lg">
        <CardHeader>WSIB Injury Summary Report</CardHeader>
        <CardDescription>Upload the WSIB Injury Summary Report for this subcontractor, or mark it optional to remove it from compliance scoring.</CardDescription>
        <div className="mt-4 space-y-3">
          <label className="flex items-start gap-3 cursor-pointer group">
            <div className="relative mt-0.5">
              <input
                type="checkbox"
                className="sr-only"
                checked={sub.wsibInjuryReportOptional ?? false}
                disabled={wsibOptionalSaving}
                onChange={(e) => handleToggleWsibOptional(e.target.checked)}
              />
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${sub.wsibInjuryReportOptional
                ? 'bg-brand-600 border-brand-600'
                : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-neutral-800 group-hover:border-brand-400'
                }`}>
                {sub.wsibInjuryReportOptional && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-900 dark:text-white">Make WSIB Injury Summary Report optional</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                When checked, this item is excluded from the prequalification/compliance calculation.
              </p>
            </div>
            {wsibOptionalSaving && (
              <span className="ml-auto text-xs text-neutral-400 animate-pulse">Saving…</span>
            )}
          </label>
          {sub.wsibInjuryReportPath ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-medium">WSIB Injury Summary Report uploaded — {sub.wsibInjuryReportOriginalName}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={() => handleQuickViewSubFile(sub.wsibInjuryReportPath)}>Quick View</Button>
                <Button size="sm" variant="outline" onClick={() => handleDownloadSubFile(sub.wsibInjuryReportPath, sub.wsibInjuryReportOriginalName ?? 'wsib-report.pdf')}>Download</Button>
              </div>
            </div>
          ) : sub.wsibInjuryReportOptional ? (
            <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>WSIB Injury Summary Report marked optional — excluded from prequalification scoring</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>No WSIB Injury Summary Report on file — required for prequalification</span>
            </div>
          )}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-700 space-y-2">
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Upload WSIB Injury Summary Report</p>
            <input
              type="file"
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg"
              onChange={(e) => { setWsibPdfError(null); setWsibPdfFile(e.target.files?.[0] || null) }}
              className="block w-full text-sm text-neutral-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 dark:file:bg-brand-900/30 dark:file:text-brand-300 border border-slate-200 dark:border-slate-600 rounded-xl px-2 py-1.5"
            />
            {wsibPdfError && <p className="text-xs text-red-600 dark:text-red-400">{wsibPdfError}</p>}
            <Button type="button" size="sm" onClick={handleUploadWsibPdf} disabled={!wsibPdfFile || wsibPdfUploading}>
              {wsibPdfUploading ? 'Uploading…' : 'Upload'}
            </Button>
          </div>
        </div>
      </Card>

      {/* ========= HR Safety Agreement ========= */}
      <Card padding="lg">
        <CardHeader>Sub-Contractor H&amp;R Safety Agreement</CardHeader>
        <CardDescription>Upload the signed H&amp;R Safety Agreement for this subcontractor. Required for prequalification.</CardDescription>
        <div className="mt-4 space-y-3">
          {sub.hrSafetyAgreementPath ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-medium">HR Safety Agreement uploaded — {sub.hrSafetyAgreementOriginalName}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={() => handleQuickViewSubFile(sub.hrSafetyAgreementPath)}>Quick View</Button>
                <Button size="sm" variant="outline" onClick={() => handleDownloadSubFile(sub.hrSafetyAgreementPath, sub.hrSafetyAgreementOriginalName ?? 'hr-safety.pdf')}>Download</Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>No HR Safety Agreement on file — required for prequalification</span>
            </div>
          )}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-700 space-y-2">
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Upload HR Safety Agreement</p>
            <input
              type="file"
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg"
              onChange={(e) => { setHrPdfError(null); setHrPdfFile(e.target.files?.[0] || null) }}
              className="block w-full text-sm text-neutral-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 dark:file:bg-brand-900/30 dark:file:text-brand-300 border border-slate-200 dark:border-slate-600 rounded-xl px-2 py-1.5"
            />
            {hrPdfError && <p className="text-xs text-red-600 dark:text-red-400">{hrPdfError}</p>}
            <Button type="button" size="sm" onClick={handleUploadHrPdf} disabled={!hrPdfFile || hrPdfUploading}>
              {hrPdfUploading ? 'Uploading…' : 'Upload'}
            </Button>
          </div>
        </div>
      </Card>

      {/* ========= FORM 1000 ========= */}
      <Card padding="lg">
        <CardHeader>FORM 1000</CardHeader>
        <CardDescription>
          {sub.form1000Optional
            ? 'FORM 1000 is marked optional and excluded from prequalification/compliance. You can still upload a file for records.'
            : 'Upload the FORM 1000 for this subcontractor. Required for prequalification.'}
        </CardDescription>
        <div className="mt-4 space-y-3">
          <label className="flex items-start gap-3 cursor-pointer group">
            <div className="relative mt-0.5">
              <input
                type="checkbox"
                className="sr-only"
                checked={sub.form1000Optional ?? false}
                disabled={form1000OptionalSaving}
                onChange={(e) => handleToggleForm1000Optional(e.target.checked)}
              />
              <div
                className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                  sub.form1000Optional
                    ? 'bg-brand-600 border-brand-600'
                    : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-neutral-800 group-hover:border-brand-400'
                }`}
              >
                {sub.form1000Optional && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-900 dark:text-white">Make FORM 1000 optional</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                When checked, FORM 1000 is excluded from the prequalification/compliance calculation.
              </p>
            </div>
            {form1000OptionalSaving && (
              <span className="ml-auto text-xs text-neutral-400 animate-pulse">Saving…</span>
            )}
          </label>
          {sub.form1000Optional && !sub.form1000Path && (
            <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 -mt-1">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>FORM 1000 marked optional — excluded from prequalification scoring</span>
            </div>
          )}
          {sub.form1000Path ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-medium">FORM 1000 uploaded — {sub.form1000OriginalName}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={() => handleQuickViewSubFile(sub.form1000Path)}>Quick View</Button>
                <Button size="sm" variant="outline" onClick={() => handleDownloadSubFile(sub.form1000Path, sub.form1000OriginalName ?? 'form-1000.pdf')}>Download</Button>
              </div>
            </div>
          ) : !sub.form1000Optional ? (
            <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>No FORM 1000 on file — required for prequalification</span>
            </div>
          ) : null}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-700 space-y-2">
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Upload FORM 1000</p>
            <input
              type="file"
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg"
              onChange={(e) => { setForm1000PdfError(null); setForm1000PdfFile(e.target.files?.[0] || null) }}
              className="block w-full text-sm text-neutral-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 dark:file:bg-brand-900/30 dark:file:text-brand-300 border border-slate-200 dark:border-slate-600 rounded-xl px-2 py-1.5"
            />
            {form1000PdfError && <p className="text-xs text-red-600 dark:text-red-400">{form1000PdfError}</p>}
            <Button type="button" size="sm" onClick={handleUploadForm1000Pdf} disabled={!form1000PdfFile || form1000PdfUploading}>
              {form1000PdfUploading ? 'Uploading…' : 'Upload'}
            </Button>
          </div>
        </div>
      </Card>

      <Card padding="lg">
        <CardHeader>Safety Certifications Held by Company</CardHeader>
        <CardDescription>Safety certifications for this subcontractor company, e.g. COR, ISO 45001.</CardDescription>
        <div className="mt-4 space-y-4">
          {certs.length === 0 && !isEditing ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">No certifications on file.</p>
          ) : (
            <ul className="space-y-3">
              {certs.map((c) => {
                const isEditingThisCert = editingCertId === c.id
                return (
                  <li key={c.id} className="rounded-xl border border-slate-200 dark:border-slate-600 bg-neutral-50/50 dark:bg-neutral-800/50 p-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    {isEditingThisCert ? (
                      <div className="flex flex-wrap items-end gap-3 w-full">
                        <Input label="Certification" value={certForm.name} onChange={(e) => setCertForm((f) => ({ ...f, name: e.target.value }))} className="min-w-[150px]" />
                        <Input label="Issued (Optional)" type="date" value={certForm.issuedAt} onChange={(e) => setCertForm((f) => ({ ...f, issuedAt: e.target.value }))} />
                        <Input label="Expires" type="date" value={certForm.expiresAt} onChange={(e) => setCertForm((f) => ({ ...f, expiresAt: e.target.value }))} />
                        <div className="flex gap-2 mt-2 sm:mt-0">
                          <Button size="sm" onClick={() => handleSaveCert(c.id)} disabled={!certForm.name.trim() || !certForm.expiresAt}>Save</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingCertId(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-neutral-900 dark:text-white flex items-center gap-2">
                            {c.name}
                            <Badge variant={c.status === 'expired' ? 'danger' : c.status === 'expiring-soon' ? 'warning' : 'success'}>
                              {c.status === 'expired' ? 'Expired' : c.status === 'expiring-soon' ? 'Expiring soon' : 'Current'}
                            </Badge>
                          </p>
                          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                            Issued: {c.issuedAt} · Expires: {c.expiresAt}
                          </p>
                          {(c as any).filePath && (
                            <div className="mt-2 flex items-center gap-2">
                              <Button size="sm" variant="outline" onClick={() => handleQuickViewSubFile((c as any).filePath)}>Quick View</Button>
                              <Button size="sm" variant="outline" onClick={() => handleDownloadSubFile((c as any).filePath, `${c.name}.pdf`)}>Download</Button>
                            </div>
                          )}
                        </div>
                        {isEditing && (
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => { setEditingCertId(c.id); setCertForm({ name: c.name, issuedAt: c.issuedAt, expiresAt: c.expiresAt }) }}>Edit</Button>
                            <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300" onClick={() => handleRemoveCert(c.id)}>Remove</Button>
                          </div>
                        )}
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {isEditing && (
            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-600">
              <h4 className="text-sm font-medium text-neutral-900 dark:text-white mb-3">Add Certification</h4>
              <div className="flex flex-wrap items-end gap-3">
                <Input label="Certification Name" placeholder="e.g. ISO 9001" value={newCert.name} onChange={(e) => setNewCert((f) => ({ ...f, name: e.target.value }))} className="min-w-[150px]" />
                <Input label="Issued (Optional)" type="date" value={newCert.issuedAt} onChange={(e) => setNewCert((f) => ({ ...f, issuedAt: e.target.value }))} />
                <Input label="Expires" type="date" value={newCert.expiresAt} onChange={(e) => setNewCert((f) => ({ ...f, expiresAt: e.target.value }))} />
                <label className="flex flex-col gap-1.5 min-w-[200px]">
                  <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">File (optional)</span>
                  <input
                    type="file"
                    accept=".pdf,image/png,image/jpeg,image/jpg"
                    onChange={(e) => setNewCertPdfFile(e.target.files?.[0] || null)}
                    className="block w-full text-sm text-neutral-500
                      file:mr-3 file:py-1.5 file:px-3
                      file:rounded-md file:border-0
                      file:text-sm file:font-medium
                      file:bg-brand-50 file:text-brand-700
                      hover:file:bg-brand-100 dark:file:bg-brand-900/30 dark:file:text-brand-300
                      border border-slate-200 dark:border-slate-600 rounded-xl px-2 py-1.5"
                  />
                </label>
                <Button onClick={handleAddCert} disabled={!newCert.name.trim() || !newCert.expiresAt}>
                  Add Certification
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card padding="lg">
        <CardHeader>Contractor Personnel</CardHeader>
        <CardDescription>People who work for this contractor. Supervisors listed first; open all people to see everyone. Add workers here, then assign them to jobs below.</CardDescription>
        {(() => {
          const subPersonnel = personnel.filter((p) => p.subcontractorId === sub.id)
          const supervisors = subPersonnel.filter((p) => p.isSupervisor)
          const nonSupervisors = subPersonnel.filter((p) => !p.isSupervisor)
          const displayList = showAllPersonnel ? subPersonnel : supervisors.length > 0 ? supervisors : subPersonnel
          return (
            <div className="mt-4 space-y-4">
              {subPersonnel.length === 0 && !isEditing && (
                <p className="text-sm text-neutral-500 dark:text-neutral-400">No personnel added yet.</p>
              )}
              {subPersonnel.length > 0 && (supervisors.length > 0 || nonSupervisors.length > 0) && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setShowAllPersonnel((v) => !v)}
                  >
                    {showAllPersonnel ? 'Show supervisors only' : 'View all people'}
                  </Button>
                  {!showAllPersonnel && nonSupervisors.length > 0 && (
                    <span className="text-sm text-neutral-500 dark:text-neutral-400">
                      (+ {nonSupervisors.length} other{nonSupervisors.length !== 1 ? 's' : ''})
                    </span>
                  )}
                </div>
              )}
              <ul className="space-y-3">
                {displayList.map((p) => {
                  const personCerts = personnelCertifications.filter((c) => c.personnelId === p.id)
                  const isEditingThis = editingPersonnelId === p.id
                  const isAddingCert = addingCertForPersonnelId === p.id
                  return (
                    <li key={p.id} className="rounded-xl border border-slate-200 dark:border-slate-600 bg-neutral-50/50 dark:bg-neutral-800/50 p-3">
                      {isEditingThis ? (
                        <div className="flex flex-wrap items-end gap-3">
                          <Input label="Name" value={personnelForm.name} onChange={(e) => setPersonnelForm((f) => ({ ...f, name: e.target.value }))} className="min-w-[150px]" />
                          <Input label="Email" type="email" value={personnelForm.email} onChange={(e) => setPersonnelForm((f) => ({ ...f, email: e.target.value }))} className="min-w-[180px]" />
                          <Input label="Site Orientation Date" type="datetime-local" value={personnelForm.orientationCompletedAt ? personnelForm.orientationCompletedAt.slice(0, 16) : ''} onChange={(e) => setPersonnelForm((f) => ({ ...f, orientationCompletedAt: e.target.value ? new Date(e.target.value).toISOString() : '' }))} />
                          <Input label="Site Orientation Location" type="text" value={personnelForm.orientationLocation} onChange={(e) => setPersonnelForm((f) => ({ ...f, orientationLocation: e.target.value }))} placeholder="e.g. Main Office" />
                          <Button size="sm" onClick={() => handleSavePersonnel(p.id)}>Save</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingPersonnelId(null)}>Cancel</Button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <span className="font-medium text-neutral-900 dark:text-white">{p.name}</span>
                            {p.isSupervisor && <Badge variant="default" className="ml-2 text-xs">Supervisor</Badge>}
                            {p.email && <p className="text-xs text-neutral-500 dark:text-neutral-400">{p.email}</p>}
                            <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                              Site Orientation:{' '}
                              {p.orientationCompletedAt ? <span className="font-medium text-green-700 dark:text-green-400">Completed {new Date(p.orientationCompletedAt).toLocaleDateString()}{p.orientationLocation ? ` at ${p.orientationLocation}` : ''}</span> : 'Not completed'}
                            </p>
                            {personCerts.length > 0 && (
                              <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                                Certifications:{' '}
                                {personCerts.map((c) => (
                                  <span key={c.id} className="inline-flex items-center gap-1 mr-2">
                                    <span>{c.name}</span>
                                    {isEditing && (
                                      <button type="button" onClick={() => handleRemovePersonnelCert(p.id, c.id)} className="text-red-600 dark:text-red-400 hover:underline" aria-label={`Remove ${c.name}`}>
                                        Remove
                                      </button>
                                    )}
                                  </span>
                                ))}
                              </p>
                            )}
                          </div>
                          <div className="flex gap-2 flex-wrap items-center">
                            <Link to={`/subcontractors/${sub.id}/personnel/${p.id}`}>
                              <Button size="sm" variant="outline">Manage Certificates</Button>
                            </Link>
                            <select
                              value={p.status || 'active'}
                              onChange={(e) => handleUpdatePersonnelStatus(p.id, e.target.value)}
                              className="text-xs px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 focus:ring-1 focus:ring-brand-500 focus:border-brand-500"
                            >
                              <option value="active">Active</option>
                              <option value="on-leave">On Leave</option>
                              <option value="inactive">Inactive</option>
                              <option value="terminated">Terminated</option>
                            </select>
                            {isEditing && (
                              <>
                                <Button size="sm" variant="outline" onClick={() => { setEditingPersonnelId(p.id); setPersonnelForm({ name: p.name, email: p.email ?? '', orientationCompletedAt: p.orientationCompletedAt ?? '', orientationLocation: p.orientationLocation ?? '' }) }}>Edit</Button>
                                <Button size="sm" variant="ghost" onClick={() => handleRemovePersonnel(p.id)}>Remove</Button>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                      {isEditing && !isEditingThis && (
                        <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-600">
                          {!isAddingCert ? (
                            <Button size="sm" variant="secondary" onClick={() => setAddingCertForPersonnelId(p.id)}>Add Certification for This Person</Button>
                          ) : (
                            <div className="flex flex-wrap items-end gap-2">
                              <Input label="Certification" value={newPersonnelCert.name} onChange={(e) => setNewPersonnelCert((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Working at Heights" className="min-w-[160px]" />
                              <Input label="Issued (Optional)" type="date" value={newPersonnelCert.issuedAt} onChange={(e) => setNewPersonnelCert((f) => ({ ...f, issuedAt: e.target.value }))} />
                              <Input label="Expires" type="date" value={newPersonnelCert.expiresAt} onChange={(e) => setNewPersonnelCert((f) => ({ ...f, expiresAt: e.target.value }))} />
                              <Button size="sm" onClick={() => handleAddPersonnelCert(p.id)} disabled={!newPersonnelCert.name.trim() || !newPersonnelCert.expiresAt}>Save</Button>
                              <Button size="sm" variant="ghost" onClick={() => { setAddingCertForPersonnelId(null); setNewPersonnelCert({ name: '', issuedAt: '', expiresAt: '' }) }}>Cancel</Button>
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
              {isEditing && (
                <div className="pt-4 border-t border-slate-200 dark:border-slate-600 flex flex-wrap items-end gap-3">
                  <Input label="Name" value={newPersonnel.name} onChange={(e) => setNewPersonnel((f) => ({ ...f, name: e.target.value }))} placeholder="Full name" className="min-w-[180px]" />
                  <Input label="Email" type="email" value={newPersonnel.email} onChange={(e) => setNewPersonnel((f) => ({ ...f, email: e.target.value }))} placeholder="Optional" className="min-w-[200px]" />
                  <Button onClick={handleAddPersonnel} disabled={!newPersonnel.name.trim()}>Add Person</Button>
                </div>
              )}
            </div>
          )
        })()}
      </Card>

      <Card padding="lg">
        <CardHeader>Jobs Assigned</CardHeader>
        <CardDescription>Jobs/sites this subcontractor is assigned to.</CardDescription>
        {displayJobs.length === 0 && !isEditing ? (
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">No jobs assigned.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {displayJobs.map((j) => (
              <li key={j.id} className="flex items-center justify-between gap-2">
                <div>
                  <Link
                    to={`/jobs/${j.id}`}
                    className="text-brand-600 dark:text-brand-400 hover:underline font-medium"
                  >
                    {j.title}
                  </Link>
                  <span className="text-neutral-500 dark:text-neutral-400 ml-2">— {j.siteName}</span>
                </div>
                {isEditing && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeJobAssignment(jobAssignmentsForSub.find((a) => a.jobId === j.id)!.id)}
                  >
                    Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {isEditing && availableJobs.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-600 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Assign to Job</span>
              <select
                id="assign-job-select"
                className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white min-w-[220px]"
                onChange={(e) => {
                  const jobId = e.target.value
                  if (!jobId) return
                  addJobAssignment({
                    jobId,
                    subcontractorId: sub.id,
                    assignedBy: user?.name ?? 'Unknown',
                    assignedAt: new Date().toISOString().slice(0, 10),
                  })
                  e.target.value = ''
                }}
              >
                <option value="">Select a job…</option>
                {availableJobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title} — {j.siteName}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </Card>

      <Card padding="lg">
        <CardHeader>Workforce by Job</CardHeader>
        <CardDescription>
          Contractor personnel on each job, who is on site today, and each person&apos;s certifications. Add people to a job or remove them when editing.
        </CardDescription>
        {displayJobs.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">No jobs assigned — assign a job above to see personnel here.</p>
        ) : (
          <div className="mt-4 space-y-6">
            {displayJobs.map((j) => {
              const assignmentIdsOnJob = personnelJobAssignments.filter((a) => a.jobId === j.id).map((a) => a.personnelId)
              const personnelOnJob = personnel.filter((p) => p.subcontractorId === sub.id && assignmentIdsOnJob.includes(p.id))
              const subPersonnelNotOnJob = personnel.filter((p) => p.subcontractorId === sub.id && !assignmentIdsOnJob.includes(p.id))
              const today = new Date().toISOString().slice(0, 10)
              const onSiteCount = personnelOnJob.filter((p) => {
                const todayCheckIns = personnelCheckIns.filter((c) => c.personnelId === p.id && c.jobId === j.id && c.date === today)
                const latestCheckIn = todayCheckIns[todayCheckIns.length - 1]
                return latestCheckIn?.checkedInAt && !latestCheckIn?.checkedOutAt
              }).length
              return (
                <div key={j.id} className="rounded-xl border border-slate-200 dark:border-slate-600 bg-neutral-50/50 dark:bg-neutral-800/50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <Link to={`/jobs/${j.id}`} className="font-semibold text-brand-600 dark:text-brand-400 hover:underline">
                      {j.title}
                    </Link>
                    <span className="text-sm text-neutral-500 dark:text-neutral-400">
                      {j.siteName} · {personnelOnJob.length} worker{personnelOnJob.length !== 1 ? 's' : ''} · {onSiteCount} on site today
                    </span>
                  </div>
                  <ul className="space-y-3">
                    {personnelOnJob.map((p) => {
                      const allCheckIns = personnelCheckIns.filter((c) => c.personnelId === p.id && c.jobId === j.id)
                      const todayCheckIns = allCheckIns.filter((c) => c.date === today)
                      const priorCheckIns = allCheckIns.filter((c) => c.date !== today)
                      // Sort ascending by check in time
                      todayCheckIns.sort((a, b) => new Date(a.checkedInAt || '').getTime() - new Date(b.checkedInAt || '').getTime())
                      priorCheckIns.sort((a, b) => {
                        const dateCompare = b.date.localeCompare(a.date)
                        if (dateCompare !== 0) return dateCompare
                        return new Date(a.checkedInAt || '').getTime() - new Date(b.checkedInAt || '').getTime()
                      })
                      const latestCheckIn = todayCheckIns[todayCheckIns.length - 1]
                      const isOnSite = !!(latestCheckIn?.checkedInAt && !latestCheckIn?.checkedOutAt)
                      const personCerts = personnelCertifications.filter((c) => c.personnelId === p.id)
                      const assignmentId = personnelJobAssignments.find((a) => a.jobId === j.id && a.personnelId === p.id)?.id

                      const formatCheckIn = (c: typeof allCheckIns[0]) => {
                        const dateStr = new Date(c.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                        const inT = c.checkedInAt ? new Date(c.checkedInAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true }) : null
                        const outT = c.checkedOutAt ? new Date(c.checkedOutAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true }) : null
                        return { dateStr, inT, outT }
                      }

                      return (
                        <li key={p.id} className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 pl-3 border-l-2 border-slate-200 dark:border-slate-600">
                          <div className="min-w-0 flex-1">
                            <span className="font-medium text-neutral-900 dark:text-white">{p.name}</span>
                            {p.email && (
                              <p className="text-xs text-neutral-500 dark:text-neutral-400">{p.email}</p>
                            )}
                            <div className="mt-1 flex flex-col items-start gap-1">
                              {todayCheckIns.map((c, i) => {
                                const { dateStr, inT, outT } = formatCheckIn(c)
                                return (
                                  <div key={c.id || i} className="flex items-center gap-2 text-xs">
                                    <Badge variant={c.checkedOutAt ? "default" : "success"}>
                                      {c.checkedOutAt ? "Checked out" : "On site"}
                                    </Badge>
                                    <span className="text-neutral-600 dark:text-neutral-400">
                                      {dateStr} — {inT ? `In ${inT}` : ''} {outT ? `· Out ${outT}` : ''}
                                    </span>
                                  </div>
                                )
                              })}

                              {priorCheckIns.length > 0 && (
                                <details className="mt-1 w-full">
                                  <summary className="cursor-pointer text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline select-none">
                                    Prior Check-Ins ({priorCheckIns.length})
                                  </summary>
                                  <div className="mt-1 ml-2 space-y-0.5 border-l border-slate-300 dark:border-slate-600 pl-2">
                                    {priorCheckIns.map((c, i) => {
                                      const { dateStr, inT, outT } = formatCheckIn(c)
                                      return (
                                        <div key={c.id || `prior-${i}`} className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                                          <span>{dateStr} — {inT ? `In ${inT}` : ''} {outT ? `· Out ${outT}` : ''}</span>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </details>
                              )}

                              <div className="flex items-center gap-2 mt-1">
                                {isOnSite ? (
                                  <Button size="sm" variant="outline" onClick={() => apiCheckOutSubcontractorPersonnel(sub.id, p.id, j.id, today)} className="h-6 text-xs px-2 py-0">Mark Off Site</Button>
                                ) : (
                                  <Button size="sm" variant="outline" onClick={() => apiCheckInSubcontractorPersonnel(sub.id, p.id, j.id, today)} className="h-6 text-xs px-2 py-0">Mark On Site</Button>
                                )}
                              </div>
                            </div>
                            {personCerts.length > 0 && (
                              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                                <span className="font-medium">Certifications:</span>{' '}
                                {personCerts.map((c) => (
                                  <span key={c.id} className="inline-flex items-center gap-1 mr-2 mt-1">
                                    <span>{c.name}</span>
                                    <Badge
                                      variant={c.status === 'expired' ? 'danger' : c.status === 'expiring-soon' ? 'warning' : 'success'}
                                      className="text-xs"
                                    >
                                      {c.status === 'expired' ? 'Expired' : c.status === 'expiring-soon' ? 'Expiring soon' : 'Current'}
                                    </Badge>
                                  </span>
                                ))}
                              </p>
                            )}
                          </div>
                          {isEditing && assignmentId && (
                            <Button size="sm" variant="ghost" onClick={() => handleRemovePersonnelJob(p.id, assignmentId)} className="shrink-0">
                              Remove from job
                            </Button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                  {isEditing && subPersonnelNotOnJob.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-600">
                      <label className="flex flex-col gap-1.5 sm:flex-row sm:items-center gap-2">
                        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Add Person to This Job</span>
                        <select
                          className="min-h-[36px] px-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white min-w-[200px] text-sm"
                          onChange={(e) => {
                            const personnelId = e.target.value
                            if (!personnelId) return
                            handleAddPersonnelJob(personnelId, j.id)
                            e.target.value = ''
                          }}
                        >
                          <option value="">Select person…</option>
                          {subPersonnelNotOnJob.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}{p.email ? ` (${p.email})` : ''}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {!isEditing && (
        <Card padding="lg">
          <CardHeader>Profile Actions</CardHeader>
          <CardDescription>Deactivate or remove this subcontractor profile permanently.</CardDescription>
          <div className="mt-4 flex flex-wrap gap-3">
            {sub.status === 'active' && (
              <Button variant="outline" size="sm" onClick={handleDeactivateProfile}>
                Mark as Inactive
              </Button>
            )}
            <Button variant="danger" size="sm" onClick={() => setShowDeleteConfirm(true)} disabled={deletingProfile}>
              Delete Subcontractor Profile
            </Button>
          </div>
        </Card>
      )}

      {injuries.length > 0 && (
        <Card padding="lg">
          <CardHeader>Injury Reports</CardHeader>
          <CardDescription>Injuries involving this subcontractor.</CardDescription>
          <ul className="mt-4 space-y-2">
            {injuries.map((r) => (
              <li key={r.id}>
                <Link
                  to={`/injury-reports/${r.id}`}
                  className="text-brand-600 dark:text-brand-400 hover:underline font-medium"
                >
                  {r.siteName} · {r.reportedAt?.slice(0, 10)}
                </Link>
                <span className="ml-2">
                  <Badge variant={r.severity === 'major' ? 'danger' : 'warning'}>{r.severity}</Badge>
                  <span className="text-neutral-500 dark:text-neutral-400 ml-1">{r.status}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 dark:bg-black/60 animate-fade-in"
          onClick={() => !deletingProfile && setShowDeleteConfirm(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-subcontractor-title"
        >
          <Card padding="lg" className="max-w-md w-full shadow-xl animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <h2 id="delete-subcontractor-title" className="font-display font-bold text-xl text-neutral-900 dark:text-white">Delete Subcontractor Profile?</h2>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
              Are you sure you want to delete this profile? Once deleted all information will be removed permanently.
            </p>
            <div className="mt-6 flex gap-3 justify-end">
              <Button type="button" variant="ghost" onClick={() => setShowDeleteConfirm(false)} disabled={deletingProfile}>Cancel</Button>
              <Button type="button" variant="danger" onClick={handleDeleteProfile} disabled={deletingProfile}>
                {deletingProfile ? 'Deleting…' : 'Delete Profile'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
