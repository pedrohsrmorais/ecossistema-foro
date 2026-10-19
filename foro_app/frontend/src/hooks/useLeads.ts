import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { leadsApi } from '../api'
import type { Lead } from '../api'

/**
 * Hook para listar leads com paginação e filtros.
 */
export function useLeads(params?: {
  search?: string
  stage?: string
  page?: number
  limit?: number
}) {
  return useQuery({
    queryKey: ['leads', params],
    queryFn: () => leadsApi.list(params),
    staleTime: 30_000,
  })
}

/**
 * Hook para buscar um lead específico pelo ID.
 */
export function useLead(id: string) {
  return useQuery({
    queryKey: ['lead', id],
    queryFn: () => leadsApi.getById(id),
    enabled: Boolean(id),
  })
}

/**
 * Hook para o resumo do funil.
 */
export function useFunnel() {
  return useQuery({
    queryKey: ['funnel'],
    queryFn: () => leadsApi.getFunnelSummary(),
    staleTime: 60_000,
  })
}

/**
 * Hook para criar um lead.
 */
export function useCreateLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Lead>) => leadsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['funnel'] })
    },
  })
}

/**
 * Hook para atualizar um lead.
 */
export function useUpdateLead(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Lead>) => leadsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead', id] })
      qc.invalidateQueries({ queryKey: ['leads'] })
    },
  })
}

/**
 * Hook para mover o estágio de um lead.
 */
export function useMoveLeadStage(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (stage: string) => leadsApi.moveStage(id, stage),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead', id] })
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['funnel'] })
    },
  })
}
