import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Sparkles, Search } from 'lucide-react'
import { lookupApi, CnpjResult, CpfResult, ProcessoResult } from '../../api'
import ComingSoon from '../../components/ComingSoon'
import { LOCKED_FEATURES } from '../../config/featureFlags'

type Tipo = 'cpf' | 'cnpj'

function detectarTipo(digits: string): Tipo | null {
  if (digits.length === 11) return 'cpf'
  if (digits.length === 14) return 'cnpj'
  return null
}

/**
 * "Pesquisa inteligente" — uma única caixa de busca. Em vez de o usuário
 * escolher entre 3 telas (CNPJ / CPF / processual), ele só cola o documento
 * e a gente detecta o tipo pela quantidade de dígitos e já roda a consulta
 * cadastral + a busca de processos vinculados em paralelo, com resumo por IA.
 */
function PesquisaInteligenteForm() {
  const [valor, setValor] = useState('')
  const [tipoDetectado, setTipoDetectado] = useState<Tipo | null>(null)
  const [cadastro, setCadastro] = useState<CnpjResult | CpfResult | null>(null)
  const [processos, setProcessos] = useState<ProcessoResult | null>(null)
  const [summary, setSummary] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const digits = valor.replace(/\D/g, '')
  const tipo = detectarTipo(digits)

  const buscar = useMutation({
    mutationFn: async () => {
      if (!tipo) throw new Error('tipo-invalido')
      const [cadastroResult, processosResult] = await Promise.allSettled([
        tipo === 'cnpj' ? lookupApi.cnpj(digits) : lookupApi.cpf(digits),
        lookupApi.processo(digits),
      ])
      return {
        cadastro: cadastroResult.status === 'fulfilled' ? cadastroResult.value : null,
        processos: processosResult.status === 'fulfilled' ? processosResult.value : null,
      }
    },
    onSuccess: ({ cadastro, processos }) => {
      setTipoDetectado(tipo)
      setCadastro(cadastro)
      setProcessos(processos)
      setSummary(null)
      setError(null)
    },
    onError: () => setError('Não foi possível identificar ou consultar esse documento. Confira o CPF/CNPJ digitado.'),
  })

  const summaryMutation = useMutation({
    mutationFn: () => lookupApi.processoSummary(processos!),
    onSuccess: data => setSummary(data.summary),
    onError: (err: any) => setError(err?.response?.data?.error || 'Erro ao gerar resumo.'),
  })

  return (
    <div className="p-6 max-w-2xl animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-accent-500" />
          Pesquisa inteligente
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Cole um CPF ou CNPJ — a gente identifica o tipo e já traz os dados cadastrais
          e os processos vinculados numa busca só, com resumo por IA.
        </p>
      </div>

      <form
        onSubmit={e => { e.preventDefault(); buscar.mutate() }}
        className="card p-5 flex items-end gap-3 mb-5"
      >
        <div className="flex-1">
          <label className="text-xs font-medium text-slate-600 mb-1 block">CPF ou CNPJ</label>
          <input
            className="input"
            placeholder="Cole o CPF ou CNPJ — a gente identifica o tipo"
            value={valor}
            onChange={e => setValor(e.target.value)}
            maxLength={18}
          />
          {digits.length > 0 && tipo && (
            <p className="text-xs text-accent-600 mt-1">Identificado como {tipo.toUpperCase()}</p>
          )}
        </div>
        <button type="submit" className="btn-primary" disabled={buscar.isPending || !tipo}>
          <Search className="w-4 h-4" />
          {buscar.isPending ? 'Buscando...' : 'Buscar tudo'}
        </button>
      </form>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {(cadastro || processos) && (
        <div className="space-y-3 animate-fade-in">
          {cadastro && (
            <div className="card p-4">
              <p className="text-xs font-medium text-slate-500 mb-2">Dados cadastrais ({tipoDetectado?.toUpperCase()})</p>
              <p className="font-medium text-slate-900">
                {tipoDetectado === 'cnpj' ? (cadastro as CnpjResult).razao_social : (cadastro as CpfResult).nome}
              </p>
              <p className="text-sm text-slate-500 mt-0.5">
                {tipoDetectado === 'cnpj' ? (cadastro as CnpjResult).situacao_cadastral : (cadastro as CpfResult).situacao}
              </p>
            </div>
          )}

          {processos && processos.processos.length > 0 && (
            <div className="card p-4">
              <p className="text-xs font-medium text-slate-500 mb-2">
                {processos.processos.length} processo(s) vinculado(s)
              </p>
              <div className="space-y-2">
                {processos.processos.map(p => (
                  <div key={p.numero_cnj} className="border-t pt-2 first:border-t-0 first:pt-0">
                    <p className="text-sm font-medium text-slate-900">{p.numero_cnj}</p>
                    <p className="text-xs text-slate-500">{p.tribunal} · {p.classe}</p>
                  </div>
                ))}
              </div>
              {!summary && (
                <button
                  onClick={() => summaryMutation.mutate()}
                  className="btn-secondary mt-3"
                  disabled={summaryMutation.isPending}
                >
                  <Sparkles className="w-4 h-4" />
                  {summaryMutation.isPending ? 'Gerando resumo...' : 'Gerar resumo por IA'}
                </button>
              )}
            </div>
          )}

          {summary && (
            <div className="card p-5 bg-accent-50/50 border-accent-200">
              <p className="text-xs font-medium text-accent-700 mb-2 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Resumo por IA
              </p>
              <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-line">{summary}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function PesquisaInteligente() {
  if (LOCKED_FEATURES.pesquisaInteligente) {
    return (
      <ComingSoon
        title="Pesquisa inteligente"
        description="Em breve: uma busca só, que identifica se você colou um CPF ou CNPJ e já traz cadastro + processos vinculados, com resumo por IA."
      >
        <PesquisaInteligenteForm />
      </ComingSoon>
    )
  }
  return <PesquisaInteligenteForm />
}
