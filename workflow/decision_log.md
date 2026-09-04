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
