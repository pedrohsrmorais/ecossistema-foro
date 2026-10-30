import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { authApi, usersApi, type AuthResponse } from '../api'

interface User {
  id: string
  name: string
  email: string
  role: string
  email_verified?: boolean
  phone_verified?: boolean
}

interface AuthContextType {
  user: User | null
  token: string | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<AuthResponse>
  register: (data: { name: string; email: string; password: string; phone?: string; accountName?: string }) => Promise<AuthResponse>
  logout: () => void
  markEmailVerified: () => void
  /** Entra num workspace (espaço pessoal ou escritório) com o token devolvido pela API e recarrega o app nele. */
  enterWorkspace: (token: string) => Promise<void>
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
    return res
  }

  async function register(data: { name: string; email: string; password: string; phone?: string; accountName?: string }) {
    const res = await authApi.register(data)
    _storeSession(res)
    return res
  }

  async function enterWorkspace(newToken: string) {
    localStorage.setItem('foro_token', newToken)
    try {
      const me = await usersApi.me()
      localStorage.setItem('foro_user', JSON.stringify({ id: me.id, name: me.name, email: me.email, role: me.role, email_verified: me.email_verified, phone_verified: user?.phone_verified }))
    } catch { /* o app recarrega e busca de novo */ }
    window.location.assign('/chat') // recarrega: zera cache, conversa da IA e tudo o que era do workspace anterior
  }

  function logout() {
    localStorage.removeItem('foro_token')
    localStorage.removeItem('foro_user')
    setToken(null)
    setUser(null)
  }

  /**
   * Atualiza o usuário local como "e-mail verificado" após o sucesso de
   * POST /auth/verify-code — evita precisar relogar para desbloquear o acesso.
   */
  function markEmailVerified() {
    setUser(prev => {
      if (!prev) return prev
      const updated = { ...prev, email_verified: true }
      localStorage.setItem('foro_user', JSON.stringify(updated))
      return updated
    })
  }

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout, markEmailVerified, enterWorkspace }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
