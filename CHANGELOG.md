# Changelog

All notable changes to the TEC Domain App Template are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: [Semantic Versioning](https://semver.org/)

---

## [Unreleased]

### Added
- Packaging hygiene: `LICENSE` (MIT), expanded `README`, this CHANGELOG,
  and Dependabot config (`npm` + `github-actions`, weekly).

### Changed
- `tsconfig`: enabled `noUncheckedIndexedAccess` (stricter index access).

## [2.0.0] - 2026-06 — production-ready by default

### Added
- `/api/health` — uniform C-92 health signal (fail-safe, public, never 500s).
- Structured `log` + `reportError` (C-96) — no silent error handlers.
- `PiRuntime` (PAL) + `PiCircuitBreaker` — single choke-point for `window.Pi.*`.
- `lib/flags.ts` — feature flags (`NEXT_PUBLIC_FLAG_*`) from day one.
- Coverage gate (`test:coverage`, 60% floor).

## [1.0.0] - initial

- Portal-ready skeleton: Hub SSO, dual-mode Pi payments (ADR-007), CSRF
  (middleware-only, C-12 §11), unified payment contract (ADR-009), legal pages,
  and CI policy guards (payment-policy + CSRF + lint/typecheck/test/build).
