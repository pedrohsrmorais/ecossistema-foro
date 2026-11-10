interface BrandProps {
  inverse?: boolean
  compact?: boolean
}

export default function Brand({ inverse = false, compact = false }: BrandProps) {
  return (
    <span className={`foro-brand${inverse ? ' foro-brand-inverse' : ''}${compact ? ' foro-brand-compact' : ''}`}>
      <span className="foro-brand-symbol" aria-hidden="true">[FO]</span>
      <span className="foro-brand-wordmark">FORO.OS</span>
    </span>
  )
}
