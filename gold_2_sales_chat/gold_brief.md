# Gold 2 — Sales Chat Readiness

## Goal

Salespeople can open the app, select a customer, read/listen to incoming content, reply without UI uncertainty, and classify the conversation with labels.

## Confirmed user requirements

1. Sending currently feels delayed; improve responsiveness and correctness.
2. Some large icons/stickers render poorly.
3. Call bubbles are confusing.
4. Voice messages need an understandable playback control.
5. Tags organize many customers in ZaloHub and relate to Zalo labels.
6. Bulk sending is deferred. Future system automation may use tags, but this version provides management only.
7. Produce a detailed design for another agent team to implement.

## Delivery defaults chosen for this design

These are implementation defaults, not claims that the user explicitly selected every policy:

- Keep the existing monolith, Express entrypoint, React/Vite app, PostgreSQL, MinIO, and Zalo SDK.
- Desktop sales workflow first; maintain equivalent core functionality in `/m`.
- Keep existing login/JWT mechanism; no BFF/cookie migration.
- Internal labels are newly created per account; existing global labels remain usable subject to the rules in `design.md`.
- Viewers view/filter labels; editors assign/unassign; account admins/masters manage account label definitions; super-admin retains its existing bypass.
- Zalo-origin labels are read-only mirrors in v1. Verify actual API support separately before proposing writes back to Zalo.
- Voice means playback, not recording or speech-to-text. Call support means call records, not placing/answering calls.
- Sticker/icon scope is correct display of received and existing outgoing content. A sticker catalogue/picker is not included.
- Drafts and unresolved outgoing intents survive account/conversation switching; text drafts and serializable pending metadata survive reload. File bytes remain tab-local in v1.

## Scope by sprint

| Sprint | Deliverables |
|---|---|
| 1 | Baseline measurement; conversation-keyed state; deterministic reconciliation; per-message status; additive send receipt/request-status API; draft isolation; image preview; cache-first reads; scoped realtime required by these flows |
| 2 | Evidence-based message normalization; voice player; call card; sticker/emoji renderer; historical-data compatibility; media playback/seek support as required |
| 3 | Account-safe tag storage/migration; label CRUD; assignments; filters; Zalo import; scoped realtime; role enforcement |

## Boundaries

- No global architecture reorganization, service extraction, new message broker, bulk-send jobs, automation rule builder, automatic send on tag change, or CRM customer-identity merge.
- A conversation is identified by account + canonical conversation ID, not by a cross-account customer entity.
- Existing API fields/URLs remain compatible where possible. New fields are additive. Correcting missing authorization on touched paths is an intentional compatibility change and must be tested/documented.
- Preserve the uncommitted `backend/src/server/services/case-station-webhook.ts` change found at handoff.
- Do not run two runtimes for the same real account to test this upgrade.

## Evidence to collect at Sprint 1/2/3 entry

| Evidence | Owner | Why needed |
|---|---|---|
| Baseline build/typecheck/browser results | Verifier/tester | Existing manifests have no standard test command; Vite build is not typecheck |
| SDK text/image/file send result + corresponding incoming echo | Backend agent | Provider IDs, number of messages emitted, reliable correlation |
| Slow-send browser timeline and GET-message timing | Frontend/tester | Separate paint, network, SDK and persistence delay |
| Sanitized voice/call/sticker examples, including stored history | Media agent | Never guess provider call type/status/duration or asset format |
| Actual labels response, especially assignment membership and completeness | Tag backend agent | Existing importer assumes `labelData[].conversations` |
| Tag/conversation schema and association cardinality | Tag backend agent | Existing join table lacks account ID |
| Approved test account, test conversation and target browser/device | Coordinator + Lam | Live acceptance and realistic measurements |

Missing evidence blocks only the affected implementation/acceptance case, not unrelated work. Mark tests blocked rather than pass.

## Success and sequencing

- All correctness-critical cases in each sprint must pass before release.
- Performance targets in the test keys are measured targets, not current results or promises about Zalo network latency.
- Sprint 1 ships first for sales feedback; Sprint 2 and 3 follow with separate reports.
- Implementation phases follow MAIN → PLANNER → CODER → VERIFIER → TESTER → CODER response → MAIN. This handoff supplies planner artifacts; the incoming coordinator confirms them against current HEAD before execution.
