import fs from 'fs';
import path from 'path';

async function test() {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
     console.log("No groq key in env");
     return;
  }
  const prompt = `You are SentinL, an AI moderator for a Discord server. 
Server rules:
1. No slurs or profanity.

Recent channel conversation (oldest to newest):
No context

CRITICAL MODERATION & LANGUAGE LOGIC:
1. Universal Language Detection: First, identify the language or languages used in the message. The message could be in English, Portuguese, Spanish, Russian, Hindi, or ANY other language. Assume the user can speak any language.
2. Cross-Language Profanity/Slur Detection: If the text contains profanity, slurs, harassment, or offensive terms in ANY language (e.g., words like "filho da puta" in Portuguese, "puta" in Spanish, "cyka" in Russian, etc.), you MUST flag it based on the severity of the word in its native language.
3. Transliteration Check: Identify if words from one language are written using another language's alphabet (e.g., Hindi or Bengali words transliterated into English/Latin characters, like "bhenchod"). Flag these appropriately if they are slurs in their original language.
4. Context & False Positives: Ensure you do not confuse regular harmless words in one language with slurs in another. Base your judgment strictly on the intended context and the actual original language of the text.

New message from User:
Tas de merde

Analyze the new message against the rules. You must output a raw, valid JSON object matching this exact schema:

{
  "detected_language": "identify the language of the text",
  "transliteration_check": "explain if slurs from one language are in another script",
  "actual_meaning": "determine the real meaning",
  "rule_violation": "does it violate rules?",
  "level": "Safe | Extreme | Inappropriate | Moderate | Spam", 
  "confidence": 95,
  "reason": "short explanation in English"
}

Respond ONLY with the JSON object. Do not add any conversational text.`;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
          "Authorization": `Bearer ${groqKey}`,
          "Content-Type": "application/json"
      },
      body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" }
      })
  });
  
  const data = await response.json();
  console.log(JSON.stringify(data, null, 2));
}
test();
