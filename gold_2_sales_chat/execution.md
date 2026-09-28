# Agent execution and delivery contract

## 1. Roles and ownership

The user intends to hand this package to another agent team. The following split is recommended; a single agent may execute roles sequentially. Parallel work is allowed only after contracts are agreed and ownership is assigned.

| Role | Responsibility | Primary owned files |
|---|---|---|
| Coordinator / integrator | Confirm sprint, baseline, DTO freeze, compose work, resolve conflicts, final report | workflow, plans, shared types, API wrappers, DashboardPage, useDashboardState, server/index, package scripts |
| Backend delivery agent | Send receipt, request registry, sender error boundaries | sender, send-request service/repo/routes, corresponding migration |
| Frontend state agent | Reconciliation, scoped state/cache/drafts, send flow, render subscriptions | chat/composer stores, client-db, chat model/hooks, existing hook adapters |
| Realtime agent | Authenticated scoped WS and reconnection lifecycle | backend server/ws/handler, frontend features/realtime/useWebSocket, narrow access helper |
| Message presentation agent | Fixture-driven normalization, rich-message UI, audio media path | normalizer/helper projection, message components; media-route patch coordinated with integrator |
| Tag backend agent | Tag API, migration, sync, transactional label cache | tag service/repo/routes, syncLabels section, tag migration |
| Tag frontend agent | Picker, manager, filter, keyed data and invalidation | frontend features/tags, scoped tag store if required |
| Verifier | Structural review only before tests | sprint verification notes, shared verification state |
| Tester | Execute test key and capture evidence | test fixtures, tests, sprint report/evidence |

No two agents edit the same file simultaneously. In particular:

- `frontend/src/types.ts`, `backend/src/core/types.ts`, `api.ts`, `bff-api.ts`, `useDashboardState.ts`, `DashboardPage.tsx` are integration-owned.
- `MessageBubble.tsx`: Sprint 1 delivery-status patch lands before Sprint 2 renderer work.
- `sender.ts` and `core/runtime/index.ts`: delivery changes land before rich-message integration.
- WS contract lands in Sprint 1; tag agent requests scoped event support rather than opening an independent broadcast path.
- New migrations receive non-conflicting timestamps after existing migrations; names in plans are descriptive, not literal timestamps to copy blindly.
- `backend/src/server/services/case-station-webhook.ts` is existing user work. Do not include it in patches/commits or revert it.

## 2. Dependency graph

```text
S1 baseline + provider receipt evidence + contract review
  ├─ backend send requests/receipts
  ├─ frontend pure state/draft/cache (mock agreed receipt)
  └─ scoped realtime (coordinate shared auth types)
       ↓
S1 integration → structural review → tests → sales pilot/report
       ↓
S2 verified content fixtures
  ├─ backend normalizer/historical projection/media
  └─ frontend renderers using agreed fixtures
       ↓
S2 integration → structural review → tests → report
       ↓
S3 schema preflight + verified Zalo labels contract
  ├─ backend tag migration/service/sync
  └─ frontend tag UI with mock account API
       ↓
S3 integration → structural review → tests → report
```

Evidence discovery for a later sprint can happen in parallel. Do not merge a later sprint's overlapping shared-file edits before the preceding contract is stable.

## 3. Phase protocol and artifacts

For each sprint, announce transitions explicitly:

1. MAIN: confirm sprint scope; check current HEAD/worktree; record changes since `5a9f732`.
2. PLANNER: validate this plan/test key against current code and fixtures. Update design/decision log for any necessary change. Complete planner artifacts before coding.
3. CODER: implement only the selected sprint. Each agent hands back changed paths, public interface, tests added, known limitations, and integration instructions.
4. VERIFIER: inspect imports, DTO consistency, error/state transitions, account scoping, and planned-vs-actual changes. Record findings in `workflow/verification.md` and `sprint_N/verification.md`; return blocking issues to coder.
5. TESTER: run `test_key.md`; write `sprint_N/report.md` with evidence and score.
6. CODER response: write `sprint_N/coder_response.md` explaining failed/blocked cases and fixes, without concealing them by changing the score.
7. MAIN: write `sprint_N/sprint_summary.md`, update handoff, report to Lam and confirm next sprint.

