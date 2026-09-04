# Independent Service Migration Plan

## Purpose

Move ZaloHub from the current mixed backend/BFF/frontend layout to three independently deployable services without a big-bang rewrite:

1. `zalo-gateway`: Zalo account lifecycle and all Zalo-derived data.
2. `management-api`: ZaloHub identity, authorization, policies, and administration.
3. `web-platform`: browser-facing BFF, SSR, chat UI, and admin UI.

The first milestone is complete only when every service builds, starts, reports health independently, owns its schema boundary, and communicates through authenticated contracts.

## Baseline

- Source checkpoint: `bed2343` on `chore/platform-reorg-baseline`.
- Architecture decision checkpoint: `b233c0f` on `feat/independent-services-foundation`.
- Current production behavior remains the reference until each replacement flow is smoke-tested.

## Target Workspace Layout

```text
services/
  zalo-gateway/
    src/{application,domain,infrastructure,transport}/
    db/migrations/
    deploy/
  management-api/
    src/{identity,access,administration,integrations,transport}/
    db/migrations/
    deploy/
  web-platform/
    bff/
    app/
    src/features/{admin,chat,accounts}/
    deploy/
packages/contracts/
```

`backend/`, `bff/`, and `frontend/` remain intact until their replacement service passes its cutover checks. They are removed only in the final cleanup phase.

## Database Ownership

### Zalo Gateway schema: `zalo_gateway`

Move or recreate the current Zalo-owned entities:

- `accounts`, Zalo credentials, runtime/session state.
- `contacts`, `groups`, `conversations`, `messages`, attachments, reactions.
- `conversation_read_state` and monitor/sync indexes.
- Zalo media object metadata; binary media remains in the Gateway-owned MinIO bucket/prefix.

### Management API schema: `management`

Move or recreate management-owned entities:

- `system_users`, `system_sessions`.
- `zalo_account_memberships`, referencing account IDs as external identifiers.
- `dify_bots` and future policy/audit records.

### Rules

- Each service uses a PostgreSQL role limited to its own schema.
- No foreign keys or SQL joins across schemas.
- Management API validates access before issuing a scoped Gateway credential.
- Data migration is copy-verify-cutover, never an unverified destructive move.

## Internal Security Contract

Management API signs a short-lived internal JWT for each Gateway request. Required claims:

```json
{
  "iss": "management-api",
  "aud": "zalo-gateway",
  "sub": "system-user-id",
  "accountId": "zalo-account-id",
  "operation": "accounts.read|accounts.manage|chat.read|chat.write",
  "exp": "short expiry",
  "jti": "request identifier"
}
```

Zalo Gateway rejects browser cookies, public JWTs, missing scopes, mismatched account IDs, and expired tokens. Web Platform never talks to Gateway directly.

## Phase 1: Workspace and Contracts Foundation

### Create

- Root workspace manifest and lockfile strategy.
- `packages/contracts` for shared DTOs, error envelopes, event envelopes, and API version constants.
- `services/zalo-gateway`, `services/management-api`, `services/web-platform` manifests and TypeScript configurations.
- Per-service environment validation, `/health`, `/ready`, structured request ID handling, and service deployment definitions.
- Separate PostgreSQL roles and empty `zalo_gateway` / `management` schemas.

### Do not move yet

- No existing Zalo runtime source.
- No current database tables.
- No browser route changes.

### Acceptance

- Each service builds and starts independently.
- Each health endpoint responds without another service being up.
- Contract package is the only allowed shared application dependency.

## Phase 2: Extract Zalo Gateway

### Source move map

| Current location | Target | Notes |
|---|---|---|
| `backend/src/core/runtime/` | `services/zalo-gateway/src/infrastructure/zalo/runtime/` | Preserve runtime behavior; remove browser broadcast and Dify attachments. |
| `backend/src/core/zalo-pc-*` | `services/zalo-gateway/src/infrastructure/zalo/` | Zalo protocol adapter. |
| `backend/src/core/zalo-group-client.ts` | `services/zalo-gateway/src/infrastructure/zalo/` | Group adapter. |
| `backend/src/core/playwright-qr.ts` | `services/zalo-gateway/src/infrastructure/zalo/` | QR browser adapter. |
| `backend/src/core/media-store.ts` | `services/zalo-gateway/src/infrastructure/media/` | Gateway media ownership. |
| `backend/src/core/store/` | `services/zalo-gateway/src/infrastructure/postgres/` | Rename repositories by aggregate where necessary. |
| `backend/src/core/types.ts` | `services/zalo-gateway/src/domain/` | Keep Gateway internal models separate from contracts. |
| `backend/src/server/account-manager.ts` | `services/zalo-gateway/src/application/account-runtime-manager.ts` | Remove management, bot, and browser broadcast dependencies. |
| Zalo portions of `backend/src/server/routes/auth.ts` | `services/zalo-gateway/src/transport/internal/onboarding-routes.ts` | QR onboarding API only. |
| Zalo data/message portions of `backend/src/server/routes/accounts.ts` | `services/zalo-gateway/src/transport/internal/{accounts,conversations,messages}-routes.ts` | Split by Gateway operation and internal scope. |
| `backend/src/server/helpers/status.ts` | `services/zalo-gateway/src/application/` | Session/readiness status. |

### Behavior changes

- Replace `createWsHandler` broadcasts with Gateway domain events stored in an outbox table.
- Replace direct Dify executor attachment with `message.received` Gateway events.
- Gateway exposes only `/internal/v1/*` routes and validates internal JWTs.
- Move Zalo-owned migrations into Gateway and copy existing data to `zalo_gateway` schema.

### Compatibility

- Management API temporarily proxies existing account/chat API shapes to Gateway while Web Platform migration is in progress.
- Keep old backend runtime disabled only after Gateway handles the same account set and passes lifecycle smoke tests.

### Acceptance

- A Gateway service can independently onboard an account via QR, recover a stored session, synchronize contacts/groups, receive a message, send a message, and serve its conversation history.
- No Gateway source imports Management API, BFF, or browser code.

## Phase 3: Extract Management API

### Source move map

| Current location | Target | Notes |
|---|---|---|
| `backend/src/server/routes/system-auth.ts` | `services/management-api/src/identity/` | ZaloHub user login only. |
| `backend/src/server/helpers/auth-middleware.ts` | `services/management-api/src/access/` | Roles and membership checks. |
| Management portions of `backend/src/server/routes/admin.ts` | `services/management-api/src/administration/routes/` | Replace direct `GoldStore` calls with Gateway client calls. |
| `backend/src/server/services/dify-bot-service.ts` | `services/management-api/src/administration/bots/` | Management-owned configuration. |
| `backend/src/server/services/dify-bot-executor.ts` | `services/management-api/src/administration/bots/` | Consume Gateway events, do not attach to runtime. |
| `backend/src/server/routes/dify-bots.ts` | `services/management-api/src/administration/routes/` | Admin policy API. |
| `backend/src/server/routes/bot-api.ts` and `bot-auth.ts` | `services/management-api/src/administration/bots/` | Preserve external bot API behind management authorization. |

### Required adaptations

- Account creation starts as a Management API command, which authorizes the initiating user then creates Gateway onboarding.
- When Gateway emits `account.ready`, Management API creates the initiating user's `master` membership.
- Management API signs scoped Gateway JWTs only after role/membership validation.
- Dify executor consumes a durable Gateway event instead of an in-memory runtime callback.

### Acceptance

- Management API starts independently without a Zalo connection.
- User login, user administration, membership administration, and bot configuration work against a mocked or running Gateway.
- Management database contains no Zalo credential or message tables.

## Phase 4: Extract Web Platform

### Source move map

| Current location | Target | Notes |
|---|---|---|
| `bff/` | `services/web-platform/bff/` | Browser-facing API gateway. |
| `frontend/app/` | `services/web-platform/app/` | React Router SSR entry and routes. |
| `frontend/src/features/chat/` | `services/web-platform/src/features/chat/` | Chat UI. |
| `frontend/src/features/admin/` | `services/web-platform/src/features/admin/` | Admin UI. |
| `frontend/src/features/accounts/` | `services/web-platform/src/features/accounts/` | QR onboarding/status UI. |
| `frontend/src/bff-api.ts` | `services/web-platform/src/api/` | Retain BFF-only browser access. |
| `frontend/src/api.ts` | delete after consumers migrate | Direct JWT-to-backend client must not survive. |
| `backend/src/admin/` | remove after verified feature parity | Legacy admin SPA must not become a fourth web surface. |

### Required adaptations

- BFF calls Management API for identity/access and Management API-owned operations.
- BFF requests chat data through Management API, not Gateway.
- WebSocket subscriptions are authorized and account-scoped by Management API before event relay.
- The account onboarding page is `/admin/zalo-accounts`, but its commands flow through Management API to Gateway.

### Acceptance

- Admin and chat SSR routes run from Web Platform only.
- Browser uses httpOnly cookie only; no direct Gateway URL, service token, or JWT storage in browser code.
- Unauthorized users cannot subscribe to account events or load account chat data.

## Phase 5: Data Cutover and Legacy Removal

1. Backup PostgreSQL and MinIO before migration.
2. Create schemas, roles, and target migrations.
3. Copy Gateway-owned and Management-owned records to their target schemas.
4. Compare row counts, account IDs, message IDs, attachment paths, and membership IDs.
5. Start Gateway and Management API in shadow mode against copied data.
6. Cut over one non-critical account first; verify QR/session, contacts, message receive/send, admin membership, and web delivery.
7. Cut over remaining accounts after the pilot passes.
8. Remove compatibility routes and archive `backend/` only when all replacement checks pass.

## Rollback

- Do not delete original tables or media during any migration phase.
- Maintain the old backend deployment until the account-by-account pilot passes.
- Revert traffic routing to the old backend/BFF/frontend deployment if the replacement fails.
- Restore database only from a confirmed backup; application rollback should not require database rollback during shadow mode.

## Verification Matrix

| Check | Gateway | Management | Web Platform |
|---|---|---|---|
| Build | TypeScript build | TypeScript build | BFF and SSR build |
| Startup | `/health`, `/ready` | `/health`, `/ready` | `/health`, SSR route |
| DB | Gateway schema only | Management schema only | No DB credentials |
| Auth | Reject public/browser token | Validate users and membership | httpOnly cookie only |
| Core smoke | QR, session, sync, receive/send | login, membership, bot policy | login, onboarding, admin, chat |

## Approval Required Before Execution

Approve this migration plan. Execution starts with Phase 1 only; phases 2 through 5 require separate approval after their prior-phase verification reports.
