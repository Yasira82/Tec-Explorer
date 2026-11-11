'use client';

import { ArrivalTracePanel } from './ArrivalTracePanel';

/**
 * Why a campaign mission did or did not tick, on the phone that has the
 * problem: this tab's Pi sign-in and arrival report (lib/pioneer/arrival-trace).
 * Outcomes only — no token, username or Pi uid. Same panel as every app's.
 */
export default function PiTestPage() {
  return (
    <main style={{ fontFamily: 'monospace', maxWidth: 800, margin: '32px auto', padding: '0 16px' }}>
      <h1 style={{ fontSize: '1.4rem', marginBottom: 4 }}>TEC Explorer Diagnostic</h1>
      <ArrivalTracePanel />
    </main>
  );
}
