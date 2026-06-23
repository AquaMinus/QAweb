<!--
Instructions for AI coding agents working on QAweb.
Focus on concrete, discoverable patterns and commands.
--> 

# QAweb — Copilot Instructions

These notes are a compact, actionable guide for an AI coding agent to be immediately productive in this repository.

High-level
- Backend: single-process Node.js (Hono) that serves HTTP REST + WebSocket on one port. Game state (rooms, players, answers) is kept in-memory in a singleton game engine.
- Frontend: SvelteKit SPA (client) that connects to the backend REST APIs and the WebSocket endpoint for real-time gameplay.
- Persistence: SQLite (Drizzle ORM). Only hosts, question sets, share tokens and password resets persist — live game state is NOT written to DB.

Quick start (local dev)
- Backend: `cd server && npm install && npm run dev` (uses `tsx watch src/index.ts`, default port `3000`).
- Run migrations: `cd server && npm run db:migrate` (invokes `tsx src/db/migrate.ts`).
- Frontend: `cd client && npm install && npm run dev` (Vite, default port `5173`).

Key files and entrypoints (read these first)
- `docs/ARCHITECTURE.md` — canonical architecture and module descriptions (game engine, WS protocol, scoring).
- `server/src/index.ts` — HTTP server + WebSocket wiring, host vs player connection handling and lifecycle.
- `server/src/app.ts` — Hono app and REST route registrations.
- `server/src/config.ts` — runtime knobs (ports, pin length, heartbeat intervals, defaults).
- `server/src/modules/quiz/quiz.engine.ts` — in-memory singleton engine that owns Room and Player state and the phase state machine.
- `server/src/modules/quiz/quiz.ws.ts` — WS message handlers and routing for quiz events.
- `server/src/ws/connection-manager.ts` and `server/src/ws/protocol.ts` — connection indexing helpers and the JSON message schema.
- `server/src/db/*` — schema and migration script (see `package.json` `db:migrate`).
- `client/src/lib/ws.ts` and `client/src/lib/api.ts` — client side WS and REST helpers; stores are in `client/src/lib/stores/*.svelte.ts`.

Important runtime details and patterns
- Game state is ephemeral: do not persist runtime Room/Player/answers to DB. Changes to `quiz.engine.ts` must preserve the assumption that engine is a long-lived in-memory singleton.
- Host WebSocket connections MUST pass `role=host` and a `token` query param (JWT). Server decodes JWT and compares `sub` with `room.hostId`.
- Player session tokens are created server-side during `player:join`. The server-side code attaches the token to the WS as `ws._qaSessionToken` for subsequent messages.
- WS endpoint: `ws://<host>:<port>/ws`. Example host bind: `ws://localhost:3000/ws?pin=123456&role=host&token=<JWT>`; player example: `ws://localhost:3000/ws?pin=123456`.
- WS message shape (see `ws/protocol.ts`):
  ```json
  { "type": "player:answer", "payload": { "optionId": "<uuid>" }, "ts": 1670000000000 }
  ```

Common message types (quick reference)
- C→S: `player:join`, `player:reconnect`, `player:answer`, `host:start`, `host:next`, `host:kick`, `host:lock`.
- S→C: `room:joined`, `room:host_bound`, `quiz:question`, `quiz:answer_phase`, `quiz:result`, `quiz:next_countdown`.

Scoring and timing
- Scoring implemented in `modules/quiz/quiz.scoring.ts`. Two modes: `fixed` (always max points) and `time_decay` (linear decay to a floor — see `ARCHITECTURE.md`).
- The engine computes timestamps using `Date.now()`; tests or changes that rely on timing should be run in real-time-aware contexts or mock `Date.now()`.

Developer workflows and scripts
- Server dev: `server: npm run dev` — uses `tsx` watch (no build step). Production build: `npm run build` then `npm start` (runs `dist/index.js`).
- Client dev: `client: npm run dev` (Vite). Build: `npm run build`, preview: `npm run preview`.
- DB migrations: `server: npm run db:migrate`.

Code conventions & gotchas
- Project uses TypeScript ESM modules (`"type": "module"`). Use `import ... from '...'` and `export default`/named exports accordingly.
- Svelte stores use filenames like `auth.svelte.ts` and `player.svelte.ts` (these are Rune-style stores). Look in `client/src/lib/stores/` for usage patterns.
- Many internal IDs are UUID v4 (questions/options). Option colors are stable keys: `red`, `blue`, `yellow`, `green` — code relies on these strings for distribution counts.
- Room pin length and other runtime defaults live in `server/src/config.ts`; change here instead of sprinkling literals.

If you change core behavior
- When modifying room lifecycle or storage: update `docs/ARCHITECTURE.md` and search `modules/quiz` and `ws` modules for places that assume in-memory-only state.
- If you add new WS message types: update `server/src/ws/protocol.ts`, `server/src/modules/quiz/quiz.ws.ts`, and `client/src/lib/ws.ts` concurrently.

Where to look for tests / validation
- There are no unit tests included. Validate runtime behavior by running backend (`npm run dev`) and connecting the SPA (`client npm run dev`) or using a small WS client that sends messages matching `ws/protocol.ts`.

Contact points for follow-up
- If anything is ambiguous, inspect the runtime logs from `server/src/index.ts` (console logs on connection, disconnects, and errors) and `docs/ARCHITECTURE.md` for intended behavior.

---
If you'd like, I can refine this file to include code snippets for common edits (e.g., adding a new WS route or a new DB migration template). What would you like me to expand? 
