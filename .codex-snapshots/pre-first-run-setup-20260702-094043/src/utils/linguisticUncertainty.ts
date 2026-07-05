export function shouldForceFullPassForLinguisticUncertainty(text: string): { forceFullPass: boolean; reasons: string[]; score: number; } {
  const reasons: string[] = [];
  let score = 0;

  if (!text || text.trim().length === 0) {
    return { forceFullPass: false, reasons, score };
  }

  // Basic normalization
  let normalized = text.toLowerCase().trim();
  // Remove zero-width characters
  normalized = normalized.replace(/[\u200B-\u200D\uFEFF]/g, '');

  if (normalized.length > 60) {
    return { forceFullPass: false, reasons, score };
  }

  // Tokenization prep
  // Remove URLs
  let stripped = normalized.replace(/https?:\/\/\S+/g, '');
  // Remove mentions
  stripped = stripped.replace(/<@!?\d+>/g, '');
  // Remove emojis
  stripped = stripped.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\u200D]/gu, '');
  // Remove pure numbers
  stripped = stripped.split(/\s+/).filter(t => !/^\d+$/.test(t)).join(' ');

  const rawTokens = stripped.split(/\s+/).filter(Boolean);
  
  if (rawTokens.length > 6 || rawTokens.length === 0) {
    return { forceFullPass: false, reasons, score };
  }

  const commonAllowlist = new Set([
    'gg', 'gl', 'hf', 'lol', 'lmao', 'rofl', 'ok', 'okay', 'k', 'yes', 'no', 'nah', 'yeah', 'yup', 'nope', 
    'thanks', 'thx', 'ty', 'tysm', 'bro', 'dude', 'man', 'brb', 'afk', 'wait', 'coming', 'hello', 'hi', 'hey', 
    'gm', 'gn', 'good', 'night', 'morning', 'nice', 'shot', 'game', 'clip', 'true', 'same', 'fair', 'enough', 
    'help', 'where', 'how', 'why', 'what', 'who', 'when', 'one', 'sec', 'cool', 'awesome', 'great', 'wow',
    'love', 'hate', 'want', 'need', 'know', 'think', 'feel', 'look', 'find', 'tell', 'ask', 'work', 'seem', 'try', 'leave', 'call',
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'our', 'their',
    'if', 'and', 'but', 'or', 'so', 'because', 'as', 'until', 'while', 'of', 'at', 'by', 'for', 'with', 'about', 'against',
    'between', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'to', 'from', 'up', 'down', 'in', 'out', 'on', 'off',
    'again', 'further', 'then', 'once', 'here', 'there', 'where', 'when', 'why', 'how', 'which', 'who', 'whom', 'whose', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other',
    'some', 'such', 'neither', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing',
    'a', 'an', 'the', 'that', 'this', 'these', 'those', 'can', 'cant', 'will', 'wont', 'would', 'should', 'could', 'im', 'ur', 'dont', 'doesnt', 'someone', 'anyone', 'everyone', 'nobody', 'somebody',
    'just', 'like', 'make', 'made', 'go', 'went', 'gone', 'going', 'come', 'came', 'coming', 'take', 'took', 'taken', 'taking', 'get', 'got', 'getting', 'see', 'saw', 'seen', 'say', 'said',
    'am', 'oh', 'ah', 'eh', 'uh', 'um', 'ha', 'hah', 'haha',
    'test', 'testing', 'bot', 'discord', 'server', 'admin', 'mod', 'role', 'voice', 'chat', 'lobby', 'join', 'guy', 'guys', 'girl', 'friend', 'play', 'playing', 'config', 'app', 'update', 'new'
  ]);

  const removePunctuation = (str: string) => str.replace(/[^\w]/g, '');

  let hasUnknownAlphabeticToken = false;
  let hasObfuscation = false;
  let hasDirectAddress = false;

  const directAddressTriggers = ['sup', 'yo', 'hey', 'oi', 'u', 'you', 'ya', 'ka', 'hola', 'hi', 'hello'];
  const directAddressFollowers = ['bro', 'dude', 'man', 'lu', 'ka'];

  for (let i = 0; i < rawTokens.length; i++) {
    const rawToken = rawTokens[i];
    
    const rawTokenLower = removePunctuation(rawToken.toLowerCase());
    
    // Collapse repeating letters
    const collapsedToken = rawToken.replace(/(.)\1+/g, '$1');
    
    // Leetspeak conversion for analysis
    const leetToken = collapsedToken
      .replace(/0/g, 'o')
      .replace(/1/g, 'i')
      .replace(/3/g, 'e')
      .replace(/4/g, 'a')
      .replace(/@/g, 'a')
      .replace(/5/g, 's')
      .replace(/\$/g, 's')
      .replace(/7/g, 't');

    const cleanToken = removePunctuation(leetToken);
    const isAllowlisted = commonAllowlist.has(rawTokenLower) || commonAllowlist.has(cleanToken);
    
    if (cleanToken.length > 0 && cleanToken.length !== rawToken.replace(/[^\w]/g, '').length && !isAllowlisted) {
       hasObfuscation = true; 
    }
    
    if (/[a-z]/.test(cleanToken)) {
      if (!isAllowlisted) {
        if (!hasUnknownAlphabeticToken) {
           hasUnknownAlphabeticToken = true;
           // Only add to score if >= 3 to avoid penalizing single letters too heavily, except for routing
           if (cleanToken.length >= 3) {
             score += 1;
             reasons.push('Unknown alphabetic token');
           }
        } else {
           if (score < 2 && cleanToken.length >= 3) {
               score += 1;
               reasons.push('Multiple unknown tokens');
           }
        }
      }
      
      if (!isAllowlisted && /(bh|dh|kh|gh|jh|chh|sz|cz|dz|kk|tj)/.test(cleanToken)) {
        if (!reasons.includes('Romanized shape')) {
           score += 1;
           reasons.push('Romanized shape');
        }
      }
    }

    if (directAddressTriggers.includes(rawTokenLower) && i < rawTokens.length - 1) {
       const nextToken = removePunctuation(rawTokens[i+1].toLowerCase());
       // Specifically for 'you' or 'u', avoid triggering if the next word is a common function word (like 'are', 'can')
       if (rawTokenLower === 'you' || rawTokenLower === 'u') {
          if (!commonAllowlist.has(nextToken)) {
             hasDirectAddress = true;
          }
       } else {
          if (!directAddressFollowers.includes(nextToken) && nextToken.length >= 2) {
             hasDirectAddress = true;
          }
       }
    } else if (directAddressTriggers.includes(rawTokenLower)) {
       // e.g. "X bro", "shut up you"
       if (i > 0) {
           const prevToken = removePunctuation(rawTokens[i-1].toLowerCase());
           if (!commonAllowlist.has(prevToken)) hasDirectAddress = true;
       }
    } else if (i > 0 && directAddressFollowers.includes(rawTokenLower)) {
       const prevToken = removePunctuation(rawTokens[i-1].toLowerCase());
       if (!commonAllowlist.has(prevToken)) {
           hasDirectAddress = true;
       }
    }
    
    // Obfuscation shape: excessive repeated letters
    if (/(.)\1{2,}/.test(rawToken)) {
       hasObfuscation = true;
    }
  }

  // Separator logic checking outside loop (e.g., k u t t a)
  let joinedSeparators = '';
  if (stripped.length > 0 && stripped.length === rawTokens.length + stripped.split(' ').length - 1) { // mostly 1-letter words
     if (rawTokens.length >= 4) {
        joinedSeparators = rawTokens.join('');
        const leetJoined = joinedSeparators
            .replace(/0/g, 'o')
            .replace(/1/g, 'i')
            .replace(/3/g, 'e')
            .replace(/4/g, 'a')
            .replace(/@/g, 'a')
            .replace(/5/g, 's')
            .replace(/\$/g, 's')
            .replace(/7/g, 't');
        if (!commonAllowlist.has(leetJoined)) {
           hasObfuscation = true;
           hasUnknownAlphabeticToken = true;
        }
     }
  }

  if (hasDirectAddress) {
    score += 1;
    reasons.push('Direct-address shape');
  }

  if (hasObfuscation && hasUnknownAlphabeticToken) {
    score += 2;
    reasons.push('Obfuscation shape with unknown token');
  }

  let hasMixedScript = false;
  if (/[\u0400-\u04FF\u0600-\u06FF\u4E00-\u9FFF\u3040-\u30FF\u31F0-\u31FF\uAC00-\uD7AF]/.test(normalized) && /[a-z]/i.test(normalized)) {
    hasMixedScript = true;
    score += 2;
    reasons.push('Mixed script');
  } else if (/[\u0400-\u04FF\u0600-\u06FF\u4E00-\u9FFF\u3040-\u30FF\u31F0-\u31FF\uAC00-\uD7AF]/.test(normalized) && rawTokens.length > 0) {
    // Has foreign script but isn't explicitly mixed script, maybe unknown language
  }

  let forceFullPass = false;
  
  if (score >= 2 || hasMixedScript || (hasObfuscation && hasUnknownAlphabeticToken) || (hasDirectAddress && hasUnknownAlphabeticToken)) {
    forceFullPass = true;
  } else if (rawTokens.length > 0 && rawTokens.length <= 3 && hasUnknownAlphabeticToken) {
    forceFullPass = true;
    reasons.push('Short unknown slang-shaped token');
  }

  return { forceFullPass, reasons, score };
}
