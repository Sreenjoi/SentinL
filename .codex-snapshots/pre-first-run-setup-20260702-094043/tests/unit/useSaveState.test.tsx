/**
 * @vitest-environment jsdom
 */
import { renderHook, act } from "@testing-library/react";
import { useSaveState } from "../../src/hooks/useSaveState";
import { expect, test, describe } from "vitest";

describe("useSaveState synchronous dirty state", () => {
  test("slider edit marks dirty immediately", () => {
    let currentData = { slider: 0 };
    const { result, rerender } = renderHook(() => useSaveState(currentData));

    expect(result.current.hasChanges).toBe(false);
    expect(result.current.hasChangesRef.current).toBe(false);

    // simulate slider edit
    act(() => {
      currentData = { slider: 50 };
      result.current.markDirty(currentData, "slider");
    });
    
    // marks dirty synchronously before react renders
    expect(result.current.hasChangesRef.current).toBe(true);
    expect(result.current.dirtyFieldsRef.current.has("slider")).toBe(true);

    rerender();
    expect(result.current.hasChanges).toBe(true);
    // ensure dirty fields persist
    expect(result.current.dirtyFieldsRef.current.has("slider")).toBe(true);
  });

  test("toggle after slider does not clear slider dirty state", () => {
    let currentData = { slider: 0, toggle: false };
    const { result, rerender } = renderHook(() => useSaveState(currentData));

    act(() => {
      currentData = { slider: 50, toggle: false };
      result.current.markDirty(currentData, "slider");
    });
    rerender();

    expect(result.current.dirtyFieldsRef.current.has("slider")).toBe(true);

    // simulate toggle change without markDirty immediately, but via standard react re-render
    act(() => {
      currentData = { slider: 50, toggle: true };
    });
    rerender();

    expect(result.current.hasChanges).toBe(true);
    expect(result.current.dirtyFieldsRef.current.has("slider")).toBe(true); // preserved
  });

  test("remote snapshot does not overwrite dirty local fields", () => {
    let currentData = { remoteText: "A", localSlider: 0 };
    const { result, rerender } = renderHook(() => useSaveState(currentData));

    // Local change happens
    act(() => {
      currentData = { remoteText: "A", localSlider: 10 };
      result.current.markDirty(currentData, "localSlider");
    });
    rerender();
    
    expect(result.current.hasChanges).toBe(true);
    expect(result.current.dirtyFieldsRef.current.has("localSlider")).toBe(true);

    // simulate updater via updateBaseline pulling new data from remote
    act(() => {
      result.current.updateBaseline((old) => ({
        ...old,
        remoteText: "B"
      }));
    });

    // We only updated the baseline, next render should compare against updated data
    act(() => {
      currentData = { remoteText: "B", localSlider: 10 }; // React applying the remote text to current state but preserving localSlider
    });
    rerender();

    // It should STILL be dirty because localSlider is 10 vs baseline 0
    expect(result.current.hasChanges).toBe(true);
    expect(result.current.dirtyFieldsRef.current.has("localSlider")).toBe(true);
  });

  test("save clears dirty state", () => {
    let currentData = { field: 'A' };
    const { result, rerender } = renderHook(() => useSaveState(currentData));

    act(() => {
      currentData = { field: 'B' };
      result.current.markDirty(currentData, 'field');
    });
    rerender();

    expect(result.current.hasChangesRef.current).toBe(true);
    expect(result.current.dirtyFieldsRef.current.has('field')).toBe(true);

    // simulate save
    act(() => {
      result.current.setIsSaved(true);
    });

    expect(result.current.hasChangesRef.current).toBe(false);
    expect(result.current.hasChanges).toBe(false);
    expect(result.current.dirtyFieldsRef.current.size).toBe(0);
  });
});
