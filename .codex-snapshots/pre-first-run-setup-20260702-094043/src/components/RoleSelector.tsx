import React, { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, Search, Shield } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface Role {
  id: string;
  name: string;
  color: number;
  position?: number;
}

interface RoleSelectorProps {
  roles: Role[];
  botRolePosition?: number;
  disablePositionCheck?: boolean;
  value: string;
  onChange: (roleId: string) => void;
  placeholder?: string;
  className?: string;
}

export function RoleSelector({ roles, botRolePosition = 0, disablePositionCheck = false, value, onChange, placeholder = "Select a role...", className = "" }: RoleSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedRole = roles.find((r) => r.id === value);

  const filteredRoles = useMemo(() => {
    if (!search) return roles;
    return roles.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()));
  }, [roles, search]);

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
        {selectedRole ? (
          <div className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: selectedRole.color ? `#${selectedRole.color.toString(16).padStart(6, '0')}` : "#99aab5" }}
            />
            <span style={{ color: selectedRole.color ? `#${selectedRole.color.toString(16).padStart(6, '0')}` : "inherit" }}>
              {selectedRole.name}
            </span>
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
            <div className="p-3 border-b border-outline-variant/20 bg-surface-container/10">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
                <input
                  type="text"
                  placeholder="Search roles..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-white border border-outline-variant/30 rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-primary/50"
                />
              </div>
            </div>
            <div className="max-h-[250px] overflow-y-auto custom-scrollbar p-2">
              {filteredRoles.length === 0 ? (
                <div className="py-4 text-center text-xs text-text-secondary font-medium">No roles found</div>
              ) : (
                filteredRoles.map((role) => {
                  const isDisabled = !disablePositionCheck && role.position !== undefined && role.position >= botRolePosition;
                  return (
                    <button
                      key={role.id}
                      type="button"
                      disabled={isDisabled}
                      title={isDisabled ? "The bot's role must be placed higher than this role in your Discord server settings to assign it." : ""}
                      onClick={() => {
                        if (isDisabled) return;
                        onChange(role.id);
                        setIsOpen(false);
                        setSearch("");
                      }}
                      className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors flex items-center gap-2 ${
                        value === role.id ? "bg-primary/10" : "hover:bg-surface-container"
                      } ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: role.color ? `#${role.color.toString(16).padStart(6, '0')}` : "#99aab5" }}
                      />
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="truncate" style={{ color: role.color ? `#${role.color.toString(16).padStart(6, '0')}` : "inherit" }}>
                          {role.name}
                        </span>
                        {isDisabled && (
                           <span className="text-[10px] text-red-500/80 whitespace-normal leading-tight mt-0.5 font-medium">
                             Bot's role must be higher to assign this.
                           </span>
                        )}
                      </div>
                      {isDisabled && (
                        <Shield className="w-4 h-4 text-red-400 shrink-0 self-start mt-0.5" />
                      )}
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
