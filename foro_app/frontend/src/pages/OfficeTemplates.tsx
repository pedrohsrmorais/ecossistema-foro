import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, Upload, Sparkles, Trash2, ShieldCheck, AlertTriangle, Pencil, X } from 'lucide-react'
import clsx from 'clsx'
import { officeTemplatesApi, areasApi, type TemplateInput, type ConvertResult } from '../api'
import { useAuth } from '../context/AuthContext'
import { usersApi } from '../api'
import { fmtDate } from '../lib/cases'

const FIELDS: { group: string; items: [string, string][] }[] = [
  { group: 'Cliente e parte contrária', items: [['cliente.qualificacao', 'Qualificação do cliente'], ['cliente.nome', 'Nome do cliente'], ['parte_contraria.qualificacao', 'Qualificação da parte contrária'], ['parte_contraria.nome', 'Nome da parte contrária']] },
  { group: 'Processo', items: [['processo.numero', 'Nº do processo'], ['processo.vara', 'Vara'], ['processo.comarca', 'Comarca'], ['processo.tribunal', 'Tribunal'], ['processo.magistrado', 'Magistrado'], ['processo.valor_causa', 'Valor da causa']] },
  { group: 'Escritório e data', items: [['advogado.nome', 'Nome do advogado'], ['advogado.oab', 'OAB'], ['escritorio', 'Escritório'], ['cidade', 'Cidade'], ['data.extenso', 'Data por extenso']] },
]

type Draft = TemplateInput & { id?: string; legal_basis?: string[] }
const EMPTY: Draft = { title: '', area_key: 'geral', description: '', body: '' }

function Editor({ initial, notes, onClose, onSaved, isAdmin }: { initial: Draft; notes?: ConvertResult | null; onClose: () => void; onSaved: () => void; isAdmin: boolean }) {
  const [d, setD] = useState<Draft>(initial)
  const [err, setErr] = useState('')
  const ta = useRef<HTMLTextAreaElement>(null)
  const { data: areas = [] } = useQuery({ queryKey: ['areas'], queryFn: areasApi.list, staleTime: 5 * 60_000 })
  const { data: check } = useQuery({ queryKey: ['tpl-check', d.body, d.area_key], queryFn: () => officeTemplatesApi.check(d.body, d.area_key), enabled: d.body.length > 0, staleTime: 5_000 })
  const save = useMutation({
    mutationFn: () => d.id ? officeTemplatesApi.update(d.id, { title: d.title, area_key: d.area_key, description: d.description, body: d.body, ...(notes ? { legal_basis: notes.legal_basis } : {}) })
      : officeTemplatesApi.create({ title: d.title, area_key: d.area_key, description: d.description, body: d.body, legal_basis: notes?.legal_basis }),
    onSuccess: onSaved, onError: (e: any) => setErr(e?.response?.data?.error || 'Não foi possível salvar.'),
  })
  const insert = (txt: string) => {
    const el = ta.current; const at = el ? [el.selectionStart, el.selectionEnd] : [d.body.length, d.body.length]
    setD(x => ({ ...x, body: x.body.slice(0, at[0]) + txt + x.body.slice(at[1]) }))
    setTimeout(() => { el?.focus(); el?.setSelectionRange(at[0] + txt.length, at[0] + txt.length) }, 0)
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-auto" role="dialog" aria-label="Editar modelo">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl my-4">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h2 className="font-semibold text-slate-900">{d.id ? 'Editar modelo' : 'Novo modelo'}</h2>
          <button onClick={onClose} className="btn-ghost p-1" aria-label="Fechar"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 grid lg:grid-cols-[1fr_280px] gap-5">
          <div className="space-y-3">
            {err && <p className="text-sm text-red-600">{err}</p>}
            {notes && notes.modified_fragments.length > 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
                <p className="font-medium flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> A IA alterou {notes.modified_fragments.length} trecho(s) em relação ao seu texto original — confira:</p>
                <ul className="list-disc pl-5 mt-1 space-y-0.5 text-xs">{notes.modified_fragments.map((f, i) => <li key={i}>{f}</li>)}</ul>
              </div>
            )}
            <div className="grid sm:grid-cols-[1fr_200px] gap-2">
              <input className="input" placeholder="Título do modelo" aria-label="Título do modelo" value={d.title} maxLength={200} onChange={e => setD({ ...d, title: e.target.value })} />
              <select className="input" aria-label="Área do modelo" value={d.area_key} onChange={e => setD({ ...d, area_key: e.target.value })}>{areas.map(a => <option key={a.key} value={a.key}>{a.short}</option>)}</select>
            </div>
            <input className="input" placeholder="Descrição curta (opcional)" aria-label="Descrição" value={d.description || ''} maxLength={500} onChange={e => setD({ ...d, description: e.target.value })} />
            <textarea ref={ta} className="input font-mono !text-sm w-full min-h-[50vh]" aria-label="Texto do modelo" spellCheck value={d.body} onChange={e => setD({ ...d, body: e.target.value })}
              placeholder={'# TÍTULO\n\n{{cliente.qualificacao}} vem propor…\n\n[[IA: Narre os fatos usando só os dados do caso.]]'} />
          </div>
          <aside className="space-y-3 text-sm">
            <section className="rounded-lg border p-3">
              <p className="font-medium text-slate-900 mb-1">Campos automáticos</p>
              <p className="text-xs text-slate-500 mb-2">Clique para inserir onde está o cursor. O sistema preenche com os dados do processo.</p>
              {FIELDS.map(g => (
                <div key={g.group} className="mb-2">
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">{g.group}</p>
                  <div className="flex flex-wrap gap-1 mt-1">{g.items.map(([k, l]) => <button key={k} type="button" className="text-xs px-1.5 py-0.5 rounded border hover:bg-slate-50" onClick={() => insert(`{{${k}}}`)}>{l}</button>)}</div>
                </div>
              ))}
            </section>
            <section className="rounded-lg border p-3">
              <p className="font-medium text-slate-900 mb-1 flex items-center gap-1"><Sparkles className="w-3.5 h-3.5 text-accent-500" /> Trecho para a IA</p>
              <p className="text-xs text-slate-500 mb-2">Onde o texto depende do caso. Quanto mais específica a instrução, menos a IA inventa.</p>
              <button type="button" className="btn-secondary !py-1 text-xs w-full justify-center" onClick={() => insert('[[IA: descreva aqui o que a IA deve escrever, usando só os dados do caso.]]')}>Inserir trecho da IA</button>
            </section>
            <section className="rounded-lg border p-3 text-xs text-slate-600 space-y-1">
              <p>Trechos da IA: <b>{check?.ai_slots ?? 0}</b></p>
              {check && check.unknown_placeholders.length > 0 && <p className="text-amber-700">Campos desconhecidos (viram [PREENCHER]): {check.unknown_placeholders.map(k => `{{${k}}}`).join(', ')}</p>}
              {notes && <p>Base legal liberada para a IA (dispositivos que o seu texto já cita): {notes.legal_basis.length ? notes.legal_basis.join('; ') : 'nenhuma'}</p>}
              <p className="text-slate-400">Citações fora da base legal são marcadas [CONFERIR] no documento.</p>
              {!isAdmin && <p className="text-slate-400">O administrador do escritório marca o modelo como “revisado”.</p>}
            </section>
          </aside>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={!d.title.trim() || !d.body.trim() || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Salvando…' : 'Salvar modelo'}</button>
        </div>
      </div>
    </div>
  )
}

