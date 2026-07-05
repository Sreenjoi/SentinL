import { shouldForceFullPassForCustomRules } from "./customRuleRouter.js";
import { shouldForceFullPassForLinguisticUncertainty } from "./linguisticUncertainty.js";
import { analyzeTargetedPragmaticHostility, isFastPassFinalClearEligible } from "./nuancedIntentRouter.js";
import { keywordMatchesMessage } from "./keywordHelper.js";

export interface LocalRiskMetadata {
  rulesText: string;
  keywords: string[];
  isReply: boolean;
  hasMention: boolean;
}

export function escapeForPromptBlock(text: string, maxLength: number = 3000): string {
  if (!text) return "";
  let escaped = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  if (escaped.length > maxLength) {
    escaped = escaped.substring(0, maxLength) + "...[TRUNCATED]";
  }
  return `\n--- UNTRUSTED USER CONTENT START ---\n${escaped}\n--- UNTRUSTED USER CONTENT END ---\n`;
}

export const hasLocalStructuralModerationRisk = (
  text: string,
  metadata: LocalRiskMetadata,
  nuance?: any,
): boolean => {
  const n =
    nuance ||
    analyzeTargetedPragmaticHostility(text, {
      customRulesText: metadata.rulesText,
      isReply: metadata.isReply,
      hasMention: metadata.hasMention,
    });
  const fullPassNuance =
    n.forceFullPass ||
    n.reviewOnlyPreferred ||
    (n.score >= 3 && n.hasToxicRules) ||
    n.score >= 4;
  return (
    containsHighRiskSignal(text) ||
    hasIndirectContemptShape(text) ||
    shouldForceFullPassForCustomRules(
      text,
      metadata.rulesText,
      metadata.keywords,
    ) ||
    shouldForceFullPassForLinguisticUncertainty(text).forceFullPass ||
    !isFastPassFinalClearEligible(text, {
      customRulesText: metadata.rulesText,
      isReply: metadata.isReply,
      hasMention: metadata.hasMention,
    }).eligible ||
    fullPassNuance
  );
};

