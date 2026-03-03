# Implementation Plan: ccc-state-controller UI Redesign

**Session**: WFS-ccc-state-controller-ui-redesign
**Created**: 2026-03-03
**Status**: Planning Complete
**Complexity**: Low
**Estimated Time**: 2-3 hours

---

## Executive Summary

This plan outlines the UI redesign of the `ccc-state-controller` extension panel using the **ui-ux-pro-max** design system with **Vibrant & Block-based** style. The primary target is `packages/ccc-state-controller/panel/index.js`, containing all inline CSS and HTML.

### Key Changes
- **Color Palette Migration**: Orange (#f90) to Green CTA (#22C55E), Background #333 to Slate (#0F172A)
- **CSS Variable System**: 25+ design tokens for colors, spacing, typography, transitions
- **Accessibility**: 4.5:1 contrast ratios, visible focus states
- **Preservation**: All 17 element IDs and 5 event listeners maintained

---

## Design System Reference

### ui-ux-pro-max Specification

| Element | Value | Usage |
|---------|-------|-------|
| Background | `#0F172A` (Slate-900) | Panel background |
| Secondary BG | `#1E293B` (Slate-800) | Cards, elevated surfaces |
| CTA/Primary | `#22C55E` (Green-500) | Primary buttons, focus rings |
| Text Primary | `#F8FAFC` (Slate-50) | Main text |
| Text Muted | `#94A3B8` (Slate-400) | Secondary text |
| Success | `#50e3a4` | Installed status |
| Warning | `#e8b83d` | Update available |
| Error | `#f45b6b` | Error status, danger buttons |
| Info | `#5cc4ff` | Info log entries |

### Transition Timing
- Fast: 100ms (hover states)
- Normal: 150ms (focus states)
- Slow: 250ms (progress animations)

---

## Task Breakdown

### Phase 1: Foundation (IMPL-001 to IMPL-002)

#### IMPL-001: CSS Variable System Setup
**Scope**: Create 25+ CSS variables in `:host` selector

**Deliverables**:
- 6 semantic colors: `--primary-color`, `--success-color`, `--warning-color`, `--error-color`, `--info-color`, `--bg-primary`
- 4 background colors: `--bg-primary`, `--bg-secondary`, `--bg-tertiary`, `--bg-elevated`
- 3 text colors: `--text-primary`, `--text-secondary`, `--text-muted`
- 5 spacing variables: `--spacing-0` to `--spacing-4`
- 5 typography variables: `--font-size-xs` to `--font-size-lg`
- 3 transition variables: `--transition-fast`, `--transition-normal`, `--transition-slow`
- 4 radius variables: `--radius-sm` to `--radius-full`

**Verification**: `grep -c '^\s*--' panel/index.js >= 25`

---

#### IMPL-002: Host and Layout Color Migration
**Dependencies**: IMPL-001

**Color Mappings**:
| Old Value | New Variable |
|-----------|--------------|
| `#333` | `var(--bg-primary)` |
| `#e0e0e0` | `var(--text-primary)` |
| `#f90` | `var(--primary-color)` |
| `#444` | `var(--border-default)` |
| `#999` | `var(--text-muted)` |

**Verification**: `grep -c 'var(--' panel/index.js >= 10`

---

### Phase 2: Component Styling (IMPL-003 to IMPL-005)

#### IMPL-003: Input Component Styling
**Dependencies**: IMPL-002

**Changes**:
- `ui-input` background: `var(--bg-elevated)`
- `ui-input` border: `var(--border-default)`
- `ui-input:focus` border-color: `var(--primary-color)` (green)
- Add transitions using `var(--transition-fast)`

**Verification**: `grep -A5 'ui-input' | grep -c 'var(--' >= 4`

---

#### IMPL-004: Button System Styling
**Dependencies**: IMPL-003

**Key Change**: Primary button changes from **orange (#f90)** to **green (#22C55E)**

**Button States**:
| State | Old | New |
|-------|-----|-----|
| Base | `#3c3c3c` | `var(--bg-elevated)` |
| Hover | `#4a4a4a` | `var(--bg-hover)` |
| Primary | `#f90` | `var(--primary-color)` |
| Danger | `#c42` | `var(--error-color)` |
| Disabled | `#666` | `var(--disabled-bg)` |

**Verification**: `grep -A15 'ui-button' | grep -c 'var(--' >= 6`

---

#### IMPL-005: Status Card and Indicator Styling
**Dependencies**: IMPL-004

**Status Border Colors**:
| Status | Variable | Color |
|--------|----------|-------|
| Installed | `var(--success-color)` | Green |
| Not Installed | `var(--text-muted)` | Gray |
| Update Available | `var(--warning-color)` | Amber |
| Error | `var(--error-color)` | Red |

**Verification**: `grep -A20 '.status-card' | grep -c 'var(--' >= 6`

---

### Phase 3: Completion (IMPL-006 to IMPL-008)

#### IMPL-006: Progress and Log Component Styling
**Dependencies**: IMPL-005

**Progress Bar**: Change from orange (#f90) to green (`var(--primary-color)`)

**Log Entry Colors**:
| Type | Variable |
|------|----------|
| Info | `var(--info-color)` |
| Success | `var(--success-color)` |
| Error | `var(--error-color)` |
| Warn | `var(--warning-color)` |

**Verification**: `grep -A10 '.progress-|.log-' | grep -c 'var(--' >= 6`

---

#### IMPL-007: Footer, Divider, and Utility Styling
**Dependencies**: IMPL-006

**Final Cleanup**:
- Zero remaining hardcoded hex values
- All selectors use CSS variables

**Verification**: `grep -c '#[0-9a-fA-F]\{3,6\}' panel/index.js <= 2`

---

#### IMPL-008: Visual Validation and Accessibility Verification
**Dependencies**: IMPL-007

**Verification Checklist**:
- [ ] 17 element IDs preserved
- [ ] 5 event listeners intact
- [ ] Contrast ratios >= 4.5:1
- [ ] Transitions 150-300ms
- [ ] No JavaScript errors

---

## Dependency Graph

```
IMPL-001 (CSS Variables)
    |
    v
IMPL-002 (Host/Layout)
    |
    v
IMPL-003 (Inputs)
    |
    v
IMPL-004 (Buttons)
    |
    v
IMPL-005 (Status Cards)
    |
    v
IMPL-006 (Progress/Log)
    |
    v
IMPL-007 (Footer/Utilities)
    |
    v
IMPL-008 (Validation)
```

---

## Constraints & Risks

### Hard Constraints
1. **Inline CSS/HTML**: No external files, all styles in `style` property string
2. **No Build Step**: Must work directly in Cocos Creator 2.x
3. **Native Components**: Only `ui-button` and `ui-input` available
4. **ID Preservation**: All 17 element IDs must remain unchanged
5. **Event Preservation**: All 5 `confirm` event listeners must remain

### Risks
| Risk | Mitigation |
|------|------------|
| Visual regression | Sequential implementation with verification at each step |
| Missed hardcoded values | Grep verification in IMPL-007 |
| Contrast issues | 4.5:1 ratio verification in IMPL-008 |

---

## Files Modified

| File | Action | Tasks |
|------|--------|-------|
| `packages/ccc-state-controller/panel/index.js` | Modify | IMPL-001 to IMPL-008 |

---

## Quality Gates

### Pre-Implementation
- [x] Context package loaded
- [x] Pattern reference reviewed
- [x] Design system specification understood

### Per-Task
- [ ] Verification command passes
- [ ] No hardcoded values introduced
- [ ] Existing functionality preserved

### Final
- [ ] All 8 tasks completed
- [ ] Zero hardcoded hex values
- [ ] 17 element IDs preserved
- [ ] 5 event listeners intact
- [ ] Manual visual verification in Cocos Creator

---

## N+1 Context

### Decisions
| Decision | Rationale | Revisit? |
|----------|-----------|----------|
| CSS variables (basic tokens) | Maintainability without theme switching complexity | No |
| Semantic text tokens for icons | Cocos Creator constraints, consistency with current implementation | No |
| Green CTA (#22C55E) | ui-ux-pro-max design system specification | No |

### Deferred
- [ ] Multi-theme support (N+1 - requires data-theme attribute)
- [ ] SVG icon system (N+1 - requires template changes)

---

## Template Validation Checklist

- [x] All 8 sections populated
- [x] Task IDs match JSON files
- [x] Dependencies correctly mapped
- [x] Verification commands executable
- [x] Quality gates defined
- [x] N+1 context documented
