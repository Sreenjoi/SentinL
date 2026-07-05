# AI Studio Safety Guidelines

- Patch scripts are archived history only and must not be executed.
- Never run full integration, load, stress, soak, or live tests inside AI Studio.
- Never run temporary scanner scripts that use deletion APIs.
- Never run scripts named `search_deletions.js` or similar.
- Never run `npm install` or `npm ci` if `package.json` is missing.
- Before editing, verify `package.json`, `server.ts`, `src/`, `app/`, and `vite.config.ts` exist.
- Allowed commands in AI Studio:
  - `npm run lint`
  - `npm run build`
  - `npm run test:unit`
  - `npm run test:smoke`
- Heavy tests must run locally, in GitHub Actions, or in a disposable CI workspace only.
