import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, FileText, AlertTriangle, Users, UserPlus, Sparkles } from 'lucide-react'
import clsx from 'clsx'
import { areasApi, stagesApi, usersApi, casesApi, casePeopleApi, documentsApi, type CaseDetail, type AreaField } from '../api'
import { EditableCell } from './crm'
import { fmtDate } from '../lib/cases'

const PARTY_ROLES: Record<string, string> = {
  cliente: 'Cliente', autor: 'Autor / requerente', reu: 'Réu / requerido', litisconsorte: 'Litisconsorte', terceiro_interessado: 'Terceiro interessado',
  empregador: 'Empregador (reclamada)', empregado: 'Empregado (reclamante)', investigado: 'Investigado / acusado', vitima: 'Vítima',
  assistente_acusacao: 'Assistente de acusação', testemunha: 'Testemunha', perito: 'Perito', advogado_adverso: 'Advogado da parte contrária',
  orgao_publico: 'Órgão público', fornecedor: 'Fornecedor / licitante', outro: 'Outro',
}

function FieldInput({ f, value, onSave }: { f: AreaField; value: unknown; onSave: (v: unknown) => void }) {
  const str = Array.isArray(value) ? value.join(', ') : value == null ? '' : String(value)
  if (f.type === 'select') {
    return (
      <select className="input !py-1 !text-sm" value={str} onChange={e => onSave(e.target.value || null)} aria-label={f.label}>
        <option value="">—</option>{f.options?.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }
  if (f.type === 'multiselect') {
    const cur = Array.isArray(value) ? (value as string[]) : []
    return (
      <div className="flex flex-wrap gap-1.5" aria-label={f.label}>
        {f.options?.map(o => (
          <button key={o} type="button" aria-pressed={cur.includes(o)} onClick={() => onSave(cur.includes(o) ? cur.filter(x => x !== o) : [...cur, o])}
            className={clsx('text-xs px-2 py-1 rounded-full border', cur.includes(o) ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 hover:bg-slate-50')}>{o}</button>
        ))}
      </div>
    )
  }
  if (f.type === 'date') return <input type="date" className="input !py-1 !text-sm" defaultValue={str.slice(0, 10)} onBlur={e => e.target.value !== str.slice(0, 10) && onSave(e.target.value || null)} aria-label={f.label} />
  if (f.type === 'textarea') return <textarea className="input !text-sm min-h-[60px]" defaultValue={str} aria-label={f.label} onBlur={e => e.target.value !== str && onSave(e.target.value || null)} />
  return <EditableCell type={f.type === 'number' ? 'number' : 'text'} value={str || null} placeholder="Preencher" onSave={v => onSave(v || null)} />
}

export default function CaseCore({ c, onChange }: { c: CaseDetail; onChange: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [party, setParty] = useState({ name: '', role: 'cliente', document: '', responsible_user_id: '' })
  const [tpl, setTpl] = useState('')
  const fail = (e: any) => setError(e?.response?.data?.error || 'Não foi possível salvar.')
  const done = () => { setError(''); onChange() }
  const { data: areas = [] } = useQuery({ queryKey: ['areas'], queryFn: areasApi.list, staleTime: 5 * 60_000 })
  const { data: stages = [] } = useQuery({ queryKey: ['stages', c.area_key], queryFn: () => stagesApi.list(c.area_key) })
  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: usersApi.list, staleTime: 60_000 })
  const { data: templates = [] } = useQuery({ queryKey: ['doc-templates', c.area_key], queryFn: () => documentsApi.templates(c.area_key), staleTime: 5 * 60_000 })
  const activeUsers = users.filter(u => u.active)

  const upd = useMutation({ mutationFn: (d: Record<string, unknown>) => casesApi.update(c.id, d), onSuccess: done, onError: fail })
  const addParty = useMutation({
    mutationFn: () => casePeopleApi.addParty(c.id, { name: party.name.trim(), role: party.role, document: party.document || undefined, responsible_user_id: party.responsible_user_id || null } as never),
    onSuccess: () => { setParty({ name: '', role: 'cliente', document: '', responsible_user_id: '' }); done() }, onError: fail,
  })
  const updParty = useMutation({ mutationFn: ({ id, d }: { id: string; d: Record<string, unknown> }) => casePeopleApi.updateParty(c.id, id, d as never), onSuccess: done, onError: fail })
  const delParty = useMutation({ mutationFn: (id: string) => casePeopleApi.removeParty(c.id, id), onSuccess: done })
  const setMembers = useMutation({ mutationFn: (m: { user_id: string; role: 'responsavel' | 'colaborador' }[]) => casePeopleApi.setMembers(c.id, m), onSuccess: done, onError: fail })
  const newDoc = useMutation({
    mutationFn: () => documentsApi.create({ template_key: tpl, case_id: c.id }),
    onSuccess: d => { qc.invalidateQueries({ queryKey: ['documents'] }); navigate(`/documentos/${d.id}`) }, onError: fail,
  })

  const members = c.members.map(m => ({ user_id: m.user_id, role: m.role }))
  const memberIds = new Set(members.map(m => m.user_id))
  const stage = stages.find(s => s.id === c.stage_id)

  return (
    <div className="space-y-5 mt-5">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid md:grid-cols-2 gap-5">
        <section className="card p-5">
          <h2 className="font-medium text-slate-900 mb-2">Área, etapa e juízo</h2>
          <dl className="text-sm">
            <div className="grid grid-cols-[120px_1fr] items-center gap-2 py-1.5 border-b">
              <dt className="text-slate-500">Área</dt>
              <dd><select className="input !py-1 !text-sm" aria-label="Área do processo" value={c.area_key} onChange={e => confirm('Trocar a área volta o processo para a primeira etapa dela. Continuar?') && upd.mutate({ area_key: e.target.value })}>
                {areas.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
              </select></dd>
            </div>
            <div className="grid grid-cols-[120px_1fr] items-center gap-2 py-1.5 border-b">
              <dt className="text-slate-500">Etapa</dt>
              <dd><select className="input !py-1 !text-sm" aria-label="Etapa do kanban" value={c.stage_id || ''} onChange={e => upd.mutate({ stage_id: e.target.value })}>
                {stages.map(s => <option key={s.id} value={s.id}>{s.label}{s.is_final ? ' (final)' : ''}</option>)}
              </select>
              {stage?.is_final ? <p className="text-xs text-slate-400 mt-1">Etapa final: o processo fica como encerrado.</p> : null}</dd>
            </div>
            {([['comarca', 'Comarca'], ['vara', 'Vara / órgão'], ['magistrate', 'Magistrado(a)']] as const).map(([k, label]) => (
              <div key={k} className="grid grid-cols-[120px_1fr] items-center gap-2 py-1.5 border-b last:border-0">
                <dt className="text-slate-500">{label}</dt>
                <dd><EditableCell value={c[k]} placeholder="Adicionar" onSave={v => upd.mutate({ [k]: v })} /></dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="card p-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-medium text-slate-900 flex items-center gap-1.5"><Users className="w-4 h-4 text-slate-400" /> Responsáveis pelo processo</h2>
          </div>
          <ul className="divide-y mb-3">
            {c.members.map(m => (
              <li key={m.id} className="flex items-center gap-2 py-1.5 text-sm">
                <span className="flex-1 truncate">{m.name}</span>
                <select className="input !py-0.5 !text-xs !w-32" aria-label={`Papel de ${m.name}`} value={m.role}
                  onChange={e => setMembers.mutate(members.map(x => x.user_id === m.user_id ? { ...x, role: e.target.value as 'responsavel' | 'colaborador' } : x))}>
                  <option value="responsavel">Responsável</option><option value="colaborador">Colaborador</option>
                </select>
                <button className="text-slate-300 hover:text-red-600" aria-label={`Remover ${m.name}`} onClick={() => setMembers.mutate(members.filter(x => x.user_id !== m.user_id))}><Trash2 className="w-4 h-4" /></button>
              </li>
            ))}
          </ul>
          <select className="input !py-1 !text-sm" aria-label="Adicionar responsável" value="" onChange={e => e.target.value && setMembers.mutate([...members, { user_id: e.target.value, role: members.length ? 'colaborador' : 'responsavel' }])}>
            <option value="">+ Adicionar pessoa da equipe…</option>
            {activeUsers.filter(u => !memberIds.has(u.id)).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <p className="text-xs text-slate-400 mt-2">Quem responde pelo processo recebe os alertas de prazo e audiência dele.</p>
        </section>
      </div>

      <section className="card p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-medium text-slate-900">Dados específicos — {c.area_label}</h2>
          {c.missing_fields.length > 0 && c.area_key !== 'geral' && <span className="text-xs text-amber-700 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {c.missing_fields.length} sem preencher</span>}
        </div>
        <p className="text-xs text-slate-500 mb-3">A IA usa estes dados para dar insights técnicos e preencher documentos. Quanto mais completo, melhor.</p>
        {c.area_fields.length === 0 ? <p className="text-sm text-slate-400">A área “Geral” não tem campos específicos. Escolha uma área acima para liberar campos técnicos.</p> : (
          <div className="grid md:grid-cols-2 gap-x-6 gap-y-3">
            {c.area_fields.map(f => (
              <div key={f.key} className={clsx((f.type === 'textarea' || f.type === 'multiselect') && 'md:col-span-2')}>
                <label className="text-xs font-medium text-slate-600 block mb-1">{f.label}</label>
                <FieldInput f={f} value={c.details?.[f.key]} onSave={v => upd.mutate({ details: { [f.key]: v } })} />
                {f.help && <p className="text-[11px] text-slate-400 mt-0.5">{f.help}</p>}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card p-5">
        <h2 className="font-medium text-slate-900 mb-3">Partes ({c.parties.length})</h2>
        {c.parties.length > 0 && (
          <div className="overflow-x-auto mb-3">
            <table className="w-full text-sm min-w-[640px]">
              <thead><tr className="text-xs text-slate-500 text-left border-b"><th className="py-1.5 pr-2">Nome</th><th className="pr-2">Papel</th><th className="pr-2">CPF/CNPJ</th><th className="pr-2">Responsável no escritório</th><th /></tr></thead>
              <tbody>
                {c.parties.map(p => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-1.5 pr-2"><EditableCell value={p.name} placeholder="Nome" onSave={v => v && updParty.mutate({ id: p.id, d: { name: v } })} /></td>
                    <td className="pr-2"><select className="input !py-0.5 !text-xs" aria-label={`Papel de ${p.name}`} value={p.role} onChange={e => updParty.mutate({ id: p.id, d: { role: e.target.value } })}>
                      {Object.entries(PARTY_ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
                    <td className="pr-2"><EditableCell value={p.document_formatted || null} placeholder="CPF/CNPJ" onSave={v => updParty.mutate({ id: p.id, d: { document: v } })} /></td>
                    <td className="pr-2"><select className="input !py-0.5 !text-xs" aria-label={`Responsável por ${p.name}`} value={p.responsible_user_id || ''} onChange={e => updParty.mutate({ id: p.id, d: { responsible_user_id: e.target.value || null } })}>
                      <option value="">—</option>{activeUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></td>
                    <td className="text-right"><button className="text-slate-300 hover:text-red-600" aria-label={`Remover ${p.name}`} onClick={() => confirm(`Remover ${p.name}?`) && delParty.mutate(p.id)}><Trash2 className="w-4 h-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-slate-400 mt-2">Nacionalidade, estado civil, profissão e endereço entram na qualificação das peças; o que faltar aparece como [PREENCHER] no documento.</p>
          </div>
        )}
        <form className="flex gap-2 flex-wrap" onSubmit={e => { e.preventDefault(); if (party.name.trim()) addParty.mutate() }}>
          <input className="input flex-1 min-w-[180px]" placeholder="Nome da parte" value={party.name} onChange={e => setParty(p => ({ ...p, name: e.target.value }))} />
          <select className="input !w-48" aria-label="Papel da nova parte" value={party.role} onChange={e => setParty(p => ({ ...p, role: e.target.value }))}>{Object.entries(PARTY_ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <input className="input !w-40" placeholder="CPF/CNPJ (opcional)" value={party.document} onChange={e => setParty(p => ({ ...p, document: e.target.value }))} />
          <select className="input !w-44" aria-label="Responsável da nova parte" value={party.responsible_user_id} onChange={e => setParty(p => ({ ...p, responsible_user_id: e.target.value }))}>
            <option value="">Responsável (opcional)</option>{activeUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
          <button className="btn-primary" disabled={!party.name.trim() || addParty.isPending}><UserPlus className="w-4 h-4" /> Adicionar parte</button>
        </form>
      </section>

      <section className="card p-5">
        <h2 className="font-medium text-slate-900 mb-3 flex items-center gap-1.5"><FileText className="w-4 h-4 text-slate-400" /> Documentos ({c.documents.length})</h2>
        {c.documents.length > 0 && (
          <ul className="divide-y mb-3">
            {c.documents.map(d => (
              <li key={d.id} className="flex items-center gap-2 py-1.5 text-sm">
                <Link to={`/documentos/${d.id}`} className="flex-1 truncate text-brand-700 hover:underline">{d.title}</Link>
                {d.ai_generated ? <Sparkles className="w-3.5 h-3.5 text-accent-500" aria-label="Rascunho com IA" /> : null}
                {d.open_flags > 0 && <span className="badge bg-amber-100 text-amber-700 !py-0">{d.open_flags} pendência(s)</span>}
                <span className="badge bg-slate-100 text-slate-600 !py-0">{d.status}</span>
                <span className="text-xs text-slate-400">{fmtDate(d.updated_at)}</span>
              </li>
            ))}
          </ul>
        )}
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (tpl) newDoc.mutate() }}>
          <select className="input" aria-label="Modelo de documento" value={tpl} onChange={e => setTpl(e.target.value)}>
            <option value="">Novo documento a partir de um modelo…</option>
            {templates.map(t => <option key={t.key} value={t.key}>{t.title}{t.reviewed ? '' : ' (modelo-base)'}</option>)}
          </select>
          <button className="btn-primary shrink-0" disabled={!tpl || newDoc.isPending}><Plus className="w-4 h-4" /> Criar</button>
        </form>
      </section>
    </div>
  )
}
