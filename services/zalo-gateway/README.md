# Zalo Gateway

The Zalo Gateway owns Zalo QR onboarding and persisted Zalo session credentials. It is an internal service: browsers must use Web Platform and Management API rather than calling this service directly.

## Run

```bash
export INTERNAL_JWT_SECRET=<shared-secret>
export ZALO_GATEWAY_DATABASE_URL=postgresql://user:password@host:5432/database
npm run migrate --workspace=@zalohub/zalo-gateway
npm run start --workspace=@zalohub/zalo-gateway
```

The default schema is `zalo_gateway`. Infrastructure must provision it and assign its ownership to the Gateway database role before the service starts. Set `ZALO_GATEWAY_DB_SCHEMA` to override it.

## Internal API

All `/internal/v1/*` routes require a short-lived JWT issued by Management API with issuer `management-api`, audience `zalo-gateway`, and the listed operation.

| Method | Route | Operation | Purpose |
|---|---|---|---|
| POST | `/internal/v1/onboarding` | `onboarding.manage` | Starts the single active QR flow. |
| GET | `/internal/v1/onboarding/:id` | `onboarding.manage` | Gets onboarding outcome and account metadata. |
| GET | `/internal/v1/onboarding/:id/qr` | `onboarding.manage` | Gets QR image data while awaiting scan. |
| GET | `/internal/v1/accounts/:id/status` | `accounts.read` | Gets stored credential and in-memory session state. |
| POST | `/internal/v1/accounts/:id/reconnect` | `accounts.manage` | Restores a Zalo session from persisted credentials. |
| DELETE | `/internal/v1/accounts/:id/session` | `accounts.manage` | Deactivates the stored Zalo session. |

## Current Vertical Slice

This extraction intentionally covers QR onboarding, credential persistence, status, reconnect, and logout only. The next Gateway increments will move contact/group synchronization, listener receive events, messages, media, and send operations. No Zalo credential is returned by any API response.

## Operational Notes

- Only one QR onboarding runs per Gateway process to match the existing Zalo QR flow.
- Onboarding state is in memory. Restarting the service cancels an unscanned QR, but completed credentials remain stored.
- Production requires explicit `INTERNAL_JWT_SECRET`; startup does not accept a development fallback when `NODE_ENV=production`.
