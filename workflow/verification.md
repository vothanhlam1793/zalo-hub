# Verification

## Expected Checks
- Independent build and start commands for all services.
- Health and readiness endpoints for all services.
- Schema ownership and no cross-service database queries.
- Browser flows use the Web Platform and BFF rather than direct Gateway access.

## Performed Checks
- Repository structure and current entry points reviewed.
- Existing build commands identified.
- `npm run build:foundation` completed for contracts, Management API, Zalo Gateway, and Web Platform.
- Started all three services with isolated ports and verified `/health` or `/ready` endpoints.
- Issued a short-lived Gateway token from Management API and verified the Gateway accepted it.
- Verified the Gateway rejects the same internal route without a token with HTTP 401.
- `git diff --check` passed for the Phase 1 worktree.
- Gateway Phase 2 vertical slice built successfully with `npm run build:foundation`.
- Gateway started against local PostgreSQL with an isolated `zalo_gateway` schema and returned a successful readiness response.
- Management API issued an `onboarding.manage` token, and Gateway created a real QR payload through `zalo-api-final`.
- Gateway rejected an onboarding query without the internal token with HTTP 401.
- Deployed the standalone Gateway as `zalohub-zalo-gateway.service` on `leco` at `0.0.0.0:16002` for private-network access.
- Verified live `/health` and `/ready` responses after systemd start.
- Verified the Gateway database role can query `zalo_gateway.accounts` and cannot read `public.system_users`.

## Results
- pass for Phase 1 service foundation
- pass for the Phase 2 QR/session vertical slice

## Issues Found
- No standard automated test suite exists for the existing application.
- Phase 1 has service skeletons only; no Zalo runtime, database schema, or browser flow has migrated yet.
- Contact/group synchronization, message listener, message persistence, media, and send operations remain in the monolith and are not yet Gateway behavior.

## Confidence
- high for the Phase 1 foundation and QR/session vertical slice

## Recommended Next Step
Plan the next Gateway increment for directory synchronization and account-ready event delivery. The deployed service is intentionally localhost-only until Management API is deployed and an internal reverse-proxy policy is defined.
