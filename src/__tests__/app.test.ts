import { describe, it, expect } from 'vitest';

describe('Template Health', () => {
  it('environment is configured', () => {
    expect(process.env.NODE_ENV).toBeDefined();
  });

  it('gateway URL has fallback', () => {
    const url =
      process.env.NEXT_PUBLIC_API_GATEWAY_URL ??
      'https://api-gateway-production-6a68.up.railway.app';
    expect(url).toContain('http');
  });
});
