import { useState } from 'react'
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'
import type { ProcessSnapshot, SourcesInfo, SourceInfo } from '../api'

export function fmtDate(d?: string | null) {
  if (!d) return '—'
  const dt = new Date(d.length <= 10 ? d + 'T12:00:00' : d)
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('pt-BR')
}
export function fmtDateTime(d?: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? d : dt.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

const SRC_NAME = { datajud: 'DataJud (CNJ)', djen: 'DJEN (publicações)' } as const
const STATUS: Record<string, { label: string; cls: string }> = {
  ok: { label: 'ok', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  vazio: { label: 'sem registros', cls: 'bg-slate-50 text-slate-600 border-slate-200' },
  erro: { label: 'indisponível', cls: 'bg-red-50 text-red-700 border-red-200' },
  nao_configurado: { label: 'não configurado', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  nao_suportado: { label: 'não suportado', cls: 'bg-slate-50 text-slate-500 border-slate-200' },
  nao_consultado: { label: 'não consultado', cls: 'bg-slate-50 text-slate-500 border-slate-200' },
}

/** Uma linha por fonte: nome, situação e (quando houver) o motivo. */
export function SourceChips({ fontes }: { fontes?: SourcesInfo | null }) {
  if (!fontes) return null
  const items = (['datajud', 'djen'] as const).map(k => [k, fontes[k]] as [typeof k, SourceInfo]).filter(([, v]) => v && v.status !== 'nao_consultado')
  if (!items.length) return null
  return (
    <div className="space-y-1" data-testid="fontes">
      <div className="flex flex-wrap gap-1.5">
        {items.map(([k, v]) => {
          const st = STATUS[v.status] || STATUS.vazio
          return <span key={k} className={`text-[11px] px-2 py-0.5 rounded-full border ${st.cls}`} data-testid={`fonte-${k}`}>{SRC_NAME[k]}: {st.label}</span>
        })}
      </div>
      {items.filter(([, v]) => v.mensagem && (v.status === 'erro' || v.status === 'nao_configurado')).map(([k, v]) => (
        <p key={k} className="text-xs text-amber-700">{SRC_NAME[k]}: {v.mensagem}</p>
      ))}
    </div>
  )
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-sm text-slate-800 break-words">{value || '—'}</p>
    </div>
  )
}

/** Retrato do processo: capa, partes e abas Movimentações / Publicações. Usado na pesquisa (e pronto para o monitoramento). */
export default function ProcessSnapshotView({ snap }: { snap: ProcessSnapshot }) {
  const [tab, setTab] = useState<'mov' | 'pub'>(snap.movimentos.length || !snap.comunicacoes.length ? 'mov' : 'pub')
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const c = snap.capa
  const ativo = snap.partes.filter(p => /ativo/i.test(p.papel))
  const passivo = snap.partes.filter(p => /passivo/i.test(p.papel))
  const outros = snap.partes.filter(p => !/ativo|passivo/i.test(p.papel))

  return (
    <div className="space-y-4" data-testid="snapshot">
      <SourceChips fontes={snap.fontes} />
      <p className="text-xs text-slate-400">Consultado em {fmtDateTime(snap.consultado_em)}</p>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3" data-testid="capa">
        <Field label="Número" value={c.numero_cnj} />
        <Field label="Tribunal" value={[c.tribunal, c.tribunal_nome].filter(Boolean).join(' — ')} />
        <Field label="Classe" value={c.classe} />
        <Field label="Órgão julgador" value={c.orgao_julgador} />
        <div className="col-span-2"><Field label="Assuntos" value={c.assuntos.join('; ')} /></div>
        <Field label="Ajuizamento" value={c.data_ajuizamento ? fmtDate(c.data_ajuizamento) : null} />
        <Field label="Sistema / formato" value={[c.sistema, c.formato].filter(Boolean).join(' · ')} />
        {c.graus.length > 1 && <Field label="Graus" value={c.graus.join(', ')} />}
      </div>

      <div data-testid="partes">
        <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">Partes</p>
        {snap.partes.length === 0
          ? <p className="text-sm text-slate-500">As fontes públicas não informaram as partes deste processo.</p>
          : <div className="text-sm text-slate-800 space-y-0.5">
              {[['Polo ativo', ativo], ['Polo passivo', passivo], ['Outros', outros]].map(([t, list]) => (list as typeof ativo).length > 0 && (
                <p key={t as string}><span className="text-slate-500">{t as string}:</span> {(list as typeof ativo).map(p => p.nome).join('; ')}</p>
              ))}
            </div>}
      </div>

      <div>
        <div className="flex gap-1 border-b border-slate-200 mb-2" role="tablist">
          <button role="tab" aria-selected={tab === 'mov'} onClick={() => setTab('mov')}
            className={`px-3 py-1.5 text-sm -mb-px border-b-2 ${tab === 'mov' ? 'border-accent-500 text-slate-900 font-medium' : 'border-transparent text-slate-500'}`}>
            Movimentações ({snap.movimentos_total})
          </button>
          <button role="tab" aria-selected={tab === 'pub'} onClick={() => setTab('pub')}
            className={`px-3 py-1.5 text-sm -mb-px border-b-2 ${tab === 'pub' ? 'border-accent-500 text-slate-900 font-medium' : 'border-transparent text-slate-500'}`}>
            Publicações ({snap.comunicacoes_total})
          </button>
        </div>

        {tab === 'mov' && (
          snap.movimentos.length === 0
            ? <p className="text-sm text-slate-500 py-2">Nenhuma movimentação nas fontes consultadas.</p>
            : <ol className="divide-y divide-slate-100" data-testid="movimentos">
                {snap.movimentos.map((m, i) => (
                  <li key={i} className="py-2 flex gap-3">
                    <span className="text-xs text-slate-500 w-20 shrink-0 pt-0.5">{fmtDate(m.data)}</span>
                    <div className="min-w-0">
                      <p className="text-sm text-slate-800">{m.nome}</p>
                      {m.complementos.length > 0 && <p className="text-xs text-slate-500 break-words">{m.complementos.join(' · ')}</p>}
                    </div>
                  </li>
                ))}
              </ol>
        )}

        {tab === 'pub' && (
          snap.comunicacoes.length === 0
            ? <p className="text-sm text-slate-500 py-2">Nenhuma publicação/intimação encontrada no DJEN.</p>
            : <ul className="divide-y divide-slate-100" data-testid="publicacoes">
                {snap.comunicacoes.map((p, i) => {
                  const k = String(p.id ?? i); const isOpen = !!open[k]
                  return (
                    <li key={k} className="py-2">
                      <button className="w-full text-left flex items-start gap-2" onClick={() => setOpen(o => ({ ...o, [k]: !o[k] }))} aria-expanded={isOpen}>
                        {isOpen ? <ChevronDown className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" /> : <ChevronRight className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />}
                        <span className="text-xs text-slate-500 w-20 shrink-0 pt-0.5">{fmtDate(p.data)}</span>
                        <span className="text-sm text-slate-800 min-w-0">
                          {p.tipo || 'Publicação'}{p.tipo_documento ? ` — ${p.tipo_documento}` : ''}
                          {p.orgao && <span className="block text-xs text-slate-500">{p.orgao}</span>}
                        </span>
                      </button>
                      {isOpen && (
                        <div className="ml-6 mt-2 space-y-2">
                          <p className="text-sm text-slate-700 whitespace-pre-wrap break-words bg-slate-50 rounded-lg p-3">{p.texto || '(sem texto)'}</p>
                          {p.advogados.length > 0 && <p className="text-xs text-slate-500">Advogados: {p.advogados.map(a => a.oab ? `${a.nome} (OAB ${a.oab})` : a.nome).join('; ')}</p>}
                          {p.link && /^https?:\/\//.test(p.link) && <a href={p.link} target="_blank" rel="noreferrer" className="text-xs text-accent-600 inline-flex items-center gap-1 underline">Abrir no tribunal <ExternalLink className="w-3 h-3" /></a>}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
        )}
      </div>
    </div>
  )
}
