import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type {
  Subcontractor,
  SubcontractorCertification,
  SubcontractorJobAssignment,
  SubcontractorPersonnel,
  SubcontractorPersonnelCertification,
  SubcontractorPersonnelJobAssignment,
  SubcontractorPersonnelCheckIn,
  SubcontractorPersonnelDocument,
} from '@/types'
import { fetchSubcontractors, fetchJobs, addSubcontractor as apiAddJobSubcontractor, removeSubcontractor as apiRemoveJobSubcontractor } from '@/api/jobs'
import * as subcontractorApi from '@/api/subcontractors'

const EXPIRING_DAYS = 30

function certStatusFromExpiry(expiresAt: string): 'current' | 'expiring-soon' | 'expired' {
  const today = new Date().toISOString().slice(0, 10)
  const in30 = new Date(Date.now() + EXPIRING_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  if (expiresAt < today) return 'expired'
  if (expiresAt <= in30) return 'expiring-soon'
  return 'current'
}

interface SubcontractorsContextValue {
  loadData: () => void
  loadPersonnelForSubcontractor: (id: string) => Promise<void>
  subcontractors: Subcontractor[]
  listLoading: boolean
  certifications: SubcontractorCertification[]
  jobAssignments: SubcontractorJobAssignment[]
  addSubcontractor: (payload: import('@/api/subcontractors').SubcontractorPayload) => Promise<Subcontractor>
  updateSubcontractor: (id: string, updates: Partial<Omit<Subcontractor, 'id'>>) => void | Promise<void>
  deleteSubcontractorProfile: (id: string) => Promise<void>
  addCertification: (cert: Omit<SubcontractorCertification, 'id' | 'status'>) => SubcontractorCertification
  updateCertification: (id: string, updates: Partial<Pick<SubcontractorCertification, 'name' | 'issuedAt' | 'expiresAt'>>) => void
  removeCertification: (id: string) => void
  addJobAssignment: (assignment: Omit<SubcontractorJobAssignment, 'id'>) => void
  removeJobAssignment: (id: string) => void
  // Contractor personnel (workers) and their job assignments
  personnel: SubcontractorPersonnel[]
  personnelCertifications: SubcontractorPersonnelCertification[]
  personnelJobAssignments: SubcontractorPersonnelJobAssignment[]
  personnelCheckIns: SubcontractorPersonnelCheckIn[]
  addPersonnel: (p: Omit<SubcontractorPersonnel, 'id'>) => SubcontractorPersonnel
  updatePersonnel: (id: string, updates: Partial<Pick<SubcontractorPersonnel, 'name' | 'email'>>) => void
  removePersonnel: (id: string) => void
  addPersonnelCertification: (cert: Omit<SubcontractorPersonnelCertification, 'id' | 'status'>) => SubcontractorPersonnelCertification
  updatePersonnelCertification: (id: string, updates: Partial<Pick<SubcontractorPersonnelCertification, 'name' | 'issuedAt' | 'expiresAt' | 'fileName' | 'filePath'>>) => void
  removePersonnelCertification: (id: string) => void
  personnelDocuments: SubcontractorPersonnelDocument[]
  addPersonnelDocument: (doc: Omit<SubcontractorPersonnelDocument, 'id'>) => SubcontractorPersonnelDocument
  removePersonnelDocument: (id: string) => void
  addPersonnelJobAssignment: (a: Omit<SubcontractorPersonnelJobAssignment, 'id'>) => void
  updatePersonnelJobAssignment: (id: string, updates: Partial<SubcontractorPersonnelJobAssignment>) => void
  removePersonnelJobAssignment: (id: string) => void
  apiCheckInSubcontractorPersonnel: (subcontractorId: string, personnelId: string, jobId: string, date: string) => Promise<void>
  apiCheckOutSubcontractorPersonnel: (subcontractorId: string, personnelId: string, jobId: string, date: string) => Promise<void>
  jobsList: { id: string; title: string; siteName?: string }[]
}

const SubcontractorsContext = createContext<SubcontractorsContextValue | null>(null)

export function SubcontractorsProvider({ children }: { children: React.ReactNode }) {
  const [hasFetched, setHasFetched] = useState(false)
  const loadData = useCallback(() => setHasFetched(true), [])
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [certifications, setCertifications] = useState<SubcontractorCertification[]>([])
  const [jobAssignments, setJobAssignments] = useState<SubcontractorJobAssignment[]>([])
  const [personnel, setPersonnel] = useState<SubcontractorPersonnel[]>([])
  const [personnelCertifications, setPersonnelCertifications] = useState<SubcontractorPersonnelCertification[]>([])
  const [personnelJobAssignments, setPersonnelJobAssignments] = useState<SubcontractorPersonnelJobAssignment[]>([])
  const [personnelCheckIns, setPersonnelCheckIns] = useState<SubcontractorPersonnelCheckIn[]>([])
  const [personnelDocuments, setPersonnelDocuments] = useState<SubcontractorPersonnelDocument[]>([])
  const [jobsList, setJobsList] = useState<{ id: string; title: string; siteName?: string }[]>([])

  useEffect(() => {
    if (!hasFetched) return;
    let cancelled = false
    setListLoading(true)
    Promise.all([fetchSubcontractors(), fetchJobs(), subcontractorApi.listAllSubcontractorCertifications()])
      .then(([subList, jList, allCerts]) => {
        if (!cancelled) {
          if (Array.isArray(subList)) {
            setSubcontractors(
              subList.map((s: any) => ({
                id: s.id,
                companyName: s.companyName,
                officeContactName: s.officeContactName,
                officeContactEmail: s.officeContactEmail ?? '',
                officeContactPhone: s.officeContactPhone,
                siteContactName: s.siteContactName,
                siteContactEmail: s.siteContactEmail,
                siteContactPhone: s.siteContactPhone,
                status: s.status === 'inactive' ? 'inactive' : 'active',
                compliance: s.compliance,
                notes: s.notes,
                insurances: Array.isArray(s.insurances)
                  ? s.insurances.map((i: any) => ({
                    id: i.id,
                    type: i.type,
                    policyNumber: i.policyNumber,
                    expiresAt: i.expiresAt ? String(i.expiresAt).slice(0, 10) : undefined,
                    filePath: i.filePath,
                    originalName: i.originalName,
                  }))
                  : [],
              }))
            )
            const allAssignments = subList.flatMap((s: any) => s.jobAssignments || [])
            setJobAssignments(allAssignments)
          }
          if (Array.isArray(jList)) {
            setJobsList(jList)
          }
          if (allCerts) {
            setCertifications(allCerts.companyCertifications || [])
            setPersonnelCertifications(prev => {
              // Replace rather than merge, since listAllSubcontractorCertifications fetches all that the user has access to.
              return allCerts.personnelCertifications || []
            })
          }
        }
      })
      .catch((err) => {
        console.error('Failed to load subcontractors context data', err)
        if (!cancelled) {
          setSubcontractors([])
          setJobsList([])
        }
      })
      .finally(() => {
        if (!cancelled) setListLoading(false)
      })
    return () => { cancelled = true }
  }, [hasFetched])

  const addSubcontractor = useCallback(async (payload: import('@/api/subcontractors').SubcontractorPayload): Promise<Subcontractor> => {
    const created = await subcontractorApi.createSubcontractor(payload)
    const mapped: Subcontractor = {
      id: created.id,
      companyName: created.companyName,
      officeContactName: created.officeContactName,
      officeContactEmail: created.officeContactEmail ?? '',
      officeContactPhone: created.officeContactPhone,
      siteContactName: created.siteContactName,
      siteContactEmail: created.siteContactEmail,
      siteContactPhone: created.siteContactPhone,
      status: created.status === 'inactive' ? 'inactive' : 'active',
      compliance: created.compliance,
      notes: created.notes,
      insurances: Array.isArray((created as any).insurances)
        ? (created as any).insurances.map((i: any) => ({
          id: i.id,
          type: i.type,
          policyNumber: i.policyNumber,
          expiresAt: i.expiresAt ? String(i.expiresAt).slice(0, 10) : undefined,
          filePath: i.filePath,
          originalName: i.originalName,
        }))
        : [],
    }
    setSubcontractors((prev) => [mapped, ...prev])
    return mapped
  }, [])

  const loadPersonnelForSubcontractor = useCallback(async (subId: string) => {
    try {
      const data = await subcontractorApi.listSubcontractorPersonnel(subId)
      const pList: any[] = []
      const pcList: any[] = []
      const pjaList: any[] = []
      const pdList: any[] = []
      data.forEach((p: any) => {
        const { certifications, jobAssignments, documents, ...rest } = p
        pList.push(rest)
        if (certifications) {
          pcList.push(
            ...certifications.map((c: any) => ({ ...c, subcontractorId: subId }))
          )
        }
        if (jobAssignments) pjaList.push(...jobAssignments)
        if (documents) pdList.push(...documents)
      })
      
      const checkInsList = await subcontractorApi.listSubcontractorPersonnelCheckIns(subId)
      
      setPersonnel(prev => {
        const others = prev.filter(x => x.subcontractorId !== subId)
        return [...others, ...pList]
      })
      setPersonnelCertifications(prev => {
        const personIds = pList.map(p => p.id)
        const others = prev.filter(x => !personIds.includes(x.personnelId))
        return [...others, ...pcList]
      })
      setPersonnelJobAssignments(prev => {
        const personIds = pList.map(p => p.id)
        const others = prev.filter(x => !personIds.includes(x.personnelId))
        return [...others, ...pjaList]
      })
      setPersonnelDocuments(prev => {
        const personIds = pList.map(p => p.id)
        const others = prev.filter(x => !personIds.includes(x.personnelId))
        return [...others, ...pdList]
      })
      setPersonnelCheckIns(prev => {
        const personIds = pList.map(p => p.id)
        const others = prev.filter(x => !personIds.includes(x.personnelId))
        return [...others, ...checkInsList]
      })
    } catch (err) {
      console.error('Failed to load personnel data', err)
    }
  }, [])

  const updateSubcontractor = useCallback(async (id: string, updates: Partial<Omit<Subcontractor, 'id'>>) => {
    const updated = await subcontractorApi.updateSubcontractor(id, updates)
    setSubcontractors((prev) => prev.map((s) => (s.id === id ? { ...s, ...updated } : s)))
  }, [])

  const deleteSubcontractorProfile = useCallback(async (id: string) => {
    await subcontractorApi.deleteSubcontractor(id)
    setSubcontractors((prev) => prev.filter((s) => s.id !== id))
    setCertifications((prev) => prev.filter((c) => c.subcontractorId !== id))
    setJobAssignments((prev) => prev.filter((a) => a.subcontractorId !== id))
    const removedPersonnelIds = personnel.filter((p) => p.subcontractorId === id).map((p) => p.id)
    setPersonnel((prev) => prev.filter((p) => p.subcontractorId !== id))
    setPersonnelCertifications((prev) => prev.filter((c) => !removedPersonnelIds.includes(c.personnelId)))
    setPersonnelJobAssignments((prev) => prev.filter((a) => !removedPersonnelIds.includes(a.personnelId)))
    setPersonnelCheckIns((prev) => prev.filter((c) => !removedPersonnelIds.includes(c.personnelId)))
    setPersonnelDocuments((prev) => prev.filter((d) => !removedPersonnelIds.includes(d.personnelId)))
  }, [personnel])

  const addCertification = useCallback(
    (cert: Omit<SubcontractorCertification, 'id' | 'status'>): SubcontractorCertification => {
      const status = certStatusFromExpiry(cert.expiresAt)
      const newCert: SubcontractorCertification = {
        ...cert,
        id: `scc-${Date.now()}`,
        status,
      }
      setCertifications((prev) => [...prev, newCert])
      return newCert
    },
    []
  )

  const updateCertification = useCallback(
    (id: string, updates: Partial<Pick<SubcontractorCertification, 'name' | 'issuedAt' | 'expiresAt'>>) => {
      setCertifications((prev) =>
        prev.map((c) => {
          if (c.id !== id) return c
          const next = { ...c, ...updates }
          if (updates.expiresAt !== undefined) next.status = certStatusFromExpiry(updates.expiresAt)
          return next
        })
      )
    },
    []
  )

  const removeCertification = useCallback((id: string) => {
    setCertifications((prev) => prev.filter((c) => c.id !== id))
  }, [])

  const addJobAssignment = useCallback(async (assignment: Omit<SubcontractorJobAssignment, 'id'>) => {
    try {
      await apiAddJobSubcontractor(assignment.jobId, assignment.subcontractorId)
      setJobAssignments((prev) => [
        ...prev,
        { ...assignment, id: `sja-${Date.now()}` },
      ])
    } catch (e) {
      console.error('Failed to assign job', e)
    }
  }, [])

  const removeJobAssignment = useCallback(async (id: string) => {
    const assignment = jobAssignments.find(a => a.id === id)
    if (assignment) {
      try {
        await apiRemoveJobSubcontractor(assignment.jobId, assignment.subcontractorId)
      } catch (e) {
        console.error('Failed to remove job assignment', e)
      }
    }
    setJobAssignments((prev) => prev.filter((a) => a.id !== id))
  }, [jobAssignments])

  const addPersonnel = useCallback((p: Omit<SubcontractorPersonnel, 'id'>): SubcontractorPersonnel => {
    const newP: SubcontractorPersonnel = { ...p, id: `sp-${Date.now()}` }
    setPersonnel((prev) => [...prev, newP])
    return newP
  }, [])

  const updatePersonnel = useCallback((id: string, updates: Partial<Pick<SubcontractorPersonnel, 'name' | 'email'>>) => {
    setPersonnel((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)))
  }, [])

  const removePersonnel = useCallback((id: string) => {
    setPersonnel((prev) => prev.filter((p) => p.id !== id))
    setPersonnelCertifications((prev) => prev.filter((c) => c.personnelId !== id))
    setPersonnelJobAssignments((prev) => prev.filter((a) => a.personnelId !== id))
    setPersonnelCheckIns((prev) => prev.filter((c) => c.personnelId !== id))
  }, [])

  const addPersonnelCertification = useCallback(
    (cert: Omit<SubcontractorPersonnelCertification, 'id' | 'status'>): SubcontractorPersonnelCertification => {
      const status = certStatusFromExpiry(cert.expiresAt)
      const newC: SubcontractorPersonnelCertification = { ...cert, id: `spc-${Date.now()}`, status }
      setPersonnelCertifications((prev) => [...prev, newC])
      return newC
    },
    []
  )

  const updatePersonnelCertification = useCallback(
    (id: string, updates: Partial<Pick<SubcontractorPersonnelCertification, 'name' | 'issuedAt' | 'expiresAt'>>) => {
      setPersonnelCertifications((prev) =>
        prev.map((c) => {
          if (c.id !== id) return c
          const next = { ...c, ...updates }
          if (updates.expiresAt !== undefined) next.status = certStatusFromExpiry(updates.expiresAt)
          return next
        })
      )
    },
    []
  )

  const removePersonnelCertification = useCallback((id: string) => {
    setPersonnelCertifications((prev) => prev.filter((c) => c.id !== id))
  }, [])

  const addPersonnelDocument = useCallback((doc: Omit<SubcontractorPersonnelDocument, 'id'>) => {
    const newDoc: SubcontractorPersonnelDocument = { ...doc, id: `spd-${Date.now()}` }
    setPersonnelDocuments((prev) => [...prev, newDoc])
    return newDoc
  }, [])

  const removePersonnelDocument = useCallback((id: string) => {
    setPersonnelDocuments((prev) => prev.filter((d) => d.id !== id))
  }, [])

  const addPersonnelJobAssignment = useCallback((a: Omit<SubcontractorPersonnelJobAssignment, 'id'>) => {
    setPersonnelJobAssignments((prev) => [...prev, { ...a, id: `spja-${Date.now()}` }])
  }, [])

  const updatePersonnelJobAssignment = useCallback((id: string, updates: Partial<SubcontractorPersonnelJobAssignment>) => {
    setPersonnelJobAssignments((prev) => prev.map((a) => (a.id === id ? { ...a, ...updates } : a)))
  }, [])

  const removePersonnelJobAssignment = useCallback((id: string) => {
    setPersonnelJobAssignments((prev) => prev.filter((x) => x.id !== id))
  }, [])

  const apiCheckInSubcontractorPersonnel = useCallback(async (subcontractorId: string, personnelId: string, jobId: string, date: string) => {
    try {
      const c = await subcontractorApi.checkInSubcontractorPersonnel(subcontractorId, personnelId, jobId, date)
      setPersonnelCheckIns((prev) => {
        const copy = [...prev]
        const idx = copy.findIndex(x => x.id === c.id)
        if (idx >= 0) copy[idx] = c
        else copy.push(c)
        return copy
      })
    } catch (e) {
      console.error('Failed to check in personnel', e)
    }
  }, [])

  const apiCheckOutSubcontractorPersonnel = useCallback(async (subcontractorId: string, personnelId: string, jobId: string, date: string) => {
    try {
      const c = await subcontractorApi.checkOutSubcontractorPersonnel(subcontractorId, personnelId, jobId, date)
      setPersonnelCheckIns((prev) => {
        const copy = [...prev]
        const idx = copy.findIndex(x => x.id === c.id)
        if (idx >= 0) copy[idx] = c
        return copy
      })
    } catch (e) {
      console.error('Failed to check out personnel', e)
    }
  }, [])

  return (
    <SubcontractorsContext.Provider
      value={{
        loadData,
        loadPersonnelForSubcontractor,
        subcontractors,
        listLoading,
        certifications,
        jobAssignments,
        addSubcontractor,
        updateSubcontractor,
        deleteSubcontractorProfile,
        addCertification,
        updateCertification,
        removeCertification,
        addJobAssignment,
        removeJobAssignment,
        personnel,
        personnelCertifications,
        personnelJobAssignments,
        personnelCheckIns,
        addPersonnel,
        updatePersonnel,
        removePersonnel,
        addPersonnelCertification,
        updatePersonnelCertification,
        removePersonnelCertification,
        personnelDocuments,
        addPersonnelDocument,
        removePersonnelDocument,
        addPersonnelJobAssignment,
        updatePersonnelJobAssignment,
        removePersonnelJobAssignment,
        apiCheckInSubcontractorPersonnel,
        apiCheckOutSubcontractorPersonnel,
        jobsList,
      }}
    >
      {children}
    </SubcontractorsContext.Provider>
  )
}

