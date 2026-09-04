# Independent Service Proposal

## Proposed Structure

```text
services/
  zalo-gateway/                 # Module 1
    src/
      application/              # QR onboarding, sessions, messaging, sync
      domain/                   # ZaloAccount, Contact, Group, Conversation, Message
      infrastructure/           # Zalo adapters, PostgreSQL, MinIO
      transport/                # authenticated internal HTTP API and event delivery
    db/migrations/
    deploy/

  management-api/               # Module 2
    src/
      identity/                 # ZaloHub users, password sessions, roles
      access/                   # user-to-Zalo-account memberships and policies
      administration/           # bot configuration, audit, management workflows
      integrations/zalo-gateway/
    db/migrations/
    deploy/

  web-platform/                 # Module 3
    bff/                        # cookie session gateway and browser-facing API
    app/                        # React Router SSR routes
    src/features/
      admin/                    # administration UI
      chat/                     # chat UI
      accounts/                 # Zalo onboarding/status UI
    deploy/

packages/
  contracts/                    # versioned HTTP/event DTOs only
  config/                       # non-secret shared configuration helpers
```

## Service Ownership

| Service | Owns | Must not own |
|---|---|---|
| Zalo Gateway | Zalo QR/session credentials, account runtime, contacts, groups, conversations, messages, attachments, Zalo synchronization | ZaloHub users, browser cookies, memberships, admin policy, Dify policy |
| Management API | ZaloHub users, browser-independent authentication, roles, account membership, bots, policies, audit records | Zalo credentials, runtime objects, direct message persistence |
| Web Platform | Browser routes, SSR, chat/admin presentation, cookie handling, API composition | Credentials, authorization decisions, direct database access |

## Data Boundary

Start with one PostgreSQL instance but separate service-owned schemas:

```text
zalo_gateway.*
management.*
```

Each service runs only its own migrations and has a separate database credential restricted to its schema. The services never query the other schema. This permits a later physical database split without changing application contracts.

Zalo Gateway owns the message content because it ingests, deduplicates, synchronizes, and normalizes it. Management API references `zalo_account_id` but does not persist or modify messages.

## Interaction Model

```text
Browser
  -> Web Platform (SSR + BFF)
  -> Management API: identity and access decision
  -> Zalo Gateway: authorized account operation or chat query

Zalo Gateway
  -> versioned event: account.ready, session.changed, message.received,
                        message.updated, sync.completed
  -> Management API: membership provisioning, policy/bot processing, audit
  -> Web Platform realtime relay: authorized delivery only
```

Management API is the policy decision point. It authenticates the user and then calls Zalo Gateway using a signed internal identity containing the approved `userId`, `accountId`, requested operation, and expiry. Zalo Gateway validates that credential but never accepts browser cookies or public browser traffic.

## Public/Internal API Boundary

| Caller | Target | Allowed interface |
|---|---|---|
| Browser | Web Platform | Public HTTPS and WebSocket |
| Web Platform | Management API | Internal HTTPS using service credentials |
| Management API | Zalo Gateway | Internal HTTPS using short-lived signed credentials |
| Zalo Gateway | Management API / Web Platform | Versioned internal events |

Initial Zalo Gateway internal operations:

```text
POST   /internal/v1/onboarding
GET    /internal/v1/onboarding/:id/qr
GET    /internal/v1/accounts/:id/status
POST   /internal/v1/accounts/:id/reconnect
DELETE /internal/v1/accounts/:id
POST   /internal/v1/accounts/:id/sync-directory
GET    /internal/v1/accounts/:id/contacts
GET    /internal/v1/accounts/:id/groups
GET    /internal/v1/accounts/:id/conversations
GET    /internal/v1/accounts/:id/conversations/:conversationId/messages
POST   /internal/v1/accounts/:id/messages
```

## Migration Phases

### Phase 1: Service foundation
- Create `services/` and `packages/contracts/` workspaces.
- Establish independent manifests, environment validation, health/readiness endpoints, database credentials, migrations, and service deployment units.
- Define signed internal request and event envelopes.

### Phase 2: Extract Zalo Gateway
- Move and adapt the current runtime, Zalo protocol helpers, store repositories, media store, and account lifecycle into `services/zalo-gateway`.
- Preserve behavior behind Gateway internal routes.
- Remove Dify and browser WebSocket dependencies from the runtime.

### Phase 3: Extract Management API
- Move system auth, user/role/membership, Dify configuration, and management policies into `services/management-api`.
- Replace direct runtime access with Gateway client calls and events.

### Phase 4: Adapt Web Platform
- Consolidate `frontend/` and `bff/` under `services/web-platform`.
- Remove direct backend/JWT client paths and legacy backend admin SPA.
- Route account onboarding through Management API to Gateway.

### Phase 5: Data migration and cutover
- Copy current tables to owned schemas without cross-schema reads.
- Perform a staged production cutover with rollback checkpoints.
- Archive superseded monolith code only after smoke verification.

## Risks and Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Account session interruption during runtime extraction | High | Preserve runtime behavior first; use account-by-account cutover and rollback capability |
| Unauthorized realtime data delivery | High | Management API authorizes subscriptions; Web Platform relays only account-scoped events |
| Cross-service auth bypass | High | Short-lived signed internal credentials, network isolation, service-specific secrets |
| Inconsistent data during schema migration | High | Copy-verify-cutover workflow with read-only validation and rollback checkpoint |
| No existing automated tests | High | Add contract and lifecycle smoke tests as part of each extraction phase |
| Premature event infrastructure | Medium | Start with an authenticated internal event endpoint/outbox; introduce a broker only when needed |

## Approval Requested

Approve this topology and phased direction before creating the exact migration plan. The remaining decision is the internal authentication mechanism: signed short-lived JWT is recommended for the first milestone; mTLS can be added at the infrastructure layer later.
