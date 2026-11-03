import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Scale } from 'lucide-react'
import { LEGAL } from '../../lib/legal'

/** Cabeçalho e rodapé das páginas públicas (início, privacidade, termos) — não exigem login. */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2" aria-label="Foro — página inicial">
            <Scale className="w-6 h-6 text-brand-800" />
            <span className="logo-wordmark text-xl text-brand-950">Foro</span>
          </Link>
          <nav className="flex items-center gap-2 sm:gap-4 text-sm">
            <Link to="/privacidade" className="text-slate-600 hover:text-brand-700 hidden sm:inline">Privacidade</Link>
            <Link to="/termos" className="text-slate-600 hover:text-brand-700 hidden sm:inline">Termos</Link>
            <Link to="/login" className="btn-secondary !py-1.5 text-sm">Entrar</Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  )
}

export function PublicFooter() {
  return (
    <footer className="border-t bg-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between text-sm text-slate-500">
        <p>© {new Date().getFullYear()} {LEGAL.product}{LEGAL.legalEntity ? ` — ${LEGAL.legalEntity}` : ''}{LEGAL.cnpj ? ` · CNPJ ${LEGAL.cnpj}` : ''}</p>
        <p className="flex gap-4 flex-wrap">
          <Link to="/privacidade" className="hover:text-brand-700">Política de Privacidade</Link>
          <Link to="/termos" className="hover:text-brand-700">Termos de Serviço</Link>
          <a href={`mailto:${LEGAL.contactEmail}`} className="hover:text-brand-700">{LEGAL.contactEmail}</a>
        </p>
      </div>
    </footer>
  )
}

export interface LegalSection { id: string; title: string; body: ReactNode }

/** Documento jurídico com sumário lateral (âncoras) — legível em celular e impressão. */
export default function LegalDoc({ title, intro, sections }: { title: string; intro: ReactNode; sections: LegalSection[] }) {
  return (
    <PublicShell>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 lg:grid lg:grid-cols-[14rem_1fr] lg:gap-10">
        <aside className="hidden lg:block">
          <nav className="sticky top-6 text-sm" aria-label="Sumário">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Neste documento</p>
            <ul className="space-y-1.5 border-l pl-3">
              {sections.map((s, i) => <li key={s.id}><a href={`#${s.id}`} className="text-slate-600 hover:text-brand-700">{i + 1}. {s.title}</a></li>)}
            </ul>
          </nav>
        </aside>
        <article className="min-w-0 max-w-3xl">
          <h1 className="text-3xl font-semibold text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500 mt-1">Última atualização: {LEGAL.updatedAt}</p>
          <div className="mt-5 text-slate-700 leading-relaxed space-y-3">{intro}</div>
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="mt-9 scroll-mt-6">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">{i + 1}. {s.title}</h2>
              <div className="text-slate-700 leading-relaxed space-y-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1.5 [&_a]:text-brand-700 [&_a]:underline">{s.body}</div>
            </section>
          ))}
        </article>
      </div>
    </PublicShell>
  )
}
