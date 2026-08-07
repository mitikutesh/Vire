import { describe, expect, it } from 'vitest';
import { isAllowed, parseAllowlist } from './allowlist';

describe('parseAllowlist', () => {
  it('accepts a comma-separated list', () => {
    expect(parseAllowlist('a@example.com,b@example.com')).toEqual([
      'a@example.com',
      'b@example.com',
    ]);
  });

  it('tolerates whitespace and mixed case', () => {
    expect(parseAllowlist('  A@Example.com ,\n b@example.com  ')).toEqual([
      'a@example.com',
      'b@example.com',
    ]);
  });

  it('treats missing configuration as an empty list', () => {
    expect(parseAllowlist(undefined)).toEqual([]);
    expect(parseAllowlist('')).toEqual([]);
    expect(parseAllowlist('   ')).toEqual([]);
  });
});

describe('isAllowed', () => {
  const allowlist = parseAllowlist('owner@example.com, partner@example.com');

  it('admits a listed address', () => {
    expect(isAllowed('owner@example.com', allowlist)).toBe(true);
    expect(isAllowed('partner@example.com', allowlist)).toBe(true);
  });

  it('ignores case and surrounding whitespace', () => {
    expect(isAllowed('  Owner@Example.COM ', allowlist)).toBe(true);
  });

  it('refuses anyone else', () => {
    expect(isAllowed('stranger@example.com', allowlist)).toBe(false);
    expect(isAllowed('', allowlist)).toBe(false);
  });

  it('fails closed when the allowlist is missing', () => {
    // The important case: a misconfigured secret must not turn into an open
    // registration endpoint attached to a paid AI key.
    expect(isAllowed('owner@example.com', [])).toBe(false);
    expect(isAllowed('anyone@anywhere.com', parseAllowlist(undefined))).toBe(false);
  });

  it('supports a whole-domain entry', () => {
    const domain = parseAllowlist('@vire.example');
    expect(isAllowed('anyone@vire.example', domain)).toBe(true);
    expect(isAllowed('anyone@elsewhere.example', domain)).toBe(false);
  });

  it('does not let a lookalike domain through a domain entry', () => {
    const domain = parseAllowlist('@vire.example');
    expect(isAllowed('attacker@notvire.example', domain)).toBe(false);
  });

  it('does not match a partial address', () => {
    expect(isAllowed('owner@example.com.attacker.net', allowlist)).toBe(false);
    expect(isAllowed('notowner@example.com', allowlist)).toBe(false);
  });
});
