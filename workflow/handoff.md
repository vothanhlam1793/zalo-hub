# Handoff

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
