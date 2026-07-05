import { describe, it, expect } from 'vitest';
import { isAdvancedHeuristicSafe, containsHighRiskSignal } from '../../src/utils/moderationHelpers.js';

describe('Message Bypass Heuristics', () => {
  describe('containsHighRiskSignal', () => {
    it('should flag slurs', () => {
      expect(containsHighRiskSignal('omg u retard')).toBe(true);
      expect(containsHighRiskSignal('what a faggot')).toBe(true);
    });

    it('should flag violent threats', () => {
      expect(containsHighRiskSignal('i will kill you')).toBe(true);
      expect(containsHighRiskSignal('death to all')).toBe(true);
    });

    it('should flag sexual content', () => {
      expect(containsHighRiskSignal('send nudes')).toBe(true);
      expect(containsHighRiskSignal('im so horny')).toBe(true);
      expect(containsHighRiskSignal('check out this porn')).toBe(true);
    });

    it('should flag self harm', () => {
      expect(containsHighRiskSignal('i want to die')).toBe(true);
      expect(containsHighRiskSignal('gonna kill myself')).toBe(true);
    });

    it('should flag harassment', () => {
      expect(containsHighRiskSignal('kys')).toBe(true);
      expect(containsHighRiskSignal('go die plz')).toBe(true);
    });

    it('should flag mass mentions', () => {
      expect(containsHighRiskSignal('hello <@123> <@456> <@789> <@000> spam')).toBe(true);
      expect(containsHighRiskSignal('just one <@123> is fine')).toBe(false);
    });

    it('should flag excessive repeated characters', () => {
      expect(containsHighRiskSignal('looooooooool')).toBe(true); // 10 o's
      expect(containsHighRiskSignal('llllllleeeeeetttsss ggggoooo')).toBe(false);
    });

    it('should flag obfuscated profanity', () => {
      expect(containsHighRiskSignal('f u c k')).toBe(true);
      expect(containsHighRiskSignal('s_h_i_t')).toBe(true);
    });

    it('should flag suspicious URLs with extra text', () => {
      expect(containsHighRiskSignal('check this out https://spam.com/free')).toBe(true);
      expect(containsHighRiskSignal('https://link.com')).toBe(false); // only URL is fine for now
    });
  });

  describe('isAdvancedHeuristicSafe', () => {
    it('should bypass exact safe phrases', () => {
      expect(isAdvancedHeuristicSafe('hello everyone')).toBe(true);
      expect(isAdvancedHeuristicSafe('thanks bro')).toBe(true);
      expect(isAdvancedHeuristicSafe('lmao true')).toBe(true);
      expect(isAdvancedHeuristicSafe('one sec')).toBe(true);
      expect(isAdvancedHeuristicSafe('nice shot')).toBe(true);
      expect(isAdvancedHeuristicSafe('can someone help')).toBe(true);
    });

    it('should bypass normal short structural replies', () => {
      expect(isAdvancedHeuristicSafe('i think so')).toBe(true);
      expect(isAdvancedHeuristicSafe('sounds awesome to me')).toBe(true);
      expect(isAdvancedHeuristicSafe('that is crazy')).toBe(true);
      expect(isAdvancedHeuristicSafe('how do i')).toBe(true);
      expect(isAdvancedHeuristicSafe('me too')).toBe(true);
    });

    it('should NOT bypass safe phrases if they contain high risk signals', () => {
      expect(isAdvancedHeuristicSafe('thanks retard')).toBe(false); // 'thanks' is safe, but has slur
      expect(isAdvancedHeuristicSafe('lol kill yourself')).toBe(false); // 'lol' is safe, but harassment
      expect(isAdvancedHeuristicSafe('brb gonna suicide')).toBe(false); // 'brb' is safe, but self harm
      expect(isAdvancedHeuristicSafe('gg https://phishing.com/claim-nitro')).toBe(false); // 'gg' is safe, but has URL with extra text
    });

    it('should bypass URLs with no extra text', () => {
      expect(isAdvancedHeuristicSafe('https://google.com')).toBe(true);
    });

    it('should NOT bypass arbitrary sentences', () => {
      expect(isAdvancedHeuristicSafe('i really enjoy eating apples on a sunny day')).toBe(false);
      expect(isAdvancedHeuristicSafe('can anyone here tell me the time')).toBe(false);
    });
  });
});
