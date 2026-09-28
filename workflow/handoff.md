# Handoff

## Approved UI polish — 2026-09-27
Frontend-only implementation complete; see `gold_2_sales_chat/composer_full/ui-polish-report.md` and `ui-polish-plan.md` for agent instructions, owned files, checks and limitations. Typecheck, 22-test sales-chat run, 43-test model/notification run, composer/tools Chromium at 320/390/1280, album Chromium at 390/1280 and build pass. No backend edits, deploy or commit. Existing release HOLD remains; build emits large chunk warning.

## Release HOLD findings 2/3/6/8 — 2026-09-27
See `gold_2_sales_chat/composer_full/release-hold-tools-fixes.md`. Shared server reservation barrier and frontend local action recovery integrated with senior hydration changes; atomic absent-action sealing, pre-await semaphore and required sticker keyword implemented. Typechecks/build/unit/browser checks pass; PostgreSQL barrier regression is present but unexecuted in this session (no isolated URL). No deployment/migration execution/commit. HOLD remains pending DB/integration review.

## Release HOLD fixes — 2026-09-27
Findings 1/4/5/7 fixed; read `gold_2_sales_chat/composer_full/release-hold-fixes.md` for shared recovery barrier integration contract. Extended-tools service/component deliberately untouched; other owner must integrate action recovery/barrier. Both typechecks, 5 new frontend regressions, 22 sales-chat tests, Chromium two sizes, 39 backend tests with disposable PostgreSQL pass. No production changes or commit. Overall release remains HOLD.

## Composer blockers checkpoint — 2026-09-27
Read `gold_2_sales_chat/composer_full/blockers-report.md`. Durable scoped outbox unlock and conservative staging byte release implemented. Both typechecks, frontend build, 22 sales-chat tests, two Chromium sizes, and 37 backend tests (including real disposable PostgreSQL) pass. Test container removed. No production migration/deployment/commit. Legacy unproven mirrors, browser-local/cross-tab limitations and live SDK/MinIO gates explicitly documented. All existing dirty work preserved.

## Extended tools checkpoint — 2026-09-27
Read `gold_2_sales_chat/composer_full/extended-report.md`. Backend/frontend tools implemented with actual SDK contracts and scoped no-replay receipts; attachment quote/mention context added. All dirty work preserved. Two additive migrations require deployment-owner review; none applied. Native voice remains explicit audio-file fallback; location unsupported. Batch outbox/unlock remains separate main work. Local checks pass; live SDK/DB/storage gates remain open.

## Album checkpoint — 2026-09-27
Received image albums implemented and locally verified; read gold_2_sales_chat/album_sprint/sprint_summary.md and frontend-report.md. Explicit older-history loading, inner-content anchoring and same-URL lightbox fixes included. Not deployed. Next checkpoint: upload staging/durable drafts and multi-file send contracts. Existing dirty worktree includes prior deployed upgrades; preserve it.

## Album frontend checkpoint — 2026-09-27
Received image album selector/grid/action/lightbox/anchor integration implemented and locally verified. Read `gold_2_sales_chat/album_sprint/frontend-report.md` for exact owned files, test commands/results and limitations. All prior dirty changes preserved; no backend edits, deployment or commit by frontend owner.

## Latest implementation — 2026-09-27
Rich-message projection/media/notification milestone implemented on 2ea9921. Read gold_2_sales_chat/sprint_2/upgrade-report.md and sprint_summary.md first. 107 tests pass; one isolated PostgreSQL integration test skipped; both typechecks and frontend build pass. Worktree intentionally uncommitted. No deployment/production rewrite. Remaining album grouping, complete recall/group/reminder event ingestion, live browser/media/database checks are explicitly listed in the report.

## Active Handoff — Sales Chat Readiness, 2026-09-22

**Start here, not with the historical Gateway next-step below.**

### Current State
User prioritized sales chat usability over architecture cleanup and requested a detailed design for another agent team. The design is in `gold_2_sales_chat/`; no application implementation has been performed in this handoff task.

### Read First
1. `workflow/brief.md` and current assessment.
2. `gold_2_sales_chat/README.md`.
3. `gold_2_sales_chat/design.md`, `ux.md` and `execution.md`.
4. `gold_2_sales_chat/sprint_1/plan.md` and `test_key.md`.

### Next Exact Action
Incoming MAIN checks current git state against baseline `5a9f732`, confirms Sprint 1 scope with Lam, and runs S1-01/S1-02 baseline + receipt discovery. Review/freeze contracts before assigning parallel implementation. Execute Gold phases in order and record actual verification results.

### Guardrails Specific to This Handoff
- Preserve the pre-existing uncommitted `backend/src/server/services/case-station-webhook.ts` edit.
- Keep existing monolith/browser integration; no service extraction or broad folder refactor.
- Tags classify customers/conversations only. No bulk-send or automated-message feature.
- Do not assume two-way Zalo label sync, provider client-ID injection, or unsupported call/sticker formats.
- One authoritative message state; account-qualified tag associations; no text/time-based correlation.
- No code builds/live tests/migrations/deployments have been claimed by the design author.

### Pending Evidence
SDK receipts and matching echoes; problematic message samples; supported target browsers; approved live test account/conversation; database/tag mapping preflight; Zalo label membership completeness.

### Recommended Next Skill
gold-sprint (GOLD), not REORG. A sprint can be worked by multiple agents following file ownership in `execution.md`.

---

## Historical Handoff — Independent Services

## Current State
The independent-service direction and signed internal JWT approach are confirmed. The implementation branch is `feat/independent-services-foundation`, created from checkpoint `bed2343`.

## Completed
- Reviewed the existing backend, BFF, frontend, deployment files, and current worktree.
- Created a Git checkpoint before reorganization.
- Confirmed the first milestone: independently runnable service framework.
- Confirmed that services should be independent from the start.
- Created and committed the independent-service architecture proposal at `b233c0f`.
- Produced `reorg/migration_plan.md` for phased extraction.
- Completed and verified Phase 1 service workspace, contract, health, and internal JWT foundation.
- Added and verified Gateway QR onboarding, persisted session credential, reconnect, status, and logout vertical slice.
- Deployed `zalohub-zalo-gateway.service` on `leco`, bound to `0.0.0.0:16002` for private-network access, with an isolated `zalohub_gateway` PostgreSQL role and `zalo_gateway` schema.

## Pending
- Plan the next Gateway increment for contacts/groups, account-ready events, and runtime ownership.

## Recommended Next Skill
- gold-sprint (REORG)

## Files To Read First
- workflow/brief.md
- workflow/repo_assessment.md
- reorg/proposal.md
- reorg/migration_plan.md
- reorg/verification.md

## Open Questions
- Confirm whether message retention/deletion policy must be included in the first milestone.
