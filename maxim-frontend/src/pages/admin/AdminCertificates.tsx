import { useState, useMemo, useRef, useEffect } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Link, useSearchParams } from 'react-router-dom'
import { useUser } from '@/contexts/UserContext'
import { useCertificates } from '@/contexts/CertificatesContext'
import { useSubcontractors } from '@/contexts/SubcontractorsContext'
import { useEmployees } from '@/contexts/EmployeesContext'
import { pdfDataUrlToImageDataUrls } from '@/utils/pdfToImages'
import * as certificateApi from '@/api/certificates'
import { fetchSubcontractorDetail } from '@/api/subcontractors'
import { downloadBlob, quickViewBlob } from '@/utils/fileActions'
import { downloadCertificatesExcel, type CertificateExportMode } from '@/utils/exportCertificatesExcel'
import { CourseNameSelect } from '@/components/training/CourseNameSelect'
import { ManageTrainingCoursesModal } from '@/components/training/ManageTrainingCoursesModal'
import { PRIMARY_TRAINING_CERTIFICATE_TYPES } from '@/constants/trainingCertificates'
import * as trainingCourseApi from '@/api/trainingCourseTypes'
import type { TrainingCourseType } from '@/api/trainingCourseTypes'
import type { Certificate } from '@/types'

type CertSortKey = 'name' | 'holderName' | 'expirationDate' | 'status'
type SortDir = 'asc' | 'desc'
type StatusFilter = 'all' | 'current' | 'expiry-60' | 'expiry-30' | 'expired'

import { getExpiryBucket } from '@/utils/certificateExpiry'

const EXPIRING_DAYS = 30
const EXPIRING_60_DAYS = 60

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function getExpirationStatus(expirationDate?: string): 'current' | 'expiring-soon' | 'expired' {
  const bucket = getExpiryBucket(expirationDate)
  if (bucket === 'expired') return 'expired'
  if (bucket === 'expiry-30') return 'expiring-soon'
  return 'current'
}

function clampExpirationDate(value: string): string {
  if (!value || value.length < 10) return value
  const year = value.slice(0, 4)
  if (year.length > 4) return value.slice(0, 10)
  const y = parseInt(year, 10)
  if (y > 9999) return '9999' + value.slice(4)
  return value.slice(0, 10)
}

const CHART_COLORS = { 'Expiry 60 days': '#facc15', 'Expiry 30 days': '#fb923c', 'Expired': '#f87171', 'Current': '#4ade80' }

