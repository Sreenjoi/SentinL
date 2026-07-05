import React from 'react';
import { Logo } from './Logo';

interface EmptyStateProps {
  icon?: React.ElementType;
  iconColor?: string;
  bgClass?: string;
  shadowClass?: string;
  title: string;
  description: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action, children }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center gap-5">
      {/* Logo ring */}
      <div className="relative">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/10 to-secondary/10
          flex items-center justify-center border border-white/60 shadow-lg shadow-primary/5">
          {Icon
            ? <Icon className="w-9 h-9 text-primary/60" />
            : <Logo className="w-10 h-10 text-primary/50" />
          }
        </div>
        {/* Decorative ring */}
        <div className="absolute inset-0 rounded-full border-2 border-primary/10 scale-125 opacity-60" />
        <div className="absolute inset-0 rounded-full border border-primary/5 scale-[1.6] opacity-40" />
      </div>

      <div className="max-w-xs">
        <h3 className="font-black text-on-surface text-base mb-1.5">{title}</h3>
        {description && (
          <p className="text-sm text-text-secondary leading-relaxed">{description}</p>
        )}
      </div>

      {(action || children) && (
        <div className="mt-1">{action || children}</div>
      )}
    </div>
  );
}

export function CompactEmptyState({
  icon: Icon = Logo,
  iconColor = "text-text-secondary",
  bgClass = "bg-surface-container",
  title,
  description,
  children
}: EmptyStateProps) {
  return (
    <div className="w-full h-full p-6 flex flex-col items-center justify-center border-2 border-dashed border-outline-variant/30 rounded-3xl bg-surface-container/10">
      <div className={`w-12 h-12 ${bgClass} rounded-full flex items-center justify-center mb-4 border border-outline-variant/30 shadow-sm`}>
        <Icon className={`w-5 h-5 ${iconColor} opacity-50`} />
      </div>
      <p className="text-[11px] font-black tracking-[0.2em] uppercase text-text-secondary mb-1 text-center">{title}</p>
      <p className="text-xs text-text-secondary/70 font-medium text-center max-w-[200px]">{description}</p>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
