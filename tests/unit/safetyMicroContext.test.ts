import { shouldUseSafetyMicroContext } from '../../src/utils/nuancedIntentRouter.js';
import { describe, expect, test } from 'vitest';

describe('shouldUseSafetyMicroContext', () => {
    test('"How genius of you. Next time remember nobody cares" uses safety micro-context', () => {
        const result = shouldUseSafetyMicroContext("How genius of you. Next time remember nobody cares");
        expect(result.useMicroContext).toBe(true);
    });

    test('"Classic you" uses safety micro-context', () => {
        const result = shouldUseSafetyMicroContext("Classic you");
        expect(result.useMicroContext).toBe(true);
    });

    test('"great job team" does not use safety micro-context', () => {
        const result = shouldUseSafetyMicroContext("great job team");
        expect(result.useMicroContext).toBe(false);
    });

    test('"nice shot" does not use safety micro-context', () => {
        const result = shouldUseSafetyMicroContext("nice shot");
        expect(result.useMicroContext).toBe(false);
    });

    test('obvious threat does not need micro-context', () => {
        const result = shouldUseSafetyMicroContext("kill you now");
        expect(result.useMicroContext).toBe(false);
    });

    test('obvious slur does not need micro-context', () => {
        const result = shouldUseSafetyMicroContext("you are a stupid bitch");
        expect(result.useMicroContext).toBe(false);
    });

    test('Short targeted evaluation gets micro-context', () => {
        const result = shouldUseSafetyMicroContext("you are an absolute genius", { hasMention: true });
        // Signals: Mentions (1), Direct addr (you) (1), Eval (genius) (1), Short+Target(1) -> 4 signals -> true
        expect(result.useMicroContext).toBe(true);
    });
});
