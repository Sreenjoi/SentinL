type PlanDisplayInput = {
  tier?: string | null;
  userTier?: string | null;
  isBetaTester?: boolean;
  isTrial?: boolean;
  isSharedServer?: boolean;
};

export function getPlanDisplayLabel({
  tier,
  userTier,
  isBetaTester = false,
  isTrial = false,
  isSharedServer = false,
}: PlanDisplayInput) {
  const effectiveTier = tier || userTier || "free";
  const base =
    isTrial
      ? "Pro Trial"
      : effectiveTier === "premium" || effectiveTier === "pro_3"
        ? "Premium"
        : effectiveTier === "pro_1" || effectiveTier === "pro"
          ? "Pro"
          : isBetaTester
            ? "Pro"
            : "Free";

  const tags = [
    isBetaTester && !isTrial ? "Beta" : null,
    isSharedServer ? "Shared" : null,
  ].filter(Boolean);

  return tags.length ? `${base} (${tags.join(", ")})` : base;
}