export default function OfficeTemplates() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const { data: me } = useQuery({ queryKey: ['me-profile'], queryFn: usersApi.me })
  const canManage = !!me?.permissions?.templates_manage
  const isAdmin = user?.role === 'admin'
  const { data: list = [], isLoading } = useQuery({ queryKey: ['office-templates'], queryFn: officeTemplatesApi.list })
  const { data: areas = [] } = useQuery({ queryKey: ['areas'], queryFn: areasApi.list, staleTime: 5 * 60_000 })
  const [editing, setEditing] = useState<{ draft: Draft; notes?: ConvertResult | null } | null>(null)
  const [importing, setImporting] = useState(false)
  const [text, setText] = useState('')
  const [impArea, setImpArea] = useState('geral')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const refresh = () => { qc.invalidateQueries({ queryKey: ['office-templates'] }); qc.invalidateQueries({ queryKey: ['doc-templates'] }) }
  const fail = (e: any) => setMsg({ ok: false, text: e?.response?.data?.error || 'Não foi possível concluir.' })

  const convert = useMutation({
    mutationFn: () => officeTemplatesApi.convert(text, impArea),
    onSuccess: r => { qc.invalidateQueries({ queryKey: ['ai-credits'] }); setImporting(false); setText(''); setMsg({ ok: true, text: `Convertido (${r.credits_used.toFixed(1)} crédito(s)). Revise antes de salvar.` }); setEditing({ draft: { title: r.title, area_key: r.area_key, description: r.description, body: r.body }, notes: r }) },
    onError: fail,
  })
  const open = useMutation({ mutationFn: (id: string) => officeTemplatesApi.get(id), onSuccess: t => setEditing({ draft: { id: t.id, title: t.title, area_key: t.area, description: t.description, body: t.body } }), onError: fail })
  const remove = useMutation({ mutationFn: (id: string) => officeTemplatesApi.remove(id), onSuccess: refresh, onError: fail })
  const review = useMutation({ mutationFn: (v: { id: string; reviewed: boolean }) => officeTemplatesApi.update(v.id, { reviewed: v.reviewed }), onSuccess: refresh, onError: fail })

  const onFile = async (f: File | undefined) => {
    if (!f) return
    setMsg(null)
    try {
      if (/\.docx$/i.test(f.name)) {
        const b64 = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(f) })
        const out = await officeTemplatesApi.extract(b64); setText(out.text)
        if (out.truncated) setMsg({ ok: false, text: 'O arquivo é maior que o limite; só o começo foi lido. Divida a peça.' })
      } else if (/\.(txt|md)$/i.test(f.name)) setText(await f.text())
      else setMsg({ ok: false, text: 'Envie .docx, .txt ou .md — ou cole o texto.' })
    } catch (e) { fail(e) }
    if (fileRef.current) fileRef.current.value = ''
  }
  const areaLabel = (k: string) => areas.find(a => a.key === k)?.short || k

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Link to="/documentos" className="btn-ghost p-1.5" title="Voltar"><ArrowLeft className="w-4 h-4" /></Link>
        <div className="flex-1 min-w-[240px]">
          <h1 className="text-xl font-semibold text-slate-900">Modelos do escritório</h1>
          <p className="text-sm text-slate-500">Visíveis só para o seu escritório, junto com os modelos-base do Foro.</p>
        </div>
        {canManage && (
          <>
            <button className="btn-secondary" onClick={() => setImporting(true)}><Upload className="w-4 h-4" /> Importar peça pronta</button>
            <button className="btn-primary" onClick={() => setEditing({ draft: EMPTY })}><Plus className="w-4 h-4" /> Novo modelo</button>
          </>
        )}
      </div>
      {!canManage && <p className="mb-3 text-sm text-slate-500 bg-slate-100 rounded-lg p-3">Você pode usar os modelos do escritório. Para criar ou importar modelos, peça ao administrador em Configurações → Equipe → Permissões.</p>}
      {msg && <p className={clsx('mb-3 text-sm rounded-lg p-3', msg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700')} role="status">{msg.text}</p>}

      {importing && (
        <section className="card p-5 mb-5">
          <h2 className="font-medium text-slate-900 mb-1">Importar peça pronta</h2>
          <p className="text-xs text-slate-500 mb-3">Cole o texto (ou envie .docx/.txt). A IA mantém o seu texto, troca os dados do caso por campos automáticos e marca só os trechos que dependem do caso. Você revisa tudo antes de salvar. Gasta créditos de IA.</p>
          <div className="flex gap-2 mb-2 flex-wrap">
            <select className="input !w-52" aria-label="Área da peça" value={impArea} onChange={e => setImpArea(e.target.value)}>{areas.map(a => <option key={a.key} value={a.key}>{a.short}</option>)}</select>
            <input ref={fileRef} type="file" accept=".docx,.txt,.md" className="text-sm" aria-label="Enviar arquivo" onChange={e => onFile(e.target.files?.[0])} />
          </div>
          <textarea className="input !text-sm w-full min-h-[240px]" aria-label="Texto da peça" placeholder="Cole aqui a peça completa…" value={text} onChange={e => setText(e.target.value)} />
          <p className="text-xs text-slate-400 mt-1">{text.length.toLocaleString('pt-BR')} / 20.000 caracteres</p>
          <div className="flex gap-2 mt-3">
            <button className="btn-primary" disabled={text.trim().length < 80 || text.length > 20000 || convert.isPending} onClick={() => { setMsg(null); convert.mutate() }}><Sparkles className="w-4 h-4" /> {convert.isPending ? 'Convertendo…' : 'Converter em modelo'}</button>
            <button className="btn-secondary" onClick={() => setImporting(false)}>Cancelar</button>
          </div>
        </section>
      )}

      {isLoading ? <div className="card p-8 text-center text-slate-400">Carregando…</div> : list.length === 0 ? (
        <div className="card p-10 text-center"><p className="text-slate-600 mb-1">Nenhum modelo do escritório ainda.</p><p className="text-sm text-slate-400">Importe uma peça que o escritório já usa e a IA a transforma em modelo reutilizável.</p></div>
      ) : (
        <ul className="card divide-y">
          {list.map(t => (
            <li key={t.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{t.title} <span className="text-xs text-slate-400 font-normal">v{t.version}</span></p>
                <p className="text-xs text-slate-500 truncate">{areaLabel(t.area_key)} · por {t.created_by_name || '—'} · {fmtDate(t.updated_at)}{t.description ? ` · ${t.description}` : ''}</p>
              </div>
              {t.reviewed ? <span className="badge bg-green-100 text-green-700 !py-0 flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> revisado</span> : <span className="badge bg-amber-100 text-amber-700 !py-0">não revisado</span>}
              {isAdmin && <button className="text-xs text-brand-700 hover:underline" onClick={() => review.mutate({ id: t.id, reviewed: !t.reviewed })}>{t.reviewed ? 'Desmarcar' : 'Marcar revisado'}</button>}
              {(isAdmin || (canManage && t.created_by === user?.id)) && (
                <>
                  <button className="text-slate-400 hover:text-slate-800" aria-label={`Editar ${t.title}`} onClick={() => open.mutate(t.id)}><Pencil className="w-4 h-4" /></button>
                  <button className="text-slate-300 hover:text-red-600" aria-label={`Excluir ${t.title}`} onClick={() => confirm(`Excluir o modelo "${t.title}"? Documentos já criados não são afetados.`) && remove.mutate(t.id)}><Trash2 className="w-4 h-4" /></button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing && <Editor initial={editing.draft} notes={editing.notes} isAdmin={isAdmin} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); setMsg({ ok: true, text: 'Modelo salvo.' }) }} />}
    </div>
  )
}
