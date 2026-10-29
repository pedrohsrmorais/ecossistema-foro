import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { AdminAuthProvider } from './context/AdminAuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import RequireVerified from './components/RequireVerified'
import AdminProtectedRoute from './components/AdminProtectedRoute'
import Layout from './components/Layout'
import AdminLayout from './components/AdminLayout'
import Login from './pages/Login'
import Register from './pages/Register'
import VerifyEmail from './pages/VerifyEmail'
import Dashboard from './pages/Dashboard'
import Chat from './pages/Chat'
import Leads from './pages/Leads'
import LeadDetail from './pages/LeadDetail'
import Tasks from './pages/Tasks'
import Plans from './pages/Plans'
import Settings from './pages/Settings'
import Education from './pages/Education'
import TrilhaDetail from './pages/TrilhaDetail'
import ModuloDesativado from './pages/ModuloDesativado'
import ConsultaCnpj from './pages/aplicativos/ConsultaCnpj'
import ConsultaCpf from './pages/aplicativos/ConsultaCpf'
import ConsultaProcessual from './pages/aplicativos/ConsultaProcessual'
import PesquisaInteligente from './pages/aplicativos/PesquisaInteligente'
import ProvasDeConceito from './pages/inteligencia/ProvasDeConceito'
import QuizTake from './pages/inteligencia/QuizTake'
import DesafiosSemanais from './pages/inteligencia/DesafiosSemanais'
import Comunidade from './pages/inteligencia/Comunidade'
import AdminLogin from './pages/admin/AdminLogin'
import AdminAccounts from './pages/admin/AdminAccounts'
import AdminAccountDetail from './pages/admin/AdminAccountDetail'
import AdminCreditsOverview from './pages/admin/AdminCreditsOverview'
import AdminEducationTrilhas from './pages/admin/AdminEducationTrilhas'
import AdminEducationTrilhaDetail from './pages/admin/AdminEducationTrilhaDetail'
import AdminQuizDetail from './pages/admin/AdminQuizDetail'
import AdminChallenges from './pages/admin/AdminChallenges'
import AdminCommunity from './pages/admin/AdminCommunity'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <AuthProvider>
      <AdminAuthProvider>
        <Routes>
          {/* Públicas (app do escritório) */}
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
                <Route path="/planos"    element={<Plans />} />
                <Route path="/education"      element={<Education />} />
                <Route path="/education/:id"  element={<TrilhaDetail />} />
                <Route path="/modulo-desativado" element={<ModuloDesativado />} />

                {/* Aplicativos — consultas pagas (todas atrás de "Em breve" por
                    enquanto, ver config/featureFlags.ts) */}
                <Route path="/pesquisa-inteligente" element={<PesquisaInteligente />} />
                <Route path="/consulta-cnpj"        element={<ConsultaCnpj />} />
                <Route path="/consulta-cpf"         element={<ConsultaCpf />} />
                <Route path="/consulta-processual"  element={<ConsultaProcessual />} />

                {/* Inteligência — Provas de conceito, Desafios semanais, Comunidade */}
                <Route path="/provas-de-conceito"          element={<ProvasDeConceito />} />
                <Route path="/provas-de-conceito/:aulaId"  element={<QuizTake />} />
                <Route path="/desafios-semanais"           element={<DesafiosSemanais />} />
                <Route path="/comunidade"                  element={<Comunidade />} />
              </Route>
            </Route>
          </Route>

          {/* Painel administrativo da plataforma (equipe intellsn) — sessão e
              autenticação totalmente separadas do app do escritório acima. */}
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route element={<AdminProtectedRoute />}>
            <Route element={<AdminLayout />}>
              <Route path="/admin" element={<Navigate to="/admin/accounts" replace />} />
              <Route path="/admin/accounts"     element={<AdminAccounts />} />
              <Route path="/admin/accounts/:id" element={<AdminAccountDetail />} />
              <Route path="/admin/credits"      element={<AdminCreditsOverview />} />
              <Route path="/admin/education"     element={<AdminEducationTrilhas />} />
              <Route path="/admin/education/:id" element={<AdminEducationTrilhaDetail />} />
              <Route path="/admin/education/aulas/:aulaId/quiz" element={<AdminQuizDetail />} />
              <Route path="/admin/challenges"    element={<AdminChallenges />} />
              <Route path="/admin/community"     element={<AdminCommunity />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </AdminAuthProvider>
    </AuthProvider>
  )
}
