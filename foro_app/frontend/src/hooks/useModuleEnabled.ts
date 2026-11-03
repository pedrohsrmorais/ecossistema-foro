import { useQuery } from '@tanstack/react-query'
import { modulesApi } from '../api'

/** Módulos ligados/desligados por conta pelo admin da plataforma. Enquanto carrega, considera tudo ligado (sem piscar). */
export function useModuleEnabled() {
  const { data } = useQuery({ queryKey: ['modules'], queryFn: modulesApi.list, staleTime: 5 * 60 * 1000 })
  const off = new Set((data || []).filter(m => !m.enabled).map(m => m.module_key))
  return (key: string) => !off.has(key)
}
