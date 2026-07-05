export const PLAN_CONFIG = {
  free: {
    priceCents: 0,
    maxServers: 1,
    aiLimit: 300,
  },
  pro_1: {
    priceCents: 799,
    maxServers: 1,
    aiLimit: 2000,
  },
  pro_3: {
    priceCents: 1999,
    maxServers: 3,
    aiLimit: 2000,
  },
  premium: { // legacy fallback, behaves as pro_3
    priceCents: 1999,
    maxServers: 3,
    aiLimit: 2000,
  },
};

export function normalizeTier(tier: string | null | undefined): string {
  if (!tier) return 'free';
  if (tier === 'premium') return 'pro_3';
  return tier;
}

export function isPaidTier(tier: string | null | undefined, status?: string | null): boolean {
  if (status === 'trial') return true;
  const t = normalizeTier(tier);
  return t === 'pro_1' || t === 'pro_3';
}

export function getDailyAiLimitForTier(tier: string | null | undefined, status?: string | null): number {
  if (status === 'trial') return PLAN_CONFIG.pro_1.aiLimit;
  const t = normalizeTier(tier);
  switch(t) {
    case 'pro_1': return PLAN_CONFIG.pro_1.aiLimit;
    case 'pro_3': return PLAN_CONFIG.pro_3.aiLimit;
    case 'premium': return PLAN_CONFIG.premium.aiLimit;
    default: return PLAN_CONFIG.free.aiLimit;
  }
}

export function getMaxServersForTier(tier: string | null | undefined, status?: string | null): number {
  if (status === 'trial') return PLAN_CONFIG.pro_1.maxServers;
  const t = normalizeTier(tier);
  switch(t) {
    case 'pro_1': return PLAN_CONFIG.pro_1.maxServers;
    case 'pro_3': return PLAN_CONFIG.pro_3.maxServers;
    case 'premium': return PLAN_CONFIG.premium.maxServers;
    default: return PLAN_CONFIG.free.maxServers;
  }
}