export function hasIndirectContemptShape(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .replace(/[^\w\s'/.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return false;

  const positiveFraming =
    /\b(amazing|impressive|brilliant|genius|talent|achievement|award|medal|congratulations|great job|well done|beautiful|wonderful|perfect|bold|remarkable|fascinating|masterclass|rare|excellent|stellar|incredible)\b/i;
  const negativeOutcome =
    /\b(confusion|incident|harder|hard|difficult|easiest|easy|basic|simple|obvious|mess|problem|issue|mistake|failure|failed|worse|disaster|chaos|wrong|escaped|slowing|slow|recover|lowering|lowered|floor|warning label|warning|again|somehow|never)\b/i;
  const impliedHumanActionTarget =
    /\b(strategy|decision|choice|explanation|contribution|work|help|meeting|documentation|option|door|plan|approach|attempt|fix|update|response|answer|idea|logic|execution)\b/i;
  const contemptOutcome =
    /\b(made|making|turned|became|managed|somehow|still|again|escaped|lowered|lowering|slowing|opened|recover|warning label|harder to find|wrong door|simple option)\b/i;
  const clearNeutralPositive =
    /\b(thanks|thank you|appreciate|helpful|helped|nice shot|good game|well played|great job team|proud of you|congratulations on|well done on|impressive work on)\b/i;
  const constructiveResolution =
    /\b(so|and|but)\s+(i|we|they|someone)\s+(added|fixed|updated|restored|corrected|moved|picked|changed|documented|noted|clarified)\b|\b(everything is fixed|final version is better|makes? (it|the page|the flow|the setup|things) (clearer|easier|better)|should be the next .* improvement)\b/i;

  if (clearNeutralPositive.test(normalized)) return false;
  if (constructiveResolution.test(normalized)) return false;

  const vagueTarget =
    /\b(some people|someone here|certain people|people like this|these people|those people|this level of|that level of)\b/i;
  const dismissiveFrame =
    /\b(no surprise|apparently|honestly a talent|had to be explained|finding ways to make|became the biggest|became a full)\b/i;
  const competenceFrame =
    /\b(understand|planning|spacing|step|fix|note|instructions?|decision|confusion)\b/i;

  if (vagueTarget.test(normalized) && negativeOutcome.test(normalized)) {
    return true;
  }

  if (
    positiveFraming.test(normalized) &&
    negativeOutcome.test(normalized) &&
    (dismissiveFrame.test(normalized) || competenceFrame.test(normalized))
  ) {
    return true;
  }

  if (
    positiveFraming.test(normalized) &&
    negativeOutcome.test(normalized) &&
    impliedHumanActionTarget.test(normalized) &&
    contemptOutcome.test(normalized)
  ) {
    return true;
  }

  if (
    impliedHumanActionTarget.test(normalized) &&
    contemptOutcome.test(normalized) &&
    /\b(the bar|warning label|never recover|wrong door|simple option|harder to find|slowing everyone down|escaped the meeting)\b/i.test(normalized)
  ) {
    return true;
  }

  if (
    /\b(bar|standard|standards|expectation|expectations)\b/i.test(normalized) &&
    /\b(floor|low|lower|lowered|lowering|basement)\b/i.test(normalized) &&
    /\b(still|somehow|managed|needed|kept|again)\b/i.test(normalized)
  ) {
    return true;
  }

  if (dismissiveFrame.test(normalized) && competenceFrame.test(normalized)) {
    return true;
  }

  return false;
}

export function shouldBypassClearlySafeLongMessage(
  text: string,
  metadata: LocalRiskMetadata,
): { bypass: boolean; reason: string } {
  const trimmed = text.trim();
  if (!trimmed) return { bypass: true, reason: "empty_message" };
  if (trimmed.length < 45 || trimmed.length > 900) {
    return { bypass: false, reason: "outside_safe_length" };
  }

  const normalized = trimmed
    .toLowerCase()
    .replace(/[^\w\s'/.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length < 8 || words.length > 140) {
    return { bypass: false, reason: "outside_safe_word_count" };
  }

  if (metadata.isReply || metadata.hasMention) {
    return { bypass: false, reason: "direct_interaction" };
  }
  if (containsHighRiskSignal(trimmed)) {
    return { bypass: false, reason: "high_risk_signal" };
  }
  if (/(discord(?:app\.com\/invite|\.gg)|\.gg\/|https?:\/\/|www\.)/i.test(trimmed)) {
    return { bypass: false, reason: "link_or_invite" };
  }
  if (/<@!?\d+>|@everyone|@here/i.test(trimmed)) {
    return { bypass: false, reason: "mention_signal" };
  }
  if (
    /[\u0400-\u04FF\u0600-\u06FF\u0900-\u097F\u0980-\u09FF\u4E00-\u9FFF\u3040-\u30FF\u31F0-\u31FF\uAC00-\uD7AF]/.test(
      trimmed,
    )
  ) {
    return { bypass: false, reason: "mixed_or_non_latin_text" };
  }
  for (const keyword of metadata.keywords || []) {
    if (keywordMatchesMessage(trimmed, keyword)) {
      return { bypass: false, reason: "custom_keyword_match" };
    }
  }

  const rulesLower = (metadata.rulesText || "").toLowerCase();
  const explicitRuleRisks = [
    {
      rule: /\b(no|ban|banned|avoid|forbidden|not allowed|disallow).{0,30}\b(politics|political|religion|religious|election|debate)\b/i,
      message: /\b(politics|political|religion|religious|election|vote|debate|government|president)\b/i,
    },
    {
      rule: /\b(no|ban|banned|avoid|forbidden|not allowed|disallow).{0,30}\b(links?|url|promo|promotion|advertis(e|ing))\b/i,
      message: /\b(check out|subscribe|follow me|my channel|my stream|twitch\.tv|youtube\.com|youtu\.be|tiktok\.com|instagram\.com)\b/i,
    },
    {
      rule: /\b(no|ban|banned|avoid|forbidden|not allowed|disallow).{0,30}\b(dm|direct message|private message)\b/i,
      message: /\b(dm me|pm me|message me|check dm|inbox me|private message me)\b/i,
    },
    {
      rule: /\b(no|ban|banned|avoid|forbidden|not allowed|disallow).{0,30}\b(spoilers?|leaks?)\b/i,
      message: /\b(spoiler|spoilers|leak|leaked|ending|plot twist|final boss)\b/i,
    },
    {
      rule: /\b(no|ban|banned|avoid|forbidden|not allowed|disallow).{0,30}\b(giveaways?|free nitro|rewards?|prize)\b/i,
      message: /\b(giveaway|free nitro|free robux|claim reward|claim prize|gift link)\b/i,
    },
    {
      rule: /\b(no|ban|banned|avoid|forbidden|not allowed|disallow).{0,30}\b(roles?|role request|role begging|admin|mod)\b/i,
      message: /\b(give me role|can i get role|add role|mod role|admin role|rank me|promote me)\b/i,
    },
  ];
  if (
    explicitRuleRisks.some(
      (risk) => risk.rule.test(rulesLower) && risk.message.test(normalized),
    )
  ) {
    return { bypass: false, reason: "explicit_custom_rule_topic" };
  }

  const directAddress = /\b(you|your|you're|youre|u|ur|yours|yourself)\b/i;
  if (directAddress.test(normalized)) {
    return { bypass: false, reason: "direct_address" };
  }

  const vagueTargeting =
    /\b(some people|someone here|certain people|people like this|this guy|that guy|these people|those people)\b/i;
  const negativeJudgment =
    /\b(worse|useless|trash|garbage|stupid|dumb|idiot|annoying|pathetic|embarrassing|fault|blame|ruined|terrible|awful|bad at|can't even|cannot even|nobody cares|drama|toxic|crybaby)\b/i;
  if (
    vagueTargeting.test(normalized) ||
    negativeJudgment.test(normalized) ||
    hasIndirectContemptShape(trimmed)
  ) {
    return { bypass: false, reason: "conflict_or_judgment_language" };
  }

  const safeIntentPatterns = [
    /\b(i|we)\s+(checked|updated|uploaded|fixed|changed|added|removed|tested|finished|started|will|can|am going|are going|need|want|think|saw|noticed)\b/i,
    /\b(can someone|could someone|please check|please confirm|let me know|if anyone needs|leave the details)\b/i,
    /\b(settings|permissions|setup|config|configuration|document|notes|file|layout|sidebar|spacing|update|event|schedule|channel)\b/i,
    /\b(match|round|game|event|meeting|stream|session)\b/i,
    /\b(good morning|thanks for helping|hope the server|move ahead|offline for a bit)\b/i,
  ];

  if (!safeIntentPatterns.some((pattern) => pattern.test(normalized))) {
    return { bypass: false, reason: "no_safe_intent_shape" };
  }

  const nuance = analyzeTargetedPragmaticHostility(trimmed, {
    customRulesText: "",
    isReply: metadata.isReply,
    hasMention: metadata.hasMention,
  });
  if (nuance.hasTargeting) {
    return { bypass: false, reason: "nuanced_or_targeted_shape" };
  }

  return { bypass: true, reason: "clearly_safe_long_message" };
}

export class AISafeCache {
  private cache = new Map<string, { expiresAt: number; version: number }>();
  private serverVersions = new Map<string, number>();
  private maxSize = 10000;
  private ttlMs = 12 * 60 * 60 * 1000;

  public normalize(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ")
      .replace(/[.,!?;:()\[\]{}"'-]/g, "");
  }

  public isEligibleForCache(
    message: any,
    customRulesText: string,
    keywords: string[],
  ): boolean {
    const text = message.content || "";
    if (!text || text.length > 120) return false;
    if (
      message.attachments &&
      typeof message.attachments.size === "number" &&
      message.attachments.size > 0
    )
      return false;

    if (/(discord(?:app\.com\/invite|\.gg)|\.gg\/)/i.test(text)) return false;

    const urlRegex = /https?:\/\/[^\s]+/;
    if (urlRegex.test(text)) {
      const textWithoutUrl = text.replace(urlRegex, "").trim();
      if (textWithoutUrl.length > 0) return false;
    }

    const metadata = {
      rulesText: customRulesText,
      keywords: keywords,
      isReply: !!message.reference,
      hasMention: message.mentions?.users?.size > 0,
    };
    const nuance = analyzeTargetedPragmaticHostility(text, {
      customRulesText,
      isReply: !!message.reference,
      hasMention: message.mentions?.users?.size > 0,
    });
    if (
      nuance.score >= 2 ||
      nuance.reviewOnlyPreferred ||
      nuance.forceFullPass ||
      (nuance.hasTargeting && nuance.hasToxicRules)
    )
      return false;
    if (hasLocalStructuralModerationRisk(text, metadata, nuance)) return false;

    if (
      /[\u0400-\u04FF\u0600-\u06FF\u4E00-\u9FFF\u3040-\u30FF\u31F0-\u31FF\uAC00-\uD7AF]/.test(
        text,
      )
    )
      return false;

    if (/\b(lmfao|stfu|wtf|bs|bullshit|af|lmao|simp|cuck)\b/i.test(text))
      return false;

    return true;
  }

  public incrementVersion(serverId: string) {
    const current = this.serverVersions.get(serverId) || 0;
    this.serverVersions.set(serverId, current + 1);
  }

  public getVersion(serverId: string): number {
    return this.serverVersions.get(serverId) || 0;
  }

  public add(serverId: string, text: string) {
    const key = `${serverId}::${this.normalize(text)}`;
    if (this.cache.size >= this.maxSize) {
      const first = this.cache.keys().next().value;
      if (first) this.cache.delete(first);
    }
    const version = this.getVersion(serverId);
    this.cache.set(key, { expiresAt: Date.now() + this.ttlMs, version });
  }

  public has(serverId: string, text: string): boolean {
    const key = `${serverId}::${this.normalize(text)}`;
    const entry = this.cache.get(key);
    if (!entry) return false;

    const currentVersion = this.getVersion(serverId);
    if (Date.now() > entry.expiresAt || entry.version !== currentVersion) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  public clear() {
    this.cache.clear();
    this.serverVersions.clear();
  }
}

export const aiSafeCache = new AISafeCache();

export function checkQuotaIsExceeded(
  dailyCount: number,
  limit: number = 300,
): boolean {
  return dailyCount >= limit;
}

export const shouldRunFullPass = (fastResults: any[], threshold: number) => {
  return fastResults.some((item: any) => {
    const conf =
      typeof item?.confidence === "number"
        ? item.confidence
        : parseInt(item?.confidence) || 0;
    return (
      item?.flag === true ||
      String(item?.flag).toLowerCase() === "true" ||
      conf < threshold
    );
  });
};

export const shouldIncludeContext = (
  isPremium: boolean,
  useContext: boolean,
) => {
  return isPremium && useContext;
};

export const shouldEscalateTo70B = (
  isPremium: boolean,
  enableDualModel: boolean,
  fullResults: any[],
  threshold: number,
) => {
  if (!isPremium || !enableDualModel) return false;
  return fullResults.some((item: any) => {
    const conf =
      typeof item?.confidence === "number"
        ? item.confidence
        : parseInt(item?.confidence) || 0;
    return conf < threshold;
  });
};

export const containsHighRiskSignal = (text: string): boolean => {
  const tLower = text.toLowerCase();

  if (/\b(niggas?|niggers?|fagg?s?|faggots?|trann(y|ies)|retards?|spics?|chinks?|gooks?|kykes?|kikes?|dykes?)\b/i.test(tLower))
    return true;
  if (
    /\b(kill|murder|stab|shoot|strangle|beat up|death to|die|bomb|terrorize)\b/i.test(
      tLower,
    )
  )
    return true;
  if (
    /\b(porn|nude|sex|rape|incest|cp|pedophil|blowjob|fuck me|send nudes|horny)\b/i.test(
      tLower,
    )
  )
    return true;
  if (
    /\b(suicide|kill myself|cut myself|end it all|want to die|hang myself)\b/i.test(
      tLower,
    )
  )
    return true;
  if (
    /\b(kys|kill yourself|ur ugly|go die|nobody loves you|jump off a|drink bleach|eat shit)\b/i.test(
      tLower,
    )
  )
    return true;
  if (/<@!?\d+>.*?<@!?\d+>.*?<@!?\d+>.*?<@!?\d+>/.test(text)) return true;
  if (/(.)\1{9,}/.test(text)) return true;
  if (
    /\b(f[\W_]*u[\W_]*c[\W_]*k|s[\W_]*h[\W_]*i[\W_]*t|b[\W_]*i[\W_]*t[\W_]*c[\W_]*h|c[\W_]*u[\W_]*n[\W_]*t|p[\W_]*o[\W_]*r[\W_]*n)\b/i.test(
      tLower,
    )
  )
    return true;

  const urlRegex = /https?:\/\/[^\s]+/;
  if (urlRegex.test(text)) {
    const textWithoutUrl = text.replace(urlRegex, "").trim();
    if (textWithoutUrl.length > 0) return true;
  }

  return false;
};

export async function buildRelevantContext(
  messagesNeedingFullPass: { msg: any }[],
): Promise<string> {
  try {
    let needsMoreContext = false;
    messagesNeedingFullPass.forEach((m) => {
      const textLower = m.msg.content.toLowerCase();
      if (/["'”״]/.test(textLower)) needsMoreContext = true;
      if (
        /\b(nigga|nigger|fag|faggot|queer|bitch|hoe|slut|retard|simp|cuck|dyke|tranny)\b/.test(
          textLower,
        )
      )
        needsMoreContext = true;
      if (/\/s\b|jk\b|lol\b|lmao\b|sarcasm/i.test(textLower))
        needsMoreContext = true;
      if (
        m.msg.mentions &&
        m.msg.mentions.users &&
        m.msg.mentions.users.size > 0
      )
        needsMoreContext = true;
      if (m.msg.reference && m.msg.reference.messageId) needsMoreContext = true;
    });

    const fetchLimit = needsMoreContext ? 30 : 10;
    const lineCap = needsMoreContext ? 10 : 3;

    const lastMsg =
      messagesNeedingFullPass[messagesNeedingFullPass.length - 1].msg;
    const messages = await lastMsg.channel.messages.fetch({
      limit: fetchLimit,
      before: lastMsg.id,
    });
    const recentMsgs = Array.from(messages.values()).filter(
      (m: any) => !m.author.bot,
    );

    const targetAuthorIds = new Set(
      messagesNeedingFullPass.map((m) => m.msg.author.id),
    );
    const targetMentionIds = new Set<string>();
    const replyToIds = new Set<string>();

    messagesNeedingFullPass.forEach((m) => {
      if (m.msg.mentions && m.msg.mentions.users) {
        m.msg.mentions.users.forEach((u: any) => targetMentionIds.add(u.id));
      }
      if (m.msg.reference && m.msg.reference.messageId) {
        replyToIds.add(m.msg.reference.messageId);
      }
    });

    const targetTime = lastMsg.createdTimestamp;
    let relevantLines: { timestamp: number; line: string }[] = [];
    const userMapping = new Map<string, string>();
    let userCounter = 1;
    const getUserLabel = (id: string) => {
      if (!userMapping.has(id)) {
        userMapping.set(id, `User${userCounter++}`);
      }
      return userMapping.get(id);
    };

    for (const m of recentMsgs as any[]) {
      const isSameAuthor = targetAuthorIds.has(m.author.id);
      const isMentioned = targetMentionIds.has(m.author.id);
      const isRepliedTo = replyToIds.has(m.id);
      const isVeryRecent = Math.abs(targetTime - m.createdTimestamp) < 120000;
      const hasResponseMarker =
        /\b(yes|no|why|how|what|who|you|them|they)\b/i.test(m.content);

      if (
        isSameAuthor ||
        isMentioned ||
        isRepliedTo ||
        (isVeryRecent && hasResponseMarker)
      ) {
        let content = m.content.trim();
        if (!content && m.attachments && m.attachments.size > 0)
          content = "[Attachment]";
        relevantLines.push({
          timestamp: m.createdTimestamp,
          line: `${getUserLabel(m.author.id)}: ${content.substring(0, 100)}`,
        });
      }
    }

    relevantLines.sort((a, b) => a.timestamp - b.timestamp);
    if (relevantLines.length > lineCap)
      relevantLines = relevantLines.slice(-lineCap);

    if (relevantLines.length > 0) {
      return relevantLines.map((r) => r.line).join("\n");
    }
  } catch (e) {
  }
  return "No context provided.";
}

export const isAdvancedHeuristicSafe = (text: string): boolean => {
  const t = text.trim();

  if (containsHighRiskSignal(text)) return false;

  if (/^https?:\/\/[^\s]+$/.test(t)) return true;

  const benignPhrases = [
    "good morning", "good night", "hello", "hi", "hey", "sup", "nm", "gm", "gn",
    "bye", "cya", "hello everyone", "gm everyone", "good night all", "morning", "afternoon",
    "thanks", "thx", "ty", "tysm", "yw", "np", "no problem", "thanks bro",
    "appreciate it", "thank you", "much appreciated", "tyvm",
    "lol", "lmao", "rofl", "yes", "no", "ok", "okay", "k", "kk", "yeah", "yep", "nope",
    "idk", "ikr", "tbh", "ngl", "lol yeah", "lmao true", "same here", "fair enough",
    "true", "facts", "fr", "for real", "hah", "haha", "hahaha", "pog", "based",
    "brb", "one sec", "be right back", "coming", "wait", "gimme a sec", "hold on", "on my way", "omw",
    "gg", "wp", "ggwp", "gg wp", "glhf", "mb", "my bad", "nice shot", "good game",
    "that was crazy", "clip it", "ns", "nt", "nice try", "huge", "harmless message",
    "can someone help", "how do i do this", "where is this", "help please", "plz help", "need help"
  ];

  const normalized = t.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
  if (benignPhrases.includes(normalized)) return true;

  const words = normalized.split(/\s+/);
  if (words.length > 0 && words.length <= 5) {
    if (words[0] === "i" && ["agree", "see", "understand", "think", "know", "can", "will", "didnt", "dont", "do"].includes(words[1])) return true;
    if (words[0] === "sounds" && ["good", "great", "awesome", "bad", "fun", "cool", "fine", "fair"].includes(words[1])) return true;
    if (words[0] === "looks" && ["good", "great", "awesome", "bad", "fun", "cool", "fine", "fair", "like"].includes(words[1])) return true;
    if (normalized.includes("makes sense")) return true;
    if ((words[0] === "that" || words[0] === "thats") && ["is", "was", "sounds", "looks", "cool", "crazy", "insane", "nice", "awesome", "good", "bad", "wild", "funny"].includes(words[1])) return true;
    if ((words[0] === "it" || words[0] === "its") && ["is", "was", "sounds", "looks", "cool", "crazy", "insane", "nice", "awesome", "good", "bad", "wild", "funny", "okay", "fine"].includes(words[1])) return true;
    if ((words[0] === "what" || words[0] === "whats" || words[0] === "how" || words[0] === "where") && words.length > 1 && words.length <= 4 && ["is", "are", "was", "were", "do", "does", "did", "about"].includes(words[1])) return true;
    if (normalized === "you too" || normalized === "me too" || normalized === "same") return true;
  }

  const harmfulEmojis = /[\u{1F346}\u{1F351}\u{1F595}]/gu;
  if (!harmfulEmojis.test(t)) {
    const withoutEmojis = t.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\u200D]/gu, "");
    if (withoutEmojis.trim().length === 0 && t.length > 0) return true;
  }

  if (/^\d+$/.test(t)) return true;

  return false;
};
