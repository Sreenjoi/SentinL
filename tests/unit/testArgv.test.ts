import { describe, it } from "vitest";

describe("Test", () => {
  it("shows argv", () => {
    console.log("process.argv[1] is", process.argv[1]);
  });
});
