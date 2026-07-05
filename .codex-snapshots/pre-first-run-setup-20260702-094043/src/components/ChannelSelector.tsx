import React, { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, Search, Hash } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface Channel {
  id: string;
  name: string;
}

interface ChannelSelectorProps {
  channels: Channel[];
  value: string;
  onChange: (channelId: string) => void;
  placeholder?: string;
  className?: string;
}

export function ChannelSelector({ channels, value, onChange, placeholder = "Select a channel...", className = "" }: ChannelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedChannel = channels.find((c) => c.id === value);

  const filteredChannels = useMemo(() => {
    if (!search) return channels;
    return channels.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));
  }, [channels, search]);

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
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-surface-container/50 border border-outline-variant/30 rounded-2xl px-5 py-4 text-sm text-on-surface focus:outline-none focus:border-primary/50 focus:bg-white transition-all duration-300 ease-out shadow-inner font-medium flex justify-between items-center"
      >
        {selectedChannel ? (
          <div className="flex items-center gap-2 text-on-surface">
            <Hash className="w-4 h-4 text-text-secondary" />
            <span>{selectedChannel.name}</span>
          </div>
        ) : (
          <span className="text-text-secondary/60">{placeholder}</span>
        )}
        <ChevronDown className={`w-4 h-4 text-text-secondary transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 w-full mt-2 bg-white rounded-2xl border border-outline-variant/30 shadow-xl overflow-hidden"
          >
            <div className="max-h-[250px] overflow-y-auto custom-scrollbar p-2">
              <button
                 type="button"
                 onClick={() => {
                   onChange("");
                   setIsOpen(false);
                   setSearch("");
                 }}
                 className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors flex items-center gap-2 ${
                    value === "" ? "bg-primary/10 text-primary font-medium" : "hover:bg-surface-container text-text-secondary"
                  }`}
              >
                 <span className="truncate">Disabled / None</span>
              </button>
              {filteredChannels.length === 0 ? (
                <div className="py-4 text-center text-xs text-text-secondary font-medium">No channels found</div>
              ) : (
                filteredChannels.map((channel) => {
                  return (
                    <button
                      key={channel.id}
                      type="button"
                      onClick={() => {
                        onChange(channel.id);
                        setIsOpen(false);
                        setSearch("");
                      }}
                      className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors flex items-center gap-2 ${
                        value === channel.id ? "bg-primary/10 text-on-surface" : "hover:bg-surface-container text-on-surface"
                      }`}
                    >
                      <Hash className="w-4 h-4 text-text-secondary shrink-0" />
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="truncate">
                          {channel.name}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
