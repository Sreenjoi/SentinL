\# Project Instructions for Codex



\## Project overview



This is a software project that should prioritize working, maintainable, production-safe code. Use the existing architecture and conventions before introducing new patterns.



\## Working style



\- Lead with the outcome when reporting results.

\- Make the smallest safe change that solves the problem.

\- Do not rewrite or refactor unrelated code.

\- Preserve existing behavior unless the requested task requires changing it.

\- Match the existing naming, formatting, folder structure, and component patterns.

\- Ask before destructive, irreversible, external, or production-impacting actions.

\- Do not commit, push, deploy, publish, delete, reset, or overwrite user work unless explicitly asked.



\## Context and token efficiency



\- Start with the smallest relevant set of files.

\- Prefer search before reading large files.

\- Do not read generated folders unless directly relevant.

\- Do not inspect `node\_modules`, `.next`, `dist`, `build`, coverage output, or lockfiles unless necessary.

\- Stop investigating once the root cause is sufficiently supported.

\- Use targeted tests/checks before broad full-suite checks.



\## Project structure



\- Start frontend work in `src`, `app`, `pages`, `components`, or `hooks`, depending on what exists.

\- Start backend/API work in `api`, `server`, `routes`, `controllers`, `lib`, or equivalent folders.

\- Reuse existing UI components before creating new ones.

\- Reuse existing API helpers, validation utilities, and types before adding new ones.



\## Package manager



\- Infer the package manager from the lockfile.

\- If `pnpm-lock.yaml` exists, use pnpm.

\- If `package-lock.json` exists, use npm.

\- If `yarn.lock` exists, use yarn.

\- Do not create a second lockfile.



\## Verification



\- After code changes, run the most targeted relevant check available.

\- For TypeScript changes, run the project’s typecheck command if available.

\- For UI or route changes, run the relevant test/build check if available.

\- If tests cannot be run, explain why.

\- Never claim verification passed unless it actually passed.



\## Dependencies



\- Do not add new dependencies unless clearly justified.

\- Prefer existing libraries and built-in APIs.

\- Ask before adding production dependencies.



\## Security



\- Never expose secrets, tokens, API keys, credentials, or `.env` values.

\- Treat auth, payments, file uploads, database migrations, and user data as high-risk areas.

\- Validate user input at server/API boundaries.

\- Help only with defensive, authorized, educational, or CTF security work.



\## Final response format



For completed code changes, report:



1\. What changed

2\. Why it changed

3\. What verification was run

4\. Any remaining risks or next steps

