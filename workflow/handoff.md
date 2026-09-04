# Handoff

## Current State
The independent-service direction is confirmed. The repository has been checkpointed on branch `chore/platform-reorg-baseline` at commit `bed2343`.

## Completed
- Reviewed the existing backend, BFF, frontend, deployment files, and current worktree.
- Created a Git checkpoint before reorganization.
- Confirmed the first milestone: independently runnable service framework.
- Confirmed that services should be independent from the start.

## Pending
- Approve the three-service proposal.
- Produce an exact migration plan with file moves, compatibility adapters, schemas, and deployment changes.
- Execute the extraction in incremental checkpoints.

## Recommended Next Skill
- gold-sprint (REORG)

## Files To Read First
- workflow/brief.md
- workflow/repo_assessment.md
- reorg/proposal.md

## Open Questions
- Choose service-to-service authentication: mTLS, signed internal JWT, or network-isolated static credentials.
- Confirm whether message retention/deletion policy must be included in the first milestone.
