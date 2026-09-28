# Sales-facing interaction specification

Use existing theme, components, typography and desktop/mobile routes. This is a behavioral layout reference, not a requirement to redesign the whole application.

## 1. Desktop workspace

```text
┌──────────┬────────────────────────┬────────────────────────────────────────┐
│ Accounts │ Search customer        │ Customer name             [Info]       │
│ + badges │ [All labels       v]   │ [Thợ camera ×] [Báo giá ×] [+ Gắn nhãn] │
│          │ [Quản lý nhãn]         ├────────────────────────────────────────┤
│          ├────────────────────────┤ Message history                        │
│          │ Customer A       14:30 │                                        │
│          │ Last message           │               New outgoing message     │
│          │ [Thợ camera] [Báo giá] │                       Đang gửi…         │
│          │                        │                                        │
│          │ Customer B       14:25 │ [↓ Tin nhắn mới] when reading above    │
│          │ Voice message          ├────────────────────────────────────────┤
│          │ [Khách mới]            │ Attachment preview + remove            │
│          │                        │ [Attach] Type a reply…           [Gửi] │
└──────────┴────────────────────────┴────────────────────────────────────────┘
```

Label definition management is secondary to chat. Do not replace the composer with campaign tools. Long label lists wrap/collapse with a count; they must not push the conversation viewport off screen.

## 2. Sending states and copy

| State | Bubble footer | Available action |
|---|---|---|
| queued | `Chờ gửi` | Cancel before dispatch |
| sending | `Đang gửi…` | Continue drafting; no second submit of same intent |
| sent | `Đã gửi` | Ordinary message actions using actual provider IDs |
| failed, retryable | `Gửi chưa thành công` + short reason | `Thử lại` explicitly, same request intent |
| failed, non-retryable | Short actionable reason | Edit as a new draft or correct account/permissions |
| unknown | `Chưa xác nhận kết quả gửi` | `Kiểm tra trạng thái`; do not offer automatic resend |

Pending items have no reaction/send-forward action requiring a provider ID. Incoming/history messages without local delivery metadata do not get an invented sending status. Sent means provider acceptance, not read receipt.

The composer clears the submitted snapshot immediately and stays ready for a new draft. It must never clear a later draft when an earlier send resolves. The button is disabled for empty input/IME composition or unavailable action permissions, not merely because another request is running. Queue status belongs to its own conversation.

Text drafts return when switching back. File previews remain available within the current tab; after reload, a lost file is clearly marked for reselect. Cancel/discard affects only unsent content.

## 3. Conversation loading and scrolling

- Warm cache: show messages immediately, with a subtle background-refresh indicator if needed.
- Cold cache: clear old content synchronously and show neutral skeleton/loading state under the newly selected customer.
- Confirmed empty response: show `Chưa có tin nhắn nào`; do not show this while still waiting.
- Read failure with cache: keep cached messages and show a non-blocking retry affordance.
- Read failure without cache: show an inline retry state, not another customer's messages.
- Prepend history preserves the first visible message/offset. New incoming while reading older content shows a count/jump action; own send returns to the sent item.
- Do not overwrite the user's selected account merely because a delayed status response names another account.

## 4. Rich messages

```text
Voice:   [▶] ━━━━━●━━━━━━━━  00:12 / 00:45
Call:    [phone icon] Cuộc gọi nhỡ
                     14:32
Call:    [video icon] Cuộc gọi video
                     02:15 · 14:32
Sticker: transparent bounded asset + timestamp + existing reactions
```

- Call copy depends on verified metadata. Unknown outcome is simply `Cuộc gọi` / `Cuộc gọi video` if media is known; do not invent missed/completed wording.
- Audio controls have accessible names, keyboard focus, loading/error text and sufficient hit area. No autoplay or recording button in this increment.
- Emoji/sticker sizing is bounded and responsive. Normal text containing emoji keeps readable text size.
- Native/browser-supported audio is preferred over a fabricated waveform. Duration/progress must reflect actual metadata/playback.

## 5. Label picker and manager

Picker contains search, selected state, source badge, and permission-aware controls. Existing Zalo mirrored assignments are visible/read-only with explanatory copy; internal labels can be toggled. Mutations show pending on the affected control; failed mutations restore the prior value and display an inline error.

Manager contains name, color, source, account-scoped usage count and applicable actions. Creating/renaming rejects empty names, invalid colors and duplicate normalized internal names. Definition IDs never change on rename.

Deleting a used internal label says how many conversations lose it. This deletes classification only, never conversation history. A globally scoped historical label clearly identifies that its definition is shared and only super-admin may edit/delete it.

Filter options: `Tất cả`, `Chưa gắn nhãn`, each named label. Combine with text search. A no-match state says `Không có hội thoại phù hợp` with a clear-filter action. It is distinct from no conversations loaded or a request failure.

Sync outcomes: `Đã đồng bộ`, `Đồng bộ một phần`, `Tài khoản/API chưa hỗ trợ`, `Đồng bộ thất bại`. Partial/error states preserve existing labels and explain that assignment data may be incomplete. Do not label import as two-way sync.

## 6. Mobile and accessibility

- Keep `/m` navigation. Header chip list may collapse to `N nhãn`; picker/manager use dialog or bottom sheet with the same data/actions as desktop.
- Preserve draft and playback rules when navigating back to conversation list.
- Announce delivery failure/status changes accessibly without focus stealing. Tag chips include readable labels, not color alone.
- Return focus to the triggering button when closing dialogs. Keyboard search/selection and Escape work. Do not trigger send while Vietnamese IME is composing.
- Test long customer names, long labels, 320–390 px widths and normal text zoom; no horizontal overflow.

## 7. Interaction evidence

Tester captures desktop/mobile screenshots for loading, sending/error/unknown, voice/call/sticker, tag picker/manager/filter and Zalo partial import. Screenshots prove layout; provider fixtures and automated cases separately prove data correctness.
