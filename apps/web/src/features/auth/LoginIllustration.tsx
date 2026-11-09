import { Logo } from '../../components/brand/Logo';

export function LoginIllustration() {
  return (
    <div className="flex min-w-0 flex-col justify-between bg-brand-900 px-6 py-6 text-primary-foreground sm:px-10 sm:py-8 lg:px-12 lg:py-12 xl:px-16">
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
        <Logo variant="full" tone="mono-light" />
        <span className="text-sm font-medium text-brand-100">Ambiente Demo</span>
      </div>

      <div className="mt-8 max-w-md lg:my-20">
        <h2 className="font-display text-2xl leading-snug font-semibold tracking-tight lg:text-4xl lg:leading-tight xl:text-[2.75rem]">
          Do agendamento ao laudo,{' '}
          <span className="text-brand-200">sem complicação.</span>
        </h2>
        <p className="mt-6 hidden max-w-sm text-base leading-relaxed text-brand-100 lg:block">
          Agendamentos e laudos para a equipe médica. Exames e resultados publicados para pacientes.
        </p>
      </div>

      <div className="hidden border-t border-brand-700 pt-6 text-sm leading-relaxed text-brand-100 lg:block">
        <p className="font-medium text-primary-foreground">Tecnologia em Saúde</p>
        <div className="mt-3 flex flex-col gap-1">
          <span>Horário oficial de Brasília</span>
          <span>Acesso com credencial demo</span>
        </div>
      </div>
    </div>
  );
}
