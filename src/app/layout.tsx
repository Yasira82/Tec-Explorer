import { PiWarmup } from '@/components/pi/PiWarmup';
import { HUB_HOSTS } from '@/lib/pi-network';
import type { Metadata } from 'next';
import '@/styles/tec-design-tokens.css';
// Bundled, not pulled from unpkg. A CDN <link> would be a third-party request on
// every page load and a dependency Pi Browser might block; the package is
// already installed, so the stylesheet ships with the app.
import 'leaflet/dist/leaflet.css';
import { LocaleProvider } from '@/lib/i18n';
import { THEME_BOOT_SCRIPT } from '@/lib-client/theme';

export const metadata: Metadata = {
  title:       'TEC Explorer — Discover the Pi economy',
  description: 'Find Pi-accepting businesses, services, and opportunities near you. The discovery layer of the TEC Federated Platform.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    /* `suppressHydrationWarning`: the boot script below stamps `data-theme` and
       `colorScheme` on this element before React hydrates, so the server markup
       and the client DOM differ here ON PURPOSE. Without it React logs a
       mismatch on every load for something that is working correctly. */
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        {/* One theme-color per scheme, so the browser chrome above the page
            matches the page. A single dark value left a black bar sitting on
            top of a light app. */}
        <meta name="theme-color" media="(prefers-color-scheme: dark)"  content="#101014" />
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#f4f3f1" />
        {/* `color-scheme` is NOT declared here any more. It has to follow the
            reader's stored choice, which only the boot script knows — a static
            `dark` meta made light mode paint dark scrollbars and dark form
            controls, which is how a theme ends up looking half-finished. */}
        {/* Applies the stored theme BEFORE first paint. Inline and synchronous
            by necessity: anything deferred paints too late, and the page would
            render dark and then snap to light on every single load — a flash
            that is worse than not offering the choice at all. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        {/* The Pi SDK is NOT loaded here. It is injected below, and ONLY when
            this is not a Hub-owned session — see the note in that script. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.addEventListener('load', function() {
                // ADR-007/C-12 §3: Hub-entered = Hub owns this Pi Browser
                // session — never Pi.init() here (it poisons the session and
                // breaks the Hub PaymentModal). The SSO landing persists the
                // flag; referrer covers direct hops.
                //
                // BOTH Hub hosts. The list is interpolated from
                // lib/pi-network.ts (HUB_HOSTS) because this script runs before
                // any module and cannot import — but it must not become a
                // second, drifting copy of the answer. It named only the
                // Mainnet Hub, so a hop from the Testnet Hub ran Pi.init() into
                // a session the Hub owns and every later Pi call went silent.
                var __hubHosts = ${JSON.stringify(HUB_HOSTS)};
                var __fromHub = false;
                try {
                  __fromHub = !!document.referrer &&
                    __hubHosts.indexOf(new URL(document.referrer).hostname.toLowerCase()) !== -1;
                } catch (e) {}
                try {
                  if (sessionStorage.getItem('__tec_hub_entry') === '1' || __fromHub) {
                    window.__TEC_PI_FOREIGN_SESSION = true;
                    window.__TEC_PI_READY = true;
                    window.dispatchEvent(new Event('tec-pi-ready'));
                    return;
                  }
                } catch(e) {}
                // Standalone session — load the SDK now, then init it. In a
                // Hub-owned session it is not merely left un-init'd, it is NOT
                // LOADED AT ALL: pulling pi-sdk.js opens Pi's bridge on this
                // origin regardless of init, and ADR-007 says an app in a
                // Hub-owned session must not touch Pi. Loading its SDK is
                // touching it.
                var __boot = function () {
                  if (typeof window.Pi === 'undefined') {
                    window.__TEC_PI_ERROR = true;
                    window.dispatchEvent(new Event('tec-pi-error'));
                    return;
                  }
                  try {
                    var __isTestnetHost = /\\.vercel\\.app$/i.test(location.hostname)
                      || /-test\\.tecosystem\\.app$/i.test(location.hostname);
                    // SANDBOX IS NOT TESTNET. The HOST decides which Pi APP the
                    // visitor is in (and so which network the server approves
                    // against); "sandbox" points the SDK at Pi's SANDBOX
                    // environment, a third thing. A paired Testnet app is a
                    // normal app on its own domain — NOT the sandbox. Setting
                    // sandbox:true there left the Pi bridge silent ("Messaging
                    // promise with id 1 timed out after 120000ms"). Default
                    // false; ?pi_sandbox=1 is the way back in, honoured only on
                    // the Testnet host so no query param can put a Mainnet
                    // payment into sandbox mode.
                    var __q = null;
                    try { __q = new URLSearchParams(location.search).get('pi_sandbox'); } catch (e) {}
                    var __sandbox = __isTestnetHost
                      ? (__q === '1')
                      : ${process.env.NEXT_PUBLIC_PI_SANDBOX === 'true'};
                    window.__TEC_PI_SANDBOX = __sandbox;
                    window.Pi.init({
                      version: '2.0',
                      sandbox: __sandbox,
                    });
                    window.__TEC_PI_READY = true;
                    window.dispatchEvent(new Event('tec-pi-ready'));
                  } catch(e) {
                    window.__TEC_PI_ERROR = true;
                    window.dispatchEvent(new Event('tec-pi-error'));
                  }
                };

                if (typeof window.Pi !== 'undefined') { __boot(); return; }
                var __s = document.createElement('script');
                __s.src   = 'https://sdk.minepi.com/pi-sdk.js';
                __s.async = true;
                __s.onload  = __boot;
                __s.onerror = function () {
                  window.__TEC_PI_ERROR = true;
                  window.dispatchEvent(new Event('tec-pi-error'));
                };
                document.head.appendChild(__s);
              });
            `,
          }}
        />
      </head>
      <body><PiWarmup /><LocaleProvider>{children}</LocaleProvider></body>
    </html>
  );
}
