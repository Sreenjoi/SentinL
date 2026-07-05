import { describe, it, expect } from "vitest";

// This simulates the parseGroqJSON function inside discordBot.ts
function parseGroqJSON(rawText: string) {
  let cleanText = rawText || "{}";
  
  // Try to parse the text simply first:
  try {
    const directObj = JSON.parse(cleanText);
    if (directObj && Array.isArray(directObj.results)) {
      return directObj.results;
    }
    if (Array.isArray(directObj)) {
      return directObj;
    }
  } catch (e) {}

  // Fallback: extract object
  const startObject = cleanText.indexOf("{");
  const endObject = cleanText.lastIndexOf("}");
  if (startObject !== -1 && endObject !== -1 && endObject >= startObject) {
     try {
       const obj = JSON.parse(cleanText.substring(startObject, endObject + 1));
       if (obj && Array.isArray(obj.results)) {
          return obj.results;
       }
     } catch(e) {}
  }

  // Fallback: extract array (old behavior)
  const startArray = cleanText.indexOf("[");
  const endArray = cleanText.lastIndexOf("]");
  
  if (startArray !== -1 && endArray !== -1 && endArray >= startArray) {
     try {
       return JSON.parse(cleanText.substring(startArray, endArray + 1));
     } catch(e) {}
  }

  // Final fallback: single object extraction if it didn't have 'results' array
  if (startObject !== -1 && endObject !== -1 && endObject >= startObject) {
    try {
       const singleObj = JSON.parse(cleanText.substring(startObject, endObject + 1));
       if (!singleObj.results) {
         return [singleObj];
       }
    } catch(e) {}
  }
  throw new Error("No JSON object found in response");
}

describe("parseGroqJSON (Unit Test)", () => {
  it("should parse valid { results: [] } object", () => {
    const raw = '{"results": [{"level": "Safe", "confidence": 100}]}';
    const result = parseGroqJSON(raw);
    expect(result[0].level).toBe("Safe");
    expect(result[0].confidence).toBe(100);
  });

  it("should extract { results: [] } from markdown text", () => {
    const raw = '```json\n{"results": [{"level": "Spam", "confidence": 95}]}\n```';
    const result = parseGroqJSON(raw);
    expect(result[0].level).toBe("Spam");
  });

  it("should parse old raw array format", () => {
    const raw = '[{"level": "Inappropriate", "confidence": 80}]';
    const result = parseGroqJSON(raw);
    expect(result[0].level).toBe("Inappropriate");
  });

  it("should extract array from markdown text", () => {
    const raw = 'Some preamble\n```json\n[{"level": "Extreme", "confidence": 99}]\n```';
    const result = parseGroqJSON(raw);
    expect(result[0].level).toBe("Extreme");
  });

  it("should parse a fallback standalone object and wrap it in an array", () => {
    const raw = '{"level": "Safe", "confidence": 85}';
    const result = parseGroqJSON(raw);
    expect(result[0].level).toBe("Safe");
  });

  it("should throw an error for malformed text with no JSON", () => {
    const raw = 'I am sorry, I cannot fulfill this request.';
    expect(() => parseGroqJSON(raw)).toThrow("No JSON object found in response");
  });

  it("should throw an error for partial unparseable JSON", () => {
    const raw = '{"results": [{"level": "Safe", "confidence": 100'; // Missing closing brackets
    expect(() => parseGroqJSON(raw)).toThrow("No JSON object found in response");
  });
});

