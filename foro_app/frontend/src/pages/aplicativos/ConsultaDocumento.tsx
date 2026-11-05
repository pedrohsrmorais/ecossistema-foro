import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Search, UserPlus, Gavel, Sparkles, RefreshCw, Phone, Mail, MapPin, MessageCircle, CheckCircle2, AlertTriangle, Users, ExternalLink } from 'lucide-react'
import {
  lookupApi, type CpfResult, type CnpjResult, type LookupMeta, type LookupPhone, type LookupAddress, type ProcessoResult,
} from '../../api'
import { useCan } from '../../hooks/useCan'
import { useModuleEnabled } from '../../hooks/useModuleEnabled'

export type Kind = 'cpf' | 'cnpj'
export const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const errMsg = (e: any, fb: string) => e?.response?.data?.error || fb
const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—')
const fmtDoc = (d: string) => d.length === 11
  ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  : d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
const addrLine = (a: LookupAddress) =>
  [[a.logradouro, a.numero, a.complemento].filter(Boolean).join(', '), a.bairro, [a.cidade, a.uf].filter(Boolean).join('/'), a.cep].filter(Boolean).join(' · ')

function Section({ icon: Icon, title, children }: { icon: typeof Phone; title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500 mb-1.5 flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" /> {title}</p>
      {children}
    </div>
  )
}

