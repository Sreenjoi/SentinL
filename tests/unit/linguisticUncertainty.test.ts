import { describe, it, expect } from 'vitest';
import { shouldForceFullPassForLinguisticUncertainty } from '../../src/utils/linguisticUncertainty';

describe('shouldForceFullPassForLinguisticUncertainty', () => {
    it('should bypass clearly harmless allowlisted messages', () => {
        expect(shouldForceFullPassForLinguisticUncertainty('gg').forceFullPass).toBe(false);
        expect(shouldForceFullPassForLinguisticUncertainty('gg bro').forceFullPass).toBe(false);
        expect(shouldForceFullPassForLinguisticUncertainty('lol yeah').forceFullPass).toBe(false);
        expect(shouldForceFullPassForLinguisticUncertainty('thanks bro').forceFullPass).toBe(false);
        expect(shouldForceFullPassForLinguisticUncertainty('nice shot').forceFullPass).toBe(false);
        expect(shouldForceFullPassForLinguisticUncertainty('good game').forceFullPass).toBe(false);
        expect(shouldForceFullPassForLinguisticUncertainty('brb').forceFullPass).toBe(false);
        expect(shouldForceFullPassForLinguisticUncertainty('one sec').forceFullPass).toBe(false);
        expect(shouldForceFullPassForLinguisticUncertainty('same here').forceFullPass).toBe(false);
        expect(shouldForceFullPassForLinguisticUncertainty('fair enough').forceFullPass).toBe(false);
        expect(shouldForceFullPassForLinguisticUncertainty('can someone help').forceFullPass).toBe(false);
        expect(shouldForceFullPassForLinguisticUncertainty('where is this').forceFullPass).toBe(false);
    });

    it('should force full pass for transliterated or slang abuse (uncertain)', () => {
        expect(shouldForceFullPassForLinguisticUncertainty('sup kutta').forceFullPass).toBe(true);
        expect(shouldForceFullPassForLinguisticUncertainty('yo madre').forceFullPass).toBe(true);
        expect(shouldForceFullPassForLinguisticUncertainty('hey bkl').forceFullPass).toBe(true);
        expect(shouldForceFullPassForLinguisticUncertainty('u chutiya').forceFullPass).toBe(true);
        expect(shouldForceFullPassForLinguisticUncertainty('hola puta').forceFullPass).toBe(true);
        expect(shouldForceFullPassForLinguisticUncertainty('ya kalb').forceFullPass).toBe(true);
        expect(shouldForceFullPassForLinguisticUncertainty('oi bokachoda').forceFullPass).toBe(true);
        expect(shouldForceFullPassForLinguisticUncertainty('you bakchod').forceFullPass).toBe(true);
        expect(shouldForceFullPassForLinguisticUncertainty('vai choda').forceFullPass).toBe(true);
        expect(shouldForceFullPassForLinguisticUncertainty('madar chod').forceFullPass).toBe(true);
        expect(shouldForceFullPassForLinguisticUncertainty('bhos di ke').forceFullPass).toBe(true);
        expect(shouldForceFullPassForLinguisticUncertainty('kurwa you').forceFullPass).toBe(true);
        expect(shouldForceFullPassForLinguisticUncertainty('putang ina').forceFullPass).toBe(true);
        expect(shouldForceFullPassForLinguisticUncertainty('anjing lu').forceFullPass).toBe(true);
        expect(shouldForceFullPassForLinguisticUncertainty('gago ka').forceFullPass).toBe(true);
    });

    it('should force full pass for obfuscated uncertain words', () => {
        // obfuscated with spaces might not trigger direct address easily unless it's known, but should trigger obfuscation logic
        expect(shouldForceFullPassForLinguisticUncertainty('k u t t a').forceFullPass).toBe(true);
        expect(shouldForceFullPassForLinguisticUncertainty('kutt4').forceFullPass).toBe(true);
    });

    it('should handle false triggers correctly', () => {
        expect(shouldForceFullPassForLinguisticUncertainty('i love you').forceFullPass).toBe(false);
        expect(shouldForceFullPassForLinguisticUncertainty('you are cool').forceFullPass).toBe(false); // 'you are' -> direct address is fine if rest is fine. 'cool' not in allowlist though. Is score >= 2?
        // 'you' is direct address. 'are' in allowlist. 'cool' (4 letters) not in allowlist.
        // cleanToken = cool, not in allowlist, length 4+. hasUnknownAlphabeticToken = true.
        // hasDirectAddress = you is trigger, next is are. are is in allowlist, direct address still true? Wait, "you are" is common. Let's see if we over-trigger.
    });
});
