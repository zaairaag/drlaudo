# Design System — Dr. Laudo

**Referências:** [enunciado original](../teste-agendamento-exames-laudos.pdf) · [PRD — requisitos e regras de negócio](PRD.md) · [RULES — regras de implementação](RULES.md).

## 1. Marca

- **Nome:** Dr. Laudo  ·  **Slogan:** "Do agendamento ao laudo, sem complicação."
- **Atributos:** confiável, claro, calmo, humano. **Evitar:** frio, burocrático, alarmista.
- Projeto fictício. Nenhum logo, cor ou nome de empresa real.

### Princípios
1. **Clareza clínica:** informação crítica (data, status, exame) legível em 2 segundos.
2. **Estado nunca só por cor** (WCAG 1.4.1): sempre ícone + texto.
3. **Confiança:** ações irreversíveis sempre pedem confirmação explícita.
4. **Tempo sem ambiguidade:** sempre em horário de Brasília, com a indicação.

## 2. Logo

O símbolo junta um "D" e uma folha de laudo: dobra no canto, uma linha de texto e um check teal (laudo publicado).

`apps/web/src/assets/brand/logo-mark.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" role="img" aria-label="Dr. Laudo">
  <rect width="48" height="48" rx="12" fill="var(--logo-bg, #1e4f8f)"/>
  <path d="M20 11h5a13 13 0 0 1 0 26H14V17z" fill="#fff"/>
  <path d="M14 17h6v-6z" fill="var(--logo-fold, #b9d0ee)"/>
  <rect x="19" y="19" width="10" height="2.5" rx="1.25" fill="var(--logo-fold, #b9d0ee)"/>
  <path d="M19 28.5l3.5 3.5L30 24.5" fill="none" stroke="var(--logo-check, #12907f)"
        stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

**Wordmark:** "Dr." em Plus Jakarta Sans Medium com 60% de opacidade + "Laudo" em Bold.

`apps/web/src/components/brand/Logo.tsx`
```tsx
import LogoMarkSvg from '@/assets/brand/logo-mark.svg?react';
import { cn } from '@/lib/utils';

type Props = { variant?: 'full' | 'mark'; tone?: 'color' | 'mono-light'; className?: string };

export function Logo({ variant = 'full', tone = 'color', className }: Props) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-display', className)}>
      <LogoMarkSvg className="size-8 shrink-0" aria-hidden={variant === 'full'} />
      {variant === 'full' && (
        <span className={cn('text-lg tracking-tight', tone === 'mono-light' ? 'text-white' : 'text-foreground')}>
          <span className="font-medium opacity-60">Dr.</span> <span className="font-bold">Laudo</span>
        </span>
      )}
    </span>
  );
}
```
(Requer `vite-plugin-svgr`, registrado em DECISIONS.)

**Regras:** área de respiro = metade do símbolo; mínimo de 16 px (só o símbolo) e de 96 px (logo completo). Proibido esticar, girar, trocar cores, aplicar sombra ou usar sobre foto.
**Derivados:** `public/favicon.svg` (cores fixas; se o check sumir em 16 px, use `stroke-width="3.5"`), `apple-touch-icon.png` (180 px), `og-image.png` (1200×630), `docs/assets/banner.png`.

## 3. Cores

**Teoria:** esquema **análogo** azul (≈256°) + teal (≈190°). O azul transmite confiança e o teal transmite saúde e resultado positivo. O laranja (complementar) foi evitado porque se confunde com alerta. As cores semânticas ficam afastadas no círculo cromático (verde 150°, âmbar 70°, vermelho 27°) para não competir com a marca. Proporção **60-30-10**: neutros, azul e teal.

`apps/web/src/styles/globals.css`
```css
@import "tailwindcss";
@import "tw-animate-css";

:root {
  /* Marca — azul diagnóstico */
  --brand-50:  oklch(0.97 0.015 250);
  --brand-100: oklch(0.93 0.035 252);
  --brand-200: oklch(0.87 0.06 254);
  --brand-300: oklch(0.78 0.09 255);
  --brand-400: oklch(0.67 0.12 256);
  --brand-500: oklch(0.57 0.14 257);
  --brand-600: oklch(0.50 0.14 258);
  --brand-700: oklch(0.43 0.13 259);
  --brand-800: oklch(0.37 0.11 260);
  --brand-900: oklch(0.30 0.08 260);

  /* Destaque — teal (resultado/publicado) */
  --highlight:        oklch(0.58 0.10 190); /* ícones e áreas grandes */
  --highlight-strong: oklch(0.47 0.09 192); /* texto */
  --highlight-soft:   oklch(0.95 0.03 190); /* fundos */

  /* Neutros tingidos de azul */
  --background: oklch(0.99 0.003 250);
  --foreground: oklch(0.22 0.02 255);
  --card: oklch(1 0 0);
  --card-foreground: var(--foreground);
  --popover: oklch(1 0 0);
  --popover-foreground: var(--foreground);
  --muted: oklch(0.96 0.008 250);
  --muted-foreground: oklch(0.48 0.02 255);
  --border: oklch(0.91 0.01 250);
  --input: oklch(0.91 0.01 250);
  --ring: var(--brand-500);

  /* Tokens shadcn */
  --primary: var(--brand-700);
  --primary-foreground: oklch(0.99 0 0);
  --secondary: var(--brand-50);
  --secondary-foreground: var(--brand-800);
  --accent: var(--brand-50);           /* hover de menu, NÃO é cor de marca */
  --accent-foreground: var(--brand-800);

  /* Semânticas */
  --success: oklch(0.55 0.13 150);
  --success-soft: oklch(0.95 0.04 150);
  --warning: oklch(0.52 0.12 65);      /* texto âmbar legível */
  --warning-soft: oklch(0.96 0.05 80);
  --destructive: oklch(0.55 0.21 27);
  --destructive-soft: oklch(0.96 0.03 27);
  --info: var(--brand-600);

  --radius: 0.625rem;
  --logo-bg: #1e4f8f; --logo-fold: #b9d0ee; --logo-check: #12907f;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-highlight: var(--highlight);
  --color-highlight-strong: var(--highlight-strong);
  --color-highlight-soft: var(--highlight-soft);
  --color-success: var(--success);
  --color-success-soft: var(--success-soft);
  --color-warning: var(--warning);
  --color-warning-soft: var(--warning-soft);
  --color-destructive: var(--destructive);
  --color-destructive-soft: var(--destructive-soft);
  --color-info: var(--info);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --font-sans: "Inter Variable", ui-sans-serif, system-ui, sans-serif;
  --font-display: "Plus Jakarta Sans Variable", var(--font-sans);
}
```

**Contraste estimado:** primary sobre branco ≈ 6,8:1; muted-foreground ≈ 6:1; `highlight` ≈ 4,3:1 (só ícones/áreas grandes; para texto use `highlight-strong`). **Meça cada par no WebAIM Contrast Checker antes de afirmar AA no README.**

**Regra:** JSX só usa tokens (`bg-primary`, `text-highlight-strong`). Hex solto = lint falha. Tema escuro fica fora do escopo, mas os tokens já estão prontos para ele.

## 4. Tipografia

Self-hosted via `@fontsource-variable` (sem request a Google Fonts, argumento de LGPD).

| Uso | Classe |
|---|---|
| Título de página | `font-display text-2xl font-semibold tracking-tight` |
| Título de seção | `font-display text-lg font-semibold` |
| Corpo (equipe) | `text-sm` |
| Corpo (paciente) | `text-base` |
| Texto do laudo | `text-base leading-relaxed max-w-prose whitespace-pre-wrap` |
| Datas, horários e números | `tabular-nums` |

## 5. Espaçamento e layout

Escala Tailwind padrão (múltiplos de 4 px). Card `p-6`, gap de formulário `gap-4`, página `max-w-6xl` (equipe) / `max-w-2xl` (paciente). Raio padrão `rounded-lg`.

## 6. Bibliotecas

shadcn/ui (Radix), lucide-react, sonner, react-hook-form + zod + @hookform/resolvers, react-day-picker, date-fns + @date-fns/tz, class-variance-authority, clsx, tailwind-merge, tw-animate-css.

```bash
cd apps/web
npx shadcn@latest init
npx shadcn@latest add button input label textarea select dialog alert-dialog card badge table calendar popover tooltip dropdown-menu skeleton separator avatar sonner
npm i lucide-react react-hook-form @hookform/resolvers zod date-fns @date-fns/tz @fontsource-variable/inter @fontsource-variable/plus-jakarta-sans
```
Confira a versão atual do shadcn (componentes de formulário mudam entre versões) e registre-a em DECISIONS.

## 7. Componentes de produto (`src/components/product`)

| Componente | Comportamento |
|---|---|
| `StatusBadge` | Lê `statusMap`; ícone + texto + cor. |
| `SlotGrid` | Botões de 30 min. Livre = outline; selecionado = primary; ocupado/passado = desabilitado + Tooltip com o motivo. Nome acessível: "10:00, disponível". |
| `AppointmentTable` | Agenda da equipe; em telas pequenas vira lista de cards. |
| `ReportEditor` | Formulário com "Salvar rascunho" e "Publicar". |
| `PublishDialog` | AlertDialog: "Depois de publicado, o laudo não poderá ser editado." |
| `ReportViewer` | Laudo em "folha de papel": card branco, borda, título, profissional, "Publicado em". |
| `EmptyState` | Ícone + frase + ação opcional. |
| `PageHeader` | Título, descrição e ações. |
| `TimezoneNote` | "Horário de Brasília" junto das datas. |

## 8. statusMap

`src/features/status/statusMap.ts`

| Chave | Rótulo | Ícone | Cores | Quem vê |
|---|---|---|---|---|
| `SCHEDULED` | Agendado | `CalendarClock` | `bg-secondary text-secondary-foreground` | Todos |
| `CANCELED` | Cancelado | `CalendarX` | `bg-muted text-muted-foreground` | Todos |
| `DRAFT` | Rascunho | `FilePen` | `bg-warning-soft text-warning` | **Só STAFF** |
| `PUBLISHED` | Publicado | `FileCheck2` | `bg-highlight-soft text-highlight-strong` | STAFF |
| `REPORT_AVAILABLE` | Laudo disponível | `FileCheck2` | `bg-highlight-soft text-highlight-strong` | Paciente |

A UI do paciente nunca renderiza `DRAFT`. Ela espelha o 404 do backend.

## 9. Microcopy de erros

| Code | Mensagem |
|---|---|
| `UNAUTHORIZED` (login) | E-mail ou senha incorretos. |
| `UNAUTHORIZED` (sessão) | Sua sessão expirou. Entre novamente. |
| `FORBIDDEN` | Você não tem permissão para esta ação. |
| `NOT_FOUND` | Não encontramos este registro. |
| `SLOT_TAKEN` | Este horário acabou de ser ocupado. Escolha outro. |
| `PAST_DATE` | Não é possível agendar em um horário que já passou. |
| `INVALID_SLOT` | Escolha um horário entre 07:00 e 18:30, de 30 em 30 minutos. |
| `REPORT_EXISTS` | Este agendamento já possui um laudo. |
| `REPORT_LOCKED` | Este laudo já foi publicado e não pode ser alterado. |
| `CANNOT_CANCEL` | Este agendamento não pode mais ser cancelado. |
| `APPOINTMENT_CANCELED` | O agendamento foi cancelado; o laudo está bloqueado. |
| `RATE_LIMITED` | Muitas tentativas. Aguarde um minuto. |
| `VALIDATION_ERROR` | Mensagem por campo, vinda do formulário. |
| `INTERNAL_ERROR` | Algo deu errado. Tente novamente em instantes. |

Tom: frases curtas, voz ativa, sem culpar o usuário, sempre com o próximo passo.

## 10. Página `/_ds` (só em dev)

Mostra logo, paleta, tipografia, todos os badges, SlotGrid em todos os estados, botões e diálogos. Serve de vitrine para o avaliador e de referência para o agente.

## 11. Rodapé obrigatório

"Projeto fictício para desafio técnico · dados de demonstração"
