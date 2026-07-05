import React from "react";
import { Crown, LucideIcon, Shield } from "lucide-react";

interface BrandedPageHeaderProps {
  eyebrow: string;
  title: string;
  description?: string;
  icon: LucideIcon;
  meta?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

interface HeaderMetaPillsProps {
  planLabel: string;
  path: Array<string | null | undefined>;
  className?: string;
}

export function HeaderMetaPills({ planLabel, path, className = "" }: HeaderMetaPillsProps) {
  const normalizedPath = path.filter((part): part is string => Boolean(part?.trim()));
  const isPaidPlan = /\b(pro|premium)\b/i.test(planLabel) && !/^free\b/i.test(planLabel);
  const PlanIcon = isPaidPlan ? Crown : Shield;

  return (
    <div className={`inline-flex max-w-full items-center rounded-full border border-white/25 bg-white/10 text-[10px] font-black uppercase tracking-widest text-white/85 backdrop-blur-md ${className}`}>
      <span className="inline-flex min-w-0 items-center gap-1.5 px-3 py-1.5">
        <PlanIcon className="h-3 w-3 shrink-0" />
        <span className="truncate">{planLabel}</span>
      </span>
      {normalizedPath.length > 0 && (
        <>
          <span className="h-4 w-px shrink-0 bg-white/25" />
          <span className="min-w-0 truncate px-3 py-1.5">
            {normalizedPath.join(" / ")}
          </span>
        </>
      )}
    </div>
  );
}

export function BrandedPageHeader({
  eyebrow: _eyebrow,
  title,
  description,
  icon: _Icon,
  meta,
  action,
  className = "",
}: BrandedPageHeaderProps) {
  return (
    <header className={`relative overflow-hidden rounded-[2rem] bg-primary px-6 py-7 text-white shadow-2xl shadow-primary/20 sm:px-8 sm:py-8 ${className}`}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(255,255,255,0.24),transparent_28%),radial-gradient(circle_at_88%_78%,rgba(255,255,255,0.16),transparent_34%)]" />
      <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center">
          <div className="min-w-0">
            <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl md:text-5xl">
              {title}
            </h1>
            {description && (
              <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-white/80">
                {description}
              </p>
            )}
            {meta && <div className="mt-4 flex flex-wrap items-center gap-2">{meta}</div>}
          </div>
        </div>
        {action && <div className="relative z-10 flex shrink-0 items-center">{action}</div>}
      </div>
    </header>
  );
}

interface BranchTabItem<T extends string> {
  id: T;
  label: React.ReactNode;
  icon: LucideIcon;
  disabled?: boolean;
  badge?: React.ReactNode;
}

interface BranchTabsProps<T extends string> {
  items: BranchTabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  level?: "secondary" | "sub" | "tertiary";
  className?: string;
}

export function BranchTabs<T extends string>({
  items,
  active,
  onChange,
  level = "secondary",
  className = "",
}: BranchTabsProps<T>) {
  const isTertiary = level === "tertiary";
  const isSub = level === "sub";
  const containerClass = isTertiary
    ? "w-fit max-w-full items-center gap-1 rounded-[1rem] border border-white/55 bg-white/45 p-1 shadow-sm shadow-black/[0.02] backdrop-blur-xl"
    : isSub
      ? "w-fit max-w-full items-center gap-1 rounded-[1.25rem] border border-white/60 bg-white/50 p-1 shadow-sm shadow-black/[0.02] backdrop-blur-xl"
      : "w-fit max-w-full items-center gap-1 rounded-[1.5rem] border border-white/70 bg-white/60 p-1.5 shadow-sm shadow-black/[0.03] backdrop-blur-xl";
  const buttonSizeClass = isTertiary
    ? "h-7 shrink-0 gap-1.5 rounded-[0.75rem] px-2.5 text-[7px] tracking-wider"
    : isSub
      ? "h-8 shrink-0 gap-2 rounded-[1rem] px-3 text-[8px] tracking-widest sm:px-3.5"
      : "h-10 shrink-0 gap-2 rounded-[1.2rem] px-3.5 text-[9px] tracking-widest sm:px-4";
  return (
    <nav
      className={`inline-flex flex-wrap overflow-hidden ${containerClass} ${className}`}
    >
      {items.map((tab) => {
        const selected = active === tab.id;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            type="button"
            disabled={tab.disabled}
            aria-pressed={selected}
            onClick={() => onChange(tab.id)}
            className={`group relative flex items-center justify-center text-center font-black uppercase transition-all duration-200 ease-out disabled:cursor-not-allowed disabled:opacity-55 ${
              buttonSizeClass
            } ${
              selected
                ? "border-transparent bg-primary text-white shadow-md shadow-primary/15"
                : "text-text-secondary/85 hover:bg-primary hover:text-white hover:shadow-sm hover:shadow-primary/10"
            }`}
          >
            <Icon className={`${isTertiary ? "h-3 w-3" : isSub ? "h-3.5 w-3.5" : "h-3.5 w-3.5"} shrink-0`} />
            <span className="leading-tight">{tab.label}</span>
            {tab.badge && (
              <span className={`ml-0.5 rounded-full border px-1.5 py-0.5 text-[7px] font-black leading-none ${
                selected
                  ? "border-white/70 bg-white text-primary"
                  : "border-primary bg-primary text-white group-hover:border-white/70 group-hover:bg-white group-hover:text-primary"
              }`}>
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
