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
      <div className="mb-8 w-full rounded-[1.75rem] border border-white/60 bg-white/65 p-5 shadow-[0_18px_45px_rgba(43,29,28,0.08)] backdrop-blur-xl">
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
      className="group mb-8 w-full overflow-hidden rounded-[1.75rem] border border-white/60 bg-white/65 p-4 text-left shadow-[0_18px_45px_rgba(43,29,28,0.08)] backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:bg-white/80 hover:shadow-[0_24px_60px_rgba(43,29,28,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      aria-label="Open server setup flow"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-2xl border shadow-sm ${
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

        <div className="flex items-center gap-3 sm:min-w-[260px]">
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
