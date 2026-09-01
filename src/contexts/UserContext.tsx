import React, { createContext, useContext, useState } from 'react'
import type { User, UserRole } from '@/types'
import { login as apiLogin } from '@/api/auth'

interface UserContextValue {
  user: User | null
  setUser: (u: User | null) => void
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  switchRole: (role: UserRole) => void
}

const UserContext = createContext<UserContextValue | null>(null)

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)

  const login = async (email: string, password: string) => {
    const u = await apiLogin(email, password)
    setUser(u)
  }

  const logout = () => setUser(null)

  const switchRole = (role: UserRole) => {
    if (!user) return
    setUser({ ...user, role })
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
