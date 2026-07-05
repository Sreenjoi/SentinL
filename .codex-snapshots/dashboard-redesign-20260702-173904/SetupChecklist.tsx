import React from "react";
import { motion } from "motion/react";
import { CheckCircle, ListChecks } from "lucide-react";
import { useSetupStatus } from "../hooks/useSetupStatus";

type SetupChecklistProps = {
  onOpen?: () => void;
};

export function SetupChecklist({ onOpen }: SetupChecklistProps) {
  const setupStatus = useSetupStatus();

  if (setupStatus.loading) {
    return (
      <div className="mb-8 w-full rounded-2xl border border-outline-variant/30 bg-surface-container p-5 shadow-xl">
        <div className="h-5 w-40 rounded-md bg-surface-variant/70 animate-pulse" />
        <div className="mt-4 h-2 w-full rounded-full bg-surface-variant/70 animate-pulse" />
      </div>
    );
  }

  const complete = setupStatus.isAllDone;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="mb-8 w-full rounded-2xl border border-outline-variant/40 bg-surface-container p-4 text-left shadow-xl transition-colors hover:bg-surface-container/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      aria-label="Open server setup flow"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div
            className={`flex h-11 w-11 items-center justify-center rounded-xl border ${
              complete
                ? "border-green-300 bg-green-200 text-green-900"
                : "border-primary/25 bg-primary/15 text-primary"
            }`}
          >
            {complete ? <CheckCircle className="h-5 w-5" /> : <ListChecks className="h-5 w-5" />}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-black uppercase tracking-widest text-on-surface">
                Server Setup Health
              </h3>
              {complete && (
                <span className="rounded-full bg-green-400 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-green-950">
                  Complete
                </span>
              )}
            </div>
            <p className="mt-1 text-xs font-semibold text-text-secondary">
              {setupStatus.completedCount} of {setupStatus.totalCount} setup steps complete
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 sm:min-w-[220px]">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-variant">
            <motion.div
              className={`h-full ${complete ? "bg-green-500" : "bg-primary"}`}
              initial={{ width: 0 }}
              animate={{ width: `${setupStatus.progress}%` }}
              transition={{ duration: 0.45, ease: "easeOut" }}
            />
          </div>
        </div>
      </div>
    </button>
  );
}
