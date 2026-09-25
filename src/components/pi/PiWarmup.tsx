'use client';

// Renders nothing. Starts the Pi handshake as soon as the SDK is ready, so the
// Pay tap has nothing left to wait for.
//
// This is the whole fix for "I pay in the Hub, come back to the app, and the
// payment hangs": the Pi app-context switch back to this app happens here, at
// page load, while the user is still looking at the screen — instead of after
// the tap, where it reads as a frozen button.
//
// Deliberately silent: a failed warm-up must never show the user an error for
// something they did not ask for. The tap retries through the same gate.

import { useEffect } from 'react';
import { piSession } from '@/lib/pi/pi-session';
import { selfSignIn } from '@/lib/pi/self-sign-in';

export function PiWarmup() {
  useEffect(() => {
    const w = window as unknown as {
      __TEC_PI_READY?: boolean;
      __TEC_PI_FOREIGN_SESSION?: boolean;
    };

    // ADR-007: in a Hub-owned session there is nothing to warm — Pi.authenticate
    // never answers there, and calling it poisons the Hub's own modal.
    const warm = () => {
      if (w.__TEC_PI_FOREIGN_SESSION === true) return;
      piSession.warm();
      // A standalone visit (the Quest, the campaign, Pi Browser's own app list)
      // arrives with no session of its own. The handshake just started is what
      // signs it in — see self-sign-in.ts. Joins the same handshake, never a
      // second one, and does nothing when a session already exists.
      void selfSignIn();
    };

    if (w.__TEC_PI_READY === true) { warm(); return; }

    window.addEventListener('tec-pi-ready', warm, { once: true });
    return () => window.removeEventListener('tec-pi-ready', warm);
  }, []);

  return null;
}
