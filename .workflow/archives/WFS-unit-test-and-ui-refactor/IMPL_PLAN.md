# Implementation Plan: Unit Test & UI Refactor

**Session**: WFS-unit-test-and-ui-refactor  
**Created**: 2026-03-03  
**Status**: Planning Complete

---

## Overview

Optimize ccc-state-controller project with two main objectives:
1. **Unit Test Enhancement**: Comprehensive coverage for installer modules
2. **UI/UX Refactoring**: Apply ui-ux-pro-max design guidelines while preserving Cocos Creator 2.x compatibility

### Goals
- Add 60+ test cases across installer modules and panel logic
- Achieve 80%+ code coverage for installer modules
- Improve panel accessibility (4.5:1 contrast ratio)
- Add cursor-pointer to all interactive elements

### Key Constraints
- Reference packages/ccc-smart-component-manager implementation patterns
- Cocos Creator 2.x compatibility required
- Maintain backward compatibility with existing functionality
- Follow tests/TESTING_GUIDE.md patterns

---

## Task Summary

| ID | Title | Type | Priority | Dependencies | Est. Time |
|----|-------|------|----------|--------------|-----------|
| IMPL-001 | Expand Installer Module Unit Tests | test-gen | P0 | None | 1.5h |
| IMPL-002 | Refactor Panel UI with ui-ux-pro-max | refactor | P0 | None | 1h |
| IMPL-003 | Add Panel Logic Unit Tests | test-gen | P1 | IMPL-002 | 1h |
| IMPL-004 | Add Edge Case and Error Handling Tests | test-gen | P1 | IMPL-001 | 1h |

**Total Estimated Time**: 3-4 hours  
**Parallel Execution**: IMPL-001 and IMPL-002 can run concurrently

---

## Phase 1: Unit Test Enhancement

### IMPL-001: Expand Installer Module Unit Tests

**Objective**: Implement comprehensive unit tests for installer sub-modules

**Scope**: packages/ccc-state-controller/src/installer

**Files to Create**:
- `tests/version-manager.test.js` (15+ test cases)
- `tests/file-copier.test.js` (15+ test cases)
- `tests/validator.test.js` (15+ test cases)

**Test Coverage Targets**:
- version-manager: compareVersions, readPackageVersion, readVersionFile, writeVersionFile, checkForUpdate, getInstalledVersion, setInstalledVersion, getCorePackageVersion
- file-copier: copyFile, copyDirectory, restoreBackup, cleanBackups, installCorePackage
- validator: validateFile, validateTypeScriptFile, validateInstallation, validateVersionFile, validateFullInstallation, getInstalledFiles, checkInstallationStatus

**Acceptance Criteria**:
- [ ] 3 new test files created
- [ ] 45+ test cases total
- [ ] All tests pass: `npm test -- installer`
- [ ] Coverage >= 80% for each module

---

## Phase 2: UI Refactoring

### IMPL-002: Refactor Panel UI with ui-ux-pro-max Guidelines

**Objective**: Improve panel accessibility and visual consistency

**Scope**: packages/ccc-state-controller/panel/index.js

**Modifications**:
1. Add `cursor: pointer` to all ui-button selectors
2. Update text colors for 4.5:1 contrast ratio (WCAG AA)
3. Add focus-visible outlines for keyboard accessibility
4. Reorganize CSS with section comments
5. Remove any emoji icons (use SVG or text only)

**Constraints**:
- Preserve `Editor.Panel.extend()` pattern (Cocos 2.x compatibility)
- No structural changes to panel extend call
- Maintain all existing button handlers

**Reference**: packages/ccc-smart-component-manager/panel/logic.js

**Acceptance Criteria**:
- [ ] All interactive elements have cursor-pointer
- [ ] Text contrast >= 4.5:1
- [ ] No emoji icons in UI
- [ ] Editor.Panel.extend pattern preserved
- [ ] Panel functionality unchanged

---

## Phase 3: Panel Test Coverage

### IMPL-003: Add Panel Logic Unit Tests

**Objective**: Create Jest+jsdom tests for panel UI logic

**Scope**: packages/ccc-state-controller/panel

**Files to Create**:
- `tests/panel.test.js` (20+ test cases)
- `tests/__mocks__/Editor.js` (Editor API mocks)

**Test Categories**:
1. **State Management** (5+ tests): initialization, status updates, version display
2. **Button Handlers** (8+ tests): install, update, validate, uninstall clicks
3. **IPC Communication** (5+ tests): init-panel, install-result, status-update messages
4. **Error Handling** (2+ tests): error display, recovery

