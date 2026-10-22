import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi, type AdminChallenge } from '../../api'
import { Plus, Trophy, Trash2 } from 'lucide-react'

const emptyForm = { title: '', description: '', attachment_url: '', points_awarded: 10, starts_at: '', ends_at: '', published: false }

export default function AdminChallenges() {
  const qc = useQueryClient()
  const { data: challenges = [], isLoading } = useQuery({ queryKey: ['admin-challenges'], queryFn: adminApi.listChallenges })

  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: () => adminApi.createChallenge({ ...form, attachment_url: form.attachment_url || undefined }),
    onSuccess: () => { setError(null); setForm(emptyForm); setCreating(false); qc.invalidateQueries({ queryKey: ['admin-challenges'] }) },
    onError: (err: any) => setError(err?.response?.data?.error || 'Erro ao criar o desafio.'),
  })

  const togglePublishedMutation = useMutation({
    mutationFn: ({ id, published }: { id: string; published: boolean }) => adminApi.updateChallenge(id, { published }),
    onSuccess: () => { setError(null); qc.invalidateQueries({ queryKey: ['admin-challenges'] }) },
    onError: (err: any) => setError(err?.response?.data?.error || 'Erro ao atualizar o desafio.'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteChallenge(id),
    onSuccess: () => { setError(null); qc.invalidateQueries({ queryKey: ['admin-challenges'] }) },
    onError: (err: any) => setError(err?.response?.data?.error || 'Erro ao excluir o desafio.'),
  })

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold text-slate-900">Desafios semanais</h1>
        <button onClick={() => setCreating(v => !v)} className="btn-secondary">
          <Plus className="w-4 h-4" /> Novo desafio
        </button>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        Visível para todo tenant com o módulo "Desafios semanais" ativo. Conclusão é auto-declarada pelo usuário.
      </p>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {creating && (
        <form
          onSubmit={e => { e.preventDefault(); if (form.title.trim() && form.description.trim() && form.starts_at && form.ends_at) createMutation.mutate() }}
          className="card p-4 mb-6 space-y-2"
        >
          <input className="input" placeholder="Título" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          <textarea className="input" rows={2} placeholder="Descrição" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          <input className="input" placeholder="Link de material (opcional, ex: PDF)" value={form.attachment_url} onChange={e => setForm(f => ({ ...f, attachment_url: e.target.value }))} />
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs text-slate-500 mb-1">Início</label>
              <input type="date" className="input" value={form.starts_at} onChange={e => setForm(f => ({ ...f, starts_at: e.target.value }))} />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-slate-500 mb-1">Fim</label>
              <input type="date" className="input" value={form.ends_at} onChange={e => setForm(f => ({ ...f, ends_at: e.target.value }))} />
            </div>
            <div className="w-28">
              <label className="block text-xs text-slate-500 mb-1">Pontos</label>
              <input type="number" min={1} className="input" value={form.points_awarded} onChange={e => setForm(f => ({ ...f, points_awarded: Number(e.target.value) }))} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.published} onChange={e => setForm(f => ({ ...f, published: e.target.checked }))} className="w-4 h-4 accent-brand-700" />
            Publicar imediatamente
          </label>
          <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Criando...' : 'Criar desafio'}
          </button>
        </form>
      )}

      {isLoading ? (
        <p className="text-sm text-slate-400">Carregando...</p>
      ) : (
        <div className="card divide-y">
          {challenges.map((c: AdminChallenge) => (
            <div key={c.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="flex items-start gap-3 min-w-0">
                <Trophy className="w-4 h-4 text-accent-500 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{c.title}</p>
                  <p className="text-xs text-slate-500">
                    {c.starts_at} – {c.ends_at} · {c.points_awarded} pts · {c.total_conclusoes} conclusões
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <label className="flex items-center gap-1.5 text-xs text-slate-500">
                  <input
                    type="checkbox" checked={c.published}
                    onChange={e => togglePublishedMutation.mutate({ id: c.id, published: e.target.checked })}
                    className="w-3.5 h-3.5 accent-brand-700"
                  />
                  publicado
                </label>
                <button onClick={() => { if (confirm('Excluir este desafio?')) deleteMutation.mutate(c.id) }} className="text-slate-400 hover:text-red-600">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          {challenges.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-400">Nenhum desafio criado ainda.</p>}
        </div>
      )}
    </div>
  )
}
