import { useEffect, useState } from "react";
import { auth } from "../firebase";
import { DEFAULT_RULE_PRESETS, normalizeRulePreset, type ServerRulePreset } from "../data/serverRulePresets";

export function useRulePresets() {
  const [presets, setPresets] = useState<ServerRulePreset[]>(DEFAULT_RULE_PRESETS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadPresets = async () => {
      setLoading(true);
      try {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch("/api/rule-presets", {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const data = await res.json().catch(() => ({}));
        const nextPresets = Array.isArray(data.presets)
          ? data.presets.map(normalizeRulePreset).filter(Boolean) as ServerRulePreset[]
          : [];
        if (!cancelled && nextPresets.length > 0) {
          setPresets(nextPresets.sort((a, b) => a.order - b.order));
        }
      } catch (error) {
        console.warn("Rule presets unavailable; using bundled defaults.", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadPresets();
    return () => {
      cancelled = true;
    };
  }, []);

  return { presets, loading };
}
