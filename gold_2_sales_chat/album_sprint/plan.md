# Album presentation sprint

User approved the extended composer/storage roadmap. First checkpoint implements received album presentation in the existing dirty worktree; preserve all previous deployed upgrades.

## Scope
- Group received/stored media using account-scoped conversation, sender, direction and canonical albumId. Never group by time proximity.
- Pure deterministic selector: preserve every original message and stable media identity; order by verified album index with stable fallback.
- Bounded grid (2 side by side, 3 mosaic, 4 grid, overflow count) with full lightbox and per-item reply/reaction targeting.
- Merge partial albums as older pages/realtime arrive; preserve scroll anchor when layout changes.
- Keep floating controls/reaction badges and fixed composer behavior.
- Backend read-only album context endpoint if needed: authenticated account/conversation access, strict bounded parameters, no cross-account lookups. Preserve regular history pagination.

## Deferred subsequent checkpoints
Draft blobs/upload staging, batch sends/receipts, emoji/sticker/voice/templates, advanced actions. Do not claim these complete in album sprint.

## Verification key
1. Grouping and namespace isolation, missing indices, duplicate echoes: 25%.
2. Grid overflow/lightbox/per-item action identity: 25%.
3. Pagination/realtime merge and scroll: 20%.
4. Endpoint authorization/bounded query if introduced: 15%.
5. Typechecks/build/existing regression: 15%.

Use backend existing projection metadata; no schema migration needed for first presentation milestone. Record browser and live-provider checks separately from unit tests.
