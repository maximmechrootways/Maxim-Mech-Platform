import React, { createContext, useContext } from 'react'
import type { User, UserRole } from '@/types'
import { useAuth } from './AuthContext'

interface UserContextValue {
  user: User | null
  setUser: (u: User | null) => void
  login: (email: string, _password: string) => void
  logout: () => void
  switchRole: (role: UserRole) => void
}

const UserContext = createContext<UserContextValue | null>(null)


export function UserProvider({ children }: { children: React.ReactNode }) {
  const { session, endSession, switchAuthRole } = useAuth()

  const user: User | null = session ? {
    id: session.userId,
    name: session.userName,
    email: session.userEmail,
    role: session.role as UserRole,
    actualRole: (session.actualRole ?? session.role) as UserRole,
    active: true,
    uiPreferences: session.uiPreferences,
  } : null

  const setUser = () => { }
  const login = () => { }
  const logout = () => { endSession() }

  const switchRole = (role: UserRole) => {
    switchAuthRole(role as any)
  }

  return (
    <UserContext.Provider value={{ user, setUser, login, logout, switchRole }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  const ctx = useContext(UserContext)
  if (!ctx) throw new Error('useUser must be used within UserProvider')
  return ctx
}
