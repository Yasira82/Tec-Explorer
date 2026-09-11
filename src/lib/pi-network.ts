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

/**
 * The Hub host to hand a Mode-1 payment to.
 *
 * Mode 1 sends the buyer to the Hub, which creates and approves the payment —
 * so the Hub's OWN host decides which Pi app, and therefore which key, that
 * payment is approved with. A Testnet visitor handed to the Mainnet Hub gets a
 * Mainnet approval, and a Test-Pi wallet cannot pay it: the modal simply hangs
 * on "Confirm in Pi…". That is why no app worked on the Testnet via the Hub.
 *
 * `NEXT_PUBLIC_HUB_URL` is inlined at build time and names exactly one of the
 * Hub's two hosts, so it cannot answer this — the same build-time-constant bug
 * as `APP_URL` and `sandbox` before it, in a third place.
 *
 * The Mainnet path is untouched: on a custom domain this returns the
 * configured value unchanged, and the Testnet host is a literal because a Pi
 * app's host is read off its deployment, never derived from a name.
 *
 * LOGIN is deliberately NOT routed this way. SSO is identity, not payment, and
 * the Mainnet Hub already signs sessions for Testnet hosts correctly — that is
 * how every app completed its Testnet login. Changing it would risk a flow
 * that works, to fix one that does not.
 */
const HUB_TESTNET_ORIGIN = 'https://tec-app-frontend.vercel.app';

export const hubPaymentOrigin = (configuredHubUrl: string, host?: string | null): string =>
  isTestnetHost(host ?? (typeof window === 'undefined' ? null : window.location.hostname))
    ? HUB_TESTNET_ORIGIN
    : configuredHubUrl;


/**
 * The Hub's hosts — BOTH of them. The one list every hub-entry check reads.
 *
 * ── The bug this closes ─────────────────────────────────────────────────────
 * ADR-007 exists because a visitor who arrived from the Hub is inside a Pi
 * session the HUB owns. This app must then not call `Pi.init()` (it poisons
 * that session) and must not call `Pi.authenticate()` (it never answers). The
 * detection was a substring test for `hub.tecosystem.app` — the MAINNET Hub,
 * and only it.
 *
 * On the Testnet pair the Hub is `tec-app-frontend.vercel.app`. So every hop
 * from the Testnet Hub into a Testnet app was INVISIBLE to ADR-007: the app
 * concluded it was standalone, ran `Pi.init()`, then sat in `Pi.authenticate`
 * forever. There is no error to catch — the bridge simply never replies — so
 * the only thing the user ever sees is the app's own 90-second timeout saying
 * "Payment timed out", with the Pi wallet never having opened at all.
 *
 * The guard was never wrong about Mainnet. It was blind on exactly half the
 * hosts it has to cover, which is the same shape as every other bug in this
 * series: one build, two hosts, a constant that names one of them.
 *
 * `hubPaymentOrigin` above already knew about the second Hub. The outbound
 * half of the journey knew there were two; the inbound half knew of one.
 *
 * ── Why hostname, not substring ─────────────────────────────────────────────
 * `referrer.includes('hub.tecosystem.app')` also matches
 * `hub.tecosystem.app.attacker.com`. That direction fails OPEN — a hostile
 * referrer could force Mode 1 and send the buyer to a Hub URL of its choosing.
 * The referrer is a URL; parse it and compare the host exactly, the same care
 * `isTestnetHost` already takes.
 */
export const HUB_HOSTS: readonly string[] = [
  'hub.tecosystem.app',
  'tec-app-frontend.vercel.app',
];

/** True when this page was opened FROM the Hub — either Hub. */
export const isHubReferrer = (referrer?: string | null): boolean => {
  if (!referrer) return false;
  try {
    return HUB_HOSTS.includes(new URL(referrer).hostname.toLowerCase());
  } catch {
    // Not a parseable URL → not a Hub hop. Mode 2 is the safe reading here:
    // a wrong Mode 1 sends the buyer away from an app that could have paid.
    return false;
  }
};
