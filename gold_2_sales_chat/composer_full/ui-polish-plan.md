# Approved UI polish — planner and agent instructions

Scope: frontend presentation and browser harnesses only; preserve all existing dirty work. No backend changes, deployment, commit, or new provider capabilities.

Frontend agent: inspect current components before editing; retain keyed lifecycle, immutable batches, manual preparation, unknown-result barriers and all recovery actions. Use Radix focus/escape behavior, lucide icons and design tokens. Composer footer has one horizontal toolbar; separate emoji/templates popovers. Attachments use a bounded horizontal thumbnail tray with captions/reorder in the existing preview dialog. Outbox uses counts plus explicit details. Extended tools use category navigation; opaque receipt IDs/results stay internal.

Sequence: implement components, structurally review safety/focus/responsiveness, then run typecheck, regression tests, three browser harnesses and production build. Report actual results and open release gates.

## Weighted test key
- 25: Existing composer browser safety tests pass (immutable captions, concurrent preparation, durable outbox, unknown barrier).
- 20: Extended-tools browser tests pass (no replay, recovery, capability gating).
- 20: 320/390/1280 layout, popover no shift, separate triggers, Escape focus return and detail editing pass.
- 20: Typecheck and frontend regression suites pass.
- 15: Album browser regression and production build pass.
