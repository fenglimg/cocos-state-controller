# Planning Notes

**Session**: WFS-unit-test-and-ui-refactor
**Created**: 2026-03-03T12:50:00Z

## User Intent (Phase 1)

- **GOAL**: 优化 ccc-state-controller 项目，包含两个主要任务：1) 单元测试完善 2) UI/UX 重构
- **KEY_CONSTRAINTS**:
  - 参考 packages/ccc-smart-component-manager 的实现模式
  - Cocos Creator 2.x 兼容性要求
  - 保持现有功能向后兼容

---

## Context Findings (Phase 2)

### [Context-Search Agent] 2026-03-03
- **Note**: Completed comprehensive context gathering with 3 exploration angles (patterns, integration-points, testing)

**Key Findings:**
1. **Test Infrastructure**: tests/TESTING_GUIDE.md is the canonical reference for Cocos Creator Jest patterns - defines UI Component Strategy (node.addComponent with node.active=false) and Pure Logic Strategy (singleton reset, platform API mocks)
2. **Panel Architecture**: packages/ccc-state-controller/panel/index.js (780 lines) uses Editor.Panel.extend() pattern with inline CSS/template - must be preserved for Cocos 2.x compatibility
3. **Installer Modules**: Core business logic in installer/index.js depends on version-manager, file-copier, validator sub-modules - all need unit test coverage
4. **Reference Implementation**: packages/ccc-smart-component-manager/panel/logic.js shows modern patterns: i18n integration, data manager, logger, SVG icons, modular imports
5. **UI/UX Guidelines**: ui-ux-pro-max skill provides 67 styles, 96 palettes, Pre-Delivery Checklist with critical rules (no emoji icons, cursor-pointer, 4.5:1 contrast)

**Priority Files:**
- Critical: tests/TESTING_GUIDE.md, panel/index.js, installer/index.js, main.js
- High: tests/installer.test.js, test-helper.js, smart-component-manager/panel/logic.js
- Medium: StateController.test.ts, version-manager.js, file-copier.js, validator.js

**Clarification Questions Generated:**
1. Unit test coverage scope: Full vs Critical path only vs Incremental
2. Panel UI refactoring approach: Preserve pattern vs Build step vs Minimal changes
3. Test framework for panel: Jest+jsdom vs Custom runner vs Hybrid

## Conflict Decisions (Phase 3)

- **RESOLVED**: Test Scope -> Full Coverage (覆盖所有方法和边界情况); UI Approach -> Preserve Pattern (保持 Editor.Panel.extend 模式); Panel Test -> Jest+jsdom
- **MODIFIED_ARTIFACTS**: None
- **CONSTRAINTS**: None

## Consolidated Constraints (Phase 4 Input)
1. 参考 packages/ccc-smart-component-manager 的实现模式
2. Cocos Creator 2.x 兼容性要求
3. 保持现有功能向后兼容

---

## Task Generation (Phase 4)

**Generated**: 2026-03-03T16:00:00Z
**Agent**: action-planning-agent

### Task Breakdown
| ID | Title | Type | Dependencies | Est. Time |
|----|-------|------|--------------|-----------|
| IMPL-001 | Expand Installer Module Unit Tests | test-gen | None | 1.5h |
| IMPL-002 | Refactor Panel UI with ui-ux-pro-max Guidelines | refactor | None | 1h |
| IMPL-003 | Add Panel Logic Unit Tests with Jest+jsdom | test-gen | IMPL-002 | 1h |
| IMPL-004 | Add Edge Case and Error Handling Tests | test-gen | IMPL-001 | 1h |

### Parallel Execution
- Group 1: IMPL-001 + IMPL-002 (independent tasks)
- Sequential: IMPL-003 after IMPL-002, IMPL-004 after IMPL-001

### Output Files
- Task JSONs: `.task/IMPL-001.json` through `IMPL-004.json`
- plan.json: Machine-readable plan overview
- IMPL_PLAN.md: Human-readable implementation plan
- TODO_LIST.md: Progress tracking checklist

## N+1 Context
### Decisions
| Decision | Rationale | Revisit? |
|----------|-----------|----------|
| Jest+jsdom for panel tests | Conflict resolution decision - chosen over custom runner for consistency with core tests | No |
| Full coverage scope | Conflict resolution - cover all installer methods and edge cases | No |
| Editor.Panel.extend preserved | Cocos Creator 2.x compatibility requirement | No |
| 4 task limit | Task count within acceptable range (4 <= 8) | No |
| Pure Logic Strategy for installer tests | Follows TESTING_GUIDE.md pattern for non-UI modules | No |

### Deferred
- [ ] E2E panel tests in actual Cocos Creator environment (requires manual testing setup)
- [ ] Visual regression tests for UI changes (tool not available in project)
- [ ] Performance benchmarks for installer operations (not in scope)
