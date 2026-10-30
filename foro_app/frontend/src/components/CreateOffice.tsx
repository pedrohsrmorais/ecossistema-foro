import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, KeyRound, Clock } from 'lucide-react'
import clsx from 'clsx'
import { officeApi } from '../api'
import { useAuth } from '../context/AuthContext'

function maskCnpj(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 14)
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2')
}

/** Criação rápida do escritório (só o nome é obrigatório) ou pedido de entrada por código. */
export default function CreateOffice({ initialMode = 'create' }: { initialMode?: 'create' | 'join' }) {
  const qc = useQueryClient()
  const { enterWorkspace } = useAuth()
  const { data: office } = useQuery({ queryKey: ['office'], queryFn: officeApi.get, refetchInterval: q => (q.state.data?.my_join_request ? 15_000 : false) })
  const [mode, setMode] = useState<'create' | 'join'>(initialMode)
  const [name, setName] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const fail = (e: any) => setError(e?.response?.data?.error || 'Não foi possível concluir. Tente de novo.')

  const create = useMutation({
    mutationFn: () => officeApi.create({ name: name.trim(), ...(cnpj ? { cnpj } : {}) }),
    onSuccess: r => enterWorkspace(r.token), onError: fail,
  })
  const join = useMutation({
    mutationFn: () => officeApi.join(code.trim()),
    onSuccess: r => { setInfo(`Pedido enviado para ${r.office_name}. O administrador precisa aprovar.`); setCode(''); qc.invalidateQueries({ queryKey: ['office'] }) },
    onError: fail,
  })
  const cancel = useMutation({ mutationFn: officeApi.cancelJoin, onSuccess: () => { setInfo(''); qc.invalidateQueries({ queryKey: ['office'] }) } })
  const pending = office?.my_join_request

  return (
    <div className="card p-6 w-full max-w-md bg-white">
      <div className="w-11 h-11 rounded-full bg-accent-100 text-accent-600 flex items-center justify-center mx-auto mb-3"><Building2 className="w-5 h-5" /></div>
      <h2 className="text-lg font-semibold text-slate-900 text-center">Crie ou entre em um escritório</h2>
      <p className="text-sm text-slate-500 text-center mt-1 mb-4">Cada escritório tem os próprios dados, equipe e regras. Seu espaço pessoal continua separado — troque quando quiser pelo menu.</p>

      <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg mb-4" role="tablist">
        {([['create', 'Criar escritório'], ['join', 'Entrar com código']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={mode === k} onClick={() => { setMode(k); setError('') }}
            className={clsx('text-sm py-1.5 rounded-md font-medium transition-colors', mode === k ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-800')}>{l}</button>
        ))}
      </div>

      {error && <div className="mb-3 p-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

      {mode === 'create' ? (
        <form className="space-y-3" onSubmit={e => { e.preventDefault(); setError(''); create.mutate() }}>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nome do escritório</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Silva & Associados" maxLength={120} required autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">CNPJ <span className="text-slate-400 font-normal">(opcional)</span></label>
            <input className="input" value={cnpj} onChange={e => setCnpj(maskCnpj(e.target.value))} placeholder="00.000.000/0000-00" inputMode="numeric" />
          </div>
          <button className="btn-primary w-full justify-center" disabled={create.isPending || name.trim().length < 2}>{create.isPending ? 'Criando…' : 'Criar escritório'}</button>
          <p className="text-xs text-slate-400 text-center">Você vira o administrador. Endereço, equipe e permissões você ajusta depois.</p>
        </form>
      ) : pending ? (
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm"><Clock className="w-4 h-4" /> Aguardando aprovação de <strong>{pending.office_name}</strong></div>
          <p className="text-xs text-slate-500">Quando o administrador aprovar, o escritório aparece no seletor de workspace (menu, no topo).</p>
          <button className="text-sm text-slate-500 hover:underline" onClick={() => cancel.mutate()}>Cancelar pedido</button>
        </div>
      ) : (
        <form className="space-y-3" onSubmit={e => { e.preventDefault(); setError(''); setInfo(''); join.mutate() }}>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Código do escritório</label>
            <input className="input font-mono tracking-widest uppercase" value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="ABCD2345" maxLength={12} required />
          </div>
          <button className="btn-primary w-full justify-center" disabled={join.isPending || code.trim().length < 6}><KeyRound className="w-4 h-4" /> {join.isPending ? 'Enviando…' : 'Pedir para entrar'}</button>
          {info && <p className="text-sm text-green-700">{info}</p>}
          <p className="text-xs text-slate-400 text-center">Peça o código ao administrador do escritório (ou use o link de convite que ele enviou por e-mail).</p>
        </form>
      )}
    </div>
  )
}
