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
