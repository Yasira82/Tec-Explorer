'use client';

// A link that leads nowhere lands here — in the app's language, with the way home (E1).

import Link from 'next/link';
import { useFleetStrings } from '@/components/fleet/strings';
import { StateScreen, primaryButton } from '@/components/fleet/StateScreen';

export default function NotFound() {
  const { s, dir, lang } = useFleetStrings();
  return (
    <StateScreen icon="🔍" title={s.states.notFoundTitle} body={s.states.notFoundBody} dir={dir} lang={lang}>
      <Link href="/" style={{ ...primaryButton, display: 'block', textDecoration: 'none', lineHeight: '20px' }}>{s.states.goHome}</Link>
    </StateScreen>
  );
}
