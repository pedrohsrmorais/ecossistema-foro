import { useMemo, useRef, useState, useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, Trash2, ChevronDown, ChevronRight, MoreHorizontal, Table2, Kanban, Search, ArrowLeftToLine, ArrowRightToLine, Palette, Pencil, X } from 'lucide-react'
import clsx from 'clsx'
import { boardsApi, usersApi, type Board, type BoardCell, type BoardColumn, type BoardItem, type BoardGroup, type StatusOption } from '../api'
import { useCan } from '../hooks/useCan'
import { COLUMN_TYPES, COLOR_KEYS, BOARD_COLORS, colorOf, typeInfo } from '../lib/boards'
import Cell from '../components/quadros/Cells'
import Popover from '../components/quadros/Popover'
import StatusEditor from '../components/quadros/StatusEditor'

const colPx = (t: BoardColumn['type']) => (t === 'checkbox' ? 96 : t === 'number' || t === 'date' ? 160 : 192)
const NAME_PX = 240

/** Texto editável no lugar (nomes de quadro, grupo e item). */
function InlineText({ value, canEdit, onSave, className, placeholder, label }: { value: string; canEdit: boolean; onSave: (v: string) => void; className?: string; placeholder?: string; label: string }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  if (!canEdit) return <span className={className}>{value}</span>
  const commit = () => { const t = v.trim(); if (t && t !== value) onSave(t); else setV(value) }
  return (
    <input aria-label={label} className={clsx('bg-transparent outline-none rounded px-1 -mx-1 focus:bg-white focus:ring-2 focus:ring-brand-300 hover:bg-slate-100/70 min-w-0', className)}
      value={v} placeholder={placeholder} onChange={e => setV(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setV(value); (e.target as HTMLInputElement).blur() } }} />
  )
}

