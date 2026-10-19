import { useContext } from 'react'
import { AuthContext } from '../context/AuthContext'

/**
 * Hook para acessar o contexto de autenticação.
 * Lança erro se usado fora do AuthProvider.
 */
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth deve ser usado dentro do AuthProvider')
  }
  return ctx
}
