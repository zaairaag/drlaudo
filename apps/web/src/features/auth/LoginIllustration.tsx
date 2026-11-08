export function LoginIllustration() {
  return (
    <div className="relative flex h-full flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br from-brand-50 via-card to-highlight-soft/30 p-8 sm:p-12">
      <div className="relative z-10 max-w-sm">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-highlight-soft px-3 py-1 text-xs font-semibold text-highlight-strong">
          Tecnologia em Saúde
        </span>
        <h2 className="mt-4 font-display text-2xl font-bold tracking-tight text-brand-900 sm:text-3xl">
          Do agendamento ao laudo, sem complicação.
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Acesso seguro para a equipe médica e pacientes com emissão pontual de resultados e acompanhamento contínuo.
        </p>
      </div>

      <div className="relative my-8 flex items-center justify-center" aria-hidden="true">
        <svg
          viewBox="0 0 320 220"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full max-w-xs drop-shadow-sm"
        >
          {/* Card de fundo: Calendário */}
          <rect x="20" y="30" width="180" height="130" rx="12" className="fill-card stroke-border" strokeWidth="1.5" />
          <rect x="20" y="30" width="180" height="32" rx="12" className="fill-brand-100" />
          <circle cx="42" cy="46" r="3.5" className="fill-brand-400" />
          <circle cx="56" cy="46" r="3.5" className="fill-brand-400" />
          <circle cx="70" cy="46" r="3.5" className="fill-brand-400" />
          <rect x="36" y="78" width="36" height="18" rx="4" className="fill-brand-50 stroke-brand-200" strokeWidth="1" />
          <rect x="80" y="78" width="36" height="18" rx="4" className="fill-primary" />
          <rect x="124" y="78" width="36" height="18" rx="4" className="fill-muted/60" />
          <rect x="36" y="104" width="36" height="18" rx="4" className="fill-brand-50 stroke-brand-200" strokeWidth="1" />
          <rect x="80" y="104" width="36" height="18" rx="4" className="fill-brand-50 stroke-brand-200" strokeWidth="1" />
          <rect x="124" y="104" width="36" height="18" rx="4" className="fill-brand-50 stroke-brand-200" strokeWidth="1" />

          {/* Card sobreposto: Laudo com check teal */}
          <g transform="translate(110, 65)">
            <rect width="180" height="140" rx="12" className="fill-card stroke-highlight/40" strokeWidth="1.5" />
            <rect x="18" y="22" width="70" height="10" rx="3" className="fill-brand-800" />
            <rect x="18" y="40" width="140" height="6" rx="2" className="fill-muted" />
            <rect x="18" y="52" width="125" height="6" rx="2" className="fill-muted" />
            <rect x="18" y="64" width="135" height="6" rx="2" className="fill-muted" />
            <rect x="18" y="76" width="90" height="6" rx="2" className="fill-muted" />

            <rect x="18" y="98" width="144" height="26" rx="6" className="fill-highlight-soft stroke-highlight/30" strokeWidth="1" />
            <path
              d="M32 111L36.5 115.5L45 106.5"
              className="stroke-highlight-strong"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <rect x="52" y="108" width="75" height="7" rx="2" className="fill-highlight-strong" />
          </g>
        </svg>
      </div>

      <div className="relative z-10 flex items-center justify-between border-t border-border/80 pt-4 text-xs text-muted-foreground">
        <span>Horário oficial de Brasília</span>
        <span>Acesso com credencial demo</span>
      </div>
    </div>
  );
}
