import { LoginRequestSchema, type LoginRequest } from '@drlaudo/contract';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, ArrowRight, Clock, KeyRound, LoaderCircle, Mail } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { useLoginMutation } from '../../app/api';
import { safeReturnTo } from '../../app/navigation';
import { useSession } from '../../app/session';
import { AppFooter } from '../../components/layout/AppFooter';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { LoginIllustration } from './LoginIllustration';

interface ShortcutAccount {
  name: string;
  email: string;
  roleDescription: string;
}
const SHORTCUT_ACCOUNTS: readonly ShortcutAccount[] = [
  { name: 'Equipe', email: 'equipe@drlaudo.test', roleDescription: 'Agenda e laudos' },
  { name: 'Ana Souza', email: 'ana.souza@drlaudo.test', roleDescription: 'Paciente' },
  { name: 'Bruno Lima', email: 'bruno.lima@drlaudo.test', roleDescription: 'Paciente' },
] as const;

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigationState: unknown = location.state;
  const returnTo: unknown = searchParams.has('returnTo')
    ? searchParams.getAll('returnTo').length === 1 ? searchParams.get('returnTo') : null
    : navigationState && typeof navigationState === 'object' && 'returnTo' in navigationState
      ? navigationState.returnTo : null;
  const { user, status, notice, login } = useSession();
  const [loginMutation, { isLoading }] = useLoginMutation();

  const [formError, setFormError] = useState<string | null>(null);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);

  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    setFocus,
    formState: { errors },
  } = useForm<LoginRequest>({
    resolver: zodResolver(LoginRequestSchema),
    defaultValues: { email: '', password: '' },
    mode: 'onSubmit',
  });

  // Se já autenticado, direciona para o retorno seguro ou home
  useEffect(() => {
    if (status === 'authenticated' && user) {
      const target = safeReturnTo(returnTo, user.role);
      void navigate(target, { replace: true });
    }
  }, [navigate, returnTo, status, user]);

  // Temporizador para 429 RATE_LIMITED
  useEffect(() => {
    if (retryAfterSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setRetryAfterSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [retryAfterSeconds]);

  const isLocked = isLoading || retryAfterSeconds > 0;

  // Preenchimento de atalhos (apenas preenche os campos, NUNCA executa auto-login)
  const handleShortcut = (email: string) => {
    setValue('email', email, { shouldValidate: true, shouldDirty: true });
    setValue('password', 'Demo@1234', { shouldValidate: true, shouldDirty: true });
    setFormError(null);
    passwordInputRef.current?.focus();
  };

  const onSubmit = async (values: LoginRequest) => {
    if (isLocked) return;
    setFormError(null);
    try {
      const response = await loginMutation(values).unwrap();
      login(response);
      const destination = safeReturnTo(returnTo, response.user.role);
      void navigate(destination, { replace: true });
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'status' in error) {
        const clientError = error as { status: number | string; retryAfter?: number };
        if (clientError.status === 401) {
          setFormError('E-mail ou senha incorretos.');
          setValue('password', '', { shouldDirty: true, shouldValidate: false });
          setError('password', { type: 'manual', message: 'Senha incorreta.' });
          window.setTimeout(() => passwordInputRef.current?.focus(), 0);
          return;
        }
        if (clientError.status === 429) {
          setFormError('Muitas tentativas. Aguarde um minuto.');
          setRetryAfterSeconds(clientError.retryAfter && clientError.retryAfter > 0 ? clientError.retryAfter : 60);
          return;
        }
      }
      setFormError('Algo deu errado. Tente novamente em instantes.');
    }
  };

  const onInvalid = () => {
    if (errors.email) {
      setFocus('email');
    } else if (errors.password) {
      setFocus('password');
    }
  };

  const { ref: registerEmailRef, ...emailField } = register('email');
  const { ref: registerPasswordRef, ...passwordField } = register('password');

  return (
    <div className="flex min-h-dvh flex-col bg-card">
      <main id="conteudo" className="grid min-w-0 flex-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <LoginIllustration />

        <div className="flex min-w-0 items-center justify-center px-6 py-9 sm:px-10 sm:py-12 lg:px-12 xl:px-20">
          <div className="w-full max-w-md">
            <div className="mb-8 space-y-3">
              <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
                Bem-vinda de volta
              </h1>
              <p className="text-base leading-relaxed text-muted-foreground">
                Informe suas credenciais ou selecione um perfil demonstrativo.
              </p>
            </div>

            <div className="space-y-6">
              {notice && !formError && (
                <Alert variant="destructive" role="alert" className="border-destructive/30 bg-destructive-soft">
                  <AlertCircle className="size-4 text-destructive" aria-hidden="true" />
                  <AlertTitle className="text-destructive font-semibold">Sessão</AlertTitle>
                  <AlertDescription className="text-destructive text-sm leading-relaxed">
                    {notice}
                  </AlertDescription>
                </Alert>
              )}

              {formError && (
                <Alert variant="destructive" role="alert" className="border-destructive/30 bg-destructive-soft">
                  <AlertCircle className="size-4 text-destructive" aria-hidden="true" />
                  <AlertTitle className="text-destructive font-semibold">Atenção</AlertTitle>
                  <AlertDescription id="login-form-error" className="text-destructive text-sm leading-relaxed">
                    {formError}
                  </AlertDescription>
                </Alert>
              )}

              <form onSubmit={handleSubmit(onSubmit, onInvalid)} noValidate className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="login-email" className="text-sm font-semibold text-foreground">
                    E-mail
                  </Label>
                  <div className="relative">
                    <Input
                      id="login-email"
                      type="email"
                      autoComplete="email"
                      disabled={isLocked}
                      aria-invalid={Boolean(errors.email)}
                      aria-describedby={errors.email ? 'email-error' : undefined}
                      className="pr-12 md:text-base"
                      {...emailField}
                      ref={(element) => {
                        registerEmailRef(element);
                        emailInputRef.current = element;
                      }}
                    />
                    <Mail className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  </div>
                  {errors.email && (
                    <p id="email-error" role="alert" className="text-sm font-medium text-destructive">
                      Informe um e-mail válido.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="login-password" className="text-sm font-semibold text-foreground">
                    Senha
                  </Label>
                  <div className="relative">
                    <Input
                      id="login-password"
                      type="password"
                      autoComplete="current-password"
                      disabled={isLocked}
                      aria-invalid={Boolean(errors.password)}
                      aria-describedby={
                        errors.password
                          ? 'password-error'
                          : formError
                            ? 'login-form-error'
                            : undefined
                      }
                      className="pr-12 md:text-base"
                      {...passwordField}
                      ref={(element) => {
                        registerPasswordRef(element);
                        passwordInputRef.current = element;
                      }}
                    />
                    <KeyRound className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  </div>
                  {errors.password && (
                    <p id="password-error" role="alert" className="text-sm font-medium text-destructive">
                      A senha é obrigatória.
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  disabled={isLocked}
                  className="w-full font-semibold"
                  size="lg"
                >
                  {isLoading ? (
                    <>
                      <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                      <span>Entrando…</span>
                    </>
                  ) : retryAfterSeconds > 0 ? (
                    <>
                      <Clock className="size-4" aria-hidden="true" />
                      <span>Aguarde {retryAfterSeconds} s</span>
                    </>
                  ) : (
                    <>
                      <span>Entrar</span>
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </>
                  )}
                </Button>
              </form>
            </div>

            <section aria-labelledby="demo-shortcuts-title" className="mt-10 border-t border-border pt-6">
              <div className="mb-4 space-y-1">
                <h2 id="demo-shortcuts-title" className="text-base font-semibold text-foreground">
                  Atalhos para demonstração
                </h2>
                <p className="text-sm text-muted-foreground">Preenche formulário</p>
              </div>

              <div className="divide-y divide-border">
                {SHORTCUT_ACCOUNTS.map((account) => (
                  <Button
                    key={account.name}
                    type="button"
                    variant="ghost"
                    disabled={isLocked}
                    onClick={() => handleShortcut(account.email)}
                    className="group h-auto min-h-16 w-full justify-between gap-4 rounded-none px-1 py-3 text-left hover:bg-accent/50 focus-visible:rounded-md"
                  >
                    <span className="min-w-0">
                      <span className="block text-base font-semibold text-foreground">{account.name}</span>
                      <span className="mt-0.5 block text-sm font-normal text-muted-foreground">{account.roleDescription}</span>
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
                  </Button>
                ))}
              </div>
            </section>
          </div>
        </div>
      </main>
      <AppFooter />
    </div>
  );
}
