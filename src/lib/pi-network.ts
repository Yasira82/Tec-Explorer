/**
 * Which Pi network this request is on — decided by the HOST.
 *
 * ── Why the host, and not an env var ────────────────────────────────────────
 * A `.pi` domain requires a Pi app, and Pi issues every app TWICE: a Mainnet
 * one and a paired Testnet one. Both are registered against the SAME
 * deployment, on different hosts:
 *
 *   <app>.tecosystem.app    → the Mainnet app
 *   tec-<app>.vercel.app    → the paired Testnet app
 *
 * One build serves both, so `NEXT_PUBLIC_PI_SANDBOX` cannot answer this: it is
 * baked at build time and there is only one build. The host is the only thing
 * that differs between the two, and it is what Pi itself uses to decide which
 * app a visitor is in.
 *
 * ── Why it is read server-side ──────────────────────────────────────────────
 * The network reaches payment-service as `metadata.testnet`, and it selects
 * which Pi API key a payment is approved with. A client that could set that
 * field could pay with Test-Pi and have a consumer grant it something real — a
 * free subscription. So the BFF derives it from its own `Host` header and
 * OVERWRITES anything the body carried (P6).
 *
 * ── What it is NOT ──────────────────────────────────────────────────────────
 * It is not the SDK's `sandbox` flag, and it is not the Pi Platform API host.
 * The host picks the APP; the app's KEY picks the network at Pi's end; the
 * `sandbox` flag points the SDK at Pi's Sandbox environment, a third thing.
 * Conflating them cost a day: sandbox:true on the Testnet host left the Pi
 * bridge silent, and pointing the Platform API at api.testnet.minepi.com sent
 * approve to a Horizon blockchain node that has never heard of a payment id.
 */

/**
 * `*.vercel.app` is the Testnet app; a custom domain is the Mainnet one.
 *
 * Anchored to the END of the host so a name that merely CONTAINS the string —
 * `vercel.app.attacker.com` — is not mistaken for one. The port is stripped
 * because `Host` carries it and the hostname is what identifies the app.
 */
export const isTestnetHost = (host?: string | null): boolean =>
  /\.vercel\.app$/i.test((host ?? '').split(':')[0]?.trim() ?? '');

/** The metadata a payment carries so every later step agrees which network it was on. */
export const networkMetadata = (host?: string | null): { testnet?: true } =>
  // Present ONLY when true. A `testnet: false` on every Mainnet payment would
  // put a field about the test network on 100% of real money, and the day it
  // was written wrong is the day it means the opposite of what it says.
  isTestnetHost(host) ? { testnet: true } : {};
