'use client';

// A screen that broke says so, in the app's language, and offers a way out — try
// again, or go home. Never a blank page, never a stack trace (E1). The error is
// reported, not swallowed (C-96).

import Link from 'next/link';
import { useEffect } from 'react';
import { reportError } from '@/lib/observability/reportError';
import { useFleetStrings } from '@/components/fleet/strings';
import { StateScreen, primaryButton, secondaryLink } from '@/components/fleet/StateScreen';

export default function ErrorScreen({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { s, dir, lang } = useFleetStrings();
  useEffect(() => { reportError(error, { boundary: 'app/error', digest: error.digest }); }, [error]);
  return (
    <StateScreen icon="⚠️" title={s.states.errorTitle} body={s.states.errorBody} dir={dir} lang={lang}>
      <button type="button" onClick={() => reset()} style={primaryButton}>{s.states.retry}</button>
      <div><Link href="/" style={secondaryLink}>{s.states.goHome}</Link></div>
    </StateScreen>
  );
}
