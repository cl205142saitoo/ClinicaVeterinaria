# AGENTS.md

## Verify / run

- No `test`, `lint`, or format scripts. Verify with `npx tsc --noEmit` then `npm run build`; `npm start` = build + `electron .` (run from repo root).
- Schema changes: `npx prisma validate` → `npx prisma generate` → `npx tsc --noEmit` → `npm run build`. `validate`/`generate` work offline with a dummy `DATABASE_URL`; `db:deploy` and seeds write to the real MySQL in `.env` — don't run them for routine checks.
- `npm run build` runs `tsc && node scripts/copy-assets.js`. Don't skip `copy-assets.js` or edit `dist/`: it bundles preload/renderer with esbuild and removes tsc-generated renderer `.js`.

## Runtime layout

- Entry points: `src/main/main.ts` (main process) and `src/renderer/main.ts` (single renderer entry); HTML is `src/renderer/renderer.html`, not `index.html`. `window.api` exists only inside Electron — opening `dist/renderer/renderer.html` in a browser cannot work.
- `src/main/ipc/handlers.ts` registers only whitelisted channels. Adding an IPC call means updating `src/shared/ipc-channels.ts`, `src/main/preload.ts` (`Api`), the `CANAIS` list + exhaustive handler record, and `src/shared/types.ts` (plus validators for new payloads). Authorization belongs in `PolicyService`/`SessaoService` handlers; errors go through `paraErroSeguro` in pt-BR.
- Renderer controllers select elements by exact IDs in `renderer.html`; keep IDs stable and tab panes as direct children of `#conteudoAbas`.

## Environment / database

- Load `.env` via `carregarEnv()` as the first import in `src/main/main.ts` and seed scripts; Prisma CLI reads `.env` itself, Prisma Client does not. Shell env wins; never send `DATABASE_URL`, SMTP secrets, or `PHD_ADMIN_SENHA` to the renderer or commit `.env`.
- MySQL 8.0.16+ required. Manual `CHECK` constraints exist only in `prisma/migrations/*/migration.sql`, not in `schema.prisma` — preserve them when regenerating. Use `prisma migrate deploy`, never `migrate dev` against the shared DB.
- The shared MySQL schema contains other projects' tables; PetHealthPD tables are capitalized and case-sensitive — do not delete them. `prisma/dev.db` is a 0-byte SQLite leftover and unused.
- Use ASCII status tokens (`CONCLUIDA`, not `CONCLUÍDA`); `DATETIME` is UTC, `@db.Date` values are `YYYY-MM-DD` — use `src/shared/datas.ts` for civil dates, not `toISOString().slice(0, 10)`.

## Data / conventions

- `npm run seed:admin` needs `PHD_ADMIN_NOME`, `PHD_ADMIN_EMAIL`, `PHD_ADMIN_SENHA`; public `auth:registrar` always creates `ATENDENTE`. Admin credentials are documented in README ("Login de entrega") — don't hardcode them.
- `seed:dados` and `seed:financeiro` are additive and idempotent by reserved CPFs/codes; they never `DELETE`/`TRUNCATE`.
- Seed scripts must keep `ts-node --compiler typescript5`: TypeScript 7 breaks ts-node 10; the app build stays on TS 7.
- Integrations (ViaCEP, IBGE, Nager holidays, local `GET /api/resumo`) run in the main process and tolerate offline; no network is needed for build/typecheck.

## Docs

- `README.md` is a long historical validation log; when it conflicts with scripts/config/schema, trust the executable source. `docs/PLANO_*` are plans, not guarantees.
- `opencode.jsonc` sets `default_agent: "arquiteto"` (approval-gated coordination) and watcher ignores `dist/**`, `node_modules/**`.
