import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { isAdvancedHeuristicSafe } from '../../src/utils/moderationHelpers.js';

describe('Trivial Filter Words & Advanced Heuristics', () => {
    it('should bypass these exact phrases', () => {
        const wordsPath = path.resolve(process.cwd(), "src/trivialFilterWords.json");
        const trivialWords = JSON.parse(fs.readFileSync(wordsPath, "utf8"));
        
        const requiredWords = [
            "yo", "hiya", "heya", "good morning", "good night", "morning", "night",
            "afk", "bbl", "back", "here", "done", "ready", "got it", "gotcha",
            "alright", "okay", "okie", "okey", "sure thing", "sounds good", "all good",
            "no worries", "thank you", "tysm", "tyvm", "much appreciated", "welcome",
            "youre welcome", "you're welcome", "gg wp", "glhf", "wp", "brb soon",
            "one sec", "one second", "sec", "wait", "coming", "omw", "on my way",
            "see ya", "see you", "see you later", "later", "take care"
        ];
        
        for (const word of requiredWords) {
            expect(trivialWords).toContain(word.toLowerCase());
        }
    });

    it('should NOT bypass abusive mixed phrases via trivial words', () => {
        const wordsPath = path.resolve(process.cwd(), "src/trivialFilterWords.json");
        const trivialWords = JSON.parse(fs.readFileSync(wordsPath, "utf8"));

        const abusiveMixed = [
            "thanks idiot",
            "lol kys",
            "gg trash",
            "ok buddy",
            "nice one loser",
            "wp retard"
        ];
        
        for (const phrase of abusiveMixed) {
            expect(trivialWords).not.toContain(phrase.toLowerCase());
        }
    });

    it('should NOT bypass abusive mixed phrases via Advanced Heuristic', () => {
        const abusiveMixed = [
            "thanks idiot",
            "lol kys",
            "gg trash",
            "ok buddy",
            "nice one loser",
            "wp retard",
            "that is cool you piece of shit",
            "that is good kys"
        ];
        for (const phrase of abusiveMixed) {
            expect(isAdvancedHeuristicSafe(phrase)).toBe(false);
        }
    });

    it('should NOT bypass sarcasm-prone single words exactly', () => {
        const wordsPath = path.resolve(process.cwd(), "src/trivialFilterWords.json");
        const trivialWords = JSON.parse(fs.readFileSync(wordsPath, "utf8"));
        
        const removedAmbiguousWords = ["wow", "idc", "nice", "cool", "good", "what", "why", "how"];
        
        for (const word of removedAmbiguousWords) {
            expect(trivialWords).not.toContain(word);
            // also verify that advanced heuristic alone doesn't blindly bypass them as single words
            expect(isAdvancedHeuristicSafe(word)).toBe(false);
        }
    });
});
