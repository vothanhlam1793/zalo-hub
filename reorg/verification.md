# Phase 1 Verification

## Structural Checks

| Check | Result | Evidence |
|---|---|---|
| Independent workspaces exist | Pass | `services/zalo-gateway`, `services/management-api`, and `services/web-platform` each have a manifest, TypeScript config, entry point, and systemd unit. |
| Shared code is contracts only | Pass | Service manifests depend only on `@zalohub/contracts`; no existing runtime or frontend source was imported. |
| Production secret guard | Pass | Management API and Zalo Gateway fail startup in production when required internal secrets are absent. |
| Source formatting errors | Pass | `git diff --check` completed with no output. |

## Runtime Checks

| Check | Result | Evidence |
|---|---|---|
| Foundation build | Pass | `npm run build:foundation` compiled contracts and all three services. |
| Independent health | Pass | Web Platform `:3500`, Management API `:3501`, and Zalo Gateway `:3502` returned successful health/ready responses. |
| Internal token issuance | Pass | Management API issued a short-lived token after service-key validation. |
| Gateway authorization | Pass | Gateway accepted an authorized `accounts.read` token and returned HTTP 401 without one. |

## Scope Review

No existing runtime, database tables, BFF, SSR route, or browser flow was moved. This matches the approved Phase 1 scope.

## Result

Pass. Phase 1 service foundation is ready for a separate Phase 2 decision on Zalo Gateway extraction.

## Phase 2 QR/Session Vertical Slice

| Check | Result | Evidence |
|---|---|---|
| Independent Gateway build | Pass | `npm run build:foundation` passed after adding Gateway-owned Knex and Zalo dependencies. |
| Isolated schema | Pass | Gateway readiness passed against PostgreSQL after creating the `zalo_gateway` schema and onboarding/session tables. |
| Real QR flow | Pass | An internally authorized onboarding request produced a `waiting_for_qr` state and a QR image payload through `zalo-api-final`. |
| Credential boundary | Pass | Gateway persists credentials internally and returns only account/session metadata. |
| Internal authorization | Pass | An onboarding status request without the Management-issued JWT returned HTTP 401. |

The QR/session slice does not yet replace the monolith listener, contact/group sync, chat send/receive, media, or browser realtime paths.

## Independent Deployment

| Check | Result | Evidence |
|---|---|---|
| Separate process | Pass | `zalohub-zalo-gateway.service` is enabled and running independently of existing `zalohub*.service` units. |
| Dedicated port | Pass | Gateway listens on `0.0.0.0:16002` for private-network remote operations. |
| Service health | Pass | Live `/health` and `/ready` checks passed after systemd deployment. |
| Database isolation | Pass | `zalohub_gateway` can query `zalo_gateway.accounts` but is denied read access to `public.system_users`. |

The Gateway is reachable on the private network at port `16002`. It must not be exposed through public Nginx routes before Management API is deployed as the authorization boundary.
