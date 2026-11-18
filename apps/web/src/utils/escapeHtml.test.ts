import { describe, expect, it } from 'vitest';
import { escapeHtml } from './escapeHtml';

describe('escapeHtml', () => {
  it('neutralises markup in untrusted record fields such as SSIDs', () => {
    const out = escapeHtml('<img src=x onerror="alert(1)">&\'');
    expect(out).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;');
    expect(out).not.toMatch(/[<>"]/);
  });
  it('handles null/undefined/numbers', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(-67)).toBe('-67');
  });
});
