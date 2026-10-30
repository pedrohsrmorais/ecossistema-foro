import { useQuery } from '@tanstack/react-query'
import { usersApi, type Permissions } from '../api'

/** Permissão da pessoa NO WORKSPACE ATIVO (regras do escritório + ajuste individual). Enquanto carrega, assume permitido. */
export function useCan(key: keyof Permissions): boolean {
  const { data } = useQuery({ queryKey: ['me-profile'], queryFn: usersApi.me, staleTime: 60_000 })
  const v = data?.permissions?.[key]
  return v === undefined ? true : v !== false && v !== ('none' as any)
}
