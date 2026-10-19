import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import RequireVerified from './components/RequireVerified'
import Layout from './components/Layout'
import Login from './pages/Login'
import Register from './pages/Register'
import VerifyEmail from './pages/VerifyEmail'
import Dashboard from './pages/Dashboard'
import Chat from './pages/Chat'
import Leads from './pages/Leads'
import LeadDetail from './pages/LeadDetail'
import Tasks from './pages/Tasks'
import Settings from './pages/Settings'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Públicas */}
        <Route path="/login"    element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Logado (pode ainda não ter confirmado o e-mail) */}
        <Route element={<ProtectedRoute />}>
          <Route path="/verify-email" element={<VerifyEmail />} />

          {/* Logado + e-mail confirmado */}
          <Route element={<RequireVerified />}>
            <Route element={<Layout />}>
              <Route index element={<Navigate to="/chat" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/chat"      element={<Chat />} />
              <Route path="/leads"     element={<Leads />} />
              <Route path="/leads/:id" element={<LeadDetail />} />
              <Route path="/tasks"     element={<Tasks />} />
              <Route path="/settings"  element={<Settings />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  )
}
