# Service Foundation

The services in this directory are independently deployable boundaries. They are intentionally empty of migrated business behavior during Phase 1.

| Service | Default port | Responsibility |
|---|---:|---|
| `@zalohub/web-platform` | 3500 | Browser-facing SSR, BFF, and UI |
| `@zalohub/management-api` | 3501 | Identity, access, policy, and administration |
| `@zalohub/zalo-gateway` | 3502 | Zalo sessions, data, and runtime |

`INTERNAL_JWT_SECRET` must match between Management API and Zalo Gateway. `SERVICE_AUTH_KEY` is required by callers of the Management API internal token endpoint. Development defaults exist only outside production; production startup fails without explicit secrets.