const noopPersonnelCert = (): SubcontractorPersonnelCertification =>
  ({ id: '', personnelId: '', name: '', issuedAt: '', expiresAt: '', status: 'current' })

export function useSubcontractors() {
  const ctx = useContext(SubcontractorsContext)

  useEffect(() => {
    if (ctx && ctx.loadData) {
      ctx.loadData()
    }
  }, [ctx])

  if (!ctx)
    return {
      loadData: () => { },
      loadPersonnelForSubcontractor: async () => { },

      subcontractors: [],
      listLoading: false,
      certifications: [],
      jobAssignments: [],
      addSubcontractor: async () => ({ id: '', companyName: '', officeContactName: '', officeContactEmail: '', status: 'active' as const, contractStart: '' }),
      updateSubcontractor: () => { },
      deleteSubcontractorProfile: async () => { },
      addCertification: () => ({ id: '', subcontractorId: '', name: '', issuedAt: '', expiresAt: '', status: 'current' as const }),
      updateCertification: () => { },
      removeCertification: () => { },
      addJobAssignment: () => { },
      removeJobAssignment: () => { },
      personnel: [],
      personnelCertifications: [],
      personnelJobAssignments: [],
      personnelCheckIns: [],
      addPersonnel: () => ({ id: '', subcontractorId: '', name: '', email: undefined }),
      updatePersonnel: () => { },
      removePersonnel: () => { },
      addPersonnelCertification: () => noopPersonnelCert(),
      updatePersonnelCertification: () => { },
      removePersonnelCertification: () => { },
      personnelDocuments: [],
      removePersonnelDocument: () => { },
      addPersonnelJobAssignment: () => { },
      updatePersonnelJobAssignment: () => { },
      removePersonnelJobAssignment: () => { },
      apiCheckInSubcontractorPersonnel: async () => { },
      apiCheckOutSubcontractorPersonnel: async () => { },
      jobsList: [],
    }

  return ctx
}
