import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Check, Layers3, Loader2, Plus, Sparkles } from "lucide-react";
import { Select } from "./Select";
import { useRulePresets } from "../hooks/useRulePresets";
import type { ServerRulePreset } from "../data/serverRulePresets";

type Tone = "light" | "orange";

type ServerRulePresetPickerProps = {
  selectedPresetId: string;
  onSelectPreset: (preset: ServerRulePreset) => void | Promise<void>;
  existingRules?: string[];
  addingRules?: Record<string, "idle" | "loading" | "added">;
  onAddRule: (ruleId: string, ruleText: string) => void | Promise<void>;
  onAddAllRules?: (preset: ServerRulePreset) => void | Promise<void>;
  addAllLoading?: boolean;
  disabled?: boolean;
  tone?: Tone;
  layout?: "stacked" | "split";
};

export function ServerRulePresetPicker({
  selectedPresetId,
  onSelectPreset,
  existingRules = [],
  addingRules = {},
  onAddRule,
  onAddAllRules,
  addAllLoading = false,
  disabled = false,
  tone = "light",
  layout = "stacked",
}: ServerRulePresetPickerProps) {
  const { presets, loading } = useRulePresets();
  const [localPresetId, setLocalPresetId] = useState(selectedPresetId || "custom");

  const selectedPreset = useMemo(
    () => presets.find((preset) => preset.id === (selectedPresetId || localPresetId)) || presets[0],
    [localPresetId, presets, selectedPresetId],
  );

  const existingRuleSet = useMemo(
    () => new Set(existingRules.map((rule) => rule.trim().toLowerCase())),
    [existingRules],
  );

  const isRuleAlreadyAdded = (ruleId: string, ruleText: string) =>
    existingRuleSet.has(ruleText.trim().toLowerCase()) || addingRules[ruleId] === "added";

  const remainingRuleCount = selectedPreset
    ? selectedPreset.rules.filter((rule, index) => !isRuleAlreadyAdded(`${selectedPreset.id}-${index}`, rule)).length
    : 0;

  const handleSelect = async (presetId: string) => {
    const preset = presets.find((item) => item.id === presetId);
    if (!preset) return;
    setLocalPresetId(presetId);
    await onSelectPreset(preset);
  };

  const textClass = tone === "orange" ? "text-white" : "text-on-surface";
  const mutedClass = tone === "orange" ? "text-white/72" : "text-text-secondary";
  const cardClass =
    tone === "orange"
      ? "border-white/20 bg-white/10 text-white hover:bg-white/16"
      : "border-outline-variant/20 bg-surface-container/20 text-on-surface hover:bg-white hover:border-primary/30";
  const selectClass = tone === "orange" ? "[&_button]:!bg-white [&_button]:!text-primary" : "";
  const activePresetId = selectedPreset?.id || "custom";

  if (layout === "split") {
    return (
      <div className="grid min-h-0 gap-5 lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)]">
        <div className="min-h-0">
          <div className={`mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] ${mutedClass}`}>
            <Layers3 className="h-3.5 w-3.5" />
            Server Type
          </div>
          <div className="max-h-[52vh] space-y-1 overflow-y-auto py-1 pl-1.5 pr-4 custom-scrollbar">
            {presets.map((preset) => {
              const selected = activePresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={disabled || loading}
                  onClick={() => handleSelect(preset.id)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                    selected
                      ? "border-white bg-white text-primary shadow-lg shadow-black/10"
                      : "border-white/18 bg-white/8 text-white/78 hover:border-white/35 hover:bg-white/14 hover:text-white"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <span className="block text-xs font-black uppercase tracking-widest">
                    {preset.shortLabel}
                  </span>
                  <span className={`mt-1 block text-[10px] font-semibold leading-snug ${selected ? "text-primary/70" : "text-white/55"}`}>
                    {preset.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {selectedPreset && (
          <motion.div
            key={selectedPreset.id}
            initial={{ opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className="min-h-0"
          >
            <div className="mb-3 flex flex-col gap-3 rounded-3xl border border-white/20 bg-white/10 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-black text-white">
                  <Sparkles className="h-4 w-4" />
                  {selectedPreset.label}
                </div>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-white/72">
                  Add the rules that fit your community now. You can edit or remove them later in Community DNA.
                </p>
              </div>
              {onAddAllRules && (
                <button
                  type="button"
                  disabled={disabled || addAllLoading || remainingRuleCount === 0}
                  onClick={() => onAddAllRules(selectedPreset)}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-primary transition-all hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {addAllLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {remainingRuleCount === 0 ? "All added" : `Add ${remainingRuleCount} rule${remainingRuleCount === 1 ? "" : "s"}`}
                </button>
              )}
            </div>

            <div className="max-h-[46vh] space-y-3 overflow-y-auto pr-1 custom-scrollbar">
              {selectedPreset.rules.map((rule, index) => {
                const ruleId = `${selectedPreset.id}-${index}`;
                const alreadyAdded = isRuleAlreadyAdded(ruleId, rule);
                const loadingRule = addingRules[ruleId] === "loading";
                return (
                  <motion.div
                    key={ruleId}
                    initial={{ opacity: 0, x: 22 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.04, duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                    className="rounded-2xl border border-white/18 bg-white/10 p-4 transition-all hover:bg-white/15"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <p className="text-sm font-medium leading-relaxed text-white">
                        <strong className="mb-1 block text-white">{rule.split(":")[0]}:</strong>
                        {rule.split(":").slice(1).join(":").trim()}
                      </p>
                      <button
                        type="button"
                        disabled={disabled || alreadyAdded || loadingRule}
                        onClick={() => onAddRule(ruleId, rule)}
                        className={`flex h-10 shrink-0 items-center justify-center rounded-xl border px-4 text-xs font-black uppercase tracking-widest transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
                          alreadyAdded
                            ? "border-white bg-white text-primary"
                            : "border-white/30 bg-white/10 text-white hover:bg-white hover:text-primary"
                        }`}
                      >
                        {loadingRule ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : alreadyAdded ? (
                          <span className="inline-flex items-center gap-2"><Check className="h-4 w-4" /> Added</span>
                        ) : (
                          "Add"
                        )}
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px] lg:items-end">
        <div>
          <div className={`mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] ${mutedClass}`}>
            <Layers3 className="h-3.5 w-3.5" />
            Server Type Preset
          </div>
          <h4 className={`text-lg font-black tracking-tight ${textClass}`}>
            Choose the closest match for this community
          </h4>
          <p className={`mt-1 text-sm font-semibold leading-relaxed ${mutedClass}`}>
            SentinL will show six rule suggestions tuned for that server type. You can add them one by one or add the full set.
          </p>
        </div>
        <Select
          value={selectedPreset?.id || "custom"}
          onChange={handleSelect}
          disabled={disabled || loading}
          className={selectClass}
          options={presets.map((preset) => ({
            value: preset.id,
            label: preset.label,
          }))}
        />
      </div>

      {selectedPreset && (
        <motion.div
          key={selectedPreset.id}
          initial={{ opacity: 0, x: tone === "orange" ? 28 : 0, y: tone === "orange" ? 0 : 10 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          className="space-y-4"
        >
          <div className={`flex flex-col gap-3 rounded-3xl border p-4 sm:flex-row sm:items-center sm:justify-between ${cardClass}`}>
            <div>
              <div className={`flex items-center gap-2 text-sm font-black ${textClass}`}>
                <Sparkles className="h-4 w-4" />
                {selectedPreset.label}
              </div>
              <p className={`mt-1 text-xs font-semibold leading-relaxed ${mutedClass}`}>
                {selectedPreset.description}
              </p>
            </div>
            {onAddAllRules && (
              <button
                type="button"
                disabled={disabled || addAllLoading || remainingRuleCount === 0}
                onClick={() => onAddAllRules(selectedPreset)}
                className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
                  tone === "orange"
                    ? "bg-white text-primary hover:bg-white/90"
                    : "bg-primary text-white shadow-md shadow-primary/15 hover:bg-primary/90"
                }`}
              >
                {addAllLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {remainingRuleCount === 0 ? "All added" : `Add ${remainingRuleCount} rule${remainingRuleCount === 1 ? "" : "s"}`}
              </button>
            )}
          </div>

          <div className="grid gap-3">
            {selectedPreset.rules.map((rule, index) => {
              const ruleId = `${selectedPreset.id}-${index}`;
              const alreadyAdded = isRuleAlreadyAdded(ruleId, rule);
              const loadingRule = addingRules[ruleId] === "loading";
              return (
                <motion.div
                  key={ruleId}
                  initial={{ opacity: 0, x: tone === "orange" ? 22 : 0, y: tone === "orange" ? 0 : 8 }}
                  animate={{ opacity: 1, x: 0, y: 0 }}
                  transition={{ delay: index * 0.04, duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                  className={`group rounded-2xl border p-4 transition-all ${cardClass}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <p className={`text-sm font-medium leading-relaxed ${textClass}`}>
                      <strong className={`mb-1 block ${tone === "orange" ? "text-white" : "text-primary group-hover:underline"}`}>
                        {rule.split(":")[0]}:
                      </strong>
                      {rule.split(":").slice(1).join(":").trim()}
                    </p>
                    <button
                      type="button"
                      disabled={disabled || alreadyAdded || loadingRule}
                      onClick={() => onAddRule(ruleId, rule)}
                      className={`flex h-10 shrink-0 items-center justify-center rounded-xl border px-4 text-xs font-black uppercase tracking-widest transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
                        alreadyAdded
                          ? tone === "orange"
                            ? "border-white bg-white text-primary"
                            : "border-primary bg-primary text-white"
                          : tone === "orange"
                            ? "border-white/30 bg-white/10 text-white hover:bg-white hover:text-primary"
                            : "border-outline-variant/30 bg-surface-container-high text-on-surface hover:border-primary hover:bg-primary hover:text-white"
                      }`}
                    >
                      {loadingRule ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : alreadyAdded ? (
                        <span className="inline-flex items-center gap-2"><Check className="h-4 w-4" /> Added</span>
                      ) : (
                        "Add"
                      )}
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}
    </div>
  );
}
