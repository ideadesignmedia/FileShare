# Repository Guidelines

## Response/Implementation Guidelines
NEVER ADD UNNECESSARY COMMENTS
Do not use em dashes.
Do not instantiate unused variables.
Always make sure used variables are defined.

## Project Structure & Module Organization
- frontend/ — React + Vite (TypeScript). Source in `src/`, static assets in `public/`, optional targets under `electron/` and `cordova/`.
- backend/ — Node + TypeScript WebSocket API with Postgres (TypeORM). Source in `src/`.
- connection-manager/ — Node + TypeScript WebSocket hub for cross-node coordination. Source in `src/`.
- shared/ — TypeScript message/type contracts consumed by all services.

## Build, Test, and Development Commands
Prereqs: Node 20+ (all packages), Postgres running.
- Frontend
  - `cd frontend && npm install`
  - `npm run dev` — start Vite dev server.
  - `npm run build` — type-check + build + post-build.
  - `npm run preview` — serve built assets.
- Backend
  - `cd backend && npm install && npm run build && npm start`
  - Env: `DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, PORT, SERVER_URL, SERVER_TOKEN`.
- Connection Manager
  - `cd connection-manager && npm install && npm run build && npm start`
  - Env: `PORT, AUTH_TOKEN`.
Config: copy `config-sample.*` in each package to a local config (e.g., `config.json`). Do not commit secrets.

## Coding Style & Naming Conventions
- TypeScript, 2-space indent, semicolons, prefer `const`.
- Filenames: React components `PascalCase.tsx`; utilities/constants `kebab-case.ts`.
- Identifiers: camelCase (vars/functions); PascalCase (types/components).
- Lint: frontend uses ESLint (`npm run lint`). Keep imports ordered and avoid unused vars.
- Do not add comments.
- Do not use em dashes.
- Do not instantiate unused variables.
- Always make sure used variables are defined.
- Make sure all variables are used.
- Regular expressions that are reused throughout the process' lifecycle should be instantiated in a global scope to avoid recreation.

## Testing Guidelines
- No test runner is preconfigured. If adding tests:
  - Frontend: Vitest + React Testing Library, colocate as `*.test.ts(x)`.
  - Backend/Manager: compile then run Node tests (`node --test dist/**/*.test.js`) or set up Jest/Vitest; name as `*.test.ts`.
- Keep tests fast and focused; prefer unit tests for utils/hooks.

## Commit & Pull Request Guidelines
- Commits: imperative, concise; scope prefix recommended (e.g., `feat(frontend):`, `fix(backend):`, `chore(shared):`).
- PRs: clear description, linked issues, verification steps; screenshots for UI; note any config/DB migration impacts. Ensure `npm run build` (frontend) and Node services start locally.

## Security & Configuration Tips
- Never commit credentials. Use env vars or local config from samples.
- Postgres: verify connectivity before starting backend; review TypeORM `synchronize` for production.
