# TEC Domain App Template

The **golden starter template** for a new app in the **TEC Federated Platform**.
It ships a correct, Portal-ready skeleton — Hub SSO, dual-mode Pi payments, CSRF,
legal pages, observability, and CI policy guards — so a new app is compliant from
commit zero.

> Full architecture rules and rationale live in [`CLAUDE.md`](./CLAUDE.md).
> Reference of record: `yasira82/tec-knowledge-base` (`C-12_Dual_Mode_Payment.md`).

---

## Stack

- Next.js 15 App Router + TypeScript strict · React 18
- `@yasser172/tec-ui` · `@yasser172/tec-auth` · `@yasser172/tec-sdk`
- Vitest (unit) + Playwright (e2e) · Deploy: Vercel

---

## Quick start

```bash
git clone <this-repo> tec-<domain>
cd tec-<domain>
cp .env.example .env.local
npm install --legacy-peer-deps
npm run dev
```

---

## New-app setup checklist

```
□ package.json: set "name"
□ middleware.ts: adjust PROTECTED_ROUTES
□ sso-callback/route.ts: set ALLOWED_AUDIENCES + DEFAULT_REDIRECT to your domain
□ src/lib/pi-payment.ts + payment/create: set APP_SOURCE slug
□ privacy/page.tsx + terms/page.tsx: set APP / DOMAIN / governing law / contacts
□ Add ADR-007 isHubNavigation() guard to every buy handler
□ .env: API_GATEWAY_URL · INTERNAL_SECRET · SSO_SECRET · NEXT_PUBLIC_PI_APP_ID · PI_SANDBOX=false (prod)
□ Pi Developer Portal: register domain + App ID; set /privacy + /terms URLs
□ Verify a real Pi payment Mode 1 (via Hub) AND Mode 2 (standalone)
```

---

## What's included

| Area | Files |
|------|-------|
| Auth / SSO | `middleware.ts` (CSRF + page guard), `api/auth/sso-callback`, `api/auth/refresh` |
| Payments | `api/bff/payment/{create,approve,complete,resolve-incomplete}`, `lib/pi-payment.ts` |
| Pi runtime | `lib/pi/PiRuntime.ts` (PAL), `lib/pi/PiCircuitBreaker.ts` |
| Observability | `api/health` (fail-safe), `lib/observability/{logger,reportError}.ts` |
| Platform | `lib/flags.ts`, `lib/bff/createHandler.ts`, `styles/tec-design-tokens.css` |
| Legal | `app/privacy`, `app/terms` (Pi Portal) |
| CI | `.github/workflows/` — payment-policy + CSRF guard + lint/typecheck/test/build + e2e |

---

## Files you change per domain

| File | Change |
|------|--------|
| `package.json` | `"name": "tec-<domain>"` |
| `src/app/layout.tsx` | title + description |
| `src/app/page.tsx` | login page |
| `src/app/app/` | domain pages |
| `src/app/api/bff/` | domain BFF routes |
| `.env.local` | domain secrets |

## Files you keep (the compliant core)

`middleware.ts` · `src/lib/bff/createHandler.ts` · `src/lib-client/pi/*` ·
`src/lib/pi/*` · `src/lib/observability/*` · `src/components/ErrorBoundary.tsx` ·
`next.config.js` · `Dockerfile`

---

## Commands

```bash
npm run dev            # dev server
npm run build          # production build
npm run lint           # ESLint
npm run typecheck      # tsc --noEmit (strict + noUncheckedIndexedAccess)
npm run test           # vitest
npm run test:coverage  # vitest + coverage (60% floor)
npm run test:e2e       # Playwright
```

See [CHANGELOG.md](./CHANGELOG.md). Licensed [MIT](./LICENSE).
