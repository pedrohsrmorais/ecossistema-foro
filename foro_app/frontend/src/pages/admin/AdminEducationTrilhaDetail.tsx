import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi, type AdminAula } from '../../api'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'

type VideoProvider = 'vimeo' | 'youtube' | 'url'
const emptyAulaForm: { title: string; video_provider: VideoProvider; video_id: string; description: string } = {
  title: '', video_provider: 'vimeo', video_id: '', description: '',
}

export default function AdminEducationTrilhaDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: trilha, isLoading } = useQuery({ queryKey: ['admin-trilha', id], queryFn: () => adminApi.getTrilha(id!), enabled: !!id })

  const [form, setForm] = useState({ title: '', description: '', published: false })
  const [loadedForm, setLoadedForm] = useState(false)
  if (trilha && !loadedForm) {
    setForm({ title: trilha.title, description: trilha.description || '', published: trilha.published })
    setLoadedForm(true)
  }

  const [showAulaForm, setShowAulaForm] = useState(false)
  const [aulaForm, setAulaForm] = useState(emptyAulaForm)

  const updateTrilhaMutation = useMutation({
    mutationFn: () => adminApi.updateTrilha(id!, form),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-trilha', id] }),
  })

  const deleteTrilhaMutation = useMutation({
    mutationFn: () => adminApi.deleteTrilha(id!),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-trilhas'] }); navigate('/admin/education') },
  })

  const createAulaMutation = useMutation({
    mutationFn: () => adminApi.createAula(id!, aulaForm),
    onSuccess: () => {
      setAulaForm(emptyAulaForm); setShowAulaForm(false)
      queryClient.invalidateQueries({ queryKey: ['admin-trilha', id] })
    },
  })

  const toggleAulaPublishedMutation = useMutation({
    mutationFn: ({ aulaId, published }: { aulaId: string; published: boolean }) => adminApi.updateAula(aulaId, { published }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-trilha', id] }),
  })

  const deleteAulaMutation = useMutation({
    mutationFn: (aulaId: string) => adminApi.deleteAula(aulaId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-trilha', id] }),
  })

  if (isLoading || !trilha) return <div className="p-6 text-sm text-slate-400">Carregando...</div>

  return (
    <div className="p-6 max-w-3xl">
      <Link to="/admin/education" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 mb-4">
        <ArrowLeft className="w-4 h-4" /> Trilhas
      </Link>

      {/* Dados da trilha */}
      <div className="card p-5 mb-6">
        <h2 className="font-medium text-slate-900 mb-3">Dados da trilha</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-slate-600 mb-1">Título</label>
            <input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Descrição</label>
            <textarea className="input" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.published} onChange={e => setForm(f => ({ ...f, published: e.target.checked }))} className="w-4 h-4 accent-brand-700" />
            Publicada (visível para os tenants com o módulo ativo)
          </label>
          <div className="flex items-center justify-between pt-1">
            <button onClick={() => updateTrilhaMutation.mutate()} className="btn-primary" disabled={updateTrilhaMutation.isPending}>
              {updateTrilhaMutation.isPending ? 'Salvando...' : 'Salvar alterações'}
            </button>
            <button
              onClick={() => { if (confirm('Excluir esta trilha e todas as aulas dela?')) deleteTrilhaMutation.mutate() }}
              className="text-sm text-red-600 hover:underline"
            >
              Excluir trilha
            </button>
          </div>
        </div>
      </div>

      {/* Aulas */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium text-slate-900">Aulas ({trilha.aulas.length})</h2>
          <button onClick={() => setShowAulaForm(v => !v)} className="btn-secondary">
            <Plus className="w-4 h-4" /> Nova aula
          </button>
        </div>

        {showAulaForm && (
          <form
            onSubmit={e => { e.preventDefault(); if (aulaForm.title.trim() && aulaForm.video_id.trim()) createAulaMutation.mutate() }}
            className="border rounded-lg p-3 mb-4 space-y-2"
          >
            <input className="input" placeholder="Título da aula" value={aulaForm.title} onChange={e => setAulaForm(f => ({ ...f, title: e.target.value }))} />
            <textarea className="input" rows={2} placeholder="Descrição (opcional)" value={aulaForm.description} onChange={e => setAulaForm(f => ({ ...f, description: e.target.value }))} />
            <div className="flex gap-2">
              <select className="input w-40" value={aulaForm.video_provider} onChange={e => setAulaForm(f => ({ ...f, video_provider: e.target.value as VideoProvider }))}>
                <option value="vimeo">Vimeo</option>
                <option value="youtube">YouTube</option>
                <option value="url">URL direta</option>
              </select>
              <input
                className="input flex-1"
                placeholder={aulaForm.video_provider === 'url' ? 'URL completa do vídeo' : 'ID do vídeo (ex: 824804225)'}
                value={aulaForm.video_id}
                onChange={e => setAulaForm(f => ({ ...f, video_id: e.target.value }))}
              />
            </div>
            <button type="submit" className="btn-primary" disabled={createAulaMutation.isPending}>
              {createAulaMutation.isPending ? 'Adicionando...' : 'Adicionar aula'}
            </button>
          </form>
        )}

        <div className="divide-y">
          {trilha.aulas.map((a: AdminAula) => (
            <div key={a.id} className="flex items-center justify-between py-2.5">
              <div>
                <p className="text-sm text-slate-900">{a.title}</p>
                <p className="text-xs text-slate-500">{a.video_provider} · {a.video_id}</p>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-slate-500">
                  <input
                    type="checkbox" checked={a.published}
                    onChange={e => toggleAulaPublishedMutation.mutate({ aulaId: a.id, published: e.target.checked })}
                    className="w-3.5 h-3.5 accent-brand-700"
                  />
                  publicada
                </label>
                <button onClick={() => { if (confirm('Excluir esta aula?')) deleteAulaMutation.mutate(a.id) }} className="text-slate-400 hover:text-red-600">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          {trilha.aulas.length === 0 && <p className="py-6 text-center text-sm text-slate-400">Nenhuma aula ainda.</p>}
        </div>
      </div>
    </div>
  )
}
