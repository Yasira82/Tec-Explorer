'use client';

// "Report" on a listing or a review (C-108).
//
// Deliberately quiet: a small text link, not a button competing with Follow or
// the review form. Reporting is rare and the control should be findable without
// being suggestive — a prominent report button on every card invites reports
// the way a big red switch invites pressing.
//
// The reasons are a fixed list because free text alone cannot be counted or
// triaged, and because a person deciding whether something is worth reporting
// is helped by seeing what counts. `scam` leads: this is a directory of
// businesses taking real money, and it is the report that matters most.
//
// Nothing here promises an outcome. It says the report was sent, because that
// is the only thing this app actually knows — a human decides the rest, and a
// message implying otherwise would be a lie the first time nothing happens.
import { useState } from 'react';
import { TEC_COLORS } from '@yasser172/tec-ui';
import { useTranslation } from '@/lib/i18n';
import { reportError } from '@/lib/observability/reportError';

/** The reasons the backend accepts. Any other value is rejected there. */
const REASONS = ['scam', 'spam', 'offensive', 'not_a_business', 'wrong_info', 'impersonation', 'other'] as const;
type Reason = (typeof REASONS)[number];

export function ReportButton({ targetKind, targetId, canReport = true }: {
  targetKind: 'listing' | 'review';
  targetId: string;
  /** False for your own content — the API refuses it, so it is not offered. */
  canReport?: boolean;
}) {
  const { t } = useTranslation();
  const x = t.explorer;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<Reason>('scam');
  const [note, setNote] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'failed'>('idle');

  if (!canReport) return null;

  async function send() {
    if (state === 'busy') return;
    setState('busy');
    try {
      const res = await fetch('/api/bff/explorer/report', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetKind, targetId, reason, note }),
      });
      if (!res.ok) {
        // 401 is not a failure of the app — it is a person who is not signed
        // in, and it needs different words from "something went wrong".
        setState(res.status === 401 ? 'idle' : 'failed');
        if (res.status === 401) setOpen(false);
        return;
      }
      setState('sent');
    } catch (err) {
      // Never swallowed: a moderation path that fails silently means abuse
      // reports quietly stop arriving and nobody finds out (C-96).
      reportError(err, { where: 'ReportButton', targetKind });
      setState('failed');
    }
  }

  if (state === 'sent') {
    return (
      <p style={{ fontSize: 11.5, color: TEC_COLORS.subtext, marginTop: 10, lineHeight: 1.5 }}>
        {x.reportSent}
      </p>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          background: 'none', border: 'none', padding: '6px 0', cursor: 'pointer',
          fontSize: 11.5, color: TEC_COLORS.subtext, textDecoration: 'underline',
        }}
      >{x.report}</button>
    );
  }

  const busy = state === 'busy';
  return (
    <div style={{
      marginTop: 10, padding: 12, borderRadius: 10,
      background: TEC_COLORS.bg, border: `1px solid ${TEC_COLORS.subtext}33`,
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: TEC_COLORS.text }}>{x.reportTitle}</div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {REASONS.map((r) => (
          <button
            key={r}
            onClick={() => setReason(r)}
            style={{
              fontSize: 11.5, borderRadius: 999, padding: '4px 10px', cursor: 'pointer',
              background: reason === r ? `${TEC_COLORS.gold}22` : 'transparent',
              color: reason === r ? TEC_COLORS.gold : TEC_COLORS.subtext,
              border: `1px solid ${reason === r ? `${TEC_COLORS.gold}66` : `${TEC_COLORS.subtext}44`}`,
            }}
          >{x.reportReasons[r]}</button>
        ))}
      </div>

      <textarea
        value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2}
        dir="auto" placeholder={x.reportNotePlaceholder}
        style={{
          width: '100%', boxSizing: 'border-box', marginTop: 8, padding: '8px 10px',
          background: TEC_COLORS.surface, color: TEC_COLORS.text, resize: 'vertical',
          border: `1px solid ${TEC_COLORS.subtext}33`, borderRadius: 8, fontSize: 12.5,
          outline: 'none', fontFamily: 'inherit',
        }}
      />

      {state === 'failed' && (
        <div style={{ fontSize: 11.5, color: '#EF4444', marginTop: 6 }}>{x.reportFailed}</div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button
          onClick={() => void send()} disabled={busy}
          style={{
            fontSize: 12, fontWeight: 700, borderRadius: 999, padding: '7px 14px',
            border: 'none', cursor: busy ? 'default' : 'pointer',
            background: busy ? `${TEC_COLORS.gold}33` : `linear-gradient(135deg, ${TEC_COLORS.gold}, ${TEC_COLORS.goldDark})`,
            color: busy ? TEC_COLORS.subtext : '#0a0800',
          }}
        >{busy ? x.reportSending : x.reportSend}</button>
        <button
          onClick={() => { setOpen(false); setState('idle'); }}
          style={{
            fontSize: 12, fontWeight: 700, borderRadius: 999, padding: '7px 14px',
            background: 'transparent', color: TEC_COLORS.subtext,
            border: `1px solid ${TEC_COLORS.subtext}44`, cursor: 'pointer',
          }}
        >{x.cancel}</button>
      </div>

      <p style={{ fontSize: 10.5, color: TEC_COLORS.subtext, margin: '8px 0 0', lineHeight: 1.5 }}>
        {x.reportPrivacyNote}
      </p>
    </div>
  );
}
