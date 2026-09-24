# Verification

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
