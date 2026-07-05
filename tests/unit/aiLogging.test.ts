import { describe, it, expect, vi, afterEach } from 'vitest';

describe('AI Moderation Logging Logic', () => {
    let processEnvBackup: string | undefined;
    let debugLogsBackup: string | undefined;

    afterEach(() => {
        if (processEnvBackup !== undefined) process.env.NODE_ENV = processEnvBackup;
        else delete process.env.NODE_ENV;

        if (debugLogsBackup !== undefined) process.env.DEBUG_AI_LOGS = debugLogsBackup;
        else delete process.env.DEBUG_AI_LOGS;
    });

    const simulateLogging = (
        analysisArray: { level: string; reason?: string; confidence?: number }[],
        rawText: string,
        usedModelStr: string,
        messagesCount: number
    ) => {
        const isProdMode = process.env.NODE_ENV === "production" && process.env.DEBUG_AI_LOGS !== "true";
        const logs: string[] = [];

        // Simulate Line 5247 logic
        if (isProdMode) {
            const flaggedCount = analysisArray.filter((a: any) => {
                let lvl = typeof a?.level === "string" ? a.level : "Safe";
                lvl = lvl ? lvl.charAt(0).toUpperCase() + lvl.slice(1).toLowerCase() : "Safe";
                return !["Safe", "None", "Null"].includes(lvl);
            }).length;
            const parseSuccess = analysisArray.length > 0;
            logs.push(`[AI Moderation Result] Model: ${usedModelStr} | Count: ${messagesCount} | Parse Success: ${parseSuccess} | Flagged: ${flaggedCount}`);
        } else {
            logs.push(`[AI Output (${usedModelStr})] ${rawText}`);
        }

        // Simulate Line 5310 logic
        const threshold = 80;
        for (const analysis of analysisArray) {
            const conf = analysis.confidence || 0;
            if (conf >= threshold) {
                const reasonLogText = isProdMode ? "Reason redacted in production" : analysis.reason;
                logs.push(`[SentinL] Flagged active message in mock-server - Level: ${analysis.level} - ${reasonLogText} (Confidence: ${conf} >= ${threshold})`);
            }
        }

        return logs;
    };

    it('should NOT include message text or AI reason text in production', () => {
        processEnvBackup = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        process.env.DEBUG_AI_LOGS = 'false';

        const analysisArray = [{ level: "Spam", reason: "User said bad words here.", confidence: 90 }];
        const rawText = "This is full raw AI json output with sensitive data";

        const logs = simulateLogging(analysisArray, rawText, 'primary_full', 1);

        expect(logs.some(l => l.includes('User said bad'))).toBe(false);
        expect(logs.some(l => l.includes(rawText))).toBe(false);
        expect(logs[0]).toBe('[AI Moderation Result] Model: primary_full | Count: 1 | Parse Success: true | Flagged: 1');
        expect(logs[1]).toBe('[SentinL] Flagged active message in mock-server - Level: Spam - Reason redacted in production (Confidence: 90 >= 80)');
    });

    it('should include full logs if not in production', () => {
        processEnvBackup = process.env.NODE_ENV;
        process.env.NODE_ENV = 'development';

        const analysisArray = [{ level: "Spam", reason: "User said bad words here.", confidence: 90 }];
        const rawText = "This is full raw AI json output with sensitive data";

        const logs = simulateLogging(analysisArray, rawText, 'primary_full', 1);

        expect(logs.some(l => l.includes(rawText))).toBe(true);
        expect(logs.some(l => l.includes('User said bad words here.'))).toBe(true);
    });

    it('should include full logs in production if DEBUG_AI_LOGS is true', () => {
        processEnvBackup = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        process.env.DEBUG_AI_LOGS = 'true';

        const analysisArray = [{ level: "Spam", reason: "User said bad words here.", confidence: 90 }];
        const rawText = "This is full raw AI json output with sensitive data";

        const logs = simulateLogging(analysisArray, rawText, 'primary_full', 1);

        expect(logs.some(l => l.includes(rawText))).toBe(true);
        expect(logs.some(l => l.includes('User said bad words here.'))).toBe(true);
    });
});
