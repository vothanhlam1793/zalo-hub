# Sprint 1 — test key

Weights total 100. Cases marked **critical** must pass before release. All are planned, not executed.

| ID / weight | Input and setup | Expected / pass criteria |
|---|---|---|
| S1-T01 / 15 **critical** | Fake provider delays 2s; send text then another identical text; collect paint times; hold HTTP independently from WS | Two intents/two provider sends/two final messages; immediate pending each; no shared sending flag blocks typing; correct per-message status |
| S1-T02 / 15 **critical** | HTTP first, WS first, duplicate WS, delayed history snapshot; include caption+image receipt with multiple messages | Converges to canonical real message count, stable local key for reconciled item, no duplicate/vanished pending; no text/time matching |
| S1-T03 / 10 **critical** | Send in A, switch to B, then another account with same conversation ID; late HTTP/WS; logout/login as another system user | Only captured A state updates; B's draft/error/list unchanged; previous-user cache/callback data unavailable |
| S1-T04 / 15 **critical** | Parallel identical POST IDs, different body/same ID, status lookup by another user, definite rejection, SDK acceptance then local DB/media failure, backend restart while sending | At most one SDK dispatch for a claimed attempt; 409 mismatch; ownership enforced; sent never becomes retryable after local failure; abandoned attempt unknown; failed retry CAS only; no automatic unknown replay |
| S1-T05 / 10 | Cached/uncached open; delayed IndexedDB result after HTTP/WS; IndexedDB disabled; backend Zalo session offline but DB history exists | Immediate correct cache or loading state, no old customer content, latest result wins, offline stored history accessible with permission; cache failure does not block chat |
| S1-T06 / 10 | Drafts in A/B, account switch, F5 during send, text vs file draft; preview lifecycle | Text/delivery metadata rehydrate by user/key; no auto-send on reload; status lookup resolves known request; missing File clearly requires reselect; URLs released at correct time |
| S1-T07 / 5 | Vietnamese IME Enter, Shift+Enter, fast independent submits, reselect same attachment file | No composing Enter send, newline works, legitimate repeats preserved, submission event not double-dispatched, same file selectable after prior clear |
| S1-T08 / 10 **critical** | WS unauth/expired/no-membership/super-admin, account summaries, reconnect/unmount; two users with disjoint accounts | No account data before auth; all account payloads scoped; HTTP/WS role policy aligned; reconnect authenticates/resubscribes once; no zombie reconnect after logout |
| S1-T09 / 5 | Prepend 40 older messages; incoming while scrolled up; own send near bottom; switch accounts with same conv ID; desktop/mobile | Reading anchor preserved; incoming does not drag reader down; own send visible; no old scroll-state bleed; mobile flow equivalent |
| S1-T10 / 5 | Build/typecheck + controlled benchmark (30 samples, 50 visible messages/500 summaries) + approved live text/image/file send/receive | No new compile errors; p95 pending paint <=100ms, cached open <=150ms on stated workstation; live content matches intended recipient and history after reload; record provider latency separately |

## Evidence details

- Use fake provider/isolated DB for failure and duplicate cases. Never intentionally race sends to real customers.
- Include explicit 404 status lookup during an in-flight POST: retain same clientRequestId, do not generate a second intent automatically.
- Include accepted provider response with missing IDs: do not fabricate providerMessageId or blindly merge with equal text.
- Include frontend network timeout while backend continues: status must not change to definitively failed/retryable without server evidence.
- Log timing marks without message content; browser profiler must show typing does not rerender all message rows needlessly.
- Baseline build/typecheck failures are listed separately; Vite success alone is insufficient.
- Live smoke or performance cases lacking an approved target/device are blocked, not inferred from mocks. All release-critical behavior must be covered even if aggregate score is high.
