<!-- This is a development workflow guide for AI Studio, not production configuration. -->

# Custom Agent Instructions

## Discord Bot Commands Reference
Whenever you add, remove, or modify a Discord slash command in `src/discordBot.ts` or `server.ts` (note: `worker/worker.js` is obsolete and removed), you MUST simultaneously update the `COMMANDS` array located inside `/src/components/CommandsGuide.tsx`. 

This guarantees that the web dashboard commands documentation stays perfectly in sync with the backend implementation without the user having to explicitly ask for it.

## Product Requirements Document (PRD) Maintenance
With every code update you do, change the text in `/PRD.txt` accordingly. You are required to keep the PRD document completely in sync with the current functionality, architecture, and configuration of the app. You shouldn't have to be reminded again.