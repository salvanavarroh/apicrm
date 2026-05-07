# API — CRM para Concesionarios

CRM SaaS multi-tenant para concesionarios de autos. Cliente piloto: Salvador Concesionarios. PRD vigente: `PRD_API_CRM_v2.md`.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind v4 + shadcn/ui
- Supabase (Postgres + RLS + Auth + Storage) — clientes browser/server/admin via `@supabase/ssr`
- TanStack Query, React Hook Form, Zod, @dnd-kit/core
- Resend (emails), Sentry (observabilidad)
- Playwright (E2E)

## Setup local

```bash
pnpm install
cp .env.example .env.local   # luego completá las keys reales de Supabase
pnpm dev                     # http://localhost:3000
```

## Scripts

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Dev server (Turbopack) |
| `pnpm build` | Build de producción |
| `pnpm start` | Sirve el build |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm format` | Prettier write |
| `pnpm test:e2e` | Playwright E2E |
| `pnpm db:types` | Regenera `src/types/database.ts` desde Supabase (requiere `SUPABASE_PROJECT_ID`) |

## Estructura

```
src/
├── app/                  # App Router (rutas, layouts, route handlers)
├── components/ui/        # shadcn/ui (vacío, agregar con `pnpm dlx shadcn@latest add <comp>`)
├── lib/
│   ├── env.ts            # Validación de env vars (zod)
│   ├── utils.ts          # cn() helper
│   └── supabase/         # Clientes: client (browser), server (RSC), admin (service-role), middleware
├── providers/            # Context providers (QueryProvider, …)
├── proxy.ts              # Refresh de sesión Supabase (Next 16: ex-`middleware.ts`)
├── types/database.ts     # Tipos generados por `pnpm db:types`
└── hooks/

tests/e2e/                # Playwright
```

## Roadmap (10 sprints)

Ver §10 del PRD. Sprint 0 ✓ — setup base. Sprint 1 → Auth + RLS + SuperAdmin (Empresas + Admins).
