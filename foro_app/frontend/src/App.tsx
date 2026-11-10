import { Routes, Route, Navigate, useParams } from 'react-router-dom'
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
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Dashboard from './pages/Dashboard'
import Chat from './pages/Chat'
import Leads from './pages/Leads'
import LeadDetail from './pages/LeadDetail'
import AiLibrary from './pages/AiLibrary'
import Cases from './pages/Cases'
import CaseDetail from './pages/CaseDetail'
import Agenda from './pages/Agenda'
import Tasks from './pages/Tasks'
import Quadros from './pages/Quadros'
import Home from './pages/legal/Home'
import Privacidade from './pages/legal/Privacidade'
import Termos from './pages/legal/Termos'
import QuadroView from './pages/QuadroView'
import Plans from './pages/Plans'
import Settings from './pages/Settings'
import Support from './pages/Support'
import Education from './pages/Education'
import TrilhaDetail from './pages/TrilhaDetail'
import ModuloDesativado from './pages/ModuloDesativado'
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
import Documents from './pages/Documents'
import DocumentEditor from './pages/DocumentEditor'
import OfficeTemplates from './pages/OfficeTemplates'
import NotFound from './pages/NotFound'
import Escritorio from './pages/Escritorio'
import MonitoramentoLayout from './pages/MonitoramentoLayout'
import ComingSoon from './components/ComingSoon'
import { LOCKED_FEATURES } from './config/featureFlags'

function Redirect({ to }: { to: (id: string) => string }) {
  const { id = '' } = useParams()
  return <Navigate to={to(id)} replace />
}

export default function App() {
  return (
    <AuthProvider>
      <AdminAuthProvider>
        <Routes>
          {/* Públicas (app do escritório) — a inicial, a Privacidade e os Termos também são exigidos pelo Google (OAuth) */}
          <Route path="/" element={<Home />} />
          <Route path="/privacidade" element={<Privacidade />} />
          <Route path="/termos" element={<Termos />} />
          <Route path="/politica-de-privacidade" element={<Navigate to="/privacidade" replace />} />
          <Route path="/termos-de-servico" element={<Navigate to="/termos" replace />} />
          <Route path="/login"    element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password"  element={<ResetPassword />} />

          {/* Logado (pode ainda não ter confirmado o e-mail) */}
          <Route element={<ProtectedRoute />}>
            <Route path="/verify-email" element={<VerifyEmail />} />

            {/* Logado + e-mail confirmado */}
            <Route element={<RequireVerified />}>
              <Route element={<Layout />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/biblioteca-ia" element={<AiLibrary />} />
                <Route path="/chat"      element={<Chat />} />
                <Route path="/crm-comercial"     element={<Leads />} />
                <Route path="/crm-comercial/:id" element={<LeadDetail />} />
                <Route path="/monitoramento-processual" element={<MonitoramentoLayout />}>
                  <Route index element={<Cases />} />
                  <Route path="pesquisar" element={<ConsultaProcessual />} />
                  <Route path="salvos"    element={<Navigate to="/monitoramento-processual" replace />} />   {/* aba removida: evita cair em :id */}
                  <Route path=":id"       element={<CaseDetail />} />
                </Route>
                {/* nomes antigos continuam funcionando (links salvos, e-mails de alerta) */}
                <Route path="/leads"         element={<Navigate to="/crm-comercial" replace />} />
                <Route path="/leads/:id"     element={<Redirect to={id => `/crm-comercial/${id}`} />} />
                <Route path="/processos"     element={<Navigate to="/monitoramento-processual" replace />} />
                <Route path="/processos/:id" element={<Redirect to={id => `/monitoramento-processual/${id}`} />} />
                <Route path="/processos-salvos"     element={<Navigate to="/monitoramento-processual" replace />} />
                <Route path="/consulta-processual"  element={<Navigate to="/monitoramento-processual/pesquisar" replace />} />
                <Route path="/consulta-cnpj"        element={<Navigate to="/pesquisa-inteligente?tipo=cnpj" replace />} />
                <Route path="/consulta-cpf"         element={<Navigate to="/pesquisa-inteligente?tipo=cpf" replace />} />
                <Route path="/gerador-documentos"   element={<Navigate to="/documentos?novo=1" replace />} />
                <Route path="/documentos"     element={<Documents />} />
                <Route path="/documentos/modelos" element={<OfficeTemplates />} />
                <Route path="/documentos/:id" element={<DocumentEditor />} />
                <Route path="/agenda"        element={<Agenda />} />
                <Route path="/quadros"       element={<Quadros />} />
                <Route path="/quadros/:id"   element={<QuadroView />} />
                <Route path="/escritorio"    element={<Escritorio />} />
                <Route path="/tasks"     element={<Tasks />} />
                <Route path="/settings"  element={<Settings />} />
                <Route path="/planos"    element={<Plans />} />
                <Route path="/suporte"   element={<Support />} />
                <Route path="/education"      element={LOCKED_FEATURES.educacao ? <ComingSoon title="Educação" description="As trilhas de estudo em vídeo chegam em breve." /> : <Education />} />
                <Route path="/education/:id"  element={LOCKED_FEATURES.educacao ? <ComingSoon title="Educação" description="As trilhas de estudo em vídeo chegam em breve." /> : <TrilhaDetail />} />
                <Route path="/modulo-desativado" element={<ModuloDesativado />} />

                {/* Pesquisa — consultas pagas (atrás de "Em breve" por enquanto, ver config/featureFlags.ts) */}
                <Route path="/pesquisa-inteligente" element={<PesquisaInteligente />} />

                {/* Inteligência — Provas de conceito, Desafios semanais, Comunidade */}
                <Route path="/provas-de-conceito"          element={LOCKED_FEATURES.provasConceito ? <ComingSoon title="Provas de conceito" description="Quizzes ligados às aulas chegam em breve." /> : <ProvasDeConceito />} />
                <Route path="/provas-de-conceito/:aulaId"  element={LOCKED_FEATURES.provasConceito ? <ComingSoon title="Provas de conceito" description="Quizzes ligados às aulas chegam em breve." /> : <QuizTake />} />
                <Route path="/desafios-semanais"           element={LOCKED_FEATURES.desafios ? <ComingSoon title="Desafios semanais" description="Desafios semanais para a equipe chegam em breve." /> : <DesafiosSemanais />} />
                <Route path="/comunidade"                  element={LOCKED_FEATURES.comunidade ? <ComingSoon title="Comunidade" description="O mural do seu escritório chega em breve." /> : <Comunidade />} />
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
