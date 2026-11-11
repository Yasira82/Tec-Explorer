import { describe, it, expect, vi } from 'vitest';
import { piSession } from '@/lib/pi/pi-session';

describe('piSession.announceCountedVisit', () => {
  it('announces the visit (ArrivalReport fires) but does not mark the page authenticated', () => {
    piSession.reset();
    const arrived = vi.fn();
    piSession.onSignedIn(arrived);
    piSession.announceCountedVisit();
    expect(arrived).toHaveBeenCalledTimes(1);
    expect(piSession.signedInHere).toBe(true);
    // a Pay tap must still authenticate before createPayment
    expect(piSession.isAuthenticated).toBe(false);
    piSession.reset();
  });
});
