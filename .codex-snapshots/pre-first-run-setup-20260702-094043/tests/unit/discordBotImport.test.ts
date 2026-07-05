import { describe, it, expect, afterAll } from "vitest";
import { shouldRunFullPass, startDiscordBot, shutdownDiscordBot } from "../../src/discordBot.js";

describe("discordBot import side effects", () => {
  afterAll(async () => {
    // Ensure cleanup just in case tests call startDiscordBot
    await shutdownDiscordBot();
  });

  it("should be able to import discordBot.ts without hanging", async () => {
    // If there's an interval created at root level, vitest will hang after completion
    // The test framework should just exit cleanly.
    expect(typeof shouldRunFullPass).toBe("function");
  });
  
  it("should be able to start and shutdown cleanly", async () => {
    // This will create all the timers
    startDiscordBot().catch(() => {});
    // Wait a bit
    await new Promise(r => setTimeout(r, 100));
    // Should clean them up
    await shutdownDiscordBot();
  });
});
