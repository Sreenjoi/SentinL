import { useState, useEffect, useRef } from "react";

export function useSaveState(data: any) {
  const [isSaved, setIsSaved] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const baselineDataRef = useRef<string>("");
  const latestDataRef = useRef<any>(data);
  const hasChangesRef = useRef<boolean>(false);
  const dirtyFieldsRef = useRef<Set<string>>(new Set());

  // Update latestDataRef on every render so updateBaseline always has latest data
  latestDataRef.current = data;

  useEffect(() => {
    const currentStr = JSON.stringify(data);
    
    if (!baselineDataRef.current) {
      baselineDataRef.current = currentStr;
    }

    const isDifferentFromBaseline = currentStr !== baselineDataRef.current;
    
    // update state only if it changed to avoid extra renders
    if (isDifferentFromBaseline !== hasChanges) {
      setHasChanges(isDifferentFromBaseline);
    }
    hasChangesRef.current = isDifferentFromBaseline;

    if (!isDifferentFromBaseline) {
      dirtyFieldsRef.current.clear();
    }
  }, [data, hasChanges]);

  const customSetIsSaved = (val: boolean) => {
    setIsSaved(val);
    if (val) {
      baselineDataRef.current = JSON.stringify(latestDataRef.current);
      setHasChanges(false);
      hasChangesRef.current = false;
      dirtyFieldsRef.current.clear();
    }
  };

  const markDirty = (nextData: any, changedField?: string) => {
    hasChangesRef.current = true;
    setHasChanges(true);
    if (changedField) {
      dirtyFieldsRef.current.add(changedField);
    }
    latestDataRef.current = nextData;
  };

  const updateBaseline = (updater: (old: any) => any) => {
    if (baselineDataRef.current) {
      try {
        const parsed = JSON.parse(baselineDataRef.current);
        const next = updater(parsed);
        const nextStr = JSON.stringify(next);
        baselineDataRef.current = nextStr;
        
        // Re-evaluate hasChanges against the newly patched baseline using latestDataRef
        const currentStr = JSON.stringify(latestDataRef.current);
        const changed = currentStr !== nextStr;
        setHasChanges(changed);
        hasChangesRef.current = changed;
        if (!changed) {
          dirtyFieldsRef.current.clear();
        }
      } catch (e) {
        console.error("Failed to parse baseline", e);
      }
    }
  };

  const resetSaveState = (newData?: any) => {
    const val = newData !== undefined ? newData : latestDataRef.current;
    const str = JSON.stringify(val);
    baselineDataRef.current = str;
    latestDataRef.current = val;
    setIsSaved(false);
    setHasChanges(false);
    hasChangesRef.current = false;
    dirtyFieldsRef.current.clear();
  };

  return {
    isSaved,
    setIsSaved: customSetIsSaved,
    hasChanges,
    hasChangesRef,
    dirtyFieldsRef,
    resetSaveState,
    updateBaseline,
    markDirty
  };
}