**Mock Strategy**:
- Mock Editor.Panel.extend() to capture panel configuration
- Mock Editor.Ipc.sendToMain() and sendToPanel()
- Mock Editor.Dialog.show() for dialog interactions

**Acceptance Criteria**:
- [ ] 1 test file created
- [ ] 20+ test cases
- [ ] All tests pass: `npm test -- panel`
- [ ] Editor API mocks implemented correctly

---

## Phase 4: Edge Case Coverage

### IMPL-004: Add Edge Case and Error Handling Tests

**Objective**: Expand test coverage for edge cases and error scenarios

**Scope**: packages/ccc-state-controller/tests

**Modifications**:
- Add Edge Cases describe blocks to version-manager.test.js
- Add Error Handling describe blocks to file-copier.test.js
- Add Edge Cases describe blocks to validator.test.js
- Add Recovery Scenarios to installer.test.js

**Test Scenarios**:
- Null/undefined inputs for all public functions
- File system errors: ENOENT, EACCES, ENOSPC
- Malformed version strings
- Corrupted files and partial installations
- Concurrent operation handling

**Quality Assurance**:
- Apply mutation testing checklist from TESTING_GUIDE.md
- Verify tests catch actual bugs (not just pass)

**Acceptance Criteria**:
- [ ] 15+ new edge case tests added
- [ ] Error handling tests cover: ENOENT, EACCES, ENOSPC, EINVAL
- [ ] Mutation testing checklist applied

---

## Technical Reference

### Test Patterns (from TESTING_GUIDE.md)

**Pure Logic Strategy** (for installer modules):
```javascript
// Mock before import
jest.mock('fs', () => ({ /* ... */ }));
import Module from '../src/module';

describe('Module', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    
    describe('Core Logic', () => { /* ... */ });
    describe('Edge Cases', () => { /* ... */ });
});
```

**UI Component Strategy** (for panel):
```javascript
// Mock Editor before import
global.Editor = {
    Panel: { extend: jest.fn(config => config) },
    Ipc: { sendToMain: jest.fn() }
};
```

### Key Files

| File | Role | Lines |
|------|------|-------|
| tests/TESTING_GUIDE.md | Canonical test patterns | 525 |
| packages/ccc-state-controller/panel/index.js | UI refactoring target | 780 |
| packages/ccc-state-controller/src/installer/index.js | Test coverage target | 306 |
| packages/ccc-state-controller/tests/installer.test.js | Existing test patterns | 619 |

---

## Execution Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Parallel Execution                        │
├─────────────────────────┬───────────────────────────────────┤
│     IMPL-001            │         IMPL-002                   │
│  Installer Tests        │      Panel UI Refactor            │
│  (1.5 hours)            │        (1 hour)                    │
└───────────┬─────────────┴───────────────┬───────────────────┘
            │                             │
            ▼                             ▼
┌───────────────────────┐   ┌─────────────────────────────────┐
│      IMPL-004         │   │          IMPL-003               │
│   Edge Case Tests     │   │       Panel Tests               │
│    (1 hour)           │   │        (1 hour)                 │
└───────────────────────┘   └─────────────────────────────────┘
```

---

## Quality Gates

### Pre-Implementation
- [ ] All context files loaded and reviewed
- [ ] TESTING_GUIDE.md patterns understood
- [ ] Reference implementations reviewed

### Per-Task Completion
- [ ] All acceptance criteria met
- [ ] Tests pass locally
- [ ] Code follows project conventions

### Final Verification
- [ ] All 4 tasks completed
- [ ] Total test count >= 80 (existing 20 + new 60)
- [ ] Coverage >= 80% for installer modules
- [ ] Panel UI accessible and functional

---

## N+1 Context

### Decisions
| Decision | Rationale | Revisit? |
|----------|-----------|----------|
| Jest+jsdom for panel tests | Conflict resolution: chosen over custom runner | No |
| Editor.Panel.extend preserved | Cocos 2.x compatibility requirement | No |
| Full test coverage scope | Conflict resolution: cover all methods | No |

### Deferred
- [ ] E2E panel tests in actual Cocos Creator environment (requires manual testing)
- [ ] Visual regression tests for UI changes (tool not available)

---

## Quick Links

- Task JSONs: `.workflow/active/WFS-unit-test-and-ui-refactor/.task/IMPL-*.json`
- Context Package: `.workflow/active/WFS-unit-test-and-ui-refactor/.process/context-package.json`
- Planning Notes: `.workflow/active/WFS-unit-test-and-ui-refactor/planning-notes.md`
