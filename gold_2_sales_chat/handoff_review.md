# Handoff design review

Date: 2026-09-22. Scope: this documentation package, not application acceptance.

## Checks completed

| Check | Result |
|---|---|
| Current requirements reflected | Pass: chat responsiveness, rich-message display, labels for management |
| Bulk/automatic sending excluded | Pass: label operations explicitly have zero send side effects |
| Monolith and active browser path respected | Pass: targeted changes in backend/frontend; no BFF/service migration |
| Agent tasks executable and ownership assigned | Pass: task IDs/dependencies, shared-file integrator, execution guide |
| API/state/schema contracts specified | Pass: receipt lifecycle, unknown outcome, per-account labels, migration ambiguity and WS scope |
| UI behavior specified | Pass: layouts, loading/errors, drafts, delivery states, label permissions, mobile |
| Test weights | Pass: Sprint 1 = 100 (10 cases), Sprint 2 = 100 (8 cases), Sprint 3 = 100 (9 cases) |
| File tree and README links | Pass: manually checked against created document paths |
| Whitespace | Pass: tracked diff and new Markdown files checked using Git whitespace checks |
| Existing application/user edit preserved | Pass: no application file edited in this task; pre-existing webhook change remains in worktree |
| Workflow precedence | Pass: current plan is first; old service history clearly marked historical |

## Review corrections incorporated

- Separated clientRequestId from provider cliMsgId; no fabricated provider IDs or text/time matching.
- Included provider-accepted/local-persistence-failed and crash/timeout unknown states; no exactly-once remote guarantee.
- Added scoped cache identity, late callback/logout guards, file reselect/reload behavior and account-switch scroll rules.
- Explicitly accounted for caption+attachment sends producing multiple real messages.
- Required actual payload evidence before interpreting call outcomes, durations, sticker formats or label membership snapshots.
- Preserved ambiguous old tag associations for review instead of duplicating across accounts.
- Restricted label mutations to management, with read-only Zalo mirrors and account-qualified realtime.
- Specified concurrent duplicate-name handling and transactional derived-label cache updates.

## Still pending for implementation team

- Confirm sprint execution and design defaults against current HEAD.
- Baseline builds/typecheck, executable test setup and browser measurements.
- SDK send/echo/content/label fixtures and actual database preflight.
- Approved live test accounts/conversations and target browsers/devices.
- Implementation, test reports, user pilot and deployment decision.

No runtime test, benchmark, schema migration, code implementation or deployment was performed by this design task. Documentation verification must not be reported as a successful Sales Chat release.
