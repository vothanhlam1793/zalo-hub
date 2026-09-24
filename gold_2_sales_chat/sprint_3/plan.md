# Sprint 3 — customer label management

Status: planned. Depends on Sprint 1 account-safe state and scoped realtime. Contract: `../design.md` section 6.

## Task breakdown

| ID | Owner | Change | Dependency/output |
|---|---|---|---|
| S3-01 | Tag backend | Inspect actual constraints, conversation ID mapping, existing tag/association counts and Zalo label fixtures | Preflight report; ambiguities/unsupported API states |
| S3-02 | Integrator/coordinator | Freeze scoped route/DTO/permissions and migration resolution rules | Design defaults confirmed; unresolved records escalated |
| S3-03 | Tag backend | New migration with backup/review records, account-qualified associations, indexes; dry-run | Row accounting and reversible cutover procedure |
| S3-04 | Tag backend | Tag service CRUD/assign/unassign and transactional labels_json refresh; compatibility route adapters | Authorization/validation/idempotent assignment tests |
| S3-05 | Tag backend | Zalo definitions/membership import with completeness checks and per-account serialization | No destructive empty-on-error synchronization |
| S3-06 | Tag frontend | Manager/picker/filter, role-aware controls, per-account data, optimistic assignment rollback | Mock API UI flows using agreed contract |
| S3-07 | Realtime/integrator | tags_invalidated after commit; keyed invalidation/coalescing/reconnect refresh | Two-browser consistency and account isolation |
| S3-08 | Verifier/tester | Review migration and diff; test matrix + approved Zalo import + sales UI smoke | Report and data rollout decision |

S3-06 may run in parallel with S3-03/04 using mocked API. S3-05 must not replace associations until fixture-proven completeness is established.

## File map

- Backend: `src/core/store/tag-repo.ts`, `conversation-repo.ts` label projection where required; new tag service; `src/server/routes/tags.ts`; account route mounting in `src/server/index.ts`; `src/core/runtime/sync.ts` syncLabels section; narrow access policy helper; new migration.
- Frontend: new `src/features/tags/*`; API/types integration; chat header, Sidebar, ConversationDetailsPanel and both DashboardPage layouts; realtime event union/handler and keyed tag state.
- Tests: scoped association repo/transaction cases, legacy migration fixtures, access matrix, Zalo partial/complete snapshots, two-client browser flow.

## UX specification

1. Header chips display name/color/source, collapse excess into `+N`; `Gắn nhãn` opens searchable picker.
2. Picker indicates selected labels; system labels editable by permitted roles; Zalo mirror entries show `Đồng bộ từ Zalo` and are non-editable locally.
3. `Quản lý nhãn` lists account definitions and historical global definitions with source/read-only indicators. Create/rename/recolor internal account tags. Delete confirms affected conversation count.
4. Sidebar filter includes `Tất cả`, `Chưa gắn nhãn` and named labels/counts; filters conversation list only. Friend/group tabs retain their behavior rather than implying unimplemented customer-directory tagging.
5. No bulk-send button, audience builder or send-on-tag checkbox. No automatic message side effect.
6. Operation errors appear near the action; changing conversations does not move an old tag error into a different customer header.
7. On mobile, reuse actions/data in dialog/sheet; do not create a second backend/client path.

## Permission and scope defaults

- Viewer: read/filter.
- Editor: assign/remove internal and existing assignable AI tags in an authorized account.
- Account admin/master: manage internal account labels and run Zalo import.
- Super-admin: existing account bypass plus management of historical global definitions.
- Zalo-source definitions/associations: manual mutation disabled for everyone in v1; importer owns them.
- No role may change account/source/provider ID through rename API. Creating a label cannot accept arbitrary source or owner from the browser.

## Migration gate

Do not edit the old tag migration. Rehearse on a copy; save exact original association rows. Resolve unique mappings only. Preserve ambiguous/orphan entries with reasons and ask the coordinator to choose resolution before a production cutover that hides them. Prove labels_json agrees with normalized joins for every migrated account.

Concurrent writers are stopped during association backfill/cutover. Old unscoped routes must no longer write unqualified associations. Restoring an old binary/schema without preserving new scoped data is not an acceptable rollback.

## Release gate

Pass critical test-key cases, supply migration count report, report actual Zalo capabilities, and demonstrate that tag changes do not trigger any sender. Future automation uses stable IDs/account-qualified assignments; no automation implementation is part of this sprint.
