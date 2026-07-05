import { describe, it, expect, vi } from "vitest";
import { isSafeRegex, validateKeyword, keywordMatchesMessage } from "../../src/utils/keywordHelper";
import { logger } from "../../src/utils/logger";

describe("Keyword Regex Security Tests", () => {
  it("should fail validation for overly long regex", () => {
    const longPattern = "/a" + "a".repeat(101) + "/";
    const result = validateKeyword(longPattern);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("too long");
  });

  it("should fail validation for nested catastrophic patterns", () => {
    const badPattern1 = "/(a+)+/";
    const result1 = validateKeyword(badPattern1);
    expect(result1.valid).toBe(false);
    expect(result1.error).toContain("catastrophic");

    const badPattern2 = "/.*.*/";
    const result2 = validateKeyword(badPattern2);
    expect(result2.valid).toBe(false);
    expect(result2.error).toContain("catastrophic");
  });

  it("should pass validation for simple regex", () => {
    const goodPattern = "/discord\\.gg/";
    const result = validateKeyword(goodPattern);
    expect(result.valid).toBe(true);
  });

  it("should securely skip matching on oversized regex at runtime", () => {
    const longKeyword = "/a" + "a".repeat(101) + "/";
    
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    
    const match = keywordMatchesMessage("Some completely unrelated message", longKeyword);
    expect(match).toBeNull();
    
    expect(warnSpy).toHaveBeenCalled();
    const warnMsg = warnSpy.mock.calls[0][0] as string;
    expect(warnMsg).toContain("[Regex Error]");
    expect(warnMsg).not.toContain("Some completely unrelated message");
    
    warnSpy.mockRestore();
  });

  it("should securely skip matching on catastrophic regex at runtime", () => {
    const catastrophicKw = "/(a+)+/";
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    
    const match = keywordMatchesMessage("Some completely unrelated message", catastrophicKw);
    expect(match).toBeNull();
    
    expect(warnSpy).toHaveBeenCalled();
    const warnMsg = warnSpy.mock.calls[0][0] as string;
    expect(warnMsg).toContain("[Regex Error]");
    expect(warnMsg).not.toContain("Some completely unrelated message");
    
    warnSpy.mockRestore();
  });

  it("should skip invalid regex syntax without crashing", () => {
    const invalidKeyword = "/(?unterminated/";
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    
    const match = keywordMatchesMessage("valid content", invalidKeyword);
    expect(match).toBeNull();
    
    expect(warnSpy).toHaveBeenCalled();
    const warnMsg = warnSpy.mock.calls[0][0] as string;
    expect(warnMsg).toContain("[Regex Error]");
    expect(warnMsg).not.toContain("valid content");
    
    warnSpy.mockRestore();
  });
});
