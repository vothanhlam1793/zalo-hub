# Handoff

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
- Deployed `zalohub-zalo-gateway.service` on `leco`, bound to `127.0.0.1:16002` with an isolated `zalohub_gateway` PostgreSQL role and `zalo_gateway` schema.

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
