import { renderHook, act } from "@testing-library/react";
import { useSaveState } from "../../src/hooks/useSaveState";
import { expect, test, describe } from "vitest";

describe("useSaveState", () => {
  test("maintains hasChanges true when baseline is updated but local edits still diverge", () => {
    const initialData = { toggle: false, slider: 10 };
    const { result } = renderHook(() => useSaveState(initialData));

    // Initially no changes
    expect(result.current.hasChanges).toBe(false);

    // Simulate local edit to slider
    const editedData = { toggle: false, slider: 50 };
    act(() => {
      // Re-render hook with edited data (as if host component updated state)
    });
    // For our specific useSaveState implementation, the hook reads the argument passed in on each render
    const { result: rerenderedResult, rerender } = renderHook(
      (props) => useSaveState(props),
      { initialProps: editedData }
    );

    // After slider edit
    expect(rerenderedResult.current.hasChanges).toBe(true);
    expect(rerenderedResult.current.hasChangesRef.current).toBe(true);

    // Simulate toggle + updateBaseline
    const toggledData = { toggle: true, slider: 50 }; // user flips toggle in state
    act(() => {
      // updateBaseline updates the baseline selectively
      rerenderedResult.current.updateBaseline((old: any) => ({ ...old, toggle: true }));
    });
    
    rerender(toggledData);

    // Even though baseline was selectively updated (toggle=true), the local slider=50 still differs from baseline slider=10
    expect(rerenderedResult.current.hasChanges).toBe(true);
    expect(rerenderedResult.current.hasChangesRef.current).toBe(true);
  });
});
