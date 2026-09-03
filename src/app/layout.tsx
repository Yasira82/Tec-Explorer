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
        <script
          src="https://sdk.minepi.com/pi-sdk.js"
          async
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.addEventListener('load', function() {
                // ADR-007/C-12 §3: Hub-entered = Hub owns this Pi Browser
                // session — never Pi.init() here (it poisons the session and
                // breaks the Hub PaymentModal). The SSO landing persists the
                // flag; referrer covers direct hops.
                try {
                  if (sessionStorage.getItem('__tec_hub_entry') === '1' ||
                      document.referrer.toLowerCase().indexOf('hub.tecosystem.app') !== -1) {
                    window.__TEC_PI_FOREIGN_SESSION = true;
                    window.__TEC_PI_READY = true;
                    window.dispatchEvent(new Event('tec-pi-ready'));
                    return;
                  }
                } catch(e) {}
                if (typeof window.Pi !== 'undefined') {
                  try {
                    window.Pi.init({
                      version: '2.0',
                      sandbox: ${process.env.NEXT_PUBLIC_PI_SANDBOX === 'true'},
                    });
                    window.__TEC_PI_READY = true;
                    window.dispatchEvent(new Event('tec-pi-ready'));
                  } catch(e) {
                    window.__TEC_PI_ERROR = true;
                    window.dispatchEvent(new Event('tec-pi-error'));
                  }
                }
              });
            `,
          }}
        />
      </head>
      <body><LocaleProvider>{children}</LocaleProvider></body>
    </html>
  );
}
