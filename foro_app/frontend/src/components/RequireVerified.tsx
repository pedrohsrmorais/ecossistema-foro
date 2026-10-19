import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * Usado dentro de <ProtectedRoute> (já garante que há um usuário logado).
 * Bloqueia o acesso às páginas do CRM até o e-mail ser confirmado
 * (ver requireVerifiedEmail no backend e pages/VerifyEmail.tsx).
 */
export default function RequireVerified() {
  const { user } = useAuth()

  if (user && !user.email_verified) {
    return <Navigate to="/verify-email" replace />
  }

  return <Outlet />
}