function Contacts({ telefones, emails, enderecos }: { telefones: LookupPhone[]; emails: string[]; enderecos: LookupAddress[] }) {
  return (
    <div className="space-y-4">
      <Section icon={Phone} title={`Telefones (${telefones.length})`}>
        {telefones.length === 0 ? <p className="text-sm text-slate-400">Nenhum telefone encontrado.</p> : (
          <ul className="space-y-1">
            {telefones.map(t => (
              <li key={t.numero} className="text-sm text-slate-900 flex items-center gap-2 flex-wrap">
                <span className="font-medium">{t.numero}</span>
                {t.tipo && <span className="text-xs text-slate-500">{t.tipo}</span>}
                {t.operadora && <span className="text-xs text-slate-400">{t.operadora}</span>}
                {t.whatsapp && <span className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 inline-flex items-center gap-1"><MessageCircle className="w-3 h-3" /> WhatsApp</span>}
                {t.bloqueado_telemarketing && <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">Bloqueia telemarketing</span>}
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section icon={Mail} title={`E-mails (${emails.length})`}>
        {emails.length === 0 ? <p className="text-sm text-slate-400">Nenhum e-mail encontrado.</p> : (
          <ul className="space-y-1">{emails.map(e => <li key={e} className="text-sm text-slate-900 break-all">{e}</li>)}</ul>
        )}
      </Section>
      <Section icon={MapPin} title={`Endereços (${enderecos.length})`}>
        {enderecos.length === 0 ? <p className="text-sm text-slate-400">Nenhum endereço encontrado.</p> : (
          <ul className="space-y-1">{enderecos.map((a, i) => <li key={i} className="text-sm text-slate-900">{addrLine(a)}</li>)}</ul>
        )}
      </Section>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><dt className="text-slate-500 text-xs">{label}</dt><dd className="text-slate-900 text-sm">{value || '—'}</dd></div>
}

function CpfCard({ d }: { d: CpfResult }) {
  return (
    <>
      <dl className="grid grid-cols-2 gap-3 mb-4">
        <Fact label="CPF" value={fmtDoc(d.cpf)} />
        <Fact label="Nascimento" value={d.data_nascimento ? `${fmtDate(d.data_nascimento + 'T12:00:00')}${d.idade != null ? ` (${d.idade} anos)` : ''}` : null} />
        <Fact label="Sexo" value={d.sexo} />
        <Fact label="Nome da mãe" value={d.nome_mae} />
        {d.renda_estimada != null && <Fact label="Renda estimada" value={`${brl(d.renda_estimada * 100)}${d.renda_faixa ? ` · ${d.renda_faixa}` : ''}`} />}
      </dl>
      <Contacts telefones={d.telefones} emails={d.emails} enderecos={d.enderecos} />
    </>
  )
}

function CnpjCard({ d }: { d: CnpjResult }) {
  return (
    <>
      <dl className="grid grid-cols-2 gap-3 mb-4">
        <Fact label="CNPJ" value={fmtDoc(d.cnpj)} />
        <Fact label="Situação" value={d.situacao_cadastral} />
        <Fact label="Nome fantasia" value={d.nome_fantasia} />
        <Fact label="Fundação" value={d.data_fundacao ? fmtDate(d.data_fundacao + 'T12:00:00') : null} />
        <Fact label="Porte" value={d.porte} />
        <Fact label="Natureza jurídica" value={d.natureza_juridica} />
        {d.cnae && <div className="col-span-2"><Fact label="Atividade principal" value={`${d.cnae.descricao} (${d.cnae.codigo})`} /></div>}
      </dl>
      <Contacts telefones={d.telefones} emails={d.emails} enderecos={d.enderecos} />
      {d.socios.length > 0 && (
        <div className="mt-4">
          <Section icon={Users} title={`Sócios (${d.socios.length})`}>
            <ul className="space-y-1">{d.socios.map((s, i) => <li key={i} className="text-sm text-slate-900">{s.nome}{s.cargo && <span className="text-xs text-slate-500"> · {s.cargo}</span>}</li>)}</ul>
          </Section>
        </div>
      )}
    </>
  )
}

function Processos({ r, onSummary, summary, summarizing }: { r: ProcessoResult; onSummary: () => void; summary: string | null; summarizing: boolean }) {
  return (
    <div className="card p-5 mt-4 animate-fade-in" data-testid="processos-card">
      <p className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1.5"><Gavel className="w-3.5 h-3.5" /> Processos ({r.total})</p>
      {r.total === 0 ? <p className="text-sm text-slate-500">{r.observacoes || 'Nenhum processo encontrado para este documento.'}</p> : (
        <div className="space-y-3">
          {r.processos.map(p => (
            <div key={p.numero_cnj} className="border-t pt-2 first:border-t-0 first:pt-0">
              <p className="text-sm font-medium text-slate-900">{p.numero_cnj}</p>
              <p className="text-xs text-slate-500">{[p.tribunal, p.classe, p.assunto].filter(Boolean).join(' · ')}</p>
              {p.valor_acao != null && <p className="text-xs text-slate-500">Valor da causa: {brl(p.valor_acao * 100)}</p>}
              {p.ultima_movimentacao && <p className="text-xs text-slate-400 mt-0.5">Última movimentação{p.data_ultima_movimentacao ? ` (${fmtDate(p.data_ultima_movimentacao)})` : ''}: {p.ultima_movimentacao}</p>}
            </div>
          ))}
        </div>
      )}
      {r.total > 0 && !summary && (
        <button onClick={onSummary} className="btn-secondary mt-3" disabled={summarizing}>
          <Sparkles className="w-4 h-4" /> {summarizing ? 'Gerando resumo...' : 'Gerar resumo por IA'}
        </button>
      )}
      {summary && <p className="mt-3 text-sm text-slate-800 leading-relaxed whitespace-pre-line bg-accent-50/50 rounded-lg p-3">{summary}</p>}
    </div>
  )
}

function MetaLine({ meta, onRefresh, refreshing, refreshPrice }: { meta: LookupMeta; onRefresh: () => void; refreshing: boolean; refreshPrice: number }) {
  return (
    <p className="text-xs text-slate-500 flex items-center gap-2 flex-wrap" data-testid="lookup-meta">
      {meta.cached
        ? <>Consulta de {fmtDate(meta.fetched_at)} — sem custo (já estava salva).</>
        : <>Consultado agora · cobrado {brl(meta.charged_cents)} · saldo {brl(meta.balance_cents)}.</>}
      <button type="button" onClick={onRefresh} disabled={refreshing} className="inline-flex items-center gap-1 text-accent-600 hover:underline">
        <RefreshCw className="w-3 h-3" /> Atualizar ({brl(refreshPrice)})
      </button>
    </p>
  )
}

interface Props {
  /** 'cpf' | 'cnpj' fixa o tipo; omitido = detecta pela quantidade de dígitos (pesquisa inteligente). */
  kind?: Kind
  title: string
  icon: typeof Search
  subtitle: string
}

/** Tela de consulta de CPF/CNPJ: consulta, mostra os dados, cria lead no CRM e busca processos. */
export default function ConsultaDocumento({ kind, title, icon: Icon, subtitle }: Props) {
  const qc = useQueryClient()
  const canCreate = useCan('create_leads')
  const enabled = useModuleEnabled()
  const [valor, setValor] = useState('')
  const [shown, setShown] = useState<{ kind: Kind; doc: string; data: CpfResult | CnpjResult; meta: LookupMeta } | null>(null)
  const [processos, setProcessos] = useState<{ r: ProcessoResult; meta: LookupMeta } | null>(null)
  const [summary, setSummary] = useState<string | null>(null)
  const [error, setError] = useState<{ msg: string; credits?: boolean } | null>(null)
  const [leadMsg, setLeadMsg] = useState<{ ok: boolean; text: string; id?: string } | null>(null)

  const { data: st } = useQuery({ queryKey: ['lookup-status'], queryFn: lookupApi.status, staleTime: 15_000 })
  const digits = valor.replace(/\D/g, '')
  const detected: Kind | null = kind ?? (digits.length === 11 ? 'cpf' : digits.length === 14 ? 'cnpj' : null)
  const okLen = detected === 'cpf' ? digits.length === 11 : detected === 'cnpj' ? digits.length === 14 : false
  const price = (k: Kind | 'processos') => (st ? st.prices[k] : 0)

  const fail = (e: any, fb: string) => setError({ msg: errMsg(e, fb), credits: e?.response?.status === 402 })
  const afterCharge = () => { qc.invalidateQueries({ queryKey: ['lookup-status'] }); qc.invalidateQueries({ queryKey: ['credits-balance'] }) }

  const consultar = useMutation({
    mutationFn: ({ refresh }: { refresh: boolean }): Promise<{ data: CpfResult | CnpjResult; meta: LookupMeta }> =>
      detected === 'cpf' ? lookupApi.cpf(digits, refresh) : lookupApi.cnpj(digits, refresh),
    onSuccess: (r) => {
      setShown({ kind: detected!, doc: digits, data: r.data, meta: r.meta })
      setProcessos(null); setSummary(null); setError(null); setLeadMsg(null); afterCharge()
    },
    onError: e => { setShown(null); fail(e, 'Não foi possível consultar.') },
  })
  const buscarProcessos = useMutation({
    mutationFn: () => lookupApi.processo(shown!.doc),
    onSuccess: r => { setProcessos({ r: r.data, meta: r.meta }); setError(null); afterCharge() },
    onError: e => fail(e, 'Não foi possível buscar os processos.'),
  })
  const resumir = useMutation({
    mutationFn: () => lookupApi.processoSummary(processos!.r),
    onSuccess: d => setSummary(d.summary),
    onError: e => fail(e, 'Erro ao gerar resumo.'),
  })
  const criarLead = useMutation({
    mutationFn: () => lookupApi.createLead(shown!.kind, shown!.doc),
    onSuccess: lead => {
      setLeadMsg({ ok: true, text: 'Lead criado no CRM.', id: lead.id })
      ;['leads', 'funnel', 'dashboard'].forEach(k => qc.invalidateQueries({ queryKey: [k] }))
    },
    onError: (e: any) => {
      if (e?.response?.data?.code === 'LEAD_EXISTS') setLeadMsg({ ok: false, text: 'Já existe um lead com este documento.', id: e.response.data.lead_id })
      else setLeadMsg({ ok: false, text: errMsg(e, 'Não foi possível criar o lead.') })
    },
  })

  const name = shown ? (shown.kind === 'cpf' ? (shown.data as CpfResult).nome : (shown.data as CnpjResult).razao_social) : null
  const canLead = canCreate && enabled('crm')

  return (
    <div className="p-6 max-w-2xl animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2"><Icon className="w-5 h-5 text-accent-500" /> {title}</h1>
        <p className="text-sm text-slate-500 mt-1">
          {subtitle}
          {st && <> {kind ? `Cada consulta custa ${brl(price(kind))}` : `CPF ${brl(price('cpf'))} · CNPJ ${brl(price('cnpj'))}`}, debitado da carteira de créditos (saldo {brl(st.balance_cents)}). Consultas repetidas em até {st.cache_days} dias não são cobradas de novo.</>}
        </p>
      </div>

      {st && !st.configured && (
        <p className="mb-4 text-sm rounded-lg border border-amber-200 bg-amber-50 text-amber-800 p-3 flex gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> As consultas ainda não foram configuradas na plataforma. Fale com o suporte.</p>
      )}

      <form onSubmit={e => { e.preventDefault(); consultar.mutate({ refresh: false }) }} className="card p-5 flex items-end gap-3 mb-5">
        <div className="flex-1">
          <label className="text-xs font-medium text-slate-600 mb-1 block">{kind === 'cpf' ? 'CPF' : kind === 'cnpj' ? 'CNPJ' : 'CPF ou CNPJ'}</label>
          <input className="input" data-testid="consulta-doc" placeholder={kind === 'cpf' ? '000.000.000-00' : kind === 'cnpj' ? '00.000.000/0000-00' : 'Cole o CPF ou CNPJ — a gente identifica o tipo'}
            value={valor} onChange={e => setValor(e.target.value)} maxLength={18} />
          {!kind && digits.length > 0 && detected && <p className="text-xs text-accent-600 mt-1">Identificado como {detected.toUpperCase()}</p>}
        </div>
        <button type="submit" className="btn-primary" data-testid="consulta-enviar" disabled={consultar.isPending || !okLen}>
          <Search className="w-4 h-4" /> {consultar.isPending ? 'Consultando...' : 'Consultar'}
        </button>
      </form>

      {error && (
        <p className="text-sm text-red-600 mb-4" role="alert" data-testid="consulta-erro">
          {error.msg}{error.credits && <> <Link to="/planos" className="underline">Ver créditos</Link></>}
        </p>
      )}

      {shown && (
        <div className="animate-fade-in">
          <div className="card p-5">
            <div className="flex items-start justify-between gap-3 mb-1">
              <h2 className="font-medium text-slate-900 text-lg" data-testid="consulta-nome">{name || fmtDoc(shown.doc)}</h2>
              {canLead && (
                <button className="btn-primary shrink-0" onClick={() => criarLead.mutate()} disabled={criarLead.isPending || leadMsg?.ok === true} data-testid="criar-lead">
                  <UserPlus className="w-4 h-4" /> {criarLead.isPending ? 'Criando...' : 'Criar lead'}
                </button>
              )}
            </div>
            <div className="mb-4">
              <MetaLine meta={shown.meta} refreshing={consultar.isPending} refreshPrice={price(shown.kind)} onRefresh={() => consultar.mutate({ refresh: true })} />
            </div>
            {leadMsg && (
              <p className={`text-sm mb-4 rounded-lg p-2.5 flex items-center gap-2 flex-wrap ${leadMsg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`} data-testid="lead-msg">
                {leadMsg.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />} {leadMsg.text}
                {leadMsg.id && <Link to={`/crm-comercial/${leadMsg.id}`} className="underline inline-flex items-center gap-1">{leadMsg.ok ? 'Abrir lead' : 'Abrir lead existente'} <ExternalLink className="w-3 h-3" /></Link>}
              </p>
            )}
            {shown.kind === 'cpf' ? <CpfCard d={shown.data as CpfResult} /> : <CnpjCard d={shown.data as CnpjResult} />}
          </div>

          {!processos && (
            <button className="btn-secondary mt-4" onClick={() => buscarProcessos.mutate()} disabled={buscarProcessos.isPending} data-testid="buscar-processos">
              <Gavel className="w-4 h-4" /> {buscarProcessos.isPending ? 'Buscando processos...' : `Buscar processos (${brl(price('processos'))})`}
            </button>
          )}
          {processos && <Processos r={processos.r} summary={summary} summarizing={resumir.isPending} onSummary={() => resumir.mutate()} />}
          <p className="text-[11px] text-slate-400 mt-4">Use estes dados apenas para finalidade legítima e informada, conforme a LGPD. As consultas ficam registradas na sua conta.</p>
        </div>
      )}
    </div>
  )
}
