import CreateOffice from './CreateOffice'

/** Fundo falso desfocado: evita chamar a API do CRM (que responde OFFICE_REQUIRED) por trás do overlay. */
export default function OfficeGate() {
  return (
    <div className="relative min-h-full" data-testid="office-gate">
      <div className="p-6 blur-[5px] opacity-50 select-none pointer-events-none" aria-hidden>
        <div className="h-6 w-48 rounded bg-slate-300 mb-6" />
        <div className="grid grid-cols-4 gap-4 mb-6">{[0, 1, 2, 3].map(i => <div key={i} className="h-24 rounded-xl bg-slate-200" />)}</div>
        {[0, 1, 2, 3, 4].map(i => <div key={i} className="h-12 rounded-lg bg-slate-200 mb-3" />)}
      </div>
      <div className="absolute inset-0 flex items-start justify-center px-4 pt-16 bg-white/30 backdrop-blur-[2px]">
        <CreateOffice />
      </div>
    </div>
  )
}
