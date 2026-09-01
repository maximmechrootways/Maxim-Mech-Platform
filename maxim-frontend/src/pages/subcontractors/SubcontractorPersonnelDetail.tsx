import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useUser } from '@/contexts/UserContext'
import { useSubcontractors } from '@/contexts/SubcontractorsContext'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import * as subcontractorApi from '@/api/subcontractors'
import { quickViewBlob, downloadBlob } from '@/utils/fileActions'

export function SubcontractorPersonnelDetail() {
  const { subId, personnelId } = useParams()
  const { user } = useUser()
  const {
    subcontractors,
    personnel,
    personnelCertifications,
    personnelJobAssignments,
    personnelDocuments,
    loadPersonnelForSubcontractor,
    jobsList: jobs,
  } = useSubcontractors()
  const isOwnerOrHr = user?.role === 'owner' || user?.role === 'hr'

  const sub = subId ? subcontractors.find((s: any) => s.id === subId) : undefined
  const person = personnelId ? personnel.find((p: any) => p.id === personnelId && p.subcontractorId === subId) : undefined
  const certs = person ? personnelCertifications.filter((c: any) => c.personnelId === person.id) : []
  const assignments = person ? personnelJobAssignments.filter((a: any) => a.personnelId === person.id) : []
  const docs = person ? personnelDocuments.filter((d: any) => d.personnelId === person.id) : []

  const [showAddCert, setShowAddCert] = useState(false)
  const [newCert, setNewCert] = useState({ name: '', issuedAt: '', expiresAt: '' })
  const [pdfFile, setPdfFile] = useState<File | null>(null)

  const [showAddDoc, setShowAddDoc] = useState(false)
  const [newDoc, setNewDoc] = useState({ name: '', category: 'Contract' })
  const [docFile, setDocFile] = useState<File | null>(null)

  if (!isOwnerOrHr) return null
  if (!sub || !person) {
    return (
      <div className="space-y-4 animate-fade-in">
        <p className="text-neutral-500 dark:text-neutral-400">Personnel not found.</p>
        <Link to="/subcontractors" className="text-brand-600 dark:text-brand-400 hover:underline">Back to subcontractors</Link>
      </div>
    )
  }

  const handleAddCert = async () => {
    if (!newCert.name.trim() || !newCert.issuedAt || !newCert.expiresAt || !subId || !person) return
    let payload: any = {
      name: newCert.name.trim(),
      issuedAt: newCert.issuedAt,
      expiresAt: newCert.expiresAt,
    }
    if (pdfFile) {
      payload = new FormData()
      payload.append('name', newCert.name.trim())
      payload.append('issuedAt', newCert.issuedAt)
      payload.append('expiresAt', newCert.expiresAt)
      payload.append('file', pdfFile)
    }
    await subcontractorApi.addPersonnelCertification(subId, person.id, payload)
    await loadPersonnelForSubcontractor(subId)
    setShowAddCert(false)
    setNewCert({ name: '', issuedAt: '', expiresAt: '' })
    setPdfFile(null)
  }

  const handleAddDoc = async () => {
    if (!newDoc.name.trim() || !newDoc.category || !subId || !person) return
    if (!docFile) {
      alert("Please upload a file.")
      return
    }
    const formData = new FormData()
    formData.append('name', newDoc.name.trim())
    formData.append('category', newDoc.category)
    formData.append('file', docFile)

    await subcontractorApi.addPersonnelDocument(subId, person.id, formData)
    await loadPersonnelForSubcontractor(subId)

    setShowAddDoc(false)
    setNewDoc({ name: '', category: 'Contract' })
    setDocFile(null)
  }

  const handleRemoveCert = async (certId: string) => {
    if (!subId || !person) return
    await subcontractorApi.removePersonnelCertification(subId, person.id, certId)
    await loadPersonnelForSubcontractor(subId)
  }

  const handleUpdateCertExpiry = async (certId: string, expiresAt: string) => {
    if (!subId || !person) return
    await subcontractorApi.updatePersonnelCertification(subId, person.id, certId, { expiresAt })
    await loadPersonnelForSubcontractor(subId)
  }

  const handleRemoveDoc = async (docId: string) => {
    if (!subId || !person) return
    await subcontractorApi.removePersonnelDocument(subId, person.id, docId)
    await loadPersonnelForSubcontractor(subId)
  }

  const handleCompleteOrientation = async (assignmentId: string) => {
    if (!subId || !person) return
    const now = new Date().toISOString()
    await subcontractorApi.updatePersonnelJobAssignment(subId, person.id, assignmentId, {
      orientationCompletedAt: now
    })
    // Also update the personnel record so it reflects on the Contractor Personnel list
    await subcontractorApi.updateSubcontractorPersonnel(subId, person.id, {
      orientationCompletedAt: now
    })
    await loadPersonnelForSubcontractor(subId)
  }

  const handleQuickViewSubFile = async (filePath?: string) => {
    if (!filePath) return
    const blob = await subcontractorApi.fetchSubcontractorFileBlob(filePath)
    quickViewBlob(blob)
  }

  const handleDownloadSubFile = async (filePath: string | undefined, fallbackName: string) => {
    if (!filePath) return
    const blob = await subcontractorApi.fetchSubcontractorFileBlob(filePath)
    downloadBlob(blob, fallbackName)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <Breadcrumbs
        items={[
          { label: 'Subcontractors', to: '/subcontractors' },
          { label: sub.companyName, to: `/subcontractors/${sub.id}` },
          { label: person.name },
        ]}
      />
      <div className="flex flex-wrap items-center gap-4">
        <Link
          to={`/subcontractors/${sub.id}`}
          className="touch-target p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="font-display font-bold text-display-xl text-neutral-900 dark:text-white tracking-tight">
            {person.name}
          </h1>
          <p className="text-neutral-500 dark:text-neutral-400 mt-0.5">
            {sub.companyName} · Certificate upload & management
          </p>
        </div>
      </div>

      <Card padding="lg">
        <CardHeader>Certificates</CardHeader>
        <CardDescription>
          Add and manage certificates for this person. Upload or enter certification details; expiry is tracked for compliance.
        </CardDescription>
        <ul className="mt-4 space-y-2">
          {certs.length === 0 && !showAddCert && (
            <li className="text-sm text-neutral-500 dark:text-neutral-400">No certificates yet. Add one below.</li>
          )}
          {certs.map((c: any) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2 px-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/50"
            >
              <div>
                <span className="font-medium text-neutral-900 dark:text-white">{c.name}</span>
                <span className="text-sm text-neutral-500 dark:text-neutral-400 ml-2">
                  Issued {c.issuedAt} · Expires{' '}
                  <input
                    type="date"
                    value={c.expiresAt}
                    onChange={(e) => handleUpdateCertExpiry(c.id, e.target.value)}
                    className="inline-block w-32 ml-1 px-1 py-0.5 text-sm bg-transparent border-b border-neutral-300 dark:border-neutral-600 focus:border-brand-500 focus:ring-0"
                    title="Edit Expiry Date"
                  />
                </span>
                {c.fileName && (
                  <span className="block text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                    File: {c.fileName}
                    <div className="mt-2 flex items-center gap-2">
                      {c.filePath && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => handleQuickViewSubFile(c.filePath)}>Quick View</Button>
                          <Button size="sm" variant="outline" onClick={() => handleDownloadSubFile(c.filePath, c.fileName || `${c.name}.pdf`)}>Download</Button>
                        </>
                      )}
                    </div>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant={c.status === 'expired' ? 'danger' : c.status === 'expiring-soon' ? 'warning' : 'success'}
                >
                  {c.status === 'expired' ? 'Expired' : c.status === 'expiring-soon' ? 'Expiring soon' : 'Current'}
                </Badge>
                <Button size="sm" variant="ghost" onClick={() => handleRemoveCert(c.id)}>
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
        {!showAddCert ? (
          <Button className="mt-4" variant="secondary" onClick={() => setShowAddCert(true)}>
            Add certificate
          </Button>
        ) : (
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-600 space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <Input
                label="Certification name"
                value={newCert.name}
                onChange={(e) => setNewCert((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Working at Heights"
                className="min-w-[180px]"
              />
              <Input
                label="Issued"
                type="date"
                value={newCert.issuedAt}
                onChange={(e) => setNewCert((f) => ({ ...f, issuedAt: e.target.value }))}
              />
              <Input
                label="Expires"
                type="date"
                value={newCert.expiresAt}
                onChange={(e) => setNewCert((f) => ({ ...f, expiresAt: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="personnel-cert-file" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Upload File (PDF, JPEG, PNG)
              </label>
              <input
                id="personnel-cert-file"
                type="file"
                accept=".pdf,application/pdf,image/jpeg,image/png"
                aria-label="Upload PDF or image for audit"
                onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-neutral-600 dark:text-neutral-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-100 file:text-brand-800 dark:file:bg-brand-900/30 dark:file:text-brand-200 hover:file:bg-brand-200 dark:hover:file:bg-brand-800/50"
              />
              {pdfFile && (
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{pdfFile.name}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleAddCert}
                disabled={!newCert.name.trim() || !newCert.issuedAt || !newCert.expiresAt}
              >
                Save
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setShowAddCert(false)
                  setNewCert({ name: '', issuedAt: '', expiresAt: '' })
                  setPdfFile(null)
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card padding="lg">
        <CardHeader>Contracts & Documents</CardHeader>
        <CardDescription>
          Upload worker contracts, compliance waivers, or other important documents.
        </CardDescription>
        <ul className="mt-4 space-y-2">
          {docs.length === 0 && !showAddDoc && (
            <li className="text-sm text-neutral-500 dark:text-neutral-400">No documents yet. Add one below.</li>
          )}
          {docs.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2 px-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/50"
            >
              <div>
                <span className="font-medium text-neutral-900 dark:text-white">{d.name}</span>
                <Badge variant="default" className="ml-2">{d.category}</Badge>
                <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                  Uploaded at {new Date(d.uploadedAt).toLocaleString()}
                </div>
                {d.filePath && (
                  <div className="mt-1 flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleQuickViewSubFile(d.filePath)}>Quick View</Button>
                    <Button size="sm" variant="outline" onClick={() => handleDownloadSubFile(d.filePath, d.name)}>Download</Button>
                  </div>
                )}
              </div>
              <Button size="sm" variant="ghost" onClick={() => handleRemoveDoc(d.id)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>

        {!showAddDoc ? (
          <Button className="mt-4" variant="secondary" onClick={() => setShowAddDoc(true)}>
            Upload Document
          </Button>
        ) : (
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-600 space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <Input
                label="Document Name"
                value={newDoc.name}
                onChange={(e) => setNewDoc((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Master Subcontract Agreement"
                className="min-w-[200px]"
              />
              <label className="flex flex-col gap-1.5 min-w-[150px]">
                <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Category</span>
                <select
                  value={newDoc.category}
                  onChange={(e) => setNewDoc((f) => ({ ...f, category: e.target.value }))}
                  className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                >
                  <option value="Contract">Contract</option>
                  <option value="Waiver">Waiver</option>
                  <option value="Identification">Identification</option>
                  <option value="Other">Other</option>
                </select>
              </label>
            </div>
            <div>
              <label htmlFor="personnel-doc-file" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Upload File (PDF, Word, Images)
              </label>
              <input
                id="personnel-doc-file"
                type="file"
                accept=".pdf,application/pdf,.doc,.docx,image/jpeg,image/png"
                onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-neutral-600 dark:text-neutral-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-100 file:text-brand-800 dark:file:bg-brand-900/30 dark:file:text-brand-200 hover:file:bg-brand-200 dark:hover:file:bg-brand-800/50"
              />
            </div>
            <div className="flex gap-2 mt-2">
              <Button onClick={handleAddDoc} disabled={!newDoc.name.trim() || !docFile}>
                Upload
              </Button>
              <Button variant="ghost" onClick={() => { setShowAddDoc(false); setNewDoc({ name: '', category: 'Contract' }); setDocFile(null); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card padding="lg">
        <CardHeader>Site Orientations</CardHeader>
        <CardDescription>
          Track site orientation completion for the jobs this person is assigned to.
        </CardDescription>
        <div className="mt-4 space-y-4">
          {assignments.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">This person is not assigned to any jobs yet.</p>
          ) : (
            <ul className="space-y-3">
              {assignments.map((assignment: any) => {
                const job = jobs.find(j => j.id === assignment.jobId)
                if (!job) return null
                return (
                  <li key={assignment.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/50">
                    <div>
                      <div className="font-medium text-neutral-900 dark:text-white">{job.title}</div>
                      <div className="text-sm text-neutral-500 dark:text-neutral-400">Site: {job.siteName}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      {assignment.orientationCompletedAt ? (
                        <div className="flex items-center gap-2">
                          <Badge variant="success">Completed</Badge>
                          <input
                            type="date"
                            value={new Date(assignment.orientationCompletedAt).toISOString().slice(0, 10)}
                            onChange={async (e) => {
                              if (!subId || !person) return
                              const val = e.target.value
                              const iso = val ? new Date(val + 'T12:00:00').toISOString() : null
                              await subcontractorApi.updatePersonnelJobAssignment(subId, person.id, assignment.id, {
                                orientationCompletedAt: iso
                              })
                              if (iso) {
                                await subcontractorApi.updateSubcontractorPersonnel(subId, person.id, {
                                  orientationCompletedAt: iso
                                })
                              }
                              await loadPersonnelForSubcontractor(subId)
                            }}
                            className="text-sm px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 focus:ring-1 focus:ring-brand-500 focus:border-brand-500"
                          />
                        </div>
                      ) : (
                        <>
                          <Badge variant="default">Not yet completed</Badge>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleCompleteOrientation(assignment.id)}
                          >
                            Mark Completed
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </Card>
    </div>
  )
}
