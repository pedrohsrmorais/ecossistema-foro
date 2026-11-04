import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { leadStagesApi, type LeadStage, type LeadStageKind } from '../api'

/** Etapas padrão: usadas só enquanto as do escritório carregam (as reais vêm de /lead-stages e são editáveis). */
export const DEFAULT_STAGES: LeadStage[] = [
  { id: 'd1', stage_key: 'novo',       label: 'Novo',       color: '#0ea5e9', position: 0, kind: 'open' },
  { id: 'd2', stage_key: 'em_contato', label: 'Em contato', color: '#f59e0b', position: 1, kind: 'open' },
  { id: 'd3', stage_key: 'proposta',   label: 'Proposta',   color: '#a855f7', position: 2, kind: 'proposal' },
  { id: 'd4', stage_key: 'convertido', label: 'Convertido', color: '#22c55e', position: 3, kind: 'won' },
  { id: 'd5', stage_key: 'encerrado',  label: 'Encerrado',  color: '#94a3b8', position: 4, kind: 'closed' },
]

export const KIND_LABEL: Record<LeadStageKind, string> = {
  open: 'Em andamento',
  proposal: 'Em negociação (honorários previstos)',
  won: 'Convertido (cliente fechado)',
  closed: 'Encerrado (sem conversão)',
}

/** Estilo da pílula a partir da cor da etapa (fundo claro + texto escurecido). */
export const pillStyle = (color: string) => ({
  backgroundColor: `${color}26`,
  color: `color-mix(in srgb, ${color} 62%, black)`,
})

export interface StageCtx {
  stages: LeadStage[]
  /** Etapa pela chave; se não existir (ex.: removida), cai na primeira. */
  stageOf: (key: string) => LeadStage
  firstKey: string
  isWon: (key: string) => boolean
}

/** Etapas do funil do escritório (cache compartilhado; atualizado quando o administrador edita). */
export function useLeadStages(): StageCtx {
  const { data } = useQuery({ queryKey: ['lead-stages'], queryFn: leadStagesApi.list, staleTime: 60_000 })
  const stages = data && data.length ? data : DEFAULT_STAGES
  return useMemo(() => ({
    stages,
    stageOf: (key: string) => stages.find(s => s.stage_key === key) ?? stages[0],
    firstKey: stages[0].stage_key,
    isWon: (key: string) => stages.find(s => s.stage_key === key)?.kind === 'won',
  }), [stages])
}
