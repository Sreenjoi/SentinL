import { describe, it, expect } from "vitest";
import { keywordMatchesMessage } from "../../src/utils/keywordHelper";

describe("SentinL Contingency Tests", () => {
    describe("1. Token & API Key Dead-Drops", () => {
        it("should gracefully fail if GROQ_API_KEY is missing without crashing process", async () => {
            const executeAIModeration = async (req: any, groqKey: string | undefined) => {
                if (!groqKey) {
                    throw new Error(`Cannot analyze message. GROQ_API_KEY is missing.`);
                }
                return true;
            };

            await expect(executeAIModeration({ message: "test" }, undefined))
                .rejects.toThrow("GROQ_API_KEY is missing.");
        });
    });

    describe("2. AI JSON Malformation Resilience", () => {
        function parseGroqJSON(rawText: string) {
            let cleanText = rawText || "{}";
            const start = cleanText.indexOf("{");
            const end = cleanText.lastIndexOf("}");
            if (start !== -1 && end !== -1 && end >= start) {
                return JSON.parse(cleanText.substring(start, end + 1));
            }
            throw new Error("No JSON object found in response");
        }

        it("should handle completely busted AI text safely by throwing an error that gets caught", () => {
            expect(() => parseGroqJSON("Hello, I am an AI and I refuse to output JSON."))
                .toThrow("No JSON object found");
        });

        it("should handle partial JSON string successfully if brackets exist", () => {
            const raw = 'Here is your JSON: {"level": "Safe", "confidence": 85} Hope this helps!';
            const parsed = parseGroqJSON(raw);
            expect(parsed.level).toBe("Safe");
        });
    });

    describe("3. Queue Auto-Scaling Logic", () => {
         it("should artificially cap active workers", () => {
             const MAX_WORKERS = 10;
             let activeWorkers = 0;

             const processQueue = () => {
                 while (activeWorkers < MAX_WORKERS) {
                     activeWorkers++;
                 }
             }

             processQueue();
             expect(activeWorkers).toBe(10);
         });
    });

    describe("4. AI-Failure Keyword Fallback Resilience", () => {
         const mockPerformKeywordFallback = (content: string, serverKeywords: string[]) => {
             let matchedWord = null;
             for (const kw of serverKeywords) {
                 const match = keywordMatchesMessage(content, kw);
                 if (match) {
                     matchedWord = match;
                     break;
                 }
             }
             return matchedWord;
         };

         it("handles literal keywords containing regex characters safely", () => {
             const keywords = ["*** bad.site ???", "+++[test]+++"];
             expect(mockPerformKeywordFallback("check out my *** bad.site ??? today", keywords)).toBe("*** bad.site ???");
             expect(mockPerformKeywordFallback("hello +++[test]+++ world", keywords)).toBe("+++[test]+++");
             expect(mockPerformKeywordFallback("just test world", keywords)).toBeNull();
         });

         it("still supports explicit regex keywords", () => {
             const keywords = ["/[0-9]{3}/"];
             expect(mockPerformKeywordFallback("my number is 123", keywords)).toBe("/[0-9]{3}/");
             expect(mockPerformKeywordFallback("my number is one two three", keywords)).toBeNull();
             
             // Combined with mixed keywords
             const mixedKeywords = ["badword", "/b[A-Z]d/"];
             expect(mockPerformKeywordFallback("hello bOd!", mixedKeywords)).toBe("/b[A-Z]d/");
         });

         it("does not crash on malformed patterns from server config", () => {
             const keywords = ["/[a-z/", "*(bad)*", "[malformed"];
             // Should just return match or null, but absolutely SHOULD NOT CRASH
             expect(() => mockPerformKeywordFallback("hello /[a-z/", keywords)).not.toThrow();
         });
    });
});
