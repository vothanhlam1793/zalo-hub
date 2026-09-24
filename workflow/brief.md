# Brief

## Current Initiative — 2026-09-22

**The active goal is Sales Chat Readiness in the existing monolith.** The independent-service brief below is retained as historical context, not current execution scope.

### Goal
Enable the sales team to use responsive chat, understandable voice/call/sticker content, and customer labels for management.

### Scope
1. Responsive sending, receipt reconciliation, drafts/cache, account-scoped realtime.
2. Rich-message normalization and presentation, including historical messages.
3. Account-safe internal label management and Zalo label import.

Bulk sending, automatic sending on tag change, service extraction and broad monolith restructuring are deferred. Tags prepare stable management data for future automation only.

### Current Request and Status
The user has authorized implementation and explicitly allowed an agent team. Execute Sprint 1 of the agreed plan first, with backend delivery, frontend state and realtime work in parallel behind fixed contracts. Complete review/testing and report before the next sprint checkpoint. Planner artifacts are in `gold_2_sales_chat/`.

### Constraints
- Use current `backend/` and `frontend/` paths and the browser `/api` + `/ws` integration.
- Preserve existing behavior/API fields except documented corrections on touched authorization paths.
- Preserve the existing uncommitted Case Station webhook change.
- Provider response formats and ambiguous tag mappings require evidence, not guesses.
- No automatic commit, deploy, migration on production, or live customer messaging is authorized by this documentation task.

### Verify
Follow each sprint's weighted test key and critical gates. Measure latency; distinguish mock coverage from live Zalo smoke. During this design task validate documentation structure/consistency only.

### Recommended Mode
gold-sprint (GOLD), three incremental sprints. See `gold_2_sales_chat/README.md`, `design.md`, `execution.md`.

---

## Historical Brief — Independent Services (superseded for current delivery)

## Goal
Restructure ZaloHub into independently deployable Zalo Gateway, Management API, and Web Platform services with explicit database ownership and contracts.

## Scope
The first reorganization milestone delivers the independently runnable service framework: service boundaries, separate schema ownership, internal API/event contracts, health checks, and deployment boundaries. Existing user behavior is preserved during migration.

## Context
The current repository contains a backend that mixes Zalo runtime, management APIs, WebSocket delivery, and a legacy admin SPA; a new BFF; and a React Router SSR frontend with chat and admin features.

## Constraints
- Reuse the existing Zalo runtime, persistence, BFF, and web features where possible.
- Keep ZaloHub user identity and authorization separate from Zalo QR/session authentication.
- Do not allow cross-module database queries.
- Keep the current working application operational through incremental migration.
- Do not expose Zalo Gateway management endpoints directly to browsers.

## Verify
- Each service has an independent build, start command, health endpoint, and deployment definition.
- Each service owns its schema/database boundary and communicates only through documented contracts.
- The existing account onboarding, management, and chat flows remain reachable through the Web Platform.

## Recommended Mode
- reorg

## Current Status
- confirmed
