# Decision Log

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
