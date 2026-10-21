import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { Building2, Coins, GraduationCap, LogOut, ShieldCheck } from 'lucide-react'
import { useAdminAuth } from '../context/AdminAuthContext'
import clsx from 'clsx'

const NAV = [
  { to: '/admin/accounts', label: 'Contas',    icon: Building2 },
  { to: '/admin/credits',  label: 'Créditos',  icon: Coins },
  { to: '/admin/education', label: 'Educação', icon: GraduationCap },
]

/**
 * Layout do painel administrativo — deliberadamente separado do Layout do
 * tenant (contexto de auth diferente, sem account_id). O rótulo "intellsn"
 * no topo existe pra deixar claro, mesmo visualmente, que isso é o
 * backoffice da plataforma, não um módulo dentro do produto Foro.
 */
export default function AdminLayout() {
  const { admin, logout } = useAdminAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/admin/login')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <aside className="w-56 bg-brand-950 flex flex-col shrink-0">
        <div className="flex items-center gap-2 px-4 py-5 border-b border-white/10">
          <ShieldCheck className="w-6 h-6 text-accent-400" />
          <div className="leading-tight">
            <p className="logo-wordmark text-base text-white">intellsn</p>
            <p className="text-[11px] text-brand-300">Painel administrativo</p>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV.map(({ to, label, icon: Icon }) => (
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

        <div className="p-3 border-t border-white/10">
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <div className="w-8 h-8 rounded-full bg-accent-500/20 text-accent-300 flex items-center justify-center text-sm font-semibold shrink-0">
              {admin?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{admin?.name}</p>
              <p className="text-xs text-brand-300 truncate">{admin?.email}</p>
            </div>
            <button onClick={handleLogout} className="p-1 text-brand-300 hover:text-white rounded" title="Sair">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
