import { Navigate, Outlet } from 'react-router-dom'
import { useAdminAuth } from '../context/AdminAuthContext'

export default function AdminProtectedRoute() {
  const { admin, isLoading } = useAdminAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-950">
        <div className="w-8 h-8 border-4 border-accent-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!admin) return <Navigate to="/admin/login" replace />

  return <Outlet />
}
