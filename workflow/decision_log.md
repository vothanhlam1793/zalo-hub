# Decision Log

## Current Precedence — 2026-09-22

The entries below this section describing independent services are retained history. The following decisions govern the current delivery:

### D-SALES-01 — Prioritize sales chat in the existing application
The user accepted a monolith direction, then explicitly prioritized responsive frontend chat and practical usability over making the architecture uniform. Keep existing backend/frontend and defer broad reorganization/service extraction. This does not authorize deleting or stopping existing service foundations.

### D-SALES-02 — Tags are management data in this version
The user clarified that future system automation may select customers by tags, but bulk sending is not needed now. Tag CRUD/assignment/filter/import must have no message-send side effect. Stable IDs and account-qualified associations provide future compatibility.

### D-SALES-03 — Prepare a detailed handoff, not implement in this task
The user requested detailed design for another agent team. Produce planner artifacts in `gold_2_sales_chat/` and align workflow files. Preserve current application code and the existing uncommitted webhook change. Incoming coordinator confirms sprint execution under Gold workflow.

### D-SALES-04 — Proposed implementation defaults
Use three sprints: delivery/state; rich-message display; label management. Design defaults: additive send receipt/request registry, explicit unknown-send state, scoped authenticated WS, internal account labels plus read-only Zalo mirrors, preserve ambiguous old associations for review. These technical choices are specified for coordinator review; provider capabilities and production data mappings remain evidence-dependent.

### D-SALES-05 — Do not confuse transport acknowledgement with recipient delivery
Client feedback is immediate, but sent status requires provider acceptance evidence. Unknown post-dispatch outcomes are not auto-retried. The request registry prevents duplicate Hub dispatch for known attempts but cannot promise exactly-once remote delivery across an acceptance/persistence crash window.

---

## Historical Decisions — Independent Services

## Decision
Adopt three independently deployable services from the beginning: Zalo Gateway, Management API, and Web Platform.

## Why
Each module must be independently runnable and verifiable, with clear ownership of data and contracts.

## Alternatives Considered
- Keep a modular monolith first and extract services later.
- Split only the Zalo runtime while retaining the existing backend as the management and web API.

## Impact
The existing backend will be decomposed. Zalo integration and message data become the responsibility of Zalo Gateway; user identity, authorization, and policies belong to Management API; browser presentation belongs to Web Platform.

## Follow-up
- Approve service topology and migration phases.
- Select service-to-service authentication.

## Decision
Use short-lived signed internal JWTs for Management API to Zalo Gateway requests in Phase 1.

## Why
The Gateway must independently verify the requesting user, account, operation, issuer, audience, and expiry without accepting browser credentials. This provides a service boundary without introducing a broker or mTLS dependency in the first extraction.

## Alternatives Considered
- Network-isolated static API key only.
- mTLS-only service identity.

## Impact
Management API now issues 60-second Gateway credentials after service-key authentication. Gateway accepts only `management-api` credentials for its internal API.

## Follow-up
- Replace the Phase 1 service-key token issuer with authenticated Web Platform to Management API flow during Phase 3.
- Add key rotation and mTLS at deployment infrastructure when services leave the trusted internal network.

## Decision
Extract QR onboarding and persisted Zalo session recovery as the first Gateway vertical slice, before moving the full listener, sync, message, and media runtime.

## Why
The existing `GoldRuntime` constructs all Zalo capabilities together. Moving that closure immediately would combine database migration, message delivery, media, browser realtime, and Dify decoupling in one high-risk change. QR/session is a real independently runnable Gateway capability and establishes the correct security and data boundary.

## Alternatives Considered
- Move the full `GoldRuntime` source closure in one Phase 2 change.
- Import the existing backend runtime directly from Gateway as a temporary shortcut.

## Impact
Gateway now owns `zalo_gateway.accounts` and `zalo_gateway.account_sessions`. It can create a real Zalo QR login flow and persist its credential without importing backend source or Management-owned tables.

## Follow-up
- Move contacts/groups and the account-ready event contract next.
- Add a copy-verify migration from legacy `accounts` and `account_sessions` before production cutover.
