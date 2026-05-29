# File Templates

All mode-specific notes in this file should be written in English. The shared `workflow/` files remain the primary source of truth across skills.

## gold_brief.md

```markdown
# Gold Brief — Gold <N>: <Title>

## Goal
<Feature goal in clear working English>

## Definition of Done
- [ ] <Điều kiện 1>
- [ ] <Điều kiện 2>

## Tech Constraints
- Language/Framework: ...
- Existing modules liên quan: ...
- Không được đụng vào: ...

## Sensitive Areas (require user confirmation before Planner decides)
- ...

## Planned Sprint Breakdown
- Sprint 1: ...
- Sprint 2: ...
- Sprint 3: ...
```

---

## plan.md

```markdown
# Technical Plan — Gold <N>, Sprint <N>

## Sprint Scope
<Exactly what this sprint covers>

## Architecture Decisions
| Decision | Chosen Approach | Rationale |
|----------|----------------|-----------|
| ... | ... | ... |

## File / Module Breakdown
| File | Action | Description |
|------|--------|-------------|
| src/... | CREATE | ... |
| src/... | MODIFY | ... |

## Implementation Sequence
1. ...
2. ...
3. ...

## Dependencies & Risks
- Dependency: ...
- Risk: ... → Mitigation: ...

## Out of Scope
- ...
```

---

## test_key.md

```markdown
# Test Key — Gold <N>, Sprint <N>

## Test Cases

### TC-01: <Test name> (Weight: X%)
- **Input**: ...
- **Expected Output**: ...
- **Pass Criteria**: ...
- **Partial Credit**: ... (if applicable)

### TC-02: <Tên test> (Weight: X%)
- **Input**: ...
- **Expected Output**: ...
- **Pass Criteria**: ...

[... thêm test cases ...]

## Scoring Summary
| TC | Name | Weight |
|----|------|--------|
| 01 | ... | X% |
| 02 | ... | X% |
| **Total** | | **100%** |

## Out of Scope for Testing
- ...
```

---

## report.md

```markdown
# Sprint Report — Gold <N>, Sprint <N>

## Score: <X>%

## Test Results
| # | Test Case | Weight | Result | Notes |
|---|-----------|--------|--------|-------|
| TC-01 | <name> | X% | ✅ Pass | |
| TC-02 | <name> | X% | ❌ Fail | Expected X, got Y |
| TC-03 | <name> | X% | ⚠️ Partial | ... |

## Failed / Partial Details

### TC-02 — <name>
- **Expected**: ...
- **Got**: ...
- **Evidence**: ...

### TC-03 — <name>
- **Expected**: ...
- **Got**: ...
- **Evidence**: ...
```

---

## coder_response.md

```markdown
# Coder Response — Gold <N>, Sprint <N>

## Implementation Notes
<Brief summary of what was built>

## Failure Analysis

### TC-02 — <name>
- **Root Cause**: ...
- **Fixable next sprint?**: Yes / No / Needs re-scoping
- **Suggested fix**: ...

### TC-03 — <name>
- **Root Cause**: ...
- **Fixable next sprint?**: ...
- **Suggested fix**: ...
```

---

## sprint_summary.md

```markdown
# Sprint Summary — Gold <N>, Sprint <N>

## Score: <X>%

## What Was Delivered
<1-2 sentences describing what was completed>

## What Passed ✅
- ...

## What Failed / Needs Work ❌
- <TC-02>: <short reason>

## Assessment
<Pass / Needs Fix / Escalate and why>

## Recommendation
<Continue to the next sprint? Fix and retry? What user decision is needed?>
```

---

## gold_summary.md

```markdown
# Gold Summary — Gold <N>: <Title>

## Status: Complete / Partial / Cancelled

## Sprints Completed
| Sprint | Score | Key Deliverable |
|--------|-------|----------------|
| 1 | X% | ... |
| 2 | X% | ... |
| 3 | X% | ... |

## Definition of Done — Final Status
- [x] Condition 1 — met
- [ ] Condition 2 — not met (reason)

## Lessons Learned
- ...

## Leftover / Next Gold
- ...
```
