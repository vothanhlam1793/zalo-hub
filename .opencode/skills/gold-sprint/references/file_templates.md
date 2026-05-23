# File Templates

## gold_brief.md

```markdown
# Gold Brief — Gold <N>: <Title>

## Mục tiêu
<Mô tả feature/goal bằng tiếng người dùng>

## Kết quả cuối (Definition of Done)
- [ ] <Điều kiện 1>
- [ ] <Điều kiện 2>

## Tech Constraints
- Language/Framework: ...
- Existing modules liên quan: ...
- Không được đụng vào: ...

## Sensitive Areas (cần user confirm trước khi Planner quyết định)
- ...

## Sprint Breakdown (dự kiến)
- Sprint 1: ...
- Sprint 2: ...
- Sprint 3: ...
```

---

## plan.md

```markdown
# Technical Plan — Gold <N>, Sprint <N>

## Sprint Scope
<Chính xác sprint này làm gì — không hơn không kém>

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

## Out of Scope (this sprint)
- ...
```

---

## test_key.md

```markdown
# Test Key — Gold <N>, Sprint <N>

## Test Cases

### TC-01: <Tên test> (Weight: X%)
- **Input**: ...
- **Expected Output**: ...
- **Pass Criteria**: ...
- **Partial Credit**: ... (nếu có)

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

## Out of Scope for Testing (this sprint)
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
<1-2 câu mô tả những gì đã build xong>

## What Passed ✅
- ...

## What Failed / Needs Work ❌
- <TC-02>: <lý do ngắn gọn>

## Assessment
<Pass / Needs Fix / Escalate — và lý do>

## Recommendation
<Tiếp tục Sprint tiếp theo? Fix rồi retry? Cần user quyết định gì?>
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
- [x] Điều kiện 1 — đạt
- [ ] Điều kiện 2 — chưa đạt (lý do)

## Lessons Learned
- ...

## Leftover / Next Gold (nếu có)
- ...
```
