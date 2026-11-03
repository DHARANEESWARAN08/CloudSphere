interface BrandProps { className?: string }

export default function Brand({ className = '' }: BrandProps) {
  return <span className={`cs-brand-lockup ${className}`.trim()}>
    <svg className="cs-brand-mark" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9.25" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7.2 13.8c1.45 2.2 4.54 2.8 6.74 1.35 1.97-1.3 2.5-3.95 1.2-5.92a3.45 3.45 0 0 0-5.74 3.77c.62.94 1.9 1.2 2.84.58" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
    <span className="cs-brand-wordmark">CloudSphere</span>
  </span>;
}
