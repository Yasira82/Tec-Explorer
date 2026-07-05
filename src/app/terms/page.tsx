import type { Metadata } from 'next';
import Link from 'next/link';

// TODO(new app): set these three for your app — required for Pi Portal submission.
const APP     = 'TEC App';
const DOMAIN  = 'your-app.tecosystem.app';
const UPDATED = '21 June 2026';

export const metadata: Metadata = {
  title:       `Terms of Service — ${APP}`,
  description: `Terms of Service for ${APP} (${DOMAIN}).`,
};

const wrap = { maxWidth: 820, margin: '0 auto', padding: '48px 22px', color: '#e7e7ea', background: '#020205', minHeight: '100vh', fontFamily: 'system-ui,-apple-system,Segoe UI,Roboto,sans-serif', lineHeight: 1.75 } as const;
const h1   = { color: '#d4af37', fontSize: 30, marginBottom: 4 } as const;
const h2   = { color: '#d4af37', fontSize: 19, marginTop: 30, marginBottom: 6 } as const;
const meta = { opacity: 0.65, fontSize: 14, marginBottom: 8 } as const;
const link = { color: '#d4af37' } as const;

export default function TermsPage() {
  return (
    <main style={wrap}>
      <h1 style={h1}>Terms of Service</h1>
      <p style={meta}>{APP} · {DOMAIN} · Last updated: {UPDATED}</p>

      <h2 style={h2}>1. Acceptance of Terms</h2>
      <p>By accessing or using {APP} (the &quot;Service&quot;), operated by The Elite Consortium (&quot;TEC&quot;), you agree to these Terms of Service. If you do not agree, do not use the Service.</p>

      <h2 style={h2}>2. Eligibility</h2>
      <p>You must have a valid Pi Network account and meet Pi Network&apos;s minimum age requirement. You are responsible for the security of your account.</p>

      <h2 style={h2}>3. The Service</h2>
      <p>{APP} provides its features to Pi Network users, with payments made in Pi. We may add, change, or discontinue features at any time.</p>

      <h2 style={h2}>4. Payments via Pi Network</h2>
      <p>All payments are processed through the Pi Network payment system and are denominated in Pi. By initiating a payment you authorise the corresponding Pi transaction. Completed blockchain transactions are final and irreversible. {APP} does not custody your Pi wallet or private keys.</p>

      <h2 style={h2}>5. User Responsibilities</h2>
      <ul>
        <li>Provide accurate information and use the Service lawfully</li>
        <li>Do not attempt to circumvent authentication, payment, or security controls</li>
        <li>Do not use the Service to launder funds or conduct fraudulent transactions</li>
      </ul>

      <h2 style={h2}>6. Prohibited Conduct</h2>
      <p>You may not reverse-engineer, disrupt, overload, or gain unauthorised access to the Service or its infrastructure, nor use it to infringe the rights of others.</p>

      <h2 style={h2}>7. Intellectual Property</h2>
      <p>The Service, its design, and content (excluding user-supplied content) are owned by TEC and protected by applicable law.</p>

      <h2 style={h2}>8. Disclaimers</h2>
      <p>The Service is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind. {APP} is an independent application built on Pi Network and is not affiliated with, endorsed by, or operated by Pi Network or Minepi, Inc.</p>

      <h2 style={h2}>9. Limitation of Liability</h2>
      <p>To the maximum extent permitted by law, TEC shall not be liable for indirect, incidental, or consequential damages, or for losses arising from blockchain transactions, Pi Network availability, or events beyond our reasonable control.</p>

      <h2 style={h2}>10. Termination</h2>
      <p>We may suspend or terminate access to the Service for any breach of these Terms or to protect the platform and its users.</p>

      <h2 style={h2}>11. Changes to These Terms</h2>
      <p>We may update these Terms from time to time. Continued use after changes constitutes acceptance.</p>

      <h2 style={h2}>12. Governing Law</h2>
      <p>{/* TODO(new app): set governing-law jurisdiction. */}These Terms are governed by the laws of the applicable jurisdiction of The Elite Consortium.</p>

      <h2 style={h2}>13. Contact</h2>
      <p>Questions about these Terms: <a href="mailto:support@tec.pi" style={link}>support@tec.pi</a>.</p>

      <p style={{ marginTop: 40 }}>
        <Link href="/privacy" style={link}>Privacy Policy</Link>{'  ·  '}
        <Link href="/" style={link}>← Back to {APP}</Link>
      </p>
    </main>
  );
}
