import { describe, it, expect, vi } from 'vitest';
import { buildFrameAncestors, parseAppOrigin } from '../../src/utils/cspHelper';
import { logger } from '../../src/utils/logger.js';

describe('parseAppOrigin Helper', () => {
  it('handles APP_URL with no protocol', () => {
    expect(parseAppOrigin("sentinl.app")).toBe("https://sentinl.app");
  });

  it('handles APP_URL with trailing slash', () => {
    expect(parseAppOrigin("https://sentinl.app/")).toBe("https://sentinl.app");
  });

  it('handles APP_URL with path', () => {
    expect(parseAppOrigin("https://sentinl.app/some/path")).toBe("https://sentinl.app");
  });

  it('returns null and warns on invalid APP_URL', () => {
    const loggerWarnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    expect(parseAppOrigin("http://[::1]:80:80")).toBe(null);
    expect(loggerWarnSpy).toHaveBeenCalledWith("[Startup] WARNING: Invalid APP_URL provided: http://[::1]:80:80");
    loggerWarnSpy.mockRestore();
  });
});

describe('CSP Helper', () => {
  it('includes AI Studio defaults when appUrl and env flag are missing', () => {
    const result = buildFrameAncestors(undefined, undefined);
    expect(result).toEqual([
      "'self'",
      "https://aistudio.google.com",
      "https://*.aistudio.google.com",
      "https://*.googleusercontent.com",
      "https://ai.google.dev",
      "https://ai.studio",
      "https://*.ai.studio"
    ]);
  });

  it('includes appUrl origin when valid alongside AI studio defaults', () => {
    const result = buildFrameAncestors("https://example.com/app", undefined);
    expect(result).toEqual([
      "'self'", 
      "https://example.com",
      "https://aistudio.google.com",
      "https://*.aistudio.google.com",
      "https://*.googleusercontent.com",
      "https://ai.google.dev",
      "https://ai.studio",
      "https://*.ai.studio"
    ]);
  });

  it('adds https:// scheme if missing in appUrl', () => {
    const result = buildFrameAncestors("example.com", undefined);
    expect(result).toEqual([
      "'self'", 
      "https://example.com",
      "https://aistudio.google.com",
      "https://*.aistudio.google.com",
      "https://*.googleusercontent.com",
      "https://ai.google.dev",
      "https://ai.studio",
      "https://*.ai.studio"
    ]);
  });

  it('does not crash and warns if APP_URL is invalid', () => {
    const loggerWarnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    
    // An absolutely invalid URL pattern
    const result = buildFrameAncestors("http://[::1]:80:80", undefined);
    
    expect(loggerWarnSpy).toHaveBeenCalledWith("[Startup] WARNING: Invalid APP_URL provided: http://[::1]:80:80");
    expect(result).toEqual([
      "'self'",
      "https://aistudio.google.com",
      "https://*.aistudio.google.com",
      "https://*.googleusercontent.com",
      "https://ai.google.dev",
      "https://ai.studio",
      "https://*.ai.studio"
    ]);
    
    loggerWarnSpy.mockRestore();
  });

  it('includes AI Studio frames correctly', () => {
    const result = buildFrameAncestors(undefined, "true");
    expect(result).toContain("https://aistudio.google.com");
    expect(result).toContain("https://*.aistudio.google.com");
    expect(result).toContain("https://*.googleusercontent.com");
    expect(result).toContain("https://ai.google.dev");
    expect(result).toContain("https://ai.studio");
    expect(result.length).toBe(7); // 'self' + 6 AI studio domains
  });

  it('does not include AI Studio frames when flag is explicitly false', () => {
    const result = buildFrameAncestors(undefined, "false");
    expect(result).not.toContain("https://aistudio.google.com");
    expect(result.length).toBe(1);
  });

  it('never contains wildcard "*"', () => {
    const result1 = buildFrameAncestors("https://example.com", "true");
    const result2 = buildFrameAncestors(undefined, undefined);
    expect(result1).not.toContain("*");
    expect(result2).not.toContain("*");
  });
});
