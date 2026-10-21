import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { MessageSquare, Users, LayoutDashboard, CheckSquare, Settings, LogOut, Scale, GraduationCap } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { modulesApi } from '../api'
import clsx from 'clsx'

// `module` é opcional: item sem módulo associado (ex: Configurações) nunca
// é escondido. Os demais só aparecem se o módulo estiver ativo pra conta —
// ver GET /modules e modules.middleware.js::requireModule no backend.
const NAV = [
  { to: '/chat',      label: 'IA',          icon: MessageSquare,     module: 'crm' },
  { to: '/leads',     label: 'Leads',       icon: Users,             module: 'crm' },
  { to: '/dashboard', label: 'Painel',      icon: LayoutDashboard,   module: 'crm' },
  { to: '/tasks',     label: 'Tarefas',     icon: CheckSquare,       module: 'crm' },
  { to: '/education', label: 'Educação',    icon: GraduationCap,     module: 'educacao' },
  { to: '/settings',  label: 'Configurações', icon: Settings,        module: null as string | null },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  // Enquanto não carrega, mostra tudo (evita flicker) — depois de carregar,
  // esconde o que o admin da plataforma desativou pra essa conta.
  const { data: modules } = useQuery({ queryKey: ['modules'], queryFn: modulesApi.list, staleTime: 5 * 60 * 1000 })
  const disabled = new Set((modules || []).filter(m => !m.enabled).map(m => m.module_key))
  const nav = NAV.filter(item => !item.module || !disabled.has(item.module))

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Sidebar — navy institucional, não branco: lê mais como backoffice
          jurídico "sério" do que como app de consumidor. */}
      <aside className="w-56 bg-brand-950 flex flex-col shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-5 border-b border-white/10">
          <Scale className="w-6 h-6 text-accent-400" />
          <span className="logo-wordmark text-lg text-white">Foro</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors border-l-2',
                  isActive
                    ? 'bg-white/10 text-white border-accent-400'
                    : 'text-brand-200 border-transparent hover:bg-white/5 hover:text-white'
                )
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="p-3 border-t border-white/10">
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <div className="w-8 h-8 rounded-full bg-accent-500/20 text-accent-300 flex items-center justify-center text-sm font-semibold shrink-0">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.name}</p>
              <p className="text-xs text-brand-300 truncate">{user?.role}</p>
            </div>
            <button onClick={handleLogout} className="p-1 text-brand-300 hover:text-white rounded" title="Sair">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
