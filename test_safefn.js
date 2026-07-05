const containsHighRiskSignal = (text) => {
  const tLower = text.toLowerCase();
  
  // Slurs (removed right boundary so we catch variations like faggot, trannies, niggers)
  if (/\b(nigg|fag|trann|retard|spic|chink|gook|kyke|kike|dyke)/i.test(tLower)) return true;
  // Violent threats
  if (/\b(kill|murder|stab|shoot|strangle|beat up|death to|die|bomb|terrorize)\b/i.test(tLower)) return true;
  // Sexual content
  if (/\b(porn|nude|sex|rape|incest|cp|pedophil|blowjob|fuck me|send nudes|horny)\b/i.test(tLower)) return true;
  // Self-harm terms
  if (/\b(suicide|kill myself|cut myself|end it all|want to die|hang myself)\b/i.test(tLower)) return true;
  // Harassment phrases
  if (/\b(kys|kill yourself|ur ugly|go die|nobody loves you|jump off a|drink bleach|eat shit)\b/i.test(tLower)) return true;
  // Mass mentions (4 or more)
  if (/<@!?\d+>.*?<@!?\d+>.*?<@!?\d+>.*?<@!?\d+>/.test(text)) return true;
  // Excessive repeated characters
  // Match 10+ identical characters in a row
  if (/(.)\1{9,}/.test(text)) return true;
  // Obfuscated profanity
  if (/\b(f[\W_]*u[\W_]*c[\W_]*k|s[\W_]*h[\W_]*i[\W_]*t|b[\W_]*i[\W_]*t[\W_]*c[\W_]*h|c[\W_]*u[\W_]*n[\W_]*t|p[\W_]*o[\W_]*r[\W_]*n)\b/i.test(tLower)) return true;

  // Suspicious URLs with extra text
  const urlRegex = /https?:\/\/[^\s]+/;
  if (urlRegex.test(text)) {
    const textWithoutUrl = text.replace(urlRegex, '').trim();
    if (textWithoutUrl.length > 0) return true;
  }

  return false;
};

const isAdvancedHeuristicSafe = (text) => {
  const t = text.trim();
  
  if (containsHighRiskSignal(text)) return false;

  // A. Raw URL (and nothing else)
  if (/^https?:\/\/[^\s]+$/.test(t)) return true;

  // B. Short benign phrases (whitelist)
  const benignPhrases = [
    // Greetings
    'good morning', 'good night', 'hello', 'hi', 'hey', 'sup', 'nm', 'gm', 'gn', 'bye', 'cya',
    'hello everyone', 'gm everyone', 'good night all', 'morning', 'afternoon',
    
    // Thanks / Appreciation
    'thanks', 'thx', 'ty', 'tysm', 'yw', 'np', 'no problem', 'thanks bro', 'appreciate it', 'thank you', 'much appreciated', 'tyvm',
    
    // Reactions
    'lol', 'lmao', 'rofl', 'yes', 'no', 'ok', 'okay', 'k', 'kk', 'yeah', 'yep', 'nope',
    'idk', 'idc', 'ikr', 'tbh', 'ngl', 'lol yeah', 'lmao true', 'same here', 'fair enough',
    'true', 'facts', 'fr', 'for real', 'hah', 'haha', 'hahaha', 'pog', 'based',
    
    // Coordination
    'brb', 'one sec', 'be right back', 'coming', 'wait', 'gimme a sec', 'hold on', 'on my way', 'omw',
    
    // Gameplay / Non-toxic
    'gg', 'wp', 'ggwp', 'gg wp', 'glhf', 'mb', 'my bad', 'nice shot', 'good game', 'that was crazy', 'clip it', 'ns', 'nt', 'nice try', 'huge',
    
    // Help requests
    'can someone help', 'how do i do this', 'where is this', 'help please', 'plz help', 'need help'
  ];

  const normalized = t.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
  if (benignPhrases.includes(normalized)) return true;

  // C. Harmless Short Structures (up to 5 words)
  const words = normalized.split(/\s+/);
  if (words.length > 0 && words.length <= 5) {
    if (words[0] === 'i' && ['agree', 'see', 'understand', 'think', 'know', 'can', 'will', 'didnt', 'dont', 'do'].includes(words[1])) return true;
    if (words[0] === 'sounds' && ['good', 'great', 'awesome', 'bad', 'fun', 'cool', 'fine', 'fair'].includes(words[1])) return true;
    if (words[0] === 'looks' && ['good', 'great', 'awesome', 'bad', 'fun', 'cool', 'fine', 'fair', 'like'].includes(words[1])) return true;
    if (normalized.includes('makes sense')) return true;
    if ((words[0] === 'that' || words[0] === 'thats') && ['is', 'was', 'sounds', 'looks', 'cool', 'crazy', 'insane', 'nice', 'awesome', 'good', 'bad', 'wild', 'funny'].includes(words[1])) return true;
    if ((words[0] === 'it' || words[0] === 'its') && ['is', 'was', 'sounds', 'looks', 'cool', 'crazy', 'insane', 'nice', 'awesome', 'good', 'bad', 'wild', 'funny', 'okay', 'fine'].includes(words[1])) return true;
    if ((words[0] === 'what' || words[0] === 'whats' || words[0] === 'how' || words[0] === 'where') && words.length <= 4) return true;
    if (normalized === 'you too' || normalized === 'me too' || normalized === 'same') return true;
  }

  // D. Only common harmless emojis
  const harmfulEmojis = /[\u{1F346}\u{1F351}\u{1F595}]/gu;
  if (!harmfulEmojis.test(t)) {
    const withoutEmojis = t.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\u200D]/gu, '');
    if (withoutEmojis.trim().length === 0 && t.length > 0) return true;
  }

  // E. Very short messages without suspicious characters
  if (t.length <= 4 && !/[^a-zA-Z0-9\s]/.test(t) && normalized.length > 0) return true;
  
  // F. Number only messages
  if (/^\d+$/.test(t)) return true;
  
  return false;
};

 console.log(isAdvancedHeuristicSafe('hi'));