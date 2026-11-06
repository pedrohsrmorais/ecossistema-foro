import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams, Link } from 'react-router-dom'
import { Loader2, RefreshCw } from 'lucide-react'
import { googleApi } from '../api'

/** Mensagens da volta do Google (?google=…), usadas na Agenda e em Configurações. */
export const GOOGLE_MSG: Record<string, { ok: boolean; text: string }> = {
  ok: { ok: true, text: 'Google Agenda conectado! Estamos importando os seus eventos.' },
  negado: { ok: false, text: 'Você cancelou a autorização no Google. Nada foi conectado.' },
  escopo: { ok: false, text: 'Para sincronizar é preciso marcar a permissão de Agenda na tela do Google. Tente conectar de novo.' },
  estado: { ok: false, text: 'A conexão expirou ou não pôde ser confirmada. Clique em Conectar de novo.' },
  erro: { ok: false, text: 'Não foi possível concluir a conexão com o Google. Tente novamente.' },
}

/** "G" oficial do Google (4 cores), como nos botões de login do Google. */
export function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

/** Botão branco no padrão visual do Google (logo "G", borda cinza, fonte Roboto). */
export function GoogleStyleButton({ children, onClick, disabled, busy, testId }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; busy?: boolean; testId?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled || busy} data-testid={testId}
      style={{ fontFamily: 'Roboto, "Google Sans", Arial, sans-serif' }}
      className="inline-flex items-center gap-2.5 h-10 pl-3 pr-4 rounded-full border border-[#747775] bg-white text-[#1F1F1F] text-sm font-medium
        hover:bg-[#F8FAFF] hover:shadow-[0_1px_2px_rgba(60,64,67,.3),0_1px_3px_1px_rgba(60,64,67,.15)] active:bg-[#EEF2FA]
        focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4285F4] focus-visible:ring-offset-1 disabled:opacity-60 disabled:cursor-default transition-shadow whitespace-nowrap">
      {busy ? <Loader2 className="w-[18px] h-[18px] animate-spin text-[#4285F4]" /> : <GoogleG />}
      <span>{children}</span>
    </button>
  )
}

/**
 * Bloco da Agenda: sem conexão → "Sincronizar com o Google Agenda" (abre a autorização do Google e volta para a Agenda);
 * conectado → status + "Sincronizar agora"; acesso revogado → "Reconectar". Some se a integração não estiver configurada no servidor.
 */
export default function GoogleCalendarSync() {
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const back = params.get('google')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const { data: g } = useQuery({
    queryKey: ['google'], queryFn: googleApi.status, staleTime: 60_000,
    refetchInterval: q => (q.state.data?.connected && !q.state.data.last_sync_at ? 3000 : false),
  })
  useEffect(() => {
    if (back && GOOGLE_MSG[back]) {
      setMsg(GOOGLE_MSG[back]); qc.invalidateQueries({ queryKey: ['google'] }); qc.invalidateQueries({ queryKey: ['events'] })
      const n = new URLSearchParams(params); n.delete('google'); setParams(n, { replace: true })
    }
  }, [back]) // eslint-disable-line react-hooks/exhaustive-deps
  const fail = (e: any) => setMsg({ ok: false, text: e?.response?.data?.error || 'Algo deu errado. Tente novamente.' })
  const connect = useMutation({ mutationFn: () => googleApi.start('agenda'), onSuccess: r => { window.location.href = r.url }, onError: fail })
  const sync = useMutation({
    mutationFn: googleApi.sync,
    onSuccess: r => { setMsg({ ok: true, text: r.skipped ? 'Já existe uma sincronização em andamento.' : `Sincronizado: ${r.imported ?? 0} evento(s) do Google Agenda.` }); qc.invalidateQueries({ queryKey: ['google'] }); qc.invalidateQueries({ queryKey: ['events'] }) },
    onError: e => { fail(e); qc.invalidateQueries({ queryKey: ['google'] }) },
  })

  if (!g?.configured) return null
  const revoked = g.connected && g.status === 'revoked'
  const last = g.last_sync_at ? new Date(g.last_sync_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : null

  return (
    <div className="flex flex-col items-end gap-1" data-testid="google-agenda">
      {!g.connected || revoked ? (
        <GoogleStyleButton onClick={() => { setMsg(null); connect.mutate() }} busy={connect.isPending} testId="agenda-conectar-google">
          {revoked ? 'Reconectar o Google Agenda' : 'Sincronizar com o Google Agenda'}
        </GoogleStyleButton>
      ) : (
        <div className="flex items-center gap-2 h-10 pl-3 pr-1.5 rounded-full border border-[#DADCE0] bg-white text-sm" style={{ fontFamily: 'Roboto, Arial, sans-serif' }} data-testid="google-conectado-agenda">
          <GoogleG />
          <span className="text-[#1F1F1F]" title={g.email || undefined}>Google Agenda sincronizado</span>
          <button type="button" onClick={() => { setMsg(null); sync.mutate() }} disabled={sync.isPending}
            className="ml-1 inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[#1A73E8] hover:bg-[#E8F0FE] text-xs font-medium" data-testid="agenda-sincronizar-agora">
            {sync.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Sincronizar agora
          </button>
        </div>
      )}
      {g.connected && !revoked && <p className="text-[11px] text-slate-400">{g.email}{last ? ` · última sincronização ${last}` : ' · importando…'} · <Link to="/settings" className="underline">gerenciar</Link></p>}
      {revoked && <p className="text-[11px] text-amber-700">O acesso ao Google expirou ou foi revogado.</p>}
      {msg && <p className={`text-xs ${msg.ok ? 'text-emerald-700' : 'text-red-600'}`} role="status" data-testid="google-msg">{msg.text}</p>}
    </div>
  )
}
