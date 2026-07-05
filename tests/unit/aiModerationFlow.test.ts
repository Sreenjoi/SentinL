import { describe, it, expect } from 'vitest';
import { shouldRunFullPass, shouldIncludeContext, shouldEscalateTo70B } from '../../src/utils/moderationHelpers.js';

describe('AI Moderation Staged Flow Logic', () => {
  describe('Fast Pass (shouldRunFullPass)', () => {
    it('should stop (return false) for safe messages with high confidence', () => {
      const results = [{ flag: false, confidence: 95 }];
      expect(shouldRunFullPass(results, 75)).toBe(false);
    });

    it('should proceed to full pass if flagged', () => {
      const results = [{ flag: true, confidence: 95 }];
      expect(shouldRunFullPass(results, 75)).toBe(true);
    });

    it('should proceed to full pass if safe but low confidence', () => {
      const results = [{ flag: false, confidence: 50 }]; // below 75 threshold
      expect(shouldRunFullPass(results, 75)).toBe(true);
    });

    it('should proceed to full pass if any message in the batch requires it', () => {
      const results = [
        { flag: false, confidence: 90 },
        { flag: false, confidence: 60 } // triggers full pass
      ];
      expect(shouldRunFullPass(results, 75)).toBe(true);
    });
  });

  describe('Context Inclusion (shouldIncludeContext)', () => {
    it('should include context only if paid and enabled', () => {
      expect(shouldIncludeContext(true, true)).toBe(true);
    });

    it('should NOT include context if free server', () => {
      // isPremium is mapped to any paid plan
      expect(shouldIncludeContext(false, true)).toBe(false);
    });

    it('should NOT include context if turned off by admin', () => {
      expect(shouldIncludeContext(true, false)).toBe(false);
    });
  });

  describe('Dual Model Escalation (shouldEscalateTo70B)', () => {
    it('should escalate if paid, enabled, and full pass confidence is low', () => {
      const results = [{ flag: false, confidence: 60 }];
      expect(shouldEscalateTo70B(true, true, results, 75)).toBe(true);
    });
    
    it('should NOT escalate if confidence is high enough', () => {
      const results = [{ flag: false, confidence: 80 }];
      expect(shouldEscalateTo70B(true, true, results, 75)).toBe(false);
    });

    it('should NOT escalate if free server', () => {
      const results = [{ flag: false, confidence: 60 }];
      expect(shouldEscalateTo70B(false, true, results, 75)).toBe(false);
    });

    it('should NOT escalate if Dual Model is disabled by admin', () => {
      const results = [{ flag: false, confidence: 60 }];
      expect(shouldEscalateTo70B(true, false, results, 75)).toBe(false);
    });
    
    it('should escalate if ANY full pass result has low confidence', () => {
      const results = [
        { flag: false, confidence: 90 },
        { flag: true, confidence: 65 } // triggers escalation
      ];
      expect(shouldEscalateTo70B(true, true, results, 75)).toBe(true);
    });
  });
});
