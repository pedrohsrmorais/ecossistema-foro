import { Table2, Hash, Tag, CalendarDays, User, CheckSquare, Link2, Users, Briefcase } from 'lucide-react'
import type { BoardColumnType } from '../api'

/** Paleta dos quadros (classes literais para o Tailwind enxergar). */
export const BOARD_COLORS: Record<string, { solid: string; soft: string; border: string; dot: string }> = {
  slate:  { solid: 'bg-slate-500 text-white',  soft: 'bg-slate-100 text-slate-700',   border: 'border-slate-400',  dot: 'bg-slate-500' },
  blue:   { solid: 'bg-blue-500 text-white',   soft: 'bg-blue-100 text-blue-700',     border: 'border-blue-500',   dot: 'bg-blue-500' },
  green:  { solid: 'bg-green-600 text-white',  soft: 'bg-green-100 text-green-700',   border: 'border-green-600',  dot: 'bg-green-600' },
  amber:  { solid: 'bg-amber-500 text-white',  soft: 'bg-amber-100 text-amber-800',   border: 'border-amber-500',  dot: 'bg-amber-500' },
  red:    { solid: 'bg-red-500 text-white',    soft: 'bg-red-100 text-red-700',       border: 'border-red-500',    dot: 'bg-red-500' },
  purple: { solid: 'bg-purple-500 text-white', soft: 'bg-purple-100 text-purple-700', border: 'border-purple-500', dot: 'bg-purple-500' },
  pink:   { solid: 'bg-pink-500 text-white',   soft: 'bg-pink-100 text-pink-700',     border: 'border-pink-500',   dot: 'bg-pink-500' },
  teal:   { solid: 'bg-teal-600 text-white',   soft: 'bg-teal-100 text-teal-700',     border: 'border-teal-600',   dot: 'bg-teal-600' },
}
export const COLOR_KEYS = Object.keys(BOARD_COLORS)
export const colorOf = (k?: string) => BOARD_COLORS[k || ''] || BOARD_COLORS.slate

export const COLUMN_TYPES: { id: BoardColumnType; label: string; hint: string; icon: typeof Table2 }[] = [
  { id: 'text', label: 'Texto', hint: 'Anotações livres', icon: Table2 },
  { id: 'status', label: 'Status', hint: 'Etapas coloridas que você define', icon: Tag },
  { id: 'person', label: 'Pessoa', hint: 'Responsável do escritório', icon: User },
  { id: 'date', label: 'Data', hint: 'Prazos e datas', icon: CalendarDays },
  { id: 'number', label: 'Número', hint: 'Valores e quantidades', icon: Hash },
  { id: 'checkbox', label: 'Caixa de seleção', hint: 'Feito / não feito', icon: CheckSquare },
  { id: 'link', label: 'Link', hint: 'Endereço de site ou documento', icon: Link2 },
  { id: 'lead', label: 'Contato do CRM', hint: 'Liga ao CRM Comercial', icon: Users },
  { id: 'case', label: 'Processo', hint: 'Liga ao Monitoramento Processual', icon: Briefcase },
]
export const typeInfo = (t: BoardColumnType) => COLUMN_TYPES.find(c => c.id === t) || COLUMN_TYPES[0]
