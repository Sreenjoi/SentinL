import React from "react";
import { Logo } from "./Logo";
import { motion } from "motion/react";

export function SentinLLoading({ message = "Scanning system", fullScreen = false }: { message?: string, fullScreen?: boolean }) {
  const content = (
    <div className="flex flex-col items-center justify-center gap-6 text-primary">
      <div className="relative flex items-center justify-center w-24 h-24">
        {/* Rotating circle */}
        <motion.div
           className="absolute inset-0 rounded-full border-4 border-primary/20 border-t-primary"
           animate={{ rotate: 360 }}
           transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
        />
        <div className="z-10 p-4">
          <Logo className="w-10 h-10 text-primary drop-shadow-[0_0_8px_rgba(255,111,97,1)]" fill="none" faceColor="currentColor" />
        </div>
      </div>
      <div className="font-mono text-[10px] tracking-widest font-bold uppercase text-primary/80">
        <motion.span
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          {message}
        </motion.span>
      </div>
    </div>
  );

  if (fullScreen) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-bg-base z-50">
        {content}
      </div>
    );
  }

  return (
    <div className="flex w-full min-h-[300px] items-center justify-center p-12">
      {content}
    </div>
  );
}
