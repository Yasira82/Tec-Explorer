import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The screens every app has (App Excellence Standard E1 · E12), from the template's
 * fleet/ set. Each carries its own words — an error screen must not depend on a provider
 * that may be the thing that broke — and speaks the language the app set on <html>.
 */
vi.mock('@/lib/observability/reportError', () => ({ reportError: vi.fn() }));

afterEach(() => { cleanup(); document.documentElement.lang = ''; vi.unstubAllGlobals(); });

describe('state screens', () => {
  it('the error screen offers a retry that calls reset, and reports the error', async () => {
    const { reportError } = await import('@/lib/observability/reportError');
    const { default: ErrorScreen } = await import('@/app/error');
    const reset = vi.fn();
    render(<ErrorScreen error={new Error('boom')} reset={reset} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reset).toHaveBeenCalledOnce();
    expect(reportError).toHaveBeenCalled();
  });

  it('speaks Arabic, right to left, when the app set <html lang="ar">', async () => {
    document.documentElement.lang = 'ar';
    const { default: NotFound } = await import('@/app/not-found');
    const { container } = render(<NotFound />);
    await waitFor(() => expect(screen.getByText('الصفحة غير موجودة')).toBeTruthy());
    expect(container.querySelector('main')?.getAttribute('dir')).toBe('rtl');
  });

  it('the wait is announced to screen readers', async () => {
    const { default: Loading } = await import('@/app/loading');
    render(<Loading />);
    expect(screen.getByRole('status').getAttribute('aria-label')).toBe('Loading');
  });
});

describe('help and feedback', () => {
  it('the help page answers the common questions and holds the feedback form', async () => {
    const { default: HelpPage } = await import('@/app/help/page');
    render(<HelpPage />);
    expect(screen.getByText('How do I sign in?')).toBeTruthy();
    expect(screen.getByLabelText('Tell us what you think')).toBeTruthy();
  });

  it('feedback is posted to the BFF and thanked', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const { default: HelpPage } = await import('@/app/help/page');
    render(<HelpPage />);
    fireEvent.change(screen.getByLabelText('Tell us what you think'), { target: { value: 'The map is great' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(screen.getByText('Thank you — your message arrived.')).toBeTruthy());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/bff/feedback');
    expect(JSON.parse(String(init.body))).toEqual({ message: 'The map is great', page: '/help' });
  });

  it('with no session it says to sign in — not a generic failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    const { default: HelpPage } = await import('@/app/help/page');
    render(<HelpPage />);
    fireEvent.change(screen.getByLabelText('Tell us what you think'), { target: { value: 'Hello there' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Sign in with Pi first'));
  });

  it('the feedback route labels the app server-side — a client cannot set it', () => {
    const route = join(process.cwd(), 'src/app/api/bff/feedback/route.ts');
    expect(existsSync(route)).toBe(true);
    expect(readFileSync(route, 'utf8')).toMatch(/\.\.\.parsed\.data, app: APP_SOURCE/);
  });
});
