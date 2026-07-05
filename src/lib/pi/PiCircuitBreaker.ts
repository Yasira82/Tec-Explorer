// Pi Circuit Breaker (PAL resilience) — CLOSED → OPEN → HALF_OPEN.
//
// Wraps repeated Pi calls so a flapping Pi SDK / network can't hammer the user:
// 3 consecutive failures → OPEN for 60s → one HALF_OPEN trial → CLOSED on success.
// Persists to localStorage in the browser; falls back to in-memory (SSR/tests).

const KEY = 'tec_pi_cb';
const FAILURE_LIMIT = 3;
const OPEN_TIMEOUT = 60_000; // 60s before a HALF_OPEN retry

export type CBState = {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failures: number;
  openedAt: number;
};

const DEFAULTS: CBState = { state: 'CLOSED', failures: 0, openedAt: 0 };

export class PiCircuitBreaker {
  private mem: CBState = { ...DEFAULTS };

  private read(): CBState {
    if (typeof window === 'undefined') return this.mem;
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as CBState) : { ...DEFAULTS };
    } catch {
      return this.mem;
    }
  }

  private write(s: CBState): void {
    this.mem = s;
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* in-memory fallback already set */
    }
  }

  get currentState(): CBState['state'] {
    const s = this.read();
    if (s.state === 'OPEN' && Date.now() - s.openedAt >= OPEN_TIMEOUT) {
      this.write({ ...s, state: 'HALF_OPEN' });
      return 'HALF_OPEN';
    }
    return s.state;
  }

  canAttempt(): boolean {
    return this.currentState !== 'OPEN';
  }

  onSuccess(): void {
    this.write({ ...DEFAULTS });
  }

  onFailure(): void {
    const s = this.read();
    const failures = s.failures + 1;
    if (failures >= FAILURE_LIMIT) {
      this.write({ state: 'OPEN', failures, openedAt: Date.now() });
    } else {
      this.write({ state: 'CLOSED', failures, openedAt: 0 });
    }
  }

  reset(): void {
    this.write({ ...DEFAULTS });
  }
}

export const piCircuitBreaker = new PiCircuitBreaker();
