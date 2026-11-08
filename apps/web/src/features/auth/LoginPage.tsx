import { LoginRequestSchema, type LoginRequest } from '@drlaudo/contract';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, ArrowRight, Clock, KeyRound, LoaderCircle, Mail } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router';
import { useLoginMutation } from '../../app/api';
import { safeReturnTo } from '../../app/navigation';
import { useSession } from '../../app/session';
import { Logo } from '../../components/brand/Logo';
import { AppFooter } from '../../components/layout/AppFooter';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '../../components/ui/card';
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
      const target = safeReturnTo(searchParams.get('returnTo'), user.role);
      void navigate(target, { replace: true });
    }
  }, [navigate, searchParams, status, user]);

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
      const destination = safeReturnTo(searchParams.get('returnTo'), response.user.role);
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
    <div className="flex min-h-dvh flex-col bg-background">
      <main id="conteudo" className="flex flex-1 items-center justify-center p-4 sm:p-6 lg:p-10">
        <div className="grid w-full max-w-5xl gap-8 lg:grid-cols-12 lg:items-center">
          {/* Coluna esquerda com ilustração editorial (apenas desktop) */}
          <div className="hidden h-full lg:col-span-6 lg:block">
            <LoginIllustration />
          </div>

          {/* Coluna direita: Formulário */}
          <div className="w-full lg:col-span-6">
            <Card className="border-border bg-card shadow-sm">
              <CardHeader className="space-y-3 pb-6">
                <div className="flex items-center justify-between">
                  <Logo variant="full" />
                  <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground">
                    Ambiente Demo
                  </span>
                </div>
                <div>
                  <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                    Bem-vinda de volta
                  </h1>
                  <CardDescription className="mt-1.5 text-sm text-muted-foreground">
                    Informe suas credenciais ou selecione um perfil demonstrativo.
                  </CardDescription>
                </div>
              </CardHeader>

              <CardContent className="space-y-6">
                {/* Aviso persistente de expiração de sessão ou erro geral */}
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

                <form onSubmit={handleSubmit(onSubmit, onInvalid)} noValidate className="space-y-4">
                  {/* Campo E-mail */}
                  <div className="space-y-1.5">
                    <Label htmlFor="login-email" className="text-sm font-medium text-foreground">
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
                        className="pr-10"
                        {...emailField}
                        ref={(element) => {
                          registerEmailRef(element);
                          emailInputRef.current = element;
                        }}
                      />
                      <Mail className="pointer-events-none absolute right-3 top-3 size-4 text-muted-foreground" aria-hidden="true" />
                    </div>
                    {errors.email && (
                      <p id="email-error" role="alert" className="text-xs font-medium text-destructive">
                        Informe um e-mail válido.
                      </p>
                    )}
                  </div>

                  {/* Campo Senha */}
                  <div className="space-y-1.5">
                    <Label htmlFor="login-password" className="text-sm font-medium text-foreground">
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
                        className="pr-10"
                        {...passwordField}
                        ref={(element) => {
                          registerPasswordRef(element);
                          passwordInputRef.current = element;
                        }}
                      />
                      <KeyRound className="pointer-events-none absolute right-3 top-3 size-4 text-muted-foreground" aria-hidden="true" />
                    </div>
                    {errors.password && (
                      <p id="password-error" role="alert" className="text-xs font-medium text-destructive">
                        A senha é obrigatória.
                      </p>
                    )}
                  </div>

                  {/* Botão Entrar */}
                  <Button
                    type="submit"
                    disabled={isLocked}
                    className="w-full font-semibold shadow-xs"
                    size="lg"
                  >
                    {isLoading ? (
                      <>
                        <LoaderCircle className="mr-2 size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                        <span>Entrando…</span>
                      </>
                    ) : retryAfterSeconds > 0 ? (
                      <>
                        <Clock className="mr-2 size-4" aria-hidden="true" />
                        <span>Aguarde {retryAfterSeconds} s</span>
                      </>
                    ) : (
                      <>
                        <span>Entrar</span>
                        <ArrowRight className="ml-2 size-4" aria-hidden="true" />
                      </>
                    )}
                  </Button>
                </form>

                {/* Seção de perfis rápidos (atalhos apenas preenchem) */}
                <div className="border-t border-border pt-5">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
                      Atalhos para demonstração
                    </span>
                    <span className="text-xs text-muted-foreground">Preenche formulário</span>
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {SHORTCUT_ACCOUNTS.map((account) => (
                      <Button
                        key={account.name}
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isLocked}
                        onClick={() => handleShortcut(account.email)}
                        className="flex h-auto flex-col items-start px-3 py-2 text-left"
                      >
                        <span className="font-semibold text-foreground">{account.name}</span>
                        <span className="text-[11px] text-muted-foreground">{account.roleDescription}</span>
                      </Button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
      <AppFooter />
    </div>
  );
}
