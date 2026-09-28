# Sales Chat Upgrade — implementation handoff

Date: 2026-09-22. Source baseline: `5a9f732`.

**Status: design ready for implementation review; no application changes made.**

## Outcome

Make the current ZaloHub usable by the sales team: responsive sending and conversation switching, readable message formats, and dependable customer labels.

The user chose to improve the existing application. Large monolith restructuring and independent-service extraction are deferred. Tags are management data for future automation; changing a tag must not send any message.

## Read in this order

1. [Gold brief](gold_brief.md): scope, defaults, unresolved evidence.
2. [Technical design](design.md): state, API, data, rendering and tag contracts.
3. [Interaction specification](ux.md): layout, copy, loading/error states and mobile behavior.
4. [Agent execution guide](execution.md): ownership, dependency order, commands, release controls.
5. The current sprint's plan and test key:

| Sprint | Plan | Acceptance cases | Outcome |
|---|---|---|---|
| 1 | [plan](sprint_1/plan.md) | [test key](sprint_1/test_key.md) | Responsive, correctly acknowledged chat |
| 2 | [plan](sprint_2/plan.md) | [test key](sprint_2/test_key.md) | Voice, call, sticker/emoji presentation |
| 3 | [plan](sprint_3/plan.md) | [test key](sprint_3/test_key.md) | Label management and account-safe synchronization |

Shared current initiative state lives in `../workflow/`. Historical service work lives in `../reorg/` and `../gold_1_reorg_platform/`; do not execute those plans as part of this delivery.

Documentation-only review results: [handoff review](handoff_review.md). These are not application test results.

## Prompt for the incoming coordinator

> Implement the ZaloHub Sales Chat upgrade using `workflow/brief.md`, `workflow/handoff.md`, and `gold_2_sales_chat/README.md`. Read `gold_2_sales_chat/design.md`, `gold_2_sales_chat/ux.md`, `gold_2_sales_chat/execution.md`, and the selected sprint's plan/test key before editing. Start with Sprint 1 baseline and evidence tasks. Preserve the existing uncommitted Case Station webhook change. Use the existing backend/frontend paths and browser `/api` + `/ws` integration. Follow the contracts and file ownership in the design; coordinate shared-file edits through one integrator. Verify each sprint before advancing and provide evidence, unresolved failures, and a handoff. Do not claim real Zalo acceptance from mocked tests. Implementation is not an instruction to commit, deploy, or send messages to real customers. Ask Lam to confirm the first execution sprint if it has not already been authorized.

## What is executable now vs evidence-dependent

- Frontend state/reconciliation, draft/cache, tag UI, API contracts and test harness can start from this design.
- Provider receipt mapping, call/sticker payload mapping and Zalo label membership semantics require sanitized fixtures from actual SDK responses or approved test conversations.
- Database migrations require schema/data preflight on an isolated copy. Ambiguous historical tag assignments must not be guessed.
- No fixture, benchmark, build, browser test or live send has been completed by this documentation task.