export default function QuadroView() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const canEdit = useCan('boards_edit')
  const canManage = useCan('boards_manage')
  const [view, setViewState] = useState<'tabela' | 'kanban'>(() => { try { return localStorage.getItem('foro.board.view') === 'kanban' ? 'kanban' : 'tabela' } catch { return 'tabela' } })
  const setView = (v: 'tabela' | 'kanban') => { setViewState(v); try { localStorage.setItem('foro.board.view', v) } catch { /* sem storage */ } }
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [editStatus, setEditStatus] = useState<BoardColumn | null>(null)
  const [addColAnchor, setAddColAnchor] = useState<HTMLElement | null>(null)
  const [error, setError] = useState('')

  const key = ['board', id]
  const { data: board, isLoading, isError } = useQuery({ queryKey: key, queryFn: () => boardsApi.get(id), retry: false })
  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: usersApi.list, staleTime: 60_000 })

  const fail = (e: any) => { setError(e?.response?.data?.error || 'Não foi possível salvar.'); qc.invalidateQueries({ queryKey: key }) }
  const done = () => qc.invalidateQueries({ queryKey: key })
  const setBoard = (fn: (b: Board) => Board) => qc.setQueryData<Board>(key, b => (b ? fn(b) : b))

  // ── itens (otimista: a célula muda na hora; se o servidor recusar, recarrega)
  const patchItem = (itemId: string, patch: { name?: string; group_id?: string; vals?: Record<string, BoardCell> }) => {
    setError('')
    setBoard(b => ({ ...b, items: b.items.map(i => {
      if (i.id !== itemId) return i
      const vals = { ...i.vals }
      for (const [k, v] of Object.entries(patch.vals || {})) { if (v === null || v === undefined) delete vals[k]; else vals[k] = v }
      return { ...i, name: patch.name ?? i.name, group_id: patch.group_id ?? i.group_id, vals }
    }) }))
    boardsApi.updateItem(id, itemId, patch).then(item => setBoard(b => ({ ...b, items: b.items.map(i => (i.id === itemId ? item : i)) }))).catch(fail)
  }
  const addItem = useMutation({
    mutationFn: (d: { name: string; group_id: string; vals?: Record<string, BoardCell> }) => boardsApi.addItem(id, d),
    onSuccess: done, onError: fail,
  })
  const removeItem = useMutation({ mutationFn: (itemId: string) => boardsApi.removeItem(id, itemId), onSuccess: done, onError: fail })

  // ── estrutura
  const updBoard = useMutation({ mutationFn: (d: { name?: string; description?: string | null }) => boardsApi.update(id, d), onSuccess: () => { done(); qc.invalidateQueries({ queryKey: ['boards'] }) }, onError: fail })
  const delBoard = useMutation({ mutationFn: () => boardsApi.remove(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['boards'] }); nav('/quadros') }, onError: fail })
  const addCol = useMutation({ mutationFn: (d: { name: string; type: BoardColumn['type'] }) => boardsApi.addColumn(id, d), onSuccess: done, onError: fail })
  const updCol = useMutation({ mutationFn: ({ colId, ...d }: { colId: string; name?: string; settings?: { options: StatusOption[] } }) => boardsApi.updateColumn(id, colId, d), onSuccess: done, onError: fail })
  const delCol = useMutation({ mutationFn: (colId: string) => boardsApi.removeColumn(id, colId), onSuccess: done, onError: fail })
  const moveCol = (colId: string, dir: -1 | 1) => {
    if (!board) return
    const ids = board.columns.map(c => c.id); const i = ids.indexOf(colId); const j = i + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    setBoard(b => ({ ...b, columns: ids.map(x => b.columns.find(c => c.id === x)!) }))
    boardsApi.reorderColumns(id, ids).then(done).catch(fail)
  }
  const addGroup = useMutation({ mutationFn: () => boardsApi.addGroup(id, { name: 'Novo grupo' }), onSuccess: done, onError: fail })
  const updGroup = useMutation({ mutationFn: ({ gid, ...d }: { gid: string; name?: string; color?: string }) => boardsApi.updateGroup(id, gid, d), onSuccess: done, onError: fail })
  const delGroup = useMutation({ mutationFn: (gid: string) => boardsApi.removeGroup(id, gid), onSuccess: done, onError: fail })

  const q = search.trim().toLowerCase()
  const visible = (i: BoardItem) => !q || i.name.toLowerCase().includes(q) || Object.values(i.vals).some(v => (typeof v === 'object' && v ? v.label : String(v ?? '')).toLowerCase().includes(q))
  const statusCols = useMemo(() => board?.columns.filter(c => c.type === 'status') || [], [board])
  const [kanbanCol, setKanbanCol] = useState('')
  const kcol = statusCols.find(c => c.id === kanbanCol) || statusCols[0]

  if (isLoading) return <div className="p-6 text-slate-400">Carregando…</div>
  if (isError || !board) return (
    <div className="p-6"><p className="text-slate-600 mb-2">Quadro não encontrado.</p><Link to="/quadros" className="text-brand-600 hover:underline text-sm">Voltar aos quadros</Link></div>
  )

  return (
    <div className="p-4 sm:p-6">
      <Link to="/quadros" className="text-xs text-slate-500 hover:text-brand-600 inline-flex items-center gap-1 mb-2"><ArrowLeft className="w-3.5 h-3.5" /> Quadros</Link>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div className="min-w-0 flex-1">
          <InlineText value={board.name} canEdit={canManage} onSave={name => updBoard.mutate({ name })} label="Nome do quadro" className="text-xl font-semibold text-slate-900 w-full max-w-xl" />
          {(board.description || canManage) && (
            <InlineText value={board.description || ''} canEdit={canManage} onSave={description => updBoard.mutate({ description })} label="Descrição do quadro" placeholder="Adicionar descrição…" className="text-sm text-slate-500 w-full max-w-xl block" />
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-2.5 text-slate-400" />
            <input className="input !pl-7 !py-1.5 text-sm w-40 sm:w-52" placeholder="Buscar no quadro" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="inline-flex rounded-lg border bg-white p-0.5">
            {([['tabela', 'Tabela', Table2], ['kanban', 'Kanban', Kanban]] as const).map(([v, label, Icon]) => (
              <button key={v} data-testid={`board-view-${v}`} onClick={() => setView(v)}
                className={clsx('px-3 py-1 text-sm rounded-md font-medium flex items-center gap-1', view === v ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:text-slate-900')}><Icon className="w-3.5 h-3.5" />{label}</button>
            ))}
          </div>
          {canManage && view === 'tabela' && (
            <button className="btn-secondary text-sm" onClick={e => setAddColAnchor(e.currentTarget)} data-testid="nova-coluna-topo"><Plus className="w-4 h-4" /> Coluna</button>
          )}
          {canManage && (
            <button className="btn-ghost !p-2 text-slate-400 hover:text-red-600" title="Excluir quadro" aria-label="Excluir quadro"
              onClick={() => confirm(`Excluir o quadro “${board.name}” com todos os itens? Não dá para desfazer.`) && delBoard.mutate()}><Trash2 className="w-4 h-4" /></button>
          )}
        </div>
      </div>
      {error && <p className="text-sm text-red-600 mb-2 flex items-center gap-2" role="alert">{error}<button onClick={() => setError('')} aria-label="Fechar aviso"><X className="w-3.5 h-3.5" /></button></p>}
      {!canEdit && <p className="text-xs text-slate-400 mb-2">Você pode ver este quadro, mas não editar os itens.</p>}

      {view === 'kanban' ? (
        kcol ? (
          <Kanbanboard board={board} col={kcol} statusCols={statusCols} onPickCol={setKanbanCol} canEdit={canEdit} visible={visible} users={users}
            onMove={(itemId, optId) => patchItem(itemId, { vals: { [kcol.id]: optId } })}
            onAdd={(optId, name) => addItem.mutate({ name, group_id: board.groups[0].id, vals: optId ? { [kcol.id]: optId } : undefined })} />
        ) : (
          <div className="card p-8 text-center text-slate-500 text-sm">
            O Kanban usa uma coluna de <strong>Status</strong>. {canManage ? 'Adicione uma coluna do tipo Status para ver os itens por etapa.' : 'Peça a quem administra o quadro para adicionar uma coluna de Status.'}
          </div>
        )
      ) : (
        <div className="space-y-5">
          {board.groups.map(g => (
            <GroupTable key={g.id} board={board} group={g} canEdit={canEdit} canManage={canManage} users={users}
              items={board.items.filter(i => i.group_id === g.id && visible(i))} totalInGroup={board.items.filter(i => i.group_id === g.id).length}
              collapsed={collapsed.has(g.id)} onToggle={() => setCollapsed(s => { const n = new Set(s); n.has(g.id) ? n.delete(g.id) : n.add(g.id); return n })}
              onPatch={patchItem} onAddItem={name => addItem.mutate({ name, group_id: g.id })} onRemoveItem={itemId => removeItem.mutate(itemId)}
              onRenameGroup={name => updGroup.mutate({ gid: g.id, name })} onColorGroup={color => updGroup.mutate({ gid: g.id, color })}
              onDeleteGroup={() => confirm(`Excluir o grupo “${g.name}” e os ${board.items.filter(i => i.group_id === g.id).length} itens dele?`) && delGroup.mutate(g.id)}
              onRenameCol={(colId, name) => updCol.mutate({ colId, name })} onMoveCol={moveCol} onDeleteCol={c => confirm(`Excluir a coluna “${c.name}”? Os valores dela nos itens serão apagados.`) && delCol.mutate(c.id)}
              onEditStatus={setEditStatus}
              onAddColumn={el => setAddColAnchor(el)} />
          ))}
          {canManage && <button className="btn-secondary text-sm" onClick={() => addGroup.mutate()} data-testid="novo-grupo"><Plus className="w-4 h-4" /> Novo grupo</button>}
        </div>
      )}

      {addColAnchor && (
        <Popover anchor={addColAnchor} onClose={() => setAddColAnchor(null)} width={260}>
          <p className="px-3 py-1 text-xs font-medium text-slate-400 uppercase tracking-wide">Tipo da coluna</p>
          {COLUMN_TYPES.map(t => (
            <button key={t.id} role="menuitem" data-testid={`coltype-${t.id}`} className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-start gap-2"
              onClick={() => { setAddColAnchor(null); addCol.mutate({ name: t.label, type: t.id }) }}>
              <t.icon className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
              <span><span className="block text-slate-900">{t.label}</span><span className="block text-xs text-slate-400">{t.hint}</span></span>
            </button>
          ))}
        </Popover>
      )}
      {editStatus && (
        <StatusEditor options={editStatus.settings?.options || []} onClose={() => setEditStatus(null)}
          onSave={options => { updCol.mutate({ colId: editStatus.id, settings: { options } }); setEditStatus(null) }} />
      )}
    </div>
  )
}

// ─── Grupo (tabela) ──────────────────────────────────────────────────────────

function GroupTable({ board, group, items, totalInGroup, canEdit, canManage, users, collapsed, onToggle, onPatch, onAddItem, onRemoveItem, onRenameGroup, onColorGroup, onDeleteGroup, onRenameCol, onMoveCol, onDeleteCol, onEditStatus, onAddColumn }: {
  board: Board; group: BoardGroup; items: BoardItem[]; totalInGroup: number; canEdit: boolean; canManage: boolean; users: any[]
  collapsed: boolean; onToggle: () => void
  onPatch: (itemId: string, patch: { name?: string; vals?: Record<string, BoardCell> }) => void
  onAddItem: (name: string) => void; onRemoveItem: (itemId: string) => void
  onRenameGroup: (n: string) => void; onColorGroup: (c: string) => void; onDeleteGroup: () => void
  onRenameCol: (colId: string, n: string) => void; onMoveCol: (colId: string, dir: -1 | 1) => void; onDeleteCol: (c: BoardColumn) => void
  onEditStatus: (c: BoardColumn) => void
  onAddColumn: (el: HTMLElement) => void
}) {
  const [newName, setNewName] = useState('')
  const [menu, setMenu] = useState(false)
  const menuBtn = useRef<HTMLButtonElement>(null)
  const c = colorOf(group.color)

  return (
    <section data-testid="board-group" className="min-w-0">
      <div className="flex items-center gap-1 mb-1">
        <button onClick={onToggle} className={clsx('p-0.5 rounded', c.soft)} aria-label={collapsed ? 'Expandir grupo' : 'Recolher grupo'}>{collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</button>
        <InlineText value={group.name} canEdit={canManage} onSave={onRenameGroup} label="Nome do grupo" className={clsx('font-semibold text-sm', c.soft.split(' ')[1])} />
        <span className="text-xs text-slate-400 ml-1">{totalInGroup} {totalInGroup === 1 ? 'item' : 'itens'}</span>
        {canManage && (
          <button ref={menuBtn} className="p-1 text-slate-400 hover:text-slate-700" onClick={() => setMenu(m => !m)} aria-label="Opções do grupo"><MoreHorizontal className="w-4 h-4" /></button>
        )}
        {menu && (
          <Popover anchor={menuBtn.current} onClose={() => setMenu(false)} width={190}>
            <p className="px-3 py-1 text-xs text-slate-400 flex items-center gap-1"><Palette className="w-3 h-3" /> Cor do grupo</p>
            <div className="px-3 pb-2 flex gap-1.5 flex-wrap">
              {COLOR_KEYS.map(k => <button key={k} onClick={() => { onColorGroup(k); setMenu(false) }} aria-label={`Cor ${k}`} className={clsx('w-5 h-5 rounded-full', BOARD_COLORS[k].dot, group.color === k && 'ring-2 ring-offset-1 ring-slate-700')} />)}
            </div>
            {board.groups.length > 1 && <button role="menuitem" className="w-full text-left px-3 py-1.5 text-red-600 hover:bg-red-50 flex items-center gap-2" onClick={() => { setMenu(false); onDeleteGroup() }}><Trash2 className="w-3.5 h-3.5" /> Excluir grupo</button>}
          </Popover>
        )}
      </div>

      {!collapsed && (
        <div className={clsx('card overflow-x-auto border-l-4', c.border)}>
          <table className="text-sm border-collapse" style={{ tableLayout: 'fixed', width: NAME_PX + board.columns.reduce((n, c) => n + colPx(c.type), 0) + 48 }}>
            <colgroup><col style={{ width: NAME_PX }} />{board.columns.map(c => <col key={c.id} style={{ width: colPx(c.type) }} />)}<col style={{ width: 48 }} /></colgroup>
            <thead>
              <tr className="bg-slate-50 text-slate-600 text-left">
                <th className={clsx('sticky left-0 z-10 bg-slate-50 px-2 py-1.5 font-medium border-b border-r', 'w-[15rem]')}>Item</th>
                {board.columns.map((col, idx) => (
                  <ColumnHeader key={col.id} col={col} first={idx === 0} last={idx === board.columns.length - 1} canManage={canManage}
                    onRename={n => onRenameCol(col.id, n)} onMove={d => onMoveCol(col.id, d)} onDelete={() => onDeleteCol(col)} onEditStatus={() => onEditStatus(col)} />
                ))}
                <th className="border-b px-2 py-1.5 w-12">
                  {canManage && (
                    <button onClick={e => onAddColumn(e.currentTarget)} className="p-1 rounded text-slate-500 hover:bg-slate-200" title="Adicionar coluna" aria-label="Adicionar coluna" data-testid="nova-coluna"><Plus className="w-4 h-4" /></button>
                  )}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} data-testid="board-row" className="group border-b last:border-b-0 hover:bg-slate-50/60">
                  <td className={clsx('sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r px-1', 'w-[15rem]')}>
                    <div className="flex items-center">
                      <InlineText value={item.name} canEdit={canEdit} onSave={name => onPatch(item.id, { name })} label="Nome do item" className="flex-1 py-1.5 truncate" />
                      {canEdit && <button className="p-1 text-slate-300 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-red-600 shrink-0" title="Excluir item" aria-label="Excluir item" onClick={() => confirm(`Excluir “${item.name}”?`) && onRemoveItem(item.id)}><Trash2 className="w-3.5 h-3.5" /></button>}
                    </div>
                  </td>
                  {board.columns.map(col => (
                    <td key={col.id} className="border-r p-0 align-middle">
                      <Cell col={col} value={item.vals[col.id]} canEdit={canEdit} users={users} onChange={v => onPatch(item.id, { vals: { [col.id]: v } })} />
                    </td>
                  ))}
                  <td />
                </tr>
              ))}
              {canEdit && (
                <tr>
                  <td className={clsx('sticky left-0 z-10 bg-white border-r px-1', 'w-[15rem]')}>
                    <input className="w-full bg-transparent px-1 py-1.5 text-sm outline-none rounded focus:bg-white focus:ring-2 focus:ring-brand-300 placeholder:text-slate-400" placeholder="+ Adicionar item" aria-label={`Novo item em ${group.name}`}
                      value={newName} onChange={e => setNewName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && newName.trim()) { onAddItem(newName.trim()); setNewName('') } }} />
                  </td>
                  <td colSpan={board.columns.length + 1} />
                </tr>
              )}
              {!canEdit && items.length === 0 && <tr><td colSpan={board.columns.length + 2} className="px-3 py-4 text-slate-400 text-center">Sem itens.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function ColumnHeader({ col, first, last, canManage, onRename, onMove, onDelete, onEditStatus }: {
  col: BoardColumn; first: boolean; last: boolean; canManage: boolean
  onRename: (n: string) => void; onMove: (d: -1 | 1) => void; onDelete: () => void; onEditStatus: () => void
}) {
  const [menu, setMenu] = useState(false)
  const [rename, setRename] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const Icon = typeInfo(col.type).icon
  return (
    <th className={'px-2 py-1.5 font-medium border-b border-r'}>
      <div className="flex items-center gap-1">
        <Icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        {rename
          ? <input autoFocus aria-label="Novo nome da coluna" className="input !py-0.5 text-sm flex-1 min-w-0" defaultValue={col.name} maxLength={80}
              onBlur={e => { setRename(false); const t = e.target.value.trim(); if (t && t !== col.name) onRename(t) }}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRename(false) }} />
          : <span className="truncate flex-1" title={col.name}>{col.name}</span>}
        {canManage && !rename && (
          <button ref={btn} className="p-0.5 text-slate-400 hover:text-slate-700 shrink-0" onClick={() => setMenu(m => !m)} aria-label={`Opções da coluna ${col.name}`} data-testid="col-menu"><MoreHorizontal className="w-4 h-4" /></button>
        )}
      </div>
      {menu && (
        <Popover anchor={btn.current} onClose={() => setMenu(false)} width={210}>
          <button role="menuitem" className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center gap-2" onClick={() => { setMenu(false); setRename(true) }}><Pencil className="w-3.5 h-3.5" /> Renomear</button>
          {col.type === 'status' && <button role="menuitem" className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center gap-2" onClick={() => { setMenu(false); onEditStatus() }}><Palette className="w-3.5 h-3.5" /> Editar opções de status</button>}
          {!first && <button role="menuitem" className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center gap-2" onClick={() => { setMenu(false); onMove(-1) }}><ArrowLeftToLine className="w-3.5 h-3.5" /> Mover para a esquerda</button>}
          {!last && <button role="menuitem" className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center gap-2" onClick={() => { setMenu(false); onMove(1) }}><ArrowRightToLine className="w-3.5 h-3.5" /> Mover para a direita</button>}
          <button role="menuitem" className="w-full text-left px-3 py-1.5 text-red-600 hover:bg-red-50 flex items-center gap-2" onClick={() => { setMenu(false); onDelete() }}><Trash2 className="w-3.5 h-3.5" /> Excluir coluna</button>
        </Popover>
      )}
    </th>
  )
}

// ─── Kanban por coluna de status ─────────────────────────────────────────────

function Kanbanboard({ board, col, statusCols, onPickCol, canEdit, visible, users, onMove, onAdd }: {
  board: Board; col: BoardColumn; statusCols: BoardColumn[]; onPickCol: (id: string) => void; canEdit: boolean
  visible: (i: BoardItem) => boolean; users: any[]; onMove: (itemId: string, optId: string | null) => void; onAdd: (optId: string | null, name: string) => void
}) {
  const [over, setOver] = useState<string | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const [name, setName] = useState('')
  const opts = col.settings?.options || []
  const lanes: { id: string | null; label: string; color: string }[] = [...opts.map(o => ({ id: o.id as string | null, label: o.label, color: o.color })), { id: null, label: 'Sem status', color: 'slate' }]
  const others = board.columns.filter(c => c.id !== col.id && (c.type === 'person' || c.type === 'date')).slice(0, 2)
  const drop = (e: React.DragEvent, optId: string | null) => {
    e.preventDefault(); setOver(null)
    const itemId = e.dataTransfer.getData('text/plain')
    const item = board.items.find(i => i.id === itemId)
    if (item && canEdit && (item.vals[col.id] ?? null) !== optId) onMove(itemId, optId)
  }
  return (
    <div>
      {statusCols.length > 1 && (
        <label className="text-sm text-slate-600 mb-2 flex items-center gap-2">Agrupar por
          <select className="input !py-1 w-auto text-sm" value={col.id} onChange={e => onPickCol(e.target.value)}>{statusCols.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </label>
      )}
      <div className="flex gap-3 overflow-x-auto pb-3" data-testid="board-kanban">
        {lanes.map(l => {
          const items = board.items.filter(i => (i.vals[col.id] ?? null) === l.id && visible(i))
          if (l.id === null && items.length === 0) return null
          return (
            <div key={l.id ?? 'none'} data-testid="kanban-lane" data-lane={l.label}
              onDragOver={e => { if (canEdit) { e.preventDefault(); setOver(l.id ?? 'none') } }} onDragLeave={() => setOver(null)} onDrop={e => drop(e, l.id)}
              className={clsx('w-64 min-w-[16rem] rounded-xl bg-slate-100 p-2 shrink-0', over === (l.id ?? 'none') && 'ring-2 ring-brand-400')}>
              <div className={clsx('rounded-md px-2 py-1 text-sm font-medium flex items-center justify-between', colorOf(l.color).solid)}>
                <span className="truncate">{l.label}</span><span className="text-xs opacity-80">{items.length}</span>
              </div>
              <div className="mt-2 space-y-2">
                {items.map(i => (
                  <div key={i.id} data-testid="kanban-card" draggable={canEdit} onDragStart={e => e.dataTransfer.setData('text/plain', i.id)}
                    className={clsx('bg-white rounded-lg border p-2.5 shadow-sm', canEdit && 'cursor-grab active:cursor-grabbing')}>
                    <p className="text-sm font-medium text-slate-900 break-words">{i.name}</p>
                    {others.map(c => {
                      const v = i.vals[c.id]
                      if (!v) return null
                      const text = c.type === 'person' ? users.find(u => u.id === v)?.name : typeof v === 'string' ? new Date(v + 'T12:00:00').toLocaleDateString('pt-BR') : ''
                      return text ? <p key={c.id} className="text-xs text-slate-500 mt-1">{c.name}: {text}</p> : null
                    })}
                  </div>
                ))}
                {canEdit && (adding === (l.id ?? 'none')
                  ? <input autoFocus className="input !py-1 text-sm" placeholder="Nome do item" value={name} onChange={e => setName(e.target.value)}
                      onBlur={() => { setAdding(null); setName('') }}
                      onKeyDown={e => { if (e.key === 'Enter' && name.trim()) { onAdd(l.id, name.trim()); setName(''); setAdding(null) } if (e.key === 'Escape') { setAdding(null); setName('') } }} />
                  : <button className="w-full text-left text-xs text-slate-500 hover:text-brand-600 px-1 py-1" onClick={() => { setAdding(l.id ?? 'none'); setName('') }}>+ Adicionar item</button>)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
