import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { authApi, type AuthResponse } from '../api'

interface User {
  id: string
  name: string
  email: string
  role: string
}

interface AuthContextType {
  user: User | null
  token: string | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (data: { name: string; email: string; password: string; accountName: string }) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const storedToken = localStorage.getItem('foro_token')
    const storedUser  = localStorage.getItem('foro_user')
    if (storedToken && storedUser) {
      setToken(storedToken)
      try { setUser(JSON.parse(storedUser)) } catch {}
    }
    setIsLoading(false)
  }, [])

  function _storeSession(res: AuthResponse) {
    localStorage.setItem('foro_token', res.token)
    localStorage.setItem('foro_user', JSON.stringify(res.user))
    setToken(res.token)
    setUser(res.user)
  }

  async function login(email: string, password: string) {
    const res = await authApi.login({ email, password })
    _storeSession(res)
  }

  async function register(data: { name: string; email: string; password: string; accountName: string }) {
    const res = await authApi.register(data)
    _storeSession(res)
  }

  function logout() {
    localStorage.removeItem('foro_token')
    localStorage.removeItem('foro_user')
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
