import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTabHistory } from '@/lib-client/useTabHistory';

// The phone's Back button left the app.
//
// The tabs were React state, so the browser history knew nothing about them: a
// visitor who went Discover → My Business → Settings had made ONE entry between
// them (the page load), and Back went past all three at once — usually back to
// the Hub. Three taps in, and Back threw away all three.

type Tab = 'discover' | 'listing' | 'pro' | 'settings';

/** A history stack small enough to reason about, with a real back(). */
function fakeHistory() {
  const stack: (unknown)[] = [null];
  let i = 0;
  const listeners = new Set<(e: PopStateEvent) => void>();

  window.history.replaceState = (s: unknown) => { stack[i] = s; };
  window.history.pushState = (s: unknown) => { stack.splice(i + 1); stack.push(s); i++; };

  const realAdd = window.addEventListener.bind(window);
  vi.spyOn(window, 'addEventListener').mockImplementation((t, fn, o) => {
    if (t === 'popstate') listeners.add(fn as (e: PopStateEvent) => void);
    else realAdd(t, fn as EventListener, o);
  });
  vi.spyOn(window, 'removeEventListener').mockImplementation((t, fn) => {
    if (t === 'popstate') listeners.delete(fn as (e: PopStateEvent) => void);
  });

  Object.defineProperty(window.history, 'state', { configurable: true, get: () => stack[i] });

  return {
    depth: () => stack.length,
    /** Exactly what the hardware button does: pop one entry, fire popstate. */
    back: () => {
      if (i === 0) return 'left the app';
      i--;
      for (const fn of listeners) fn({ state: stack[i] } as PopStateEvent);
      return 'still inside';
    },
  };
}

let h: ReturnType<typeof fakeHistory>;
beforeEach(() => { vi.restoreAllMocks(); h = fakeHistory(); });

describe('Back steps through the tabs', () => {
  it('walks back the way the visitor came', () => {
    const { result } = renderHook(() => useTabHistory<Tab>('discover'));

    act(() => { result.current[1]('listing'); });
    act(() => { result.current[1]('settings'); });
    expect(result.current[0]).toBe('settings');

    act(() => { expect(h.back()).toBe('still inside'); });
    expect(result.current[0]).toBe('listing');

    act(() => { expect(h.back()).toBe('still inside'); });
    expect(result.current[0]).toBe('discover');
  });

  it('and only leaves once there is nothing left to go back to', () => {
    const { result } = renderHook(() => useTabHistory<Tab>('discover'));
    act(() => { result.current[1]('pro'); });
    act(() => { h.back(); });
    expect(result.current[0]).toBe('discover');
    // One more: the front door has nothing before it inside the app.
    expect(h.back()).toBe('left the app');
  });
});

describe('the history does not fill up with nothing', () => {
  it('re-tapping the current tab adds no entry', () => {
    // Otherwise Back appears to do nothing, once per stray tap.
    const { result } = renderHook(() => useTabHistory<Tab>('discover'));
    const before = h.depth();
    act(() => { result.current[1]('discover'); });
    act(() => { result.current[1]('discover'); });
    expect(h.depth()).toBe(before);
  });

  it('one entry per real change', () => {
    const { result } = renderHook(() => useTabHistory<Tab>('discover'));
    const before = h.depth();
    act(() => { result.current[1]('pro'); });
    act(() => { result.current[1]('settings'); });
    expect(h.depth()).toBe(before + 2);
  });
});

describe('the tab is kept out of the URL', () => {
  it('records it in history.state instead', () => {
    // The URL is registered with the Pi Portal and is what the SSO landing
    // returns to. A `?tab=` on it would let a share or a re-entry land
    // somewhere other than the app's front door.
    const { result } = renderHook(() => useTabHistory<Tab>('discover'));
    act(() => { result.current[1]('settings'); });
    expect((window.history.state as { tecTab?: string }).tecTab).toBe('settings');
  });

  it('an entry that is not ours falls back to the front door', () => {
    // Landing back ONTO a foreign entry — one pushed by something else, with
    // no tab recorded. Without the fallback the screen would keep rendering
    // whatever tab happened to be showing, which is a state the history no
    // longer describes.
    const { result } = renderHook(() => useTabHistory<Tab>('discover'));
    act(() => { window.history.pushState(null, ''); });   // not ours
    act(() => { result.current[1]('settings'); });        // ours, on top of it
    act(() => { h.back(); });                             // back onto the foreign one
    expect(result.current[0]).toBe('discover');
  });
});
