import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { HRTodoItem } from '@/types'
import { useAuth } from '@/contexts/AuthContext'
import * as hrTodoApi from '@/api/hrTodo'

interface HRTodosContextValue {
  loadData: () => void
  todos: HRTodoItem[]
  loading: boolean
  refetch: () => Promise<void>
  addTodo: (item: Omit<HRTodoItem, 'id' | 'createdAt'>) => Promise<HRTodoItem | void>
  updateTodo: (id: string, patch: Partial<Pick<HRTodoItem, 'title' | 'dueDate' | 'dueTime' | 'recurrence' | 'completed' | 'completedAt' | 'linkTo'>>) => Promise<void>
  removeTodo: (id: string) => Promise<void>
  toggleComplete: (id: string) => Promise<void>
}

const HRTodosContext = createContext<HRTodosContextValue | null>(null)

export function HRTodosProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth()
  const [hasFetched, setHasFetched] = useState(false)
  const loadData = useCallback(() => setHasFetched(true), [])
  const [todos, setTodos] = useState<HRTodoItem[]>([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    try {
      setLoading(true)
      const data = await hrTodoApi.fetchHRTodo()
      setTodos(Array.isArray(data) ? data : [])
    } catch {
      setTodos([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Only fetch when authenticated so Authorization header is set (avoids 401)
  useEffect(() => {
    if (!session || !hasFetched) return
    refetch()
  }, [session?.id, hasFetched, refetch])

  const addTodo = useCallback(async (item: Omit<HRTodoItem, 'id' | 'createdAt'>): Promise<HRTodoItem | void> => {
    const created = await hrTodoApi.createHRTodo({
      title: item.title,
      recurrence: item.recurrence ?? 'daily',
      dueDate: item.dueDate,
      dueTime: item.dueTime,
      linkTo: item.linkTo,
    }) as HRTodoItem
    const full: HRTodoItem = {
      ...created,
      createdAt: created.createdAt ?? new Date().toISOString(),
    }
    setTodos((prev) => [full, ...prev])
    return full
  }, [])

  const updateTodo = useCallback(async (id: string, patch: Partial<Pick<HRTodoItem, 'title' | 'dueDate' | 'dueTime' | 'recurrence' | 'completed' | 'completedAt' | 'linkTo'>>) => {
    const updated = await hrTodoApi.updateHRTodo(id, patch)
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...updated, createdAt: t.createdAt } : t)))
  }, [])

  const removeTodo = useCallback(async (id: string) => {
    await hrTodoApi.deleteHRTodo(id)
    setTodos((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toggleComplete = useCallback(async (id: string) => {
    const t = todos.find((x) => x.id === id)
    if (!t) return
    const completed = !t.completed
    const updated = await hrTodoApi.updateHRTodo(id, { completed })
    setTodos((prev) => prev.map((x) => (x.id === id ? { ...updated, createdAt: x.createdAt } : x)))
  }, [todos])

  const value: HRTodosContextValue = {
    loadData,
    todos,
    loading,
    refetch,
    addTodo,
    updateTodo,
    removeTodo,
    toggleComplete,
  }

  return <HRTodosContext.Provider value={value}>{children}</HRTodosContext.Provider>
}

export function useHRTodos() {
  const ctx = useContext(HRTodosContext)

  if (!ctx)
    return {
      loadData: () => { },
      todos: [] as HRTodoItem[],
      loading: false,
      refetch: async () => { },
      addTodo: async () => undefined,
      updateTodo: async () => { },
      removeTodo: async () => { },
      toggleComplete: async () => { },
    }

  return ctx
}
