import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Radar, Loader2, Sparkles } from 'lucide-react'
import { caseTrackingApi, type RefreshResult } from '../api'
import ProcessSnapshotView, { fmtDateTime, fmtDate } from './ProcessSnapshotView'
import { useCan } from '../hooks/useCan'
import { useModuleEnabled } from '../hooks/useModuleEnabled'

/** Ficha do processo: publicações do DJEN e andamentos do DataJud salvos, com "Acompanhar"/"Atualizar". */
export default function CaseTracking({ caseId, caseNumber, numberValid }: { caseId: string; caseNumber: string | null; numberValid: boolean | null }) {
  const qc = useQueryClient()
  const canTrack = useCan('create_cases')
  const enabled = useModuleEnabled()
  const [news, setNews] = useState<(RefreshResult & { first: boolean }) | null>(null)
  const [err, setErr] = useState('')
  const { data, isLoading } = useQuery({ queryKey: ['case-tracking', caseId], queryFn: () => caseTrackingApi.get(caseId) })
  const track = useMutation({
    mutationFn: () => caseTrackingApi.track(caseId),
    onSuccess: r => { setErr(''); setNews(r); qc.setQueryData(['case-tracking', caseId], { process: r.process }) },
    onError: (e: any) => setErr(e?.response?.data?.error || 'Não foi possível consultar agora.'),
  })
  const p = data?.process
  const can = canTrack && enabled('pesquisa_processual')

  return (
    <div className="card p-5 mt-5" data-testid="acompanhamento">
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <h2 className="font-medium text-slate-900 flex items-center gap-2 flex-1"><Radar className="w-4 h-4 text-accent-500" /> Publicações e andamentos do tribunal</h2>
        {p && <span className="text-xs text-slate-400">Atualizado em {fmtDateTime(p.snapshot_at)}</span>}
        {can && (p || (caseNumber && numberValid)) && (
          <button className={p ? 'btn-secondary' : 'btn-primary'} onClick={() => track.mutate()} disabled={track.isPending} data-testid="acompanhar">
            {track.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : p ? <RefreshCw className="w-4 h-4" /> : <Radar className="w-4 h-4" />}
            {track.isPending ? 'Consultando…' : p ? 'Atualizar' : 'Acompanhar este processo'}
          </button>
        )}
      </div>

      {err && <p className="text-sm text-red-600 mb-3" role="alert">{err}</p>}
      {news && !news.first && (
        <p className={`text-sm mb-3 rounded-lg p-2.5 flex items-center gap-2 ${news.novas_comunicacoes + news.novos_movimentos ? 'bg-accent-50 text-accent-800' : 'bg-slate-50 text-slate-600'}`} data-testid="novidades">
          <Sparkles className="w-4 h-4" />
          {news.novas_comunicacoes + news.novos_movimentos
            ? `${news.novas_comunicacoes} publicação(ões) nova(s) e ${news.novos_movimentos} movimentação(ões) nova(s) desde a última consulta.`
            : 'Nada novo desde a última consulta.'}
        </p>
      )}
      {news && !news.first && news.novos.comunicacoes.length > 0 && (
        <ul className="mb-3 space-y-1">
          {news.novos.comunicacoes.map((c, i) => <li key={i} className="text-xs text-slate-600"><b>{fmtDate(c.data)}</b> · {c.texto}</li>)}
        </ul>
      )}

      {isLoading ? <p className="text-sm text-slate-400">Carregando…</p>
        : p?.snapshot ? <ProcessSnapshotView snap={p.snapshot} />
        : !caseNumber ? <p className="text-sm text-slate-500">Cadastre o número CNJ do processo para acompanhar as publicações do DJEN.</p>
        : !numberValid ? <p className="text-sm text-slate-500">O número CNJ cadastrado parece inválido — confira para poder acompanhar.</p>
        : <p className="text-sm text-slate-500">Ainda não acompanhamos este processo. {can ? 'Clique em "Acompanhar este processo" para buscar todas as publicações do DJEN (desde 1990) e os andamentos do DataJud.' : 'Peça a quem pode editar processos para ativar o acompanhamento.'}</p>}
    </div>
  )
}