export function AdminCertificates() {
  const [searchParams] = useSearchParams()
  const { user } = useUser()
  const canManageCertificates = user?.role === 'owner' || user?.role === 'hr'
  const { certificates, addCertificate, updateCertificate, removeCertificate, refetch } = useCertificates()
  const { subcontractors, certifications: subCerts, personnel, personnelCertifications } = useSubcontractors()
  const { employees } = useEmployees()
  const appUsers = useMemo(() => employees.map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}` })).sort((a, b) => a.name.localeCompare(b.name)), [employees])
  const [showUpload, setShowUpload] = useState(false)
  const uploadFormRef = useRef<HTMLDivElement>(null)

  const employeeListRef = useRef<HTMLDivElement>(null)
  const subcontractorListRef = useRef<HTMLDivElement>(null)
  const insuranceListRef = useRef<HTMLDivElement>(null)
  const [insuranceRows, setInsuranceRows] = useState<Array<{
    id: string
    subcontractorId: string
    subcontractorName: string
    insuranceType: string
    policyNumber: string
    expirationDate: string
    statusBucket: 'current' | 'expiry-30' | 'expired'
  }>>([])
  const [insuranceCompanyFilter, setInsuranceCompanyFilter] = useState<string>('all')
  const [courseCatalog, setCourseCatalog] = useState<TrainingCourseType[]>([])
  const [showManageCourses, setShowManageCourses] = useState(false)

  const refreshCourseCatalog = async () => {
    try {
      const list = await trainingCourseApi.fetchTrainingCourseTypes({ includeInactive: false })
      setCourseCatalog(list)
    } catch {
      /* dropdown falls back to seeded constants */
    }
  }

  useEffect(() => {
    void refreshCourseCatalog()
  }, [])

  const primaryCourseNames = useMemo(() => {
    const primary = courseCatalog.filter((c) => c.isPrimary).map((c) => c.name)
    return primary.length > 0 ? primary : [...PRIMARY_TRAINING_CERTIFICATE_TYPES]
  }, [courseCatalog])

  const primaryNameKeys = useMemo(
    () => new Set(primaryCourseNames.map((n) => n.trim().toLowerCase())),
    [primaryCourseNames],
  )

  // `react-to-print` is an optional dependency in this environment. For local dev
  // (and to keep the admin page usable), we fall back to printing the referenced
  // DOM content via a temporary window.
  const printSectionAsHtml = (ref: React.RefObject<HTMLDivElement>, title: string) => {
    if (!ref.current) return
    const html = `<!doctype html><html><head><title>${title}</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 2rem; max-width: 900px; margin: 0 auto; color: #111; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid #e2e8f0; font-size: 0.875rem; }
  th { font-weight: 600; color: #475569; }
  .no-print { display: none !important; }
  h3, h4 { margin: 0.5rem 0; }
  a { color: inherit; text-decoration: none; }
</style></head><body>${ref.current.innerHTML}</body></html>`
    const iframe = document.createElement('iframe')
    iframe.setAttribute('title', title)
    iframe.style.position = 'absolute'
    iframe.style.left = '-9999px'
    iframe.style.top = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = 'none'
    document.body.appendChild(iframe)
    const doc = iframe.contentWindow?.document
    if (!doc) { document.body.removeChild(iframe); return }
    doc.open()
    doc.write(html)
    doc.close()
    let printed = false
    const doPrint = () => {
      if (printed) return
      printed = true
      try { iframe.contentWindow?.focus(); iframe.contentWindow?.print() } catch {}
      setTimeout(() => { if (iframe.parentNode) document.body.removeChild(iframe) }, 12000)
    }
    iframe.onload = doPrint
    // Fallback if onload already fired (some browsers)
    setTimeout(doPrint, 500)
  }

  const handlePrintEmployees = () => printSectionAsHtml(employeeListRef, 'Our Employees Certificates')
  const handlePrintSubcontractors = () => printSectionAsHtml(subcontractorListRef, 'Subcontractors Certificates')
  const handlePrintInsurance = () => printSectionAsHtml(insuranceListRef, 'Subcontractor Insurance')

  const exportEmployees = useMemo(() => {
    const activeEmployees = employees
      .filter((e) => e.status !== 'terminated')
      .map((e) => ({
        id: e.id,
        name: `${e.firstName} ${e.lastName}`.trim(),
      }))
    const knownIds = new Set(activeEmployees.map((e) => e.id).filter(Boolean))
    const knownNames = new Set(activeEmployees.map((e) => e.name.toLowerCase()))
    const orphanHolders = certificates
      .filter((c) => {
        const name = c.holderName.trim()
        if (!name) return false
        if (c.holderUserId && knownIds.has(c.holderUserId)) return false
        return !knownNames.has(name.toLowerCase())
      })
      .map((c) => ({
        id: c.holderUserId,
        name: c.holderName.trim(),
      }))
    const uniqueOrphans = orphanHolders.filter(
      (h, i, arr) =>
        arr.findIndex(
          (x) => (h.id && x.id === h.id) || x.name.toLowerCase() === h.name.toLowerCase(),
        ) === i,
    )
    return [...activeEmployees, ...uniqueOrphans]
  }, [employees, certificates])

  const additionalCourseNames = useMemo(
    () =>
      [...new Set(certificates.map((c) => c.name.trim()).filter(Boolean))].filter(
        (n) => !primaryNameKeys.has(n.toLowerCase()),
      ),
    [certificates, primaryNameKeys],
  )

  const handleExportCertificatesExcel = (mode: CertificateExportMode) => {
    void downloadCertificatesExcel({
      certificates,
      employees: exportEmployees,
      mode,
      primaryTypes: primaryCourseNames,
    })
  }

  useEffect(() => {
    if (!canManageCertificates) return
    let cancelled = false
    certificateApi.reconcileCertificateLinks()
      .then((result) => {
        if (cancelled) return
        if (Array.isArray(result?.certificates)) {
          void refetch()
        }
      })
      .catch(() => {
        /* list still loads via CertificatesContext */
      })
    return () => {
      cancelled = true
    }
  }, [refetch, canManageCertificates])

  useEffect(() => {
    if (showUpload && uploadFormRef.current) {
      uploadFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [showUpload])

  useEffect(() => {
    if (searchParams.get('section') === 'subcontractor-insurance') {
      insuranceListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [searchParams])

  useEffect(() => {
    let cancelled = false
    const loadInsuranceRows = async () => {
      if (subcontractors.length === 0) {
        setInsuranceRows([])
        return
      }
      const details = await Promise.all(
        subcontractors.map(async (s: any) => {
          try {
            const d = await fetchSubcontractorDetail(s.id)
            return { id: s.id, companyName: s.companyName, insurances: Array.isArray((d as any)?.insurances) ? (d as any).insurances : [] }
          } catch {
            return { id: s.id, companyName: s.companyName, insurances: [] }
          }
        })
      )
      const today = new Date().toISOString().slice(0, 10)
      const in30 = new Date(Date.now() + EXPIRING_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      const rows = details.flatMap((s) =>
        s.insurances
          .filter((i: any) => !!i?.expiresAt)
          .map((i: any) => {
            const expires = String(i.expiresAt).slice(0, 10)
            const statusBucket: 'current' | 'expiry-30' | 'expired' =
              expires < today ? 'expired' : expires <= in30 ? 'expiry-30' : 'current'
            return {
              id: i.id ?? `${s.id}-${i.type}-${i.policyNumber ?? expires}`,
              subcontractorId: s.id,
              subcontractorName: s.companyName,
              insuranceType: i.type || 'Insurance',
              policyNumber: i.policyNumber || '—',
              expirationDate: expires,
              statusBucket,
            }
          })
      ).sort((a, b) => a.expirationDate.localeCompare(b.expirationDate))
      if (!cancelled) setInsuranceRows(rows)
    }
    loadInsuranceRows()
    return () => { cancelled = true }
  }, [subcontractors])

  const employeeCerts = useMemo(() => certificates.filter(c => c.holderUserId != null), [certificates])
  const [subCertCompanyFilter, setSubCertCompanyFilter] = useState<string>('all')

  const subCertsMapped = useMemo(() => {
    const list: any[] = []
    
    subCerts.forEach(c => {
      const sub = subcontractors.find(s => s.id === c.subcontractorId)
      if (!c.expiresAt) return
      list.push({
        id: c.id,
        name: c.name,
        holderName: sub ? sub.companyName : 'Unknown Company',
        holderUserId: undefined,
        expirationDate: c.expiresAt.slice(0, 10),
        uploadedAt: c.issuedAt || new Date().toISOString(),
        uploadedBy: 'Subcontractor',
        statusBucket: getExpiryBucket(c.expiresAt.slice(0, 10)),
        subcontractorId: c.subcontractorId,
        subcontractorName: sub?.companyName || 'Unknown Company',
        isCompany: true
      })
    })

    personnelCertifications.forEach(c => {
      const p = personnel.find(x => x.id === c.personnelId)
      const sub = subcontractors.find(s => s.id === p?.subcontractorId)
      if (!c.expiresAt) return
      list.push({
        id: c.id,
        name: c.name,
        holderName: p ? p.name : 'Unknown Person',
        holderUserId: undefined, 
        expirationDate: c.expiresAt.slice(0, 10),
        uploadedAt: c.issuedAt || new Date().toISOString(),
        uploadedBy: 'Subcontractor',
        statusBucket: getExpiryBucket(c.expiresAt.slice(0, 10)),
        subcontractorId: sub?.id || '',
        subcontractorName: sub?.companyName || 'Unknown Company',
        isCompany: false
      })
    })

    return list
  }, [subCerts, personnelCertifications, subcontractors, personnel])

  const employeeBuckets = useMemo(() => {
    const expiry60 = employeeCerts.filter((c) => getExpiryBucket(c.expirationDate) === 'expiry-60').length
    const expiry30 = employeeCerts.filter((c) => getExpiryBucket(c.expirationDate) === 'expiry-30').length
    const expired = employeeCerts.filter((c) => getExpiryBucket(c.expirationDate) === 'expired').length
    return { expiry60, expiry30, expired }
  }, [employeeCerts])

  const subBuckets = useMemo(() => {
    const expiry60 = subCertsMapped.filter((c) => c.statusBucket === 'expiry-60').length
    const expiry30 = subCertsMapped.filter((c) => c.statusBucket === 'expiry-30').length
    const expired = subCertsMapped.filter((c) => c.statusBucket === 'expired').length
    return { expiry60, expiry30, expired }
  }, [subCertsMapped])

  const employeeLineItems = useMemo(() => {
    const expiry60 = employeeCerts.filter((c) => getExpiryBucket(c.expirationDate) === 'expiry-60')
    const expiry30 = employeeCerts.filter((c) => getExpiryBucket(c.expirationDate) === 'expiry-30')
    const expired = employeeCerts.filter((c) => getExpiryBucket(c.expirationDate) === 'expired')
    return { expiry60, expiry30, expired }
  }, [employeeCerts])

  const subLineItems = useMemo(() => {
    const filtered = subCertsMapped.filter(c => subCertCompanyFilter === 'all' || c.subcontractorId === subCertCompanyFilter)
    const expiry60 = filtered.filter((c) => c.statusBucket === 'expiry-60')
    const expiry30 = filtered.filter((c) => c.statusBucket === 'expiry-30')
    const expired = filtered.filter((c) => c.statusBucket === 'expired')
    return { expiry60, expiry30, expired }
  }, [subCertsMapped, subCertCompanyFilter])

  const insuranceItems = useMemo(
    () => insuranceRows.filter((r) => insuranceCompanyFilter === 'all' || r.subcontractorId === insuranceCompanyFilter),
    [insuranceRows, insuranceCompanyFilter]
  )

  const insuranceBuckets = useMemo(() => ({
    current: insuranceItems.filter((i) => i.statusBucket === 'current').length,
    expiry30: insuranceItems.filter((i) => i.statusBucket === 'expiry-30').length,
    expired: insuranceItems.filter((i) => i.statusBucket === 'expired').length,
  }), [insuranceItems])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [holderName, setHolderName] = useState('')
  const [holderUserId, setHolderUserId] = useState('')
  const [expirationDate, setExpirationDate] = useState('')
  const [issueDate, setIssueDate] = useState('')
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfDataUrl, setPdfDataUrl] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [viewCertId, setViewCertId] = useState<string | null>(null)
  const [viewFileObjectUrl, setViewFileObjectUrl] = useState<string | null>(null)
  const [viewFileLoading, setViewFileLoading] = useState(false)

  // Certificates table filters & sort
  const [certSearch, setCertSearch] = useState('')
  const [certStatusFilter, setCertStatusFilter] = useState<StatusFilter>('all')
  const [certSortKey, setCertSortKey] = useState<CertSortKey>('expirationDate')
  const [certSortDir, setCertSortDir] = useState<SortDir>('asc')

  useEffect(() => {
    const status = searchParams.get('status')
    if (status === 'expired' || status === 'expiry-30' || status === 'expiry-60' || status === 'current' || status === 'all') {
      setCertStatusFilter(status)
    }
  }, [searchParams])

  const isEditing = editingId != null
  const viewCert = viewCertId ? certificates.find((c) => c.id === viewCertId) : null
  const editingCert = isEditing ? certificates.find((c) => c.id === editingId) : null

  useEffect(() => {
    let cancelled = false
    if (!viewCert?.filePath) {
      setViewFileObjectUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
      setViewFileLoading(false)
      return
    }
    setViewFileLoading(true)
    certificateApi.fetchCertificateFileBlob(viewCert.id)
      .then((blob) => {
        if (cancelled) return
        const objectUrl = URL.createObjectURL(blob)
        setViewFileObjectUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          return objectUrl
        })
      })
      .catch(() => {
        if (!cancelled) setViewFileObjectUrl(null)
      })
      .finally(() => {
        if (!cancelled) setViewFileLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [viewCert?.id, viewCert?.filePath])

  const openEdit = (cert: Certificate) => {
    setEditingId(cert.id)
    setName(cert.name)
    setHolderName(cert.holderName)
    setHolderUserId(cert.holderUserId ?? '')
    setExpirationDate(cert.expirationDate ?? '')
    setPdfFile(null)
    setPdfDataUrl(null)
    setShowUpload(true)
  }

  const closeForm = () => {
    setShowUpload(false)
    setEditingId(null)
    setName('')
    setHolderName('')
    setHolderUserId('')
    setExpirationDate('')
    setIssueDate('')
    setPdfFile(null)
    setPdfDataUrl(null)
  }

  const handleFileSelect = (file: File | null) => {
    setPdfFile(file)
    if (!file) {
      setPdfDataUrl(null)
      return
    }
    const reader = new FileReader()
    reader.onload = () => setPdfDataUrl(reader.result as string)
    reader.readAsDataURL(file)
  }

  const effectiveHolderName = holderName.trim() || (holderUserId ? appUsers.find((u) => u.id === holderUserId)?.name : null) || ''

  const handleSave = async () => {
    if (!name.trim() || !effectiveHolderName || !expirationDate) return
    const clampedDate = clampExpirationDate(expirationDate)
    if (isEditing && editingId) {
      if (pdfFile) {
        const form = new FormData()
        form.append('name', name.trim())
        form.append('holderName', effectiveHolderName)
        if (holderUserId) form.append('holderUserId', holderUserId)
        if (issueDate.trim()) form.append('issueDate', issueDate.trim())
        form.append('expirationDate', clampedDate)
        form.append('file', pdfFile)
        await updateCertificate(editingId, form)
      } else {
        await updateCertificate(editingId, {
          name: name.trim(),
          holderName: effectiveHolderName,
          holderUserId: holderUserId || undefined,
          issueDate: issueDate.trim() || undefined,
          expirationDate: clampedDate,
          fileName: editingCert?.fileName,
          filePath: editingCert?.filePath,
        })
      }
      closeForm()
      return
    }
    if (pdfFile) {
      const form = new FormData()
      form.append('name', name.trim())
      form.append('holderName', effectiveHolderName)
      if (holderUserId) form.append('holderUserId', holderUserId)
      if (issueDate.trim()) form.append('issueDate', issueDate.trim())
      form.append('expirationDate', clampedDate)
      form.append('file', pdfFile)
      await addCertificate(form as any)
    } else {
      await addCertificate({
        name: name.trim(),
        holderName: effectiveHolderName,
        holderUserId: holderUserId || undefined,
        issueDate: issueDate.trim() || undefined,
        expirationDate: clampedDate,
      })
    }
    closeForm()
  }

  const confirmDelete = async (id: string) => {
    await removeCertificate(id)
    setPendingDeleteId(null)
    if (viewCertId === id) setViewCertId(null)
  }

  const printCertificate = async (cert: Certificate) => {
    if (!cert.fileDataUrl && cert.filePath) {
      try {
        const blob = await certificateApi.fetchCertificateFileBlob(cert.id)
        const objectUrl = URL.createObjectURL(blob)
        window.open(objectUrl, '_blank', 'noopener,noreferrer')
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
        return
      } catch {
        // fall through to metadata-only print layout
      }
    }
    const status = getExpirationStatus(cert.expirationDate)
    const statusLabel = status === 'expired' ? 'Expired' : status === 'expiring-soon' ? 'Expiring soon' : 'Current'
    let pdfImages: string[] = []
    if (cert.fileDataUrl) {
      try {
        pdfImages = await pdfDataUrlToImageDataUrls(cert.fileDataUrl)
      } catch {
        pdfImages = []
      }
    }
    const pdfEmbed = pdfImages.length > 0
      ? `<div class="pdf-section" style="margin-top: 1.5rem;">
  <h3 style="margin: 0 0 0.5rem 0; font-size: 0.95rem;">Attached PDF</h3>
  <div class="pdf-pages">${pdfImages
        .map(
          (src) =>
            `<img class="pdf-page-img" src="${src.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" style="width:100%; max-width:100%; height:auto; display:block; margin-bottom:1rem; page-break-inside:avoid;" alt="PDF page" />`
        )
        .join('')}</div>
</div>`
      : cert.fileName
        ? `<div class="pdf-section">
  <h3>Attached PDF</h3>
  <p class="pdf-name">${escapeHtml(cert.fileName)}</p>
</div>`
        : `<div class="pdf-section">
  <h3>Attached PDF</h3>
  <p class="pdf-name">No file attached</p>
</div>`
    const hasPdfImages = pdfImages.length > 0
    const printScript = hasPdfImages
      ? `<script>
(function(){
  var printed = false;
  function doPrint(){ if(printed) return; printed = true; window.print(); }
  var imgs = document.querySelectorAll('.pdf-page-img');
  if(!imgs.length){ setTimeout(doPrint, 50); return; }
  var n = imgs.length, done = 0;
  imgs.forEach(function(img){
    if(img.complete){ done++; if(done===n) doPrint(); }
    else img.onload = function(){ done++; if(done===n) doPrint(); };
  });
  setTimeout(doPrint, 6000);
})();
</script>`
      : `<script>setTimeout(function(){ window.print(); }, 50);</script>`
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(cert.name)} - ${escapeHtml(cert.holderName)}</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 2rem; max-width: 800px; margin: 0 auto; color: #111; }
  h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
  .meta { color: #555; font-size: 0.9rem; margin-bottom: 1.5rem; }
  table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
  th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid #e2e8f0; }
  th { font-weight: 600; color: #475569; width: 40%; }
  .pdf-section { margin-top: 2rem; padding: 1rem; border: 1px dashed #cbd5e1; background: #f8fafc; border-radius: 0.5rem; }
  .pdf-section h3 { margin: 0 0 0.5rem 0; font-size: 0.95rem; }
  @media print { body { padding: 1rem; } .pdf-pages img { max-width: 100% !important; } }
</style></head>
<body>
  <h1>${escapeHtml(cert.name)}</h1>
  <p class="meta">Certificate · ${statusLabel} · Printed ${new Date().toLocaleDateString()}</p>
  <table>
    <tr><th>Holder</th><td>${escapeHtml(cert.holderName)}</td></tr>
    <tr><th>Expiration Date</th><td>${escapeHtml(cert.expirationDate ?? 'No expiry')}</td></tr>
    <tr><th>Uploaded By</th><td>${escapeHtml(cert.uploadedBy)}</td></tr>
    <tr><th>Uploaded</th><td>${new Date(cert.uploadedAt).toLocaleDateString()}</td></tr>
  </table>
  ${pdfEmbed}
  ${printScript}
</body></html>`
    const iframe = document.createElement('iframe')
    iframe.setAttribute('title', 'Certificate print')
    iframe.style.position = 'absolute'
    iframe.style.left = '-9999px'
    iframe.style.top = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = 'none'
    document.body.appendChild(iframe)
    const doc = iframe.contentWindow?.document
    if (!doc) {
      document.body.removeChild(iframe)
      return
    }
    doc.open()
    doc.write(html)
    doc.close()
    iframe.contentWindow?.focus()
    setTimeout(() => {
      if (iframe.parentNode) document.body.removeChild(iframe)
    }, 12000)
  }

  const expiringSoon = certificates.filter((c) => getExpirationStatus(c.expirationDate) === 'expiring-soon')
  const expired = certificates.filter((c) => getExpirationStatus(c.expirationDate) === 'expired')

  return (
    <div className="space-y-6 animate-fade-in">
      <Link to="/safety" className="inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline">← Health & Safety</Link>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-2xl text-neutral-900 dark:text-white flex items-center gap-2">
            <span className="text-3xl" aria-hidden>📜</span>
            Training &amp; Certificates
          </h1>
          <p className="text-neutral-500 dark:text-neutral-400 mt-0.5">
            {canManageCertificates
              ? "View and upload training certificates with expiration dates. Uploads are mirrored on each employee's Training & Certificates section."
              : 'View training certificates for employees on your supervised sites.'}
          </p>
        </div>
        {canManageCertificates && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setShowManageCourses(true)}>
              Manage Courses
            </Button>
            <Button onClick={() => setShowUpload(true)}>Upload Certificate</Button>
          </div>
        )}
      </div>

      {showUpload && (
        <div ref={uploadFormRef}>
          <Card padding="lg" className="scroll-mt-4">
            <CardHeader>{isEditing ? 'Edit Certificate' : 'Upload Certificate'}</CardHeader>
            <CardDescription>
              {isEditing ? 'Update the certificate details below.' : 'Add a certificate with expiration date. HR will receive an email when it is close to expiring.'}
            </CardDescription>
            <div className="mt-4 space-y-4 max-w-xl">
              <CourseNameSelect
                label="Certificate Name"
                ariaLabel="Certificate name"
                value={name}
                onChange={setName}
                additionalOptions={additionalCourseNames}
                courses={courseCatalog}
                persistNew={canManageCertificates}
                onCatalogChanged={() => {
                  void refreshCourseCatalog()
                  void refetch()
                }}
              />
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Holder</label>
                <select
                  aria-label="Certificate holder"
                  value={holderUserId}
                  onChange={(e) => {
                    const u = appUsers.find((x) => x.id === e.target.value)
                    setHolderUserId(e.target.value)
                    setHolderName(u ? u.name : '')
                  }}
                  className="w-full min-h-[40px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm"
                >
                  <option value="">Select person</option>
                  {appUsers.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
                <Input label="Or holder name" value={holderName} onChange={(e) => setHolderName(e.target.value)} placeholder="If not in list" className="mt-2" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Issue Date (Optional)</label>
                  <input
                    type="date"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    className="w-full min-h-[40px] px-3 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm"
                    aria-label="Issue date"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Expiration Date (Year Max 4 Digits)</label>
                  <input
                    type="date"
                    max="9999-12-31"
                    value={expirationDate}
                    onChange={(e) => setExpirationDate(clampExpirationDate(e.target.value))}
                    className="w-full min-h-[40px] px-3 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm"
                    aria-label="Expiration date"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Upload PDF (Optional)</label>
                <input
                  type="file"
                  accept=".pdf,application/pdf,image/jpeg,image/png,image/jpg"
                  onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-neutral-600 dark:text-neutral-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-100 file:text-brand-700 dark:file:bg-brand-900/40 dark:file:text-brand-300 hover:file:bg-brand-200 dark:hover:file:bg-brand-800/50 file:cursor-pointer cursor-pointer border border-neutral-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-800"
                  aria-label="Upload certificate PDF"
                />
                {(pdfFile || editingCert?.fileName) && (
                  <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                    Selected: {pdfFile ? pdfFile.name : editingCert?.fileName}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Button type="button" onClick={handleSave} disabled={!name.trim() || !effectiveHolderName || !expirationDate}>
                  {isEditing ? 'Update certificate' : 'Save certificate'}
                </Button>
                <Button type="button" variant="ghost" onClick={closeForm}>Cancel</Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Certificates dashboard: charts + line items (Our employees + Subcontractors) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card padding="lg">
          <CardHeader>Our Employees</CardHeader>
          <div className="h-48 mt-4">
            {employeeBuckets.expiry60 + employeeBuckets.expiry30 + employeeBuckets.expired > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: '< 60 Days', value: employeeBuckets.expiry60, color: CHART_COLORS['Expiry 60 days'] },
                      { name: '< 30 Days', value: employeeBuckets.expiry30, color: CHART_COLORS['Expiry 30 days'] },
                      { name: 'Expired', value: employeeBuckets.expired, color: CHART_COLORS['Expired'] },
                    ].filter((d) => d.value > 0)}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={64}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                  >
                    {[
                      { name: '< 60 Days', value: employeeBuckets.expiry60, color: CHART_COLORS['Expiry 60 days'] },
                      { name: '< 30 Days', value: employeeBuckets.expiry30, color: CHART_COLORS['Expiry 30 days'] },
                      { name: 'Expired', value: employeeBuckets.expired, color: CHART_COLORS['Expired'] },
                    ]
                      .filter((d) => d.value > 0)
                      .map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-neutral-500 dark:text-neutral-400 text-sm">No expiring or expired certificates</div>
            )}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm font-medium">
            <div><span className="text-xl font-bold text-yellow-500 dark:text-yellow-400 mr-2">{employeeBuckets.expiry60}</span>{'<'} 60 Days</div>
            <div><span className="text-xl font-bold text-orange-600 dark:text-orange-500 mr-2">{employeeBuckets.expiry30}</span>{'<'} 30 Days</div>
            <div><span className="text-xl font-bold text-red-600 dark:text-red-400 mr-2">{employeeBuckets.expired}</span>Expired</div>
          </div>
        </Card>
        <Card padding="lg">
          <CardHeader>Subcontractors</CardHeader>
          <div className="h-48 mt-4">
            {subBuckets.expiry60 + subBuckets.expiry30 + subBuckets.expired > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: '< 60 Days', value: subBuckets.expiry60, color: CHART_COLORS['Expiry 60 days'] },
                      { name: '< 30 Days', value: subBuckets.expiry30, color: CHART_COLORS['Expiry 30 days'] },
                      { name: 'Expired', value: subBuckets.expired, color: CHART_COLORS['Expired'] },
                    ].filter((d) => d.value > 0)}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={64}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                  >
                    {[
                      { name: '< 60 Days', value: subBuckets.expiry60, color: CHART_COLORS['Expiry 60 days'] },
                      { name: '< 30 Days', value: subBuckets.expiry30, color: CHART_COLORS['Expiry 30 days'] },
                      { name: 'Expired', value: subBuckets.expired, color: CHART_COLORS['Expired'] },
                    ]
                      .filter((d) => d.value > 0)
                      .map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-neutral-500 dark:text-neutral-400 text-sm">No expiring or expired certificates</div>
            )}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm font-medium">
            <div><span className="text-xl font-bold text-yellow-500 dark:text-yellow-400 mr-2">{subBuckets.expiry60}</span>{'<'} 60 Days</div>
            <div><span className="text-xl font-bold text-orange-600 dark:text-orange-500 mr-2">{subBuckets.expiry30}</span>{'<'} 30 Days</div>
            <div><span className="text-xl font-bold text-red-600 dark:text-red-400 mr-2">{subBuckets.expired}</span>Expired</div>
          </div>
        </Card>
      </div>

      {/* Line items: Our employees */}
      <div ref={employeeListRef}>
        <Card padding="lg">
          <div className="flex justify-between items-start gap-4">
            <div>
              <CardHeader>Our Employees — Expiring / Expired</CardHeader>
              <CardDescription>{'<'} 60 Days, {'<'} 30 Days, Expired.</CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={() => handlePrintEmployees()} className="no-print shrink-0">Export PDF</Button>
          </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-600">
                <th className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400">Certificate</th>
                <th className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400">Holder</th>
                <th className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400">Expires</th>
                <th className="py-2 font-medium text-neutral-600 dark:text-neutral-400">Status</th>
              </tr>
            </thead>
            <tbody>
              {[...employeeLineItems.expiry60, ...employeeLineItems.expiry30, ...employeeLineItems.expired].map((c) => (
                <tr key={c.id} className="border-b border-neutral-100 dark:border-neutral-700">
                  <td className="py-2 pr-4 font-medium text-neutral-900 dark:text-white">{c.name}</td>
                  <td className="py-2 pr-4 text-neutral-700 dark:text-neutral-300">
                    <div className="flex items-center gap-2">
                      <span>{c.holderName}</span>
                      {c.holderUserId && (
                        <Link to={`/employees/${c.holderUserId}#training-certificates`} className="text-xs text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 hover:underline">Training &amp; Certificates</Link>
                      )}
                    </div>
                  </td>
                  <td className="py-2 pr-4 text-neutral-700 dark:text-neutral-300">{c.expirationDate}</td>
                  <td className="py-2">
                    {getExpiryBucket(c.expirationDate) === 'expired' && <Badge variant="danger">Expired</Badge>}
                    {getExpiryBucket(c.expirationDate) === 'expiry-30' && <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200">{'<'} 30 Days</Badge>}
                    {getExpiryBucket(c.expirationDate) === 'expiry-60' && <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200">{'<'} 60 Days</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {employeeLineItems.expiry60.length + employeeLineItems.expiry30.length + employeeLineItems.expired.length === 0 && (
            <p className="py-4 text-neutral-500 dark:text-neutral-400 text-sm">No certificates expiring in 60 days or expired.</p>
          )}
        </div>
      </Card>
      </div>

      {/* Line items: Subcontractors */}
      <div ref={subcontractorListRef}>
        <Card padding="lg">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
            <div>
              <CardHeader>Subcontractors — Expiring / Expired</CardHeader>
              <CardDescription>{'<'} 60 Days, {'<'} 30 Days, Expired.</CardDescription>
            </div>
          <div className="flex items-center gap-2 shrink-0 no-print">
            <select
              aria-label="Subcontractor company filter"
              value={subCertCompanyFilter}
              onChange={(e) => setSubCertCompanyFilter(e.target.value)}
              className="h-8 text-sm px-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
            >
              <option value="all">All Subcontractors</option>
              {subcontractors.map((s) => (
                <option key={s.id} value={s.id}>{s.companyName}</option>
              ))}
            </select>
            <Button size="sm" variant="outline" onClick={() => handlePrintSubcontractors()} className="no-print">Export PDF</Button>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-600">
                <th className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400">Certificate</th>
                <th className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400">Company</th>
                <th className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400">Holder</th>
                <th className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400">Expires</th>
                <th className="py-2 font-medium text-neutral-600 dark:text-neutral-400">Status</th>
              </tr>
            </thead>
            <tbody>
              {[...subLineItems.expiry60, ...subLineItems.expiry30, ...subLineItems.expired].map((c) => (
                <tr key={c.id} className="border-b border-neutral-100 dark:border-neutral-700">
                  <td className="py-2 pr-4 font-medium text-neutral-900 dark:text-white">{c.name}</td>
                  <td className="py-2 pr-4 text-neutral-700 dark:text-neutral-300">
                    <Link to={`/subcontractors/${c.subcontractorId}`} className="text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 hover:underline">{c.subcontractorName}</Link>
                  </td>
                  <td className="py-2 pr-4 text-neutral-700 dark:text-neutral-300">{c.holderName}</td>
                  <td className="py-2 pr-4 text-neutral-700 dark:text-neutral-300">{c.expirationDate}</td>
                  <td className="py-2">
                    {c.statusBucket === 'expired' && <Badge variant="danger">Expired</Badge>}
                    {c.statusBucket === 'expiry-30' && <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200">{'<'} 30 Days</Badge>}
                    {c.statusBucket === 'expiry-60' && <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200">{'<'} 60 Days</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {subLineItems.expiry60.length + subLineItems.expiry30.length + subLineItems.expired.length === 0 && (
            <p className="py-4 text-neutral-500 dark:text-neutral-400 text-sm">No subcontractor certificates match the selected filters.</p>
          )}
        </div>
      </Card>
      </div>

      {(expiringSoon.length > 0 || expired.length > 0) && (
        <Card padding="md" className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            <strong>Expiration reminders:</strong> When a certificate is within {EXPIRING_DAYS} days of expiring, the system sends an email to HR so you can follow up with the holder.
            {expiringSoon.length > 0 && (
              <span className="block mt-1">
                {expiringSoon.length} certificate(s) expiring soon.
              </span>
            )}
            {expired.length > 0 && (
              <span className="block mt-1 text-red-700 dark:text-red-300">
                {expired.length} certificate(s) expired.
              </span>
            )}
          </p>
        </Card>
      )}

      {/* Line items: Subcontractor insurance (all statuses) */}
      <div ref={insuranceListRef}>
        <Card padding="lg" className="scroll-mt-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
            <div>
              <CardHeader>Subcontractor Insurance — Expiring / Current</CardHeader>
              <CardDescription>Current, {'<'} 30 Days, Expired.</CardDescription>
            </div>
            <div className="flex items-center gap-2 shrink-0 no-print">
              <select
                aria-label="Insurance company filter"
                value={insuranceCompanyFilter}
                onChange={(e) => setInsuranceCompanyFilter(e.target.value)}
                className="h-8 text-sm px-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
              >
                <option value="all">All Subcontractors</option>
                {subcontractors.map((s) => (
                  <option key={s.id} value={s.id}>{s.companyName}</option>
                ))}
              </select>
              <Button size="sm" variant="outline" onClick={() => handlePrintInsurance()} className="no-print shrink-0">
                Export PDF
              </Button>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm font-medium">
            <div><span className="text-xl font-bold text-green-600 dark:text-green-400 mr-2">{insuranceBuckets.current}</span>Current</div>
            <div><span className="text-xl font-bold text-orange-600 dark:text-orange-500 mr-2">{insuranceBuckets.expiry30}</span>{'<'} 30 Days</div>
            <div><span className="text-xl font-bold text-red-600 dark:text-red-400 mr-2">{insuranceBuckets.expired}</span>Expired</div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-600">
                  <th className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400">Company</th>
                  <th className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400">Insurance Type</th>
                  <th className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400">Policy</th>
                  <th className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400">Expires</th>
                  <th className="py-2 font-medium text-neutral-600 dark:text-neutral-400">Status</th>
                </tr>
              </thead>
              <tbody>
                {insuranceItems.map((item) => (
                  <tr key={item.id} className="border-b border-neutral-100 dark:border-neutral-700">
                    <td className="py-2 pr-4 text-neutral-700 dark:text-neutral-300">
                      <Link to={`/subcontractors/${item.subcontractorId}`} className="text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 hover:underline">
                        {item.subcontractorName}
                      </Link>
                    </td>
                    <td className="py-2 pr-4 font-medium text-neutral-900 dark:text-white">{item.insuranceType}</td>
                    <td className="py-2 pr-4 text-neutral-700 dark:text-neutral-300">{item.policyNumber}</td>
                    <td className="py-2 pr-4 text-neutral-700 dark:text-neutral-300">{item.expirationDate}</td>
                    <td className="py-2">
                      {item.statusBucket === 'expired' && <Badge variant="danger">Expired</Badge>}
                      {item.statusBucket === 'expiry-30' && <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200">{'<'} 30 Days</Badge>}
                      {item.statusBucket === 'current' && <Badge variant="success">Current</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {insuranceItems.length === 0 && (
              <p className="py-4 text-neutral-500 dark:text-neutral-400 text-sm">No subcontractor insurance records with expiration dates found.</p>
            )}
          </div>
        </Card>
      </div>

      <Card padding="lg">
        <div className="flex justify-between items-start gap-4">
          <div>
            <CardHeader>All Certificates</CardHeader>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0 no-print">
            <Button size="sm" variant="outline" onClick={() => handleExportCertificatesExcel('primary')}>
              Export Primary Training
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleExportCertificatesExcel('secondary')}>
              Export All Training
            </Button>
            <Button size="sm" variant="outline" onClick={() => window.print()}>Export PDF</Button>
          </div>
        </div>
        <CardDescription>Filter by status, search by name or holder, and click column headers to sort.</CardDescription>

        {/* Status filter tabs */}
        <div className="mt-4 flex flex-wrap gap-2">
          {([
            ['all', 'All'],
            ['current', 'Current'],
            ['expiry-60', '< 60 Days'],
            ['expiry-30', '< 30 Days'],
            ['expired', 'Expired'],
          ] as [StatusFilter, string][]).map(([val, label]) => (
            <Button
              key={val}
              variant={certStatusFilter === val ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setCertStatusFilter(val)}
            >
              {label}
              {val !== 'all' && (
                <span className="ml-1.5 text-xs opacity-70">
                  ({certificates.filter((c) => getExpiryBucket(c.expirationDate) === (val as string)).length})
                </span>
              )}
            </Button>
          ))}
        </div>

        {/* Search */}
        <div className="mt-3 max-w-sm">
          <Input
            placeholder="Search by certificate or holder name…"
            value={certSearch}
            onChange={(e) => setCertSearch(e.target.value)}
          />
        </div>

        <div className="mt-4 overflow-x-auto">
          {(() => {
            const q = certSearch.toLowerCase()
            const handleCertSort = (key: CertSortKey) => {
              if (certSortKey === key) {
                setCertSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
              } else {
                setCertSortKey(key)
                setCertSortDir('asc')
              }
            }
            const CertSortIcon = ({ col }: { col: CertSortKey }) => {
              if (certSortKey !== col) return <span className="ml-1 text-neutral-400 dark:text-neutral-600">↕</span>
              return <span className="ml-1">{certSortDir === 'asc' ? '↑' : '↓'}</span>
            }
            const filteredCerts = certificates
              .filter((c) => {
                if (certStatusFilter !== 'all' && getExpiryBucket(c.expirationDate) !== certStatusFilter) return false
                if (q && !c.name.toLowerCase().includes(q) && !c.holderName.toLowerCase().includes(q)) return false
                return true
              })
              .sort((a, b) => {
                let aVal: string, bVal: string
                if (certSortKey === 'status') {
                  aVal = getExpiryBucket(a.expirationDate)
                  bVal = getExpiryBucket(b.expirationDate)
                } else {
                  aVal = (a[certSortKey] ?? '').toLowerCase()
                  bVal = (b[certSortKey] ?? '').toLowerCase()
                }
                const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
                return certSortDir === 'asc' ? cmp : -cmp
              })
            return (
              <>
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="border-b border-neutral-200 dark:border-neutral-600">
                      <th className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400 cursor-pointer select-none hover:text-neutral-900 dark:hover:text-white transition-colors" onClick={() => handleCertSort('name')}>
                        Certificate<CertSortIcon col="name" />
                      </th>
                      <th className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400 cursor-pointer select-none hover:text-neutral-900 dark:hover:text-white transition-colors" onClick={() => handleCertSort('holderName')}>
                        Holder<CertSortIcon col="holderName" />
                      </th>
                      <th className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400 cursor-pointer select-none hover:text-neutral-900 dark:hover:text-white transition-colors" onClick={() => handleCertSort('expirationDate')}>
                        Expires<CertSortIcon col="expirationDate" />
                      </th>
                      <th className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400 cursor-pointer select-none hover:text-neutral-900 dark:hover:text-white transition-colors" onClick={() => handleCertSort('status')}>
                        Status<CertSortIcon col="status" />
                      </th>
                      <th className="py-2 font-medium text-neutral-600 dark:text-neutral-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCerts.map((c) => {
                      const status = getExpiryBucket(c.expirationDate)
                      return (
                        <tr key={c.id} className="border-b border-neutral-100 dark:border-neutral-700">
                          <td className="py-3 pr-4">
                            <span className="font-medium text-neutral-900 dark:text-white">{c.name}</span>
                            {c.fileName && (
                              <span className="block text-xs text-neutral-500 dark:text-neutral-400">{c.fileName}</span>
                            )}
                          </td>
                          <td className="py-3 pr-4 text-neutral-700 dark:text-neutral-300">
                            {c.holderUserId ? (
                              <Link
                                to={`/employees/${c.holderUserId}#training-certificates`}
                                className="text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 hover:underline font-medium"
                              >
                                {c.holderName}
                              </Link>
                            ) : (
                              c.holderName
                            )}
                          </td>
                          <td className="py-3 pr-4 text-neutral-700 dark:text-neutral-300">{c.expirationDate}</td>
                          <td className="py-3 pr-4">
                            {status === 'expired' && <Badge variant="danger">Expired</Badge>}
                            {status === 'expiry-30' && <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200">{'<'} 30 Days</Badge>}
                            {status === 'expiry-60' && <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200">{'<'} 60 Days</Badge>}
                            {status === 'current' && <Badge variant="success">Current</Badge>}
                            {(status === 'expiry-30' || status === 'expiry-60') && c.expirationReminderSentAt && (
                              <span className="block text-xs text-neutral-500 mt-1">Reminder sent to HR (simulated)</span>
                            )}
                          </td>
                          <td className="py-3">
                            <div className="flex items-center gap-2">
                              <Button type="button" variant="ghost" size="sm" onClick={() => setViewCertId(c.id)} aria-label="Quick view certificate">View</Button>
                              {canManageCertificates && (
                                <>
                                  <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(c)} aria-label="Edit certificate">Edit</Button>
                                  <Button type="button" variant="ghost" size="sm" className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300" onClick={() => setPendingDeleteId(c.id)} aria-label="Delete certificate">Delete</Button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                    {filteredCerts.length === 0 && certificates.length > 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-neutral-500 dark:text-neutral-400">
                          No certificates match your filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </>
            )
          })()}
        </div>
        {certificates.length === 0 && (
          <EmptyState
            title="No certificates yet"
            description="Upload a certificate with expiration date to get started. HR will receive a reminder when it is close to expiring."
            compact
          />
        )}
      </Card>

      {/* Quick view modal */}
      {viewCert && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 dark:bg-black/60 animate-fade-in no-print"
          onClick={() => setViewCertId(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="view-cert-title"
        >
          <Card
            padding="lg"
            className="max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-xl animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 id="view-cert-title" className="font-display font-bold text-xl text-neutral-900 dark:text-white">
                {viewCert.name}
              </h2>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setViewCertId(null)}
                  className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              {getExpirationStatus(viewCert.expirationDate) === 'expired' && <Badge variant="danger" className="mr-2">Expired</Badge>}
              {getExpirationStatus(viewCert.expirationDate) === 'expiring-soon' && <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200 mr-2">Expiring soon</Badge>}
              {getExpirationStatus(viewCert.expirationDate) === 'current' && <Badge variant="success" className="mr-2">Current</Badge>}
              {new Date(viewCert.uploadedAt).toLocaleDateString()}
              {viewCert.expirationReminderSentAt && (
                <span className="block mt-1 text-xs text-neutral-500 dark:text-neutral-400">HR expiration reminder sent (simulated)</span>
              )}
            </p>
            <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="font-medium text-neutral-500 dark:text-neutral-400">Holder</dt>
                <dd className="text-neutral-900 dark:text-white">{viewCert.holderName}</dd>
              </div>
              <div>
                <dt className="font-medium text-neutral-500 dark:text-neutral-400">Expiration date</dt>
                <dd className="text-neutral-900 dark:text-white">{viewCert.expirationDate}</dd>
              </div>
            </dl>
            <div className="mt-4 flex-1 min-h-0 border border-neutral-200 dark:border-neutral-600 rounded-lg bg-neutral-50 dark:bg-neutral-800/50 overflow-hidden flex flex-col">
              <div className="p-3 border-b border-neutral-200 dark:border-neutral-600 bg-neutral-100/80 dark:bg-neutral-800 font-medium text-sm text-neutral-700 dark:text-neutral-300">
                Attached PDF {viewCert.fileName && <span className="font-normal text-neutral-500 dark:text-neutral-400">· {viewCert.fileName}</span>}
              </div>
              <div className="flex-1 min-h-[200px] flex flex-col">
                {viewFileLoading ? (
                  <div className="p-4 flex items-center justify-center min-h-[200px]">
                    <p className="text-neutral-500 dark:text-neutral-400">Loading file…</p>
                  </div>
                ) : viewFileObjectUrl ? (
                  <iframe
                    src={viewFileObjectUrl}
                    title="Attached document"
                    className="w-full flex-1 min-h-[300px] border-0"
                  />
                ) : viewCert.fileDataUrl ? (
                  <iframe
                    src={viewCert.fileDataUrl}
                    title="Attached PDF"
                    className="w-full flex-1 min-h-[300px] border-0"
                  />
                ) : viewCert.fileName ? (
                  <div className="p-4 flex flex-col items-center justify-center min-h-[200px] text-center">
                    <p className="text-neutral-700 dark:text-neutral-300 font-medium">{viewCert.fileName}</p>
                    <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                      This certificate record has no stored file path in the database. Re-upload the file to enable quick view/download.
                    </p>
                  </div>
                ) : (
                  <div className="p-4 flex items-center justify-center min-h-[200px]">
                    <p className="text-neutral-500 dark:text-neutral-400">No PDF attached</p>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Delete confirmation popup */}
      {pendingDeleteId && (() => {
        const cert = certificates.find((c) => c.id === pendingDeleteId)
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 dark:bg-black/60 animate-fade-in"
            onClick={() => setPendingDeleteId(null)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-cert-title"
          >
            <Card
              padding="lg"
              className="max-w-md w-full shadow-xl animate-fade-in"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="delete-cert-title" className="font-display font-bold text-xl text-neutral-900 dark:text-white">Delete Certificate?</h2>
              <p className="mt-2 text-neutral-600 dark:text-neutral-400">
                {cert ? (
                  <>Are you sure you want to delete <strong>{cert.name}</strong> for {cert.holderName}? This cannot be undone.</>
                ) : (
                  'Are you sure? This cannot be undone.'
                )}
              </p>
              <div className="mt-6 flex gap-3 justify-end">
                <Button type="button" variant="ghost" onClick={() => setPendingDeleteId(null)}>Cancel</Button>
                <Button type="button" variant="danger" onClick={() => cert && confirmDelete(cert.id)}>Confirm delete</Button>
              </div>
            </Card>
          </div>
        )
      })()}

      {canManageCertificates && (
        <ManageTrainingCoursesModal
          open={showManageCourses}
          onClose={() => setShowManageCourses(false)}
          onChanged={() => {
            void refreshCourseCatalog()
            void refetch()
          }}
        />
      )}
    </div>
  )
}
