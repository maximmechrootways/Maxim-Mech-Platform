import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react'
import type { Employee } from '@/types'
import { api } from '@/api'
import { useAuth } from '@/contexts/AuthContext'

interface EmployeesContextValue {
  loadData: () => void
  employees: Employee[]
  addEmployee: (e: Omit<Employee, 'id'>) => Promise<Employee>
  updateEmployee: (id: string, updates: Partial<Omit<Employee, 'id'>>) => Promise<void>
  deleteEmployee: (id: string) => Promise<void>
  getEmployee: (id: string) => Employee | undefined
}

const EmployeesContext = createContext<EmployeesContextValue | null>(null)

/** Normalize API / form date to YYYY-MM-DD (UTC calendar day). */
function toDateOnly(v: unknown): string | undefined {
  if (v == null || v === '') return undefined
  const d = new Date(v as string)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString().slice(0, 10)
}

export function EmployeesProvider({ children }: { children: React.ReactNode }) {
  const { session, loading: authLoading } = useAuth()
  const sessionUserId = session?.userId ?? null
  const [hasFetched, setHasFetched] = useState(false)
  const [employees, setEmployees] = useState<Employee[]>([])
  const requestIdRef = useRef(0)

  const loadData = useCallback(() => {
    setHasFetched(true)
  }, [])

  // Depend on stable sessionUserId — Auth clones `session` every second for TTL countdown.
  useEffect(() => {
    if (authLoading || !sessionUserId || !hasFetched) return

    const requestId = ++requestIdRef.current

    // Fetch real employees from backend
    api.get('/users/admin')
      .then((res) => {
        if (requestId !== requestIdRef.current) return
        const users = res.data as any[]
        if (Array.isArray(users) && users.length > 0) {
          const mapped: Employee[] = users.map((u: any) => {
          const status = u.employmentStatus === 'on-leave' ? 'on-leave' : u.employmentStatus === 'terminated' ? 'terminated' : (u.isActive === false ? 'terminated' : 'active')
          return {
            id: u.id,
            firstName: u.firstName || u.name?.split(' ')[0] || '',
            lastName: u.lastName || u.name?.split(' ').slice(1).join(' ') || '',
            email: u.email,
            phone: u.phone,
            birthday: u.birthday ? new Date(u.birthday).toISOString().slice(0, 10) : undefined,
            emergencyContact1Name: u.emergencyContact1Name ?? u.emergencyContactName ?? undefined,
            emergencyContact1Phone: u.emergencyContact1Phone ?? u.emergencyContactPhone ?? undefined,
            emergencyContact1Relationship: u.emergencyContact1Relationship ?? undefined,
            emergencyContact2Name: u.emergencyContact2Name ?? undefined,
            emergencyContact2Phone: u.emergencyContact2Phone ?? undefined,
            emergencyContact2Relationship: u.emergencyContact2Relationship ?? undefined,
            emergencyNotes: u.emergencyNotes ?? undefined,
            // Don't fall back to role — job title is trade/office; role is platform permissions
            jobTitle: u.jobTitle ?? undefined,
            department: u.department,
            hireDate: (() => {
              if (u.hireDate) return new Date(u.hireDate).toISOString().slice(0, 10)
              if (u.createdAt) return new Date(u.createdAt).toISOString().slice(0, 10)
              return new Date().toISOString().slice(0, 10)
            })(),
            status,
            role: u.role,
            onLeaveStartedAt: u.onLeaveStartedAt ? new Date(u.onLeaveStartedAt).toISOString().slice(0, 10) : undefined,
            terminatedAt: u.terminatedAt ? new Date(u.terminatedAt).toISOString().slice(0, 10) : undefined,
            jobAssignments: u.jobAssignments?.map((a: any) => ({
              id: a.id,
              jobId: a.jobId,
              jobTitle: a.job?.title,
              siteName: a.job?.site?.name,
            })) || [],
            jobSupervisorLinks: u.jobSupervisorLinks?.map((a: any) => ({
              id: a.id,
              jobId: a.jobId,
              jobTitle: a.job?.title,
              siteName: a.job?.site?.name,
            })) || [],
            timeOffEntries: Array.isArray(u.timeOffEntries)
              ? u.timeOffEntries.map((t: any) => ({
                id: t.id,
                type: t.type,
                startDate: t.startDate ? new Date(t.startDate).toISOString().slice(0, 10) : '',
                endDate: t.endDate ? new Date(t.endDate).toISOString().slice(0, 10) : '',
                notes: t.notes ?? '',
                compensation: t.compensation === 'unpaid' ? 'unpaid' : 'paid',
              }))
              : [],
          }
        })
          setEmployees(mapped)
        }
      })
      .catch((err) => {
        if (requestId !== requestIdRef.current) return
        if (err.response?.status === 403) {
          api.get('/users')
            .then((fallbackRes) => {
              if (requestId !== requestIdRef.current) return
              const users = fallbackRes.data as any[]
              if (Array.isArray(users) && users.length > 0) {
                const mapped: Employee[] = users.map((u: any) => {
                  return {
                    id: u.id,
                    firstName: u.name?.split(' ')[0] || '',
                    lastName: u.name?.split(' ').slice(1).join(' ') || '',
                    email: '',
                    hireDate: new Date().toISOString().slice(0, 10),
                    status: 'active',
                    role: u.role,
                    jobAssignments: [],
                    jobSupervisorLinks: [],
                  }
                })
                setEmployees(mapped)
              }
            })
            .catch(e => console.warn('Failed to fetch fallback employees:', e))
        } else {
          console.warn('Failed to fetch employees from API:', err)
        }
      })
  }, [hasFetched, authLoading, sessionUserId])

  const addEmployee = useCallback(async (e: Omit<Employee, 'id'>): Promise<Employee> => {
    try {
      // Create user via backend API — this also generates an invite code
      const res = await api.post('/users', {
        email: e.email,
        firstName: e.firstName,
        lastName: e.lastName,
        role: 'labourer',
      })

      const { user, inviteCode } = res.data

      const newEmp: Employee = {
        ...e,
        id: user.id,
      }
      setEmployees((prev) => [...prev, newEmp])

      // Show the invite code to HR
      alert(`Employee created!\n\nInvite code: ${inviteCode}\n\nGive this code to the employee so they can log in for the first time.`)

      return newEmp
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to create employee'
      alert(`Error: ${msg}`)
      throw err
    }
  }, [])

  const updateEmployee = useCallback(async (id: string, updates: Partial<Omit<Employee, 'id'>>) => {
    try {
      const body: Record<string, unknown> = {}
      if (updates.email !== undefined) body.email = updates.email
      if (updates.firstName !== undefined) body.firstName = updates.firstName
      if (updates.lastName !== undefined) body.lastName = updates.lastName
      if (updates.phone !== undefined) body.phone = updates.phone
      if (updates.birthday !== undefined) body.birthday = updates.birthday === '' ? null : updates.birthday
      if (updates.emergencyContact1Name !== undefined)
        body.emergencyContact1Name = updates.emergencyContact1Name === '' ? null : updates.emergencyContact1Name
      if (updates.emergencyContact1Phone !== undefined)
        body.emergencyContact1Phone = updates.emergencyContact1Phone === '' ? null : updates.emergencyContact1Phone
      if (updates.emergencyContact1Relationship !== undefined)
        body.emergencyContact1Relationship = updates.emergencyContact1Relationship === '' ? null : updates.emergencyContact1Relationship
      if (updates.emergencyContact2Name !== undefined)
        body.emergencyContact2Name = updates.emergencyContact2Name === '' ? null : updates.emergencyContact2Name
      if (updates.emergencyContact2Phone !== undefined)
        body.emergencyContact2Phone = updates.emergencyContact2Phone === '' ? null : updates.emergencyContact2Phone
      if (updates.emergencyContact2Relationship !== undefined)
        body.emergencyContact2Relationship = updates.emergencyContact2Relationship === '' ? null : updates.emergencyContact2Relationship
      if (updates.emergencyNotes !== undefined) body.emergencyNotes = updates.emergencyNotes === '' ? null : updates.emergencyNotes
      if (updates.jobTitle !== undefined) body.jobTitle = updates.jobTitle
      if (updates.role !== undefined) body.role = updates.role
      if (updates.department !== undefined) body.department = updates.department
      if (updates.status !== undefined) {
        body.employmentStatus = updates.status
        body.isActive = updates.status !== 'terminated'
      }
      if (updates.onLeaveStartedAt !== undefined) body.onLeaveStartedAt = updates.onLeaveStartedAt || null
      if (updates.terminatedAt !== undefined) body.terminatedAt = updates.terminatedAt || null
      if (updates.hireDate !== undefined) {
        body.hireDate = updates.hireDate === '' || updates.hireDate === null ? null : updates.hireDate
      }
      const res = await api.patch(`/users/${id}`, body)
      const u = res.data
      const status = u.employmentStatus === 'on-leave' ? 'on-leave' : u.employmentStatus === 'terminated' ? 'terminated' : (u.isActive === false ? 'terminated' : 'active')

      const hireFromApi = toDateOnly(u.hireDate)
      const hireFromRequest =
        typeof updates.hireDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(updates.hireDate)
          ? updates.hireDate
          : undefined
      const hireDateResolved =
        hireFromApi ??
        hireFromRequest ??
        toDateOnly(u.createdAt) ??
        new Date().toISOString().slice(0, 10)

      const mapped: Partial<Employee> = {
        id: u.id,
        firstName: u.firstName || '',
        lastName: u.lastName || '',
        email: u.email,
        phone: u.phone,
        birthday: u.birthday ? new Date(u.birthday).toISOString().slice(0, 10) : undefined,
        emergencyContact1Name: u.emergencyContact1Name ?? u.emergencyContactName ?? undefined,
        emergencyContact1Phone: u.emergencyContact1Phone ?? u.emergencyContactPhone ?? undefined,
        emergencyContact1Relationship: u.emergencyContact1Relationship ?? undefined,
        emergencyContact2Name: u.emergencyContact2Name ?? undefined,
        emergencyContact2Phone: u.emergencyContact2Phone ?? undefined,
        emergencyContact2Relationship: u.emergencyContact2Relationship ?? undefined,
        emergencyNotes: u.emergencyNotes ?? undefined,
        jobTitle: u.jobTitle,
        department: u.department,
        hireDate: hireDateResolved,
        status,
        role: u.role,
        onLeaveStartedAt: u.onLeaveStartedAt ? new Date(u.onLeaveStartedAt).toISOString().slice(0, 10) : undefined,
        terminatedAt: u.terminatedAt ? new Date(u.terminatedAt).toISOString().slice(0, 10) : undefined,
      }
      if (Array.isArray(u.jobAssignments)) {
        mapped.jobAssignments = u.jobAssignments.map((a: any) => ({
          id: a.id,
          jobId: a.jobId,
          jobTitle: a.job?.title,
          siteName: a.job?.site?.name,
        }))
      }
      if (Array.isArray(u.jobSupervisorLinks)) {
        mapped.jobSupervisorLinks = u.jobSupervisorLinks.map((a: any) => ({
          id: a.id,
          jobId: a.jobId,
          jobTitle: a.job?.title,
          siteName: a.job?.site?.name,
        }))
      }
      if (Array.isArray(u.timeOffEntries)) {
        mapped.timeOffEntries = u.timeOffEntries.map((t: any) => ({
          id: t.id,
          type: t.type,
          startDate: t.startDate ? new Date(t.startDate).toISOString().slice(0, 10) : '',
          endDate: t.endDate ? new Date(t.endDate).toISOString().slice(0, 10) : '',
          notes: t.notes ?? '',
          compensation: t.compensation === 'unpaid' ? 'unpaid' : 'paid',
        }))
      }
      setEmployees((prev) => prev.map((emp) => (emp.id === id ? { ...emp, ...mapped } : emp)))
    } catch (err: any) {
      const msg = err.response?.data?.error || err.response?.data?.message || 'Failed to update employee'
      alert(`Error: ${msg}`)
      throw err
    }
  }, [])

  const deleteEmployee = useCallback(async (id: string) => {
    try {
      await api.delete(`/users/${id}`)
      setEmployees((prev) => prev.filter((emp) => emp.id !== id))
    } catch (err: any) {
      const msg = err.response?.data?.error || err.response?.data?.message || 'Failed to delete employee profile'
      alert(`Error: ${msg}`)
      throw err
    }
  }, [])

  const getEmployee = useCallback(
    (id: string) => employees.find((e) => e.id === id),
    [employees]
  )

  const value = useMemo(
    () => ({
      loadData,
      employees,
      addEmployee,
      updateEmployee,
      deleteEmployee,
      getEmployee,
    }),
    [loadData, employees, addEmployee, updateEmployee, deleteEmployee, getEmployee]
  )

  return (
    <EmployeesContext.Provider value={value}>
      {children}
    </EmployeesContext.Provider>
  )
}

export function useEmployees() {
  const ctx = useContext(EmployeesContext)
  const { session, loading: authLoading } = useAuth()
  const sessionUserId = session?.userId ?? null
  const loadData = ctx?.loadData

  useEffect(() => {
    if (authLoading || !sessionUserId || !loadData) return
    loadData()
  }, [loadData, authLoading, sessionUserId])

  if (!ctx)
    return {
      loadData: () => { },
      employees: [],
      addEmployee: async () => ({ id: '', firstName: '', lastName: '', email: '', hireDate: '', status: 'active' as const }),
      updateEmployee: async () => { },
      deleteEmployee: async () => { },
      getEmployee: (_: string) => undefined,
    }

  return ctx
}
