import { describe, it, expect } from 'vitest';
import { shouldForceFullPassForCustomRules } from '../../src/utils/customRuleRouter.js';

describe('Custom Rules Full Pass Routing', () => {
    it('triggers full pass for exact matched keyword logic', () => {
        expect(shouldForceFullPassForCustomRules("I love trading", "", ["trading"])).toBe(true);
        expect(shouldForceFullPassForCustomRules("I love apples", "", ["apples"])).toBe(true);
        expect(shouldForceFullPassForCustomRules("I love trading", "", ["apples"])).toBe(false);
    });

    it('triggers full pass for common custom rules phrases safely', () => {
        const testCases = [
            { text: "did you see the new tax politics", rules: "Remember no politics allowed", expected: true },
            { text: "trading my sword for gold", rules: "No trading in general", expected: true },
            { text: "massive spoilers ahead for the movie", rules: "ban on spoilers", expected: true },
            { text: "I like to only speak hindi", rules: "This is an english only server", expected: true },
            { text: "check out my promotion on twitch.tv", rules: "no self-promo allowed", expected: true },
            { text: "here is a link http://example.com for you", rules: "do not post URLs", expected: true },
        ];

        for (const tc of testCases) {
            expect(shouldForceFullPassForCustomRules(tc.text, tc.rules, [])).toBe(tc.expected);
        }
    });

    it('does not trigger on generic words inappropriately', () => {
        // Even if rules mention respect, server, message, etc.
        const rules = "Please respect everyone in the server message history";
        const text = "I respect your server message";
        // no keywords provided, and "respect", "server" are not in customRulePhrases
        expect(shouldForceFullPassForCustomRules(text, rules, [])).toBe(false);
    });

    it('does not trigger on genuine respect phrases', () => {
        const rules = "Please respect everyone and their opinions";
        expect(shouldForceFullPassForCustomRules("I respect your opinion", rules, [])).toBe(false);
        expect(shouldForceFullPassForCustomRules("thanks for respecting the rules", rules, [])).toBe(false);
        expect(shouldForceFullPassForCustomRules("please respect everyone", rules, [])).toBe(false);
    });

    it('triggers full pass on complex targeted passive aggression requiring structural hostility', () => {
        const rules = "Respect everyone, no sarcasm";
        // contains targeting + rule hit + mock polite/condescending -> struct hostility
        expect(shouldForceFullPassForCustomRules("bless your heart but you are completely clueless", rules, [])).toBe(true);
        expect(shouldForceFullPassForCustomRules("you must be an absolute genius to think that works", rules, [])).toBe(true);
    });

});
