import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { CorrectiveAction } from '@/types'
import * as capaApi from '@/api/capa'

interface CorrectiveActionsContextValue {
  loadData: () => void
  actions: CorrectiveAction[]
  loading: boolean
  refetch: () => Promise<void>
  addAction: (action: Omit<CorrectiveAction, 'id'>) => Promise<void>
  updateAction: (id: string, updates: Partial<Omit<CorrectiveAction, 'id'>>) => Promise<void>
  removeAction: (id: string) => Promise<void>
}

const CorrectiveActionsContext = createContext<CorrectiveActionsContextValue | null>(null)

export function CorrectiveActionsProvider({ children }: { children: React.ReactNode }) {
  const [hasFetched, setHasFetched] = useState(false)
  const loadData = useCallback(() => setHasFetched(true), [])
  const [actions, setActions] = useState<CorrectiveAction[]>([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    try {
      setLoading(true)
      const list = await capaApi.fetchCapaList()
      setActions(Array.isArray(list) ? list : [])
    } catch {
      setActions([])
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    if (!hasFetched) return;
    refetch()
  }, [hasFetched, refetch])

  const addAction = useCallback(async (action: Omit<CorrectiveAction, 'id'>) => {
    const created = await capaApi.createCapa({
      actionType: action.actionType,
      sourceType: action.sourceType,
      sourceId: action.sourceId,
      title: action.title,
      description: action.description,
      assignedTo: action.assignedTo,
      dueDate: action.dueDate,
      status: action.status,
    })
    setActions((prev) => [created, ...prev])
  }, [])

  const updateAction = useCallback(async (id: string, updates: Partial<Omit<CorrectiveAction, 'id'>>) => {
    const updated = await capaApi.updateCapa(id, {
      actionType: updates.actionType,
      sourceType: updates.sourceType,
      sourceId: updates.sourceId,
      title: updates.title,
      description: updates.description,
      assignedTo: updates.assignedTo,
      dueDate: updates.dueDate,
      status: updates.status,
      completedAt: updates.completedAt,
    })
    setActions((prev) => prev.map((a) => (a.id === id ? updated : a)))
  }, [])

  const removeAction = useCallback(async (id: string) => {
    await capaApi.deleteCapa(id)
    setActions((prev) => prev.filter((a) => a.id !== id))
  }, [])

  return (
    <CorrectiveActionsContext.Provider value={{
      loadData,
      actions, loading, refetch, addAction, updateAction, removeAction
    }}>
      {children}
    </CorrectiveActionsContext.Provider>
  )
}

export function useCorrectiveActions() {
  const ctx = useContext(CorrectiveActionsContext)

  useEffect(() => {
    if (ctx && ctx.loadData) {
      ctx.loadData()
    }
  }, [ctx])

  if (!ctx)
    return {
      loadData: () => { },
      actions: [] as CorrectiveAction[],
      loading: false,
      refetch: async () => { },
      addAction: async () => { },
      updateAction: async () => { },
      removeAction: async () => { },
    }

  return ctx
}
