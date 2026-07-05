import React, { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface Option {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

interface SelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  size?: "sm" | "md";
}

export function Select({ options, value, onChange, placeholder = "Select...", className = "", disabled = false, size = "md" }: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full ${size === "md" ? "bg-surface-container/50 border border-outline-variant/30 rounded-2xl px-5 py-4 text-sm font-medium shadow-inner" : "bg-transparent border-0 px-2 flex-1 outline-none text-[10px] font-black appearance-none m-0 focus:ring-0 focus:outline-none cursor-pointer py-1"} text-on-surface transition-all duration-300 ease-out flex justify-between items-center ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        {selectedOption ? (
          <div className="flex items-center gap-2 text-on-surface">
            {selectedOption.icon}
            <span className="truncate">{selectedOption.label}</span>
          </div>
        ) : (
          <span className="text-text-secondary/60 truncate">{placeholder}</span>
        )}
        <ChevronDown className={`w-4 h-4 text-text-secondary transition-transform shrink-0 ml-2 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className={`absolute z-50 min-w-full w-max mt-2 bg-white rounded-2xl border border-outline-variant/30 shadow-xl overflow-hidden ${size === "sm" ? "right-0 min-w-[130px]" : ""}`}
          >
            <div className="max-h-[250px] overflow-y-auto custom-scrollbar p-2">
              {options.length === 0 ? (
                <div className="py-4 text-center text-xs text-text-secondary font-medium">No options</div>
              ) : (
                options.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors flex items-center gap-2 ${
                      value === option.value ? "bg-primary/10 text-primary font-medium" : "hover:bg-surface-container text-on-surface"
                    }`}
                  >
                    {option.icon}
                    <span className="flex-1 whitespace-nowrap">{option.label}</span>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
