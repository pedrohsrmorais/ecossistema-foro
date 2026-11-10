import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  MessageSquare, Users, LayoutDashboard, CheckSquare, Settings, LogOut, Scale,
  GraduationCap, FileText, LayoutGrid, Sparkles, PanelLeftClose, PanelLeftOpen, Library, LifeBuoy, Clock, Briefcase, CalendarDays, FlaskConical, Trophy, Users2, Menu,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { modulesApi, settingsApi, officeApi, usersApi } from '../api'
import { LOCKED_FEATURES } from '../config/featureFlags'
import Brand from './Brand'
import { ThemeToggle } from '../context/ThemeContext'
import WorkspaceSwitcher from './WorkspaceSwitcher'
import { useState, useEffect, useRef } from 'react'
import { ChatProvider } from '../context/ChatContext'
import AiDock from './AiDock'
import CreditMeter from './CreditMeter'
import AlertsBell from './AlertsBell'
import clsx from 'clsx'

type NavItem = { to: string; label: string; icon: typeof Scale; module: string | null; access?: string; soon?: boolean; crm?: boolean }

const NAV_TOP: NavItem[] = [
  { to: '/chat', label: 'Assistente de IA', icon: MessageSquare, module: 'crm', access: 'ai' },
]
const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  { label: 'Espaço de trabalho', items: [
    { to: '/dashboard', label: 'Painel', icon: LayoutDashboard, module: 'crm' },
    { to: '/tasks', label: 'Tarefas', icon: CheckSquare, module: 'crm', access: 'agenda' },
    { to: '/agenda', label: 'Agenda', icon: CalendarDays, module: 'crm', access: 'agenda' },
  ] },
  { label: 'Operações', items: [
    { to: '/crm-comercial', label: 'Comercial', icon: Users, module: 'crm', access: 'leads' },
    { to: '/monitoramento-processual', label: 'Monitoramento', icon: Briefcase, module: 'crm', access: 'cases' },
    { to: '/documentos', label: 'Documentos', icon: FileText, module: 'crm', access: 'documents' },
    { to: '/pesquisa-inteligente', label: 'Consulta Inteligente', icon: Sparkles, module: 'pesquisa_cpf_cnpj', soon: LOCKED_FEATURES.pesquisaInteligente },
  ] },
  { label: 'Academia FORO', items: [
    { to: '/education', label: 'Educação', icon: GraduationCap, module: 'educacao', soon: LOCKED_FEATURES.educacao },
    { to: '/biblioteca-ia', label: 'Biblioteca de IA', icon: Library, module: null },
  ] },
]
const NAV_BOTTOM: NavItem[] = [
  { to: '/suporte', label: 'Suporte', icon: LifeBuoy, module: null },
  { to: '/settings', label: 'Configurações', icon: Settings, module: null },
]
const settingsLinks: NavItem[] = [
  NAV_BOTTOM[1],
  { to: '/escritorio', label: 'Escritório', icon: Users, module: null },
  { to: '/planos', label: 'Plano e créditos', icon: Library, module: null },
]
const academyLinks: NavItem[] = [
  NAV_SECTIONS[2].items[0],
  { to: '/provas-de-conceito', label: 'Provas de conceito', icon: FlaskConical, module: 'provas_conceito' },
  { to: '/desafios-semanais', label: 'Desafios semanais', icon: Trophy, module: 'desafios_semanais' },
  { to: '/comunidade', label: 'Comunidade', icon: Users2, module: 'comunidade' },
]
const taskLinks: NavItem[] = [
  NAV_SECTIONS[0].items[1],
  { to: '/quadros', label: 'Quadros', icon: LayoutGrid, module: 'crm', access: 'boards' },
]
const sections = [settingsLinks, academyLinks, taskLinks]
export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [compact, setCompact] = useState(() => localStorage.getItem('foro.sidebar') === 'compact')
  const section = sections.find(links => links.some(link => location.pathname.split('/')[1] === link.to.slice(1)))
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => { setMenuOpen(false) }, [location.pathname])

  // Enquanto não carrega, mostra tudo (evita flicker) — depois de carregar,
  // esconde o que o admin da plataforma desativou pra essa conta.
  const { data: modules } = useQuery({ queryKey: ['modules'], queryFn: modulesApi.list, staleTime: 5 * 60 * 1000 })
  const disabledModules = new Set((modules || []).filter(m => !m.enabled).map(m => m.module_key))
  const { data: plan } = useQuery({ queryKey: ['plan'], queryFn: settingsApi.getPlan, staleTime: 60_000 })
  const trialDaysLeft = plan?.account_status === 'trialing' && plan?.trial_ends_at
    ? Math.ceil((new Date(plan.trial_ends_at).getTime() - Date.now()) / 86_400_000)
    : null
  const { data: office } = useQuery({ queryKey: ['office'], queryFn: officeApi.get, staleTime: 30_000 })
  const { data: meP } = useQuery({ queryKey: ['me-profile'], queryFn: usersApi.me, staleTime: 60_000 })
  const hasOffice = true // todo workspace (pessoal ou escritório) é utilizável; o seletor troca entre eles
  const canAccess = (item: NavItem) => !item.access || meP?.permissions?.[('access_' + item.access) as keyof NonNullable<typeof meP.permissions>] !== false
  const visible = (item: NavItem) => (!item.module || !disabledModules.has(item.module)) && canAccess(item)

  // Tempo ativo na aba: um "ping" por minuto enquanto a aba está visível e houve interação recente
  const lastInteraction = useRef(Date.now())
  useEffect(() => {
    if (!hasOffice) return
    const mark = () => { lastInteraction.current = Date.now() }
    const evs = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']
    evs.forEach(e => window.addEventListener(e, mark, { passive: true }))
    const tick = () => { if (document.visibilityState === 'visible' && Date.now() - lastInteraction.current < 120_000) officeApi.ping().catch(() => {}) }
    const first = setTimeout(tick, 5_000)
    const id = setInterval(tick, 60_000)
    return () => { evs.forEach(e => window.removeEventListener(e, mark)); clearTimeout(first); clearInterval(id) }
  }, [hasOffice])

  function handleLogout() {
    logout()
    navigate('/login')
  }

  useEffect(() => { const close = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close) }, [])

  function renderNavItem({ to, label, icon: Icon, soon }: NavItem) {
    return (
      <NavLink
        key={to}
        to={to} title={label} aria-label={label}
        className={({ isActive }) =>
          clsx(
            'flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all border-l-2',
            (isActive || section?.[0].to === to)
              ? 'foro-nav-active'
              : 'text-[#c1c5b9] border-transparent hover:bg-white/5 hover:text-white hover:translate-x-0.5'
          )
        }
      >
        <Icon className="w-4 h-4 shrink-0" />
        <span className="nav-copy flex-1 min-w-0">{label}</span>
        {soon && <span className="nav-copy text-[8px] uppercase tracking-wide px-1 py-0.5 rounded bg-white/10 text-accent-300 whitespace-nowrap shrink-0">em breve</span>}
        {to === '/escritorio' && (office?.pending_requests || 0) > 0 && <span className="text-[10px] px-1.5 rounded-full bg-accent-500 text-white">{office?.pending_requests}</span>}
      </NavLink>
    )
  }

  return (
    <ChatProvider>
    <div className="flex h-screen overflow-hidden bg-slate-50 print:block print:h-auto print:overflow-visible">
      {menuOpen && <div className="fixed inset-0 z-30 bg-black/50 md:hidden print:hidden" onClick={() => setMenuOpen(false)} aria-hidden />}
      <aside className={clsx('foro-sidebar w-60 flex flex-col shrink-0 print:hidden fixed inset-y-0 left-0 z-40 md:static md:translate-x-0', compact && 'compact', menuOpen ? 'translate-x-0' : '-translate-x-full invisible md:visible')} aria-label="Menu principal">
        <div className="sidebar-brand">
          <NavLink to="/dashboard" aria-label="FORO.OS · Painel"><Brand inverse /></NavLink>
          <button className="hidden md:inline-flex" title={compact ? 'Expandir menu' : 'Recolher menu'} aria-expanded={!compact} onClick={() => { setCompact(!compact); localStorage.setItem('foro.sidebar', compact ? 'full' : 'compact') }}>{compact ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}</button>
          <button className="md:hidden" aria-label="Fechar menu" onClick={() => setMenuOpen(false)}><PanelLeftClose size={18} /></button>
        </div>
        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {NAV_TOP.filter(visible).map(renderNavItem)}

          {NAV_SECTIONS.map(section => {
            const items = section.items.filter(visible)
            if (items.length === 0) return null
            return (
              <div key={section.label} className="nav-section">
                <p className="nav-copy px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-accent-400/80">
                  {section.label}
                </p>
                {items.map(renderNavItem)}
              </div>
            )
          })}

        </nav>

        {/* Plano, Configurações e Suporte ficam fixos (não somem atrás da rolagem em telas baixas) */}
        <div className="px-3 pt-2 pb-1 space-y-0.5 border-t border-white/10">
          {NAV_BOTTOM.filter(visible).map(renderNavItem)}
        </div>

        {/* Créditos de IA da semana — regra tokens → créditos no tooltip */}
        {hasOffice && <div className="nav-copy px-3 pb-3"><CreditMeter /></div>}

        {/* User */}
        <div className="p-3 border-t border-white/10">
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <div className="nav-copy w-8 h-8 rounded-full bg-accent-500/20 text-accent-300 flex items-center justify-center text-sm font-semibold shrink-0">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="nav-copy flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.name}</p>
              <p className="text-xs text-brand-300 truncate">{user?.role}</p>
            </div>
            <button onClick={handleLogout} className="p-1 text-brand-300 hover:text-white rounded" title="Sair">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main — key pelo pathname faz cada troca de rota remontar com um
          fade-in sutil, em vez de trocar o conteúdo seco. */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        <header className="foro-topbar print:hidden">
          <button onClick={() => setMenuOpen(true)} aria-label="Abrir menu" className="md:hidden p-2"><Menu size={20} /></button>
          <div className="top-workspace"><WorkspaceSwitcher /></div>
          <div className="ml-auto flex items-center gap-3"><ThemeToggle />{!disabledModules.has('crm') && <AlertsBell />}</div>
        </header>
        {section && <nav className="foro-subnav" aria-label="Navegação da seção">{section.filter(visible).map(link => <NavLink key={link.to} to={link.to}>{link.label}{link.to === '/escritorio' && !!office?.pending_requests && ' (' + office.pending_requests + ')'}</NavLink>)}</nav>}
        {trialDaysLeft !== null && (
          <div className="flex items-center justify-between gap-3 px-6 py-2 bg-accent-50 border-b border-accent-200 text-sm text-accent-800">
            <span className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              {trialDaysLeft > 0
                ? `Teste grátis: ${trialDaysLeft} ${trialDaysLeft === 1 ? 'dia restante' : 'dias restantes'}.`
                : 'Seu teste grátis termina hoje.'}
            </span>
            <NavLink to="/planos" className="font-medium underline">Escolher um plano</NavLink>
          </div>
        )}
        <div key={location.pathname} className="animate-fade-in">
          <Outlet />
        </div>
      </main>
      {visible(NAV_TOP[0]) && <AiDock />}
    </div>
    </ChatProvider>
  )
}
