'use client';

// Help & feedback (App Excellence Standard E12): the common questions answered, and a
// way to say anything else. In the app's language and direction; design tokens only.

import Link from 'next/link';
import { useFleetStrings } from '@/components/fleet/strings';
import { FeedbackCard } from '@/components/fleet/FeedbackCard';

export default function HelpPage() {
  const { s, lang, dir } = useFleetStrings();
  const h = s.help;
  const qa = [[h.q1, h.a1], [h.q2, h.a2], [h.q3, h.a3]] as const;
  return (
    <main dir={dir} lang={lang} style={{ minHeight: '100vh', background: 'var(--tec-bg)', color: 'var(--tec-text-1)', padding: '32px 18px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <Link href="/app" style={{ display: 'inline-block', minHeight: 40, lineHeight: '40px', color: 'var(--tec-text-2)', fontSize: 14 }}>← {h.back}</Link>
        <h1 style={{ fontSize: 24, fontWeight: 900, margin: '8px 0 6px', color: 'var(--tec-gold)' }}>{h.title}</h1>
        <p style={{ color: 'var(--tec-text-2)', fontSize: 14, lineHeight: 1.6, marginTop: 0 }}>{h.intro}</p>

        <section aria-label={h.title} style={{ marginTop: 18 }}>
          {qa.map(([q, a]) => (
            <details key={q} style={{ background: 'var(--tec-surface-1)', border: '1px solid var(--tec-border)', borderRadius: 12, padding: '12px 14px', marginBottom: 10 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 15, minHeight: 24 }}>{q}</summary>
              <p style={{ color: 'var(--tec-text-2)', fontSize: 14, lineHeight: 1.6, margin: '10px 0 0' }}>{a}</p>
            </details>
          ))}
        </section>

        <section style={{ marginTop: 22, background: 'var(--tec-surface-1)', border: '1px solid var(--tec-border)', borderRadius: 14, padding: 16 }}>
          <FeedbackCard f={s.feedback} page="/help" />
        </section>

        <nav style={{ marginTop: 18, display: 'flex', gap: 16, fontSize: 14 }}>
          <Link href="/privacy" style={{ color: 'var(--tec-text-2)', minHeight: 40, lineHeight: '40px' }}>{h.privacy}</Link>
          <Link href="/terms" style={{ color: 'var(--tec-text-2)', minHeight: 40, lineHeight: '40px' }}>{h.terms}</Link>
        </nav>
      </div>
    </main>
  );
}
