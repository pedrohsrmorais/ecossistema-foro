import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { adminApi } from '../api'

interface PlatformAdmin {
  id: string
  name: string
  email: string
}

interface AdminAuthContextType {
  admin: PlatformAdmin | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

// Contexto totalmente separado do AuthContext do tenant — chaves de
// localStorage diferentes (foro_admin_token/foro_admin_user), sem overlap
// de sessão. Um admin da plataforma não pertence a nenhum escritório.
const AdminAuthContext = createContext<AdminAuthContextType | null>(null)

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<PlatformAdmin | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const storedToken = localStorage.getItem('foro_admin_token')
    const storedAdmin = localStorage.getItem('foro_admin_user')
    if (storedToken && storedAdmin) {
      try { setAdmin(JSON.parse(storedAdmin)) } catch {}
    }
    setIsLoading(false)
  }, [])

  async function login(email: string, password: string) {
    const res = await adminApi.login(email, password)
    localStorage.setItem('foro_admin_token', res.token)
    localStorage.setItem('foro_admin_user', JSON.stringify(res.admin))
    setAdmin(res.admin)
  }

  function logout() {
    localStorage.removeItem('foro_admin_token')
    localStorage.removeItem('foro_admin_user')
    setAdmin(null)
  }

  return (
    <AdminAuthContext.Provider value={{ admin, isLoading, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  )
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext)
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider')
  return ctx
}
