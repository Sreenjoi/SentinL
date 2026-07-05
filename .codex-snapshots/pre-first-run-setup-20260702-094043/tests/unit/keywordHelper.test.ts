import { describe, it, expect } from 'vitest';
import { validateKeyword, keywordMatchesMessage, escapeRegExp, isExplicitRegex, formatKeywordFallbackReason, sanitizeFallbackKeyword } from '../../src/utils/keywordHelper';

describe('Keyword Helper', () => {
  describe('formatKeywordFallbackReason', () => {
    it('proves the reason includes the real matched keyword and not the literal text ${matchedWord}', () => {
      const result = formatKeywordFallbackReason('badword');
      expect(result).toBe('Keyword match fallback triggered: badword');
      expect(result).not.toContain('${matchedWord}');
    });

    it('sanitizes mass mentions from the matched word', () => {
      const result = formatKeywordFallbackReason('@everyone and @here are bad');
      expect(result).toBe('Keyword match fallback triggered: @\u200beveryone and @\u200bhere are bad');
    });

    it('removes raw markdown injection characters', () => {
      const result = formatKeywordFallbackReason('some `code` and *bold* or ~strike~ or _italic_ and >quote or #heading or |spoiler|');
      expect(result).toBe('Keyword match fallback triggered: some code and bold or strike or italic and quote or heading or spoiler');
    });

    it('truncates the keyword to a maximum of 80 characters', () => {
      const longKeyword = 'a'.repeat(100);
      const result = formatKeywordFallbackReason(longKeyword);
      expect(result).toBe('Keyword match fallback triggered: ' + 'a'.repeat(80));
    });
  });

  it('identifies explicit regex', () => {
    expect(isExplicitRegex('/test/')).toBe(true);
    expect(isExplicitRegex('/a/')).toBe(true);
    expect(isExplicitRegex('//')).toBe(false);
    expect(isExplicitRegex('test')).toBe(false);
    expect(isExplicitRegex('/test')).toBe(false);
    expect(isExplicitRegex('test/')).toBe(false);
  });

  it('validates and normalizes literal keywords', () => {
    const res = validateKeyword('  BaD.sIte  ');
    expect(res.valid).toBe(true);
    expect(res.normalized).toBe('bad.site');
  });

  it('validates explicit regex', () => {
    const res = validateKeyword(' /[a-z]+/ ');
    expect(res.valid).toBe(true);
    expect(res.normalized).toBe('/[a-z]+/');
  });

  it('rejects long explicit regex', () => {
    const longRegex = '/' + 'a'.repeat(100) + '/';
    const res = validateKeyword(longRegex);
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/too long/);
  });

  it('rejects invalid regex patterns', () => {
    const res = validateKeyword('/[a-z/');
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/Invalid regex/);
  });
  
  it('blocks catastrophic nested quantifiers', () => {
    expect(validateKeyword('/(a+)+/').valid).toBe(false);
    expect(validateKeyword('/(.*)+/').valid).toBe(false);
    expect(validateKeyword('/([a-z]+)+/').valid).toBe(false);
    expect(validateKeyword('/(?:.*){2,}/').valid).toBe(false);

    expect(keywordMatchesMessage('hello', '/(a+)+/')).toBeNull();
  });

  it('allows safe regex patterns', () => {
    expect(validateKeyword('/[0-9]{3}/').valid).toBe(true);
    expect(validateKeyword('/[a-z]+/').valid).toBe(true);
    expect(validateKeyword('/b[A-Z]d/').valid).toBe(true);

    expect(keywordMatchesMessage('123', '/[0-9]{3}/')).toBe('/[0-9]{3}/');
  });

  it('matches literal keywords correctly', () => {
    expect(keywordMatchesMessage('hello bad.site world', 'bad.site')).toBe('bad.site');
    expect(keywordMatchesMessage('HELLO BAD.SITE WORLD', 'bad.site')).toBe('bad.site');
    expect(keywordMatchesMessage('something else', 'bad.site')).toBeNull();
  });

  it('matches literal keywords with special regex characters safely', () => {
    // A regex like this would error if passed directly to new RegExp, 
    // or behave unexpectedly if not escaped.
    const keywordWithSpecialChars = '*** hello (world) [test] + ? .';
    
    expect(keywordMatchesMessage('i say *** hello (world) [test] + ? . today', keywordWithSpecialChars)).toBe(keywordWithSpecialChars);
  });

  it('matches valid regex', () => {
    expect(keywordMatchesMessage('hello 123 world', '/[0-9]+/')).toBe('/[0-9]+/');
    expect(keywordMatchesMessage('hello world', '/[0-9]+/')).toBeNull();
  });

  it('does not crash on malformed regex in execution', () => {
    expect(keywordMatchesMessage('test', '/[a-z/')).toBeNull();
  });
});
