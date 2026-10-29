import { useState, useRef, useEffect, FormEvent } from 'react'
import { Send, Plus, Bot, User, CheckCircle2, Search, AlertTriangle, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { useChat } from '../context/ChatContext'
import CreditMeter from './CreditMeter'

const SUGGESTIONS = [
  'Cadastra um lead: Maria Souza, trabalhista, 51 99999-1234',
  'Agenda reunião com a Maria amanhã às 15h',
  'Cadastra o processo 0001234-08.2023.8.26.0100 da Maria',
  'Quais leads estão na etapa proposta?',
  'Mostra o resumo do funil',
  'Quais prazos vencem esta semana?',
]

export default function ChatPanel({ compact = false }: { compact?: boolean }) {
  const { messages, loading, send, reset } = useChat()
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  function submit(e?: FormEvent) {
    e?.preventDefault()
    const t = input.trim()
    if (!t || loading) return
    setInput('')
    void send(t)
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <div className={clsx('flex items-center justify-between gap-3 px-4 py-3 border-b', compact && 'pr-12')}>
        <div className="min-w-0">
          <h2 className="font-semibold text-slate-900 text-sm flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-accent-500" /> Assistente IA
          </h2>
          <p className="text-xs text-slate-500 truncate">Opera o CRM em linguagem natural</p>
        </div>
        <button onClick={reset} className="btn-secondary text-xs !px-2.5 !py-1.5"><Plus className="w-3.5 h-3.5" /> Nova</button>
      </div>

      <div className="px-4 pt-3"><CreditMeter variant="light" /></div>

      <div className={clsx('flex-1 overflow-y-auto space-y-4', compact ? 'p-3' : 'p-4')}>
        {messages.length === 0 && (
          <div className="flex flex-col items-center text-center gap-3 py-8">
            <div className="w-11 h-11 rounded-full bg-brand-100 flex items-center justify-center"><Bot className="w-5 h-5 text-brand-600" /></div>
            <div>
              <p className="font-medium text-slate-900 text-sm mb-1">Como posso ajudar?</p>
              <p className="text-xs text-slate-500">Crio leads, movo etapas, anoto, agendo tarefas e busco informações.</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => send(s)} disabled={loading}
                  className="text-xs px-2.5 py-1.5 rounded-full border bg-white text-slate-600 hover:bg-brand-50 hover:border-brand-300 transition-colors text-left">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={clsx('flex gap-2.5', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
            <div className={clsx('w-7 h-7 rounded-full flex items-center justify-center shrink-0',
              msg.role === 'user' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600')}>
              {msg.role === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
            </div>
            <div className={clsx('max-w-[85%] space-y-1.5')}>
              <div className={clsx('px-3.5 py-2 rounded-2xl text-sm leading-relaxed',
                msg.role === 'user' ? 'bg-brand-600 text-white rounded-tr-sm'
                  : msg.error ? 'bg-red-50 border border-red-200 text-red-800 rounded-tl-sm'
                  : 'bg-white border text-slate-800 rounded-tl-sm')}>
                {msg.pending ? (
                  <span className="flex gap-1 py-1">
                    {[0, 150, 300].map(d => (
                      <span key={d} className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                    ))}
                  </span>
                ) : (
                  <p className="whitespace-pre-wrap">
                    {msg.error && <AlertTriangle className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />}
                    {msg.content}
                  </p>
                )}
              </div>
              {msg.actions?.map((a, i) => (
                <div key={i} className={clsx('flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border w-fit max-w-full',
                  !a.ok ? 'bg-red-50 border-red-200 text-red-700'
                    : a.write ? 'bg-green-50 border-green-200 text-green-700' : 'bg-slate-50 text-slate-600')}>
                  {a.write ? <CheckCircle2 className="w-3 h-3 shrink-0" /> : <Search className="w-3 h-3 shrink-0" />}
                  <span className="truncate">{a.summary}</span>
                  {a.ok && (a.case_id
                    ? <Link to={`/processos/${a.case_id}`} className="underline shrink-0">abrir</Link>
                    : a.lead_id && <Link to={`/leads/${a.lead_id}`} className="underline shrink-0">abrir</Link>)}
                </div>
              ))}
              {msg.creditsUsed !== undefined && (
                <p className="text-[11px] text-slate-400">{msg.creditsUsed.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} crédito(s) nesta resposta</p>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="px-3 pb-3 pt-2 border-t bg-slate-50">
        <form onSubmit={submit} className="flex gap-2 items-end bg-white border rounded-xl p-2 shadow-sm">
          <textarea
            rows={1}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
            placeholder="Fale com a IA… (Enter envia)"
            className="flex-1 resize-none text-sm outline-none px-2 py-1.5 max-h-32 leading-relaxed"
            disabled={loading}
          />
          <button type="submit" disabled={loading || !input.trim()}
            className="w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center hover:bg-brand-700 disabled:opacity-40 shrink-0 transition-colors">
            <Send className="w-4 h-4" />
          </button>
        </form>
        <p className="text-[11px] text-slate-400 text-center mt-1.5">A IA pode cometer erros. Confira ações importantes.</p>
      </div>
    </div>
  )
}
