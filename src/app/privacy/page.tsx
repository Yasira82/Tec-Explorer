import type { Metadata } from 'next';
import Link from 'next/link';

// TODO(new app): set these three for your app — required for Pi Portal submission.
const APP     = 'TEC App';
const DOMAIN  = 'your-app.tecosystem.app';
const UPDATED = '21 June 2026';

export const metadata: Metadata = {
  title:       `Privacy Policy — ${APP}`,
  description: `Privacy Policy for ${APP} (${DOMAIN}).`,
};

const wrap = { maxWidth: 820, margin: '0 auto', padding: '48px 22px', color: '#e7e7ea', background: '#020205', minHeight: '100vh', fontFamily: 'system-ui,-apple-system,Segoe UI,Roboto,sans-serif', lineHeight: 1.75 } as const;
const h1   = { color: '#d4af37', fontSize: 30, marginBottom: 4 } as const;
const h2   = { color: '#d4af37', fontSize: 19, marginTop: 30, marginBottom: 6 } as const;
const meta = { opacity: 0.65, fontSize: 14, marginBottom: 8 } as const;
const link = { color: '#d4af37' } as const;

export default function PrivacyPage() {
  return (
    <main style={wrap}>
      <h1 style={h1}>Privacy Policy</h1>
      <p style={meta}>{APP} · {DOMAIN} · Last updated: {UPDATED}</p>

      <h2 style={h2}>1. Overview</h2>
      <p>The Elite Consortium (&quot;TEC&quot;, &quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) operates {APP}, an application built on the Pi Network blockchain. This Privacy Policy explains how we collect, use, disclose, and safeguard your information. By using {APP}, you agree to this Privacy Policy.</p>

      <h2 style={h2}>2. Information We Collect</h2>
      <p><strong>Pi Network identity.</strong> When you authenticate via Pi Network we receive your Pi User ID (UID), Pi username, and access tokens. We never receive or store your Pi password or private keys.</p>
      <p><strong>Transaction data.</strong> Payment records — transaction identifiers, amounts, timestamps, status, and blockchain transaction IDs (txid).</p>
      <p><strong>Session cookies.</strong> First-party cookies (<code>tec_access_token</code>, <code>tec_csrf</code>, <code>tec_user</code>) to keep you signed in and to protect requests. Not used for advertising or cross-site tracking.</p>
      <p><strong>Usage data.</strong> Technical information such as IP address, browser type, device information, and pages visited.</p>

      <h2 style={h2}>3. How We Use Your Information</h2>
      <ul>
        <li>Authenticate your identity and provide secure access to {APP}</li>
        <li>Process Pi Network payments and maintain accurate records</li>
        <li>Provide the service and customer support</li>
        <li>Detect, investigate, and prevent fraudulent or abusive activity</li>
        <li>Comply with applicable legal obligations</li>
      </ul>

      <h2 style={h2}>4. Security</h2>
      <p>We apply industry-standard safeguards including TLS/SSL encryption, JWT-based authentication with secure token rotation, CSRF protection, and rate limiting on payment endpoints.</p>

      <h2 style={h2}>5. Blockchain &amp; Pi Network</h2>
      <p>Payments are processed on the Pi Network blockchain and are immutable and may be publicly visible. {APP} is an independent developer application built on Pi Network and is not affiliated with, endorsed by, or operated by Pi Network or Minepi, Inc.</p>

      <h2 style={h2}>6. Third-Party Services</h2>
      <p>We rely on Pi Network (identity &amp; payments) and our infrastructure providers (hosting and backend) to deliver {APP}. They process data only as needed to operate the service.</p>

      <h2 style={h2}>7. Data Retention</h2>
      <p>We retain transaction and account records as long as needed to provide the service and to meet legal, accounting, and security obligations.</p>

      <h2 style={h2}>8. Your Rights</h2>
      <ul>
        <li>Access — request a copy of your personal data</li>
        <li>Rectification — request correction of inaccurate data</li>
        <li>Erasure — request deletion of your personal data</li>
        <li>Portability — request transfer of your data</li>
      </ul>
      <p>To exercise these rights, contact <a href="mailto:privacy@tec.pi" style={link}>privacy@tec.pi</a>.</p>

      <h2 style={h2}>9. Children</h2>
      <p>{APP} is not directed to children under the age required to hold a Pi Network account, and we do not knowingly collect their data.</p>

      <h2 style={h2}>10. Changes</h2>
      <p>We may update this Privacy Policy from time to time. Material changes are reflected by the &quot;Last updated&quot; date above.</p>

      <h2 style={h2}>11. Contact</h2>
      <p>For privacy inquiries, contact The Elite Consortium at <a href="mailto:privacy@tec.pi" style={link}>privacy@tec.pi</a>.</p>

      <p style={{ marginTop: 40 }}>
        <Link href="/terms" style={link}>Terms of Service</Link>{'  ·  '}
        <Link href="/" style={link}>← Back to {APP}</Link>
      </p>
    </main>
  );
}
