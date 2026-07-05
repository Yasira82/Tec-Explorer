import type { Metadata } from 'next';
import '@/styles/tec-design-tokens.css';

export const metadata: Metadata = {
  title:       'TEC Domain',
  description: 'TEC Ecosystem — Pi Network Super App',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        {/* Full-bleed dark shell — tint the browser UI + declare dark canvas so
            no white frame shows around the app in Pi Browser. */}
        <meta name="theme-color" content="#020205" />
        <meta name="color-scheme" content="dark" />
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
      <body>{children}</body>
    </html>
  );
}
