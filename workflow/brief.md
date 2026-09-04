# Brief

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
