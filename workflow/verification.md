# Verification

## Extended tools — 2026-09-27
See `gold_2_sales_chat/composer_full/extended-report.md`: backend 36 pass/1 DB skip; frontend typecheck/build, 22 regressions, context unit test, composer and tools browser tests at 390/1280 pass. No live provider/MinIO/microphone or PostgreSQL migration execution. Structural review and exact unsupported capabilities recorded there.

## Current Initiative — Sales Chat Readiness, 2026-09-22

### Sprint 1 Structural Review — implementation phase
Independent VERIFIER reviews completed. Result: return to CODER before TESTER. Backend blockers: status repair can insert an incomplete media row before normal persistence; unrelated-account broadcasts enter every socket queue. Frontend blockers: cross-tab user/token replacement must invalidate old state/queues; persisted queue state can regress after dispatch; caption+image placeholder merge; stored-provider aliases vs shared cli IDs; reconnect message refresh; remount conversation resubscription. Detailed reports: `gold_2_sales_chat/sprint_1/backend_verification.md` and `frontend_verification.md`. No runtime tests executed yet; correction agents own the follow-up.

### Scope of This Record
Documentation/design verification only. Historical service test results below do not establish chat-upgrade acceptance.

### Performed
- Inspected active frontend send/cache/composer/message renderers, direct API wrapper, desktop/mobile wiring.
- Inspected backend sender, runtime append/repair, normalizer/history helpers, tag repo/migration/sync, account middleware and WS delivery.
- Identified build commands and missing standard test scripts; recorded provider/data evidence gaps.
- Created detailed design, ownership plan and three weighted test keys; implementation/test results remain pending.

### Handoff Verification Results
- Confirmed the handoff document tree and relative README links against the created files.
- Reviewed all three test keys: Sprint 1 has 10 cases, Sprint 2 has 8, Sprint 3 has 9; each totals 100 points and declares critical gates.
- Checked scope alignment: current monolith, three sales-facing sprints, management-only tags, deferred Zalo write-back/bulk sending, fixture-gated provider mappings.
- Current workflow sections explicitly supersede historical service-extraction next steps; historical records are retained.
- `git diff --check` passed. `git diff --no-index --check /dev/null` passed for each new handoff Markdown file at review time.
- Git status shows documentation additions/updates plus the pre-existing Case Station webhook modification; no application source was edited by this task.
- Result: documentation handoff verified; implementation acceptance remains pending. See `gold_2_sales_chat/handoff_review.md`.

### Not Performed
Application builds/typecheck, automated/browser/live-provider tests, benchmarks, migrations, deployment and customer messaging. Planned test cases are not passes.

### Recommended Next Step
Execute Sprint 1 baseline/evidence tasks after scope confirmation. Report acceptance per `gold_2_sales_chat/sprint_1/test_key.md`.

---

## Historical Verification — Independent Services

## Expected Checks
- Independent build and start commands for all services.
- Health and readiness endpoints for all services.
- Schema ownership and no cross-service database queries.
- Browser flows use the Web Platform and BFF rather than direct Gateway access.

## Performed Checks
- Repository structure and current entry points reviewed.
- Existing build commands identified.
- `npm run build:foundation` completed for contracts, Management API, Zalo Gateway, and Web Platform.
- Started all three services with isolated ports and verified `/health` or `/ready` endpoints.
- Issued a short-lived Gateway token from Management API and verified the Gateway accepted it.
- Verified the Gateway rejects the same internal route without a token with HTTP 401.
- `git diff --check` passed for the Phase 1 worktree.
- Gateway Phase 2 vertical slice built successfully with `npm run build:foundation`.
- Gateway started against local PostgreSQL with an isolated `zalo_gateway` schema and returned a successful readiness response.
- Management API issued an `onboarding.manage` token, and Gateway created a real QR payload through `zalo-api-final`.
- Gateway rejected an onboarding query without the internal token with HTTP 401.
- Deployed the standalone Gateway as `zalohub-zalo-gateway.service` on `leco` at `0.0.0.0:16002` for private-network access.
- Verified live `/health` and `/ready` responses after systemd start.
- Verified the Gateway database role can query `zalo_gateway.accounts` and cannot read `public.system_users`.

## Results
- pass for Phase 1 service foundation
- pass for the Phase 2 QR/session vertical slice

## Issues Found
- No standard automated test suite exists for the existing application.
- Phase 1 has service skeletons only; no Zalo runtime, database schema, or browser flow has migrated yet.
- Contact/group synchronization, message listener, message persistence, media, and send operations remain in the monolith and are not yet Gateway behavior.

## Confidence
- high for the Phase 1 foundation and QR/session vertical slice

## Recommended Next Step
Plan the next Gateway increment for directory synchronization and account-ready event delivery. The deployed service is intentionally localhost-only until Management API is deployed and an internal reverse-proxy policy is defined.
# Rich-message verification — 2026-09-27
See gold_2_sales_chat/sprint_2/upgrade-report.md. Final execution: 107 tests pass, one isolated PostgreSQL test skipped; backend/frontend typechecks pass; frontend build passes with bundle-size warning. Structural findings were fixed before final testing. Production deployment, live browser/media checks and remaining album/recall/reminder scope are not complete.
# Album frontend checkpoint — 2026-09-27

Reviewer follow-up: explicit guarded load-older button wired on desktop/mobile; visible inner-content anchors; keyed same-URL lightbox slots. Final frontend typecheck/build pass, focused album 6/6 and sales-chat 22/22 pass, eight browser scenarios pass across 390px/1280px. Details in album frontend report.

Scoped structural verification and executable tests complete. See `gold_2_sales_chat/album_sprint/frontend-report.md`: 53 distinct unit/SSR tests pass, Chromium 390px/1280px pass, frontend typecheck/build pass. No live provider verification. Existing bundle-size warning remains.
# Composer blockers structural review — 2026-09-27
TESTER completed: both typechecks, frontend build, 22 sales-chat tests, Chromium 390/1280 and 37 focused backend tests including disposable PostgreSQL PASS. Final added quota upload test rerun PASS. See blockers-report.md for scope and limitations; no production changes.
VERIFIER: reviewed immutable scoped outbox, explicit detach failure, old batch targeting, no reload sends, conversation queue barrier, global execution/delete gate, FK metadata retention and mirror/persistence release proof. Skipped IndexedDB writes now fail closed. Unknown/sending never authorize cleanup or retry. Legacy receipts without mirror evidence remain conservative. Runtime tests pending below.
# UI polish structural verification — 2026-09-27
Final automated gates pass; exact commands/results, weighted assessment and remaining release gates are in `gold_2_sales_chat/composer_full/ui-polish-report.md`. Browser harness focus timing corrected and rerun successfully. Production build has a nonfatal large-chunk warning.
Reviewed UI-only changes: existing stage/send/query/retry/archive/abandon handlers retained; no backend or controller edits. Preview URLs revoke on lifecycle cleanup. Dialogs restore focus explicitly; Radix popovers handle Escape and portal placement. Tool categories preserve capability gating and unknown receipt barrier. `git diff --check` passes. Runtime verification follows in composer_full/ui-polish-report.md.
