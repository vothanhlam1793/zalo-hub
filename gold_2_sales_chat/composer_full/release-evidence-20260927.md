# Composer release evidence — 2026-09-27

## Result: DEPLOYED

User authorized release verification, backup, intended additive migrations and backend-first deployment. No commit. Prior dirty features preserved. Only application-repo code change in this release session: targeted `backend/test/composer.test.ts` fixture correction for the earlier reservation barrier; production barrier was not weakened.

## Executed verification

Raw logs and executable operational smoke scripts: `/tmp/opencode/composer-release-20260927/` (directory mode 0700).

| Check | Result |
|---|---|
| First isolated PostgreSQL run: conversation-barrier, composer, send-request repo | 7 passed, 1 failed, 0 skipped |
| Corrected isolated rerun, same three files | 8 passed, 0 failed, 0 skipped |
| Backend `npx tsc --noEmit` | PASS |
| Backend `npx tsx --test test/*.test.ts tests/realtime.test.ts` | 78 passed, 0 failed, 0 skipped |
| Frontend `npm run typecheck` | PASS |
| Frontend `../backend/node_modules/.bin/tsx --tsconfig tsconfig.app.json --test src/features/chat/model/*.test.ts src/features/chat/components/messages/*.test.ts tests/*.test.ts` | 60 passed, 0 failed, 0 skipped |
| Composer browser | 2 width scenarios passed: 390 / 1280 |
| Extended tools browser | 2 width scenarios passed: 390 / 1280 |
| Album browser | 8 scenarios passed: main + short / inner / same-url at each width |
| Backend build including admin | PASS, performed once by deploy.sh |
| Frontend build | PASS, performed once by deploy.sh; 720.73 kB main JS chunk warning |
| `git diff --check` | PASS |

PostgreSQL tests used disposable `postgres:16` container `composer-release-pg-20260927`, localhost-only dynamically assigned port, `composer_release_test` database, unique schemas. `SEND_REQUEST_TEST_DATABASE_URL` explicitly supplied. No production database used for tests. Container stopped and removed after verification.

Initial failure: composer lifecycle fixture tried to reserve a competing batch after an unknown receipt. New barrier correctly rejected earlier than old test expected. Updated assertion verifies rejection leaves no batch, temporarily settles fixture receipt to isolate abandonment, then restores unknown status. Quota still verifies unknown reference plus unreserved ready staging. Final full regression includes corrected test.

## Production migration / backup

Read runtime DATABASE_URL privately from running process environment; never printed or saved credentials. Preflight found 16 applied migrations, exactly these three pending files, and no composer tables:

1. `20260927150000_create_composer_staging.ts`
2. `20260927170000_extended_action_receipts.ts`
3. `20260927171000_composer_item_context.ts`

The user mentioned two new migrations; reports identify two extension migrations **in addition to** base composer staging. All three are required and additive. Reviewed all composer_full reports/plans/contracts and all three migration sources. Applied only these names with sequential `knex.migrate.up({name})`, after exact pending-set assertion and backup. No unrelated pending migrations existed. Application startup calls migrate.latest; pre-clearing the exact intended set avoided unrelated startup migration execution.

Post-deployment: 19 migration records, pending set empty; `composer_staging`, `composer_batches`, `composer_batch_items`, `composer_actions` present; `composer_batch_items.send_context` verified present.

Backup: `/tmp/opencode/composer-release-20260927/production-before-composer.dump`, mode 0600, 136357525 bytes, PostgreSQL 16 pg_dump custom format. `pg_restore --list` successful; full restore rehearsal not performed. SHA-256 `7d07d969858ef1ac25fc2dcc6c208dca724bd00d705c87d1b014d0f33cc53455`.

Backend artifact backup: `/tmp/opencode/composer-release-20260927/backend-dist-before.tgz`, SHA-256 `72d63b6d3ea512041442f2eff18ebcd59bf304f36b19b0d3983f7adac53f4a4c`.

## Storage / deployment

- Actual ComposerObjectStore with production MinIO settings: uniquely named harmless `release-verification/<UUID>` object PUT, GET exact byte match, DELETE, then GET NoSuchKey. Private bucket policy check passed. No staging DB rows or send identities created for this check; object removed.
- `bash deploy.sh --backend --no-verify` succeeded first, after migrations.
- `bash deploy.sh --frontend --no-verify` succeeded second. Avoided --all because script deploys frontend first. Built each artifact once; no redundant rebuild.
- Used independent strict smoke rather than deploy.sh's verify_all, which ignores curl errors.
- Local backend active/running, MainPID 3567191, NRestarts 0, one :3399 listener owned by that PID.
- Frontend previous remote distribution retained at `root@svr12.creta.vn:/var/www/zalohub-frontend/dist.bak`; deployed archive `/tmp/zalohub-frontend-dist.tgz` remains locally/remotely.
- SVR12 SSH verified using existing key (no password documented in machine note). nginx -t passed with existing unrelated drawer.creta.vn duplicate-server and server-name-hash warnings. No DNS, TLS, nginx, or vault changes.

## Strict live smoke

- Local :3399 and both public domains: health 200; anonymous /api/auth/me 401; authenticated /api/auth/me and composer capabilities 200, attachmentContext true.
- Used an existing unexpired privileged system session privately for read-only requests. No login/password mutation, no new token/session, no chat content output, no live provider send.
- Public login page Chromium smoke at 390 and 1280 on both domains: 4/4 passed, password input visible, no pageerror.
- Both public domains: WebSocket connected handshake passed anonymously, no subscriptions. Authenticated production WS data delivery not exercised; authorization is covered by local regressions.
- Both public domains serve exact local-built bytes for `/assets/index-Bb-qh8If.js` and `/assets/index-CQKtHQ6P.css`.
- First operational smoke script used wrong `accounts.id` column; fixed script to `account_id`, rerun passed. This was a smoke harness error, not an application change. Initial and rerun logs retained.

## Limitations / operational follow-up

- No actual Zalo messages/actions sent. Provider acceptance, native microphone/codec behavior and full live repaired-message lifecycle are not certified by this release. Native voice/location remain unsupported as previously documented.
- Live MinIO object operations and authenticated capability API were tested separately; no production multipart staging/batch end-to-end mutation performed.
- Public route differs from vault diagram: hub.besen.vn proxies / to backend (serves local frontend/dist); zalo.camerangochoang.com serves SVR12 static dist. Both assets verified.
- Both vhosts allow 60m bodies. zalo.camerangochoang.com API read timeout is 300s; hub.besen.vn / location has no explicit read/send timeout override (nginx defaults may limit slow operations). Full-size/slow uploads not load-tested; 120s upload proxy timeout requirement is not fully verified on hub.besen.vn.
- Existing nginx warnings and large frontend chunk warning remain. Disk availability was 347 GiB locally; remote MinIO capacity not established.
- No new alerting or automatic application rollback system installed. Existing systemd restart policy retained, NRestarts 0 at verification. Manual artifact rollback is available; migration down functions deliberately refuse destructive receipt loss. Retain additive tables on code rollback, do not restore database over newer live messages casually.
- Browser-local outbox, cross-tab conflict, opportunistic cleanup and legacy non-idempotent endpoint limitations in prior reports remain. Existing text-controller GET404 policy was not rewritten.
- Restricted backups contain production data and must be retained securely or removed under the operator's retention policy; no automatic deletion scheduled. Test container removed; no test object remains. Tiny harmless local object fixture and scripts/logs remain in restricted evidence directory.

No release-blocking executed tests remain failing. Deployed status does not imply unperformed provider or load-test certification.