Do not pre-create successful reports. This design includes plans/test keys only, not implementation/test completion artifacts.

## 4. Baseline and verification commands

From repository root, inspect:

```bash
git status --short
git rev-parse --short HEAD
git diff --stat
```

Baseline builds and typecheck (record existing failures separately):

```bash
npm run build --prefix backend
npm run build --prefix frontend
```

Frontend typecheck: run `./node_modules/.bin/tsc --noEmit -p tsconfig.json` with working directory `frontend/` after verifying the local compiler exists. Do not let `npx` silently download another compiler. Frontend's Vite build alone is not a typecheck. Baseline may contain pre-existing duplicate props/type mismatches; fix directly touched ones and report unrelated blockers instead of suppressing them globally.

At design time neither package declares a test script. The integrator must establish executable targeted tests before claiming a test pass:

- Prefer Node's built-in test runner with the existing backend `tsx` for pure TypeScript logic (e.g. a new `test:sales-chat` script with an explicit test-file list).
- PostgreSQL tests use a disposable database with migrations, including copied/synthetic legacy fixtures. Never point migration tests at production DATABASE_URL.
- Browser tests may use installed backend Playwright with an explicit fixture app/test backend URL. Mock provider sends by default. If test dependencies/scripts are added, document exact versions/commands in the report.
- Keep real-account smoke scripts separate from default automated tests; require an explicitly selected test account/conversation.

End-of-change checks include relevant scripts, builds/typecheck, `git diff --check`, and reviewing final diff. Build tools may generate dist files; stage only intended files if the user separately requests a commit.

## 5. Test evidence and scoring

Each test-key case includes setup/input/expected result and weight. Score = sum(weight × factor): pass=1, partial=0.5, fail/blocked=0. A score of 90 is not acceptance if a critical case failed.

Report each case as pass/partial/fail/blocked, not just a numeric score. Include command/browser, fixture/input, result, logs/screenshots/trace where useful. Mark mock integration separately from live Zalo smoke. Live checks without an available test target remain blocked.

Do not log customer text, cookies, access tokens, raw session payloads or reusable media links. Use redacted fixtures with shape/format preserved. If a bug depends on a real media binary, keep it local to the test environment and record only its safe test description.

## 6. Release and rollback

Implementation permission is not permission to deploy, commit, or send customer messages. Prepare release instructions and coordinate the rollout with Lam.

- Preserve old artifacts before deployment. Backend currently calls migrations at startup; check migration paths/compiled output and DATABASE_URL before restarting it.
- Sprint 1 new request registry is additive. Deploy backend + new frontend together for authenticated WS; old cached clients need reload. Do not run a second listener process against the same accounts.
- Sprint 2 reader projection should be additive. If media routing changes, verify image/file/video downloads as well as audio.
- Sprint 3 requires tag association migration + new scoped writers in one controlled cutover. Dry-run and row-accounting report are mandatory; unresolved legacy mappings are an explicit coordinator decision.
- Rolling back Sprint 1 after new send attempts must retain the request table and never replay pending/unknown work. An older binary cannot uphold its guarantees for new client requests: pause sending/revert frontend with the backend, reconcile unresolved requests first.
- Rolling back Sprint 3 must preserve post-migration scoped assignments. Export them before any restore; do not collapse account-qualified data into the old unscoped join table.
- Capture pilot observations from the sales team after each release before expanding scope.

## 7. Definition of handoff done

A sprint is handed off only with: implemented diff, verified contracts/migration notes, test report with evidence, unresolved issues, next exact task, and current source revision. Claims such as "instant", "two-way sync", "no duplicate delivery", or "supports all Zalo formats" require evidence and the limitations specified in `design.md`.
