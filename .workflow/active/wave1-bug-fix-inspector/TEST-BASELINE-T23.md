# T23 · 测试基线确认

> PLN-001 Wave 1 任务 T23。无代码变更, 仅记录测试基线。

## 出口标准 (PLN 原文)

`npm test` 全绿; 行末 `Tests: N passed` 中 N ≥ 399 + 本次新增数。

## 基线增量

| Wave 阶段 | 测试增加 |
|---|---|
| 进入分支时 baseline | 399 passed, 1 failed (T02 红测试 Bug B), 1 skipped |
| T02 Bug B 转绿 (T05/T06) | +1 |
| T09 Props.visibility (5 cases) | +5 |
| T14 currentStateLabel (2 cases) | +2 |
| T16 record/openPanel stub (2 cases) | +2 |
| T19 currentStateProps (3 cases) | +3 |
| T21 select record/openPanel stub (2 cases) | +2 |
| **合计预期** | **+15** |
| **预期 total** | **414 passed** |

## 实测

```
Test Suites: 19 passed, 19 total
Tests:       1 skipped, 414 passed, 415 total
Time:        ~1.5 s
```

- ✅ 414 = 399 + 15, 与预期完全一致
- ✅ 1 skipped 未变 (旧的 skipped case, 与 wave 1 无关)
- ✅ 无 failed
- ✅ 跑时 < 2s, 无 flaky 抖动

## 结论

T23 通过。Wave 1 测试基线锁定: **414 passed / 1 skipped / 19 test suites**。
之后任何 Wave 1.5 / Wave 2 改动都不允许这两个数字下降。
