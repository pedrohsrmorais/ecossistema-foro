import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Loader2 } from 'lucide-react'
import { eventsApi, leadsApi, casesApi } from '../api'
import { EVENT_TYPES } from '../lib/cases'

/** Modal de novo compromisso (reunião/audiência/perícia) — usado na Agenda, no lead e no processo. */
export default function EventForm({ onClose, leadId, caseId, defaultDate }: { onClose: () => void; leadId?: string; caseId?: string; defaultDate?: string }) {
  const qc = useQueryClient()
  const [f, setF] = useState({
    type: 'reuniao', title: '', date: defaultDate || new Date().toISOString().slice(0, 10), start: '14:00', end: '15:00',
    meeting_url: '', location: '', notes: '', lead_id: leadId || '', case_id: caseId || '',
  })
  const [error, setError] = useState('')
  const set = (k: string, v: string) => setF(x => ({ ...x, [k]: v }))

  const { data: leads } = useQuery({ queryKey: ['leads', 'board'], queryFn: () => leadsApi.list({ limit: 500 }), staleTime: 30_000 })
  const { data: cases } = useQuery({ queryKey: ['cases', 'all'], queryFn: () => casesApi.list(), staleTime: 30_000 })

  const save = useMutation({
    mutationFn: () => eventsApi.create({
      type: f.type as any, title: f.title.trim(),
      starts_at: new Date(`${f.date}T${f.start}`).toISOString(),
      ends_at: f.end ? new Date(`${f.date}T${f.end}`).toISOString() : null,
      meeting_url: f.meeting_url.trim() || null, location: f.location.trim() || null, notes: f.notes.trim() || null,
      lead_id: f.lead_id || null, case_id: f.case_id || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events'] }); qc.invalidateQueries({ queryKey: ['case'] })
      onClose()
    },
    onError: (e: any) => setError(e?.response?.data?.error || 'Não foi possível salvar o compromisso.'),
  })

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="card w-full max-w-lg p-5 animate-scale-in max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-900">Novo compromisso</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <div className="flex gap-2">
            {(Object.keys(EVENT_TYPES) as (keyof typeof EVENT_TYPES)[]).map(t => (
              <button key={t} onClick={() => set('type', t)}
                className={`flex-1 py-1.5 text-sm rounded-lg border font-medium ${f.type === t ? 'bg-brand-50 border-brand-500 text-brand-700' : 'bg-white text-slate-600'}`}>
                {EVENT_TYPES[t].label}
              </button>
            ))}
          </div>
          <input className="input" placeholder="Título (ex: Reunião inicial com Maria)" value={f.title} onChange={e => set('title', e.target.value)} autoFocus />
          <div className="grid grid-cols-3 gap-2">
            <input type="date" className="input" value={f.date} onChange={e => set('date', e.target.value)} />
            <input type="time" className="input" value={f.start} onChange={e => set('start', e.target.value)} />
            <input type="time" className="input" value={f.end} onChange={e => set('end', e.target.value)} />
          </div>
          <input className="input" placeholder="Link da reunião (Meet, Zoom, Teams…)" value={f.meeting_url} onChange={e => set('meeting_url', e.target.value)} />
          <input className="input" placeholder="Local (para presencial ou audiência)" value={f.location} onChange={e => set('location', e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <select className="input" value={f.lead_id} onChange={e => set('lead_id', e.target.value)} disabled={!!leadId}>
              <option value="">Contato (opcional)</option>
              {leads?.data.map(l => <option key={l.id} value={l.id}>{l.name || 'Sem nome'}</option>)}
            </select>
            <select className="input" value={f.case_id} onChange={e => set('case_id', e.target.value)} disabled={!!caseId}>
              <option value="">Processo (opcional)</option>
              {cases?.data.map(c => <option key={c.id} value={c.id}>{c.case_number || c.title}</option>)}
            </select>
          </div>
          <textarea className="input resize-none" rows={2} placeholder="Observações" value={f.notes} onChange={e => set('notes', e.target.value)} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button className="btn-primary" disabled={!f.title.trim() || save.isPending} onClick={() => { setError(''); save.mutate() }}>
              {save.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Agendar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
