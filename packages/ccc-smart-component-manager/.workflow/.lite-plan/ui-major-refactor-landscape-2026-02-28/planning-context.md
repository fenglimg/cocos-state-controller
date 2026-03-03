# Planning Context: UI Major Refactor - Design System Driven

## Source Evidence
- `exploration-ui-layout.json` - Current CSS uses 44px touch targets, 16px padding, 12px gaps; total minimum vertical consumption 180px+ exceeds 120px panel height by 50%
- `exploration-patterns.json` - 7 pattern systems identified: svgIcon, button rendering, search results (grid-based), component bar (horizontal scroll), settings modal (520px fixed width), CSS architecture (1300 lines), IPC communication
- `exploration-integration-points.json` - 17 $ element bindings, 13 IPC messages, 22 DataManager API calls, 7 keyboard shortcuts must be preserved
- `exploration-dependencies.json` - Electron 2-4 compat: flexbox gap NOT supported (Chromium 84+), must use margin; grid-gap works from Chromium 57+; only zh.js i18n exists

## Understanding
- **Current State**: panel/index.js contains ~1300 lines of CSS + ~60 lines HTML template + JS rendering. The UI was designed with 44px mobile touch targets, generous spacing (--spacing-lg=16px), and indigo (#6366f1) accent color. This is completely wrong for a 300-450px wide, 120px tall docked editor panel.
- **Problem**: The entire design language is wrong. Not just "too big" but fundamentally wrong paradigm (mobile app vs desktop developer tool). Need complete CSS rewrite following IDE/DevTool conventions: 20-24px controls, 2-4px spacing, dark OLED palette, high-contrast text.
- **Approach**: Design-system-driven rewrite in 4 sequential phases: (1) CSS design tokens + all component styles, (2) HTML template restructuring, (3) JS rendering methods + settings page conversion to full-panel view, (4) i18n updates + integration testing.

## Key Decisions
- Decision: Replace indigo #6366f1 accent with green #22C55E | Rationale: Green signals "add/success" action which matches the primary CTA (add component) | Evidence: ui-ux-pro-max design system specification
- Decision: Settings becomes full-panel replacement, not modal | Rationale: Current 520px modal exceeds 300-450px panel width; full-panel view eliminates overlay complexity | Evidence: exploration-patterns.json settings modal analysis
- Decision: Search results as single-column compact list, not grid | Rationale: 300-450px width cannot support multi-column; flat list maximizes visible results at 22-24px per item | Evidence: exploration-ui-layout.json vertical space budget
- Decision: Use margin-based spacing instead of flexbox gap | Rationale: Electron 2 (Chromium 58) does not support flexbox gap; grid-gap is safe | Evidence: exploration-dependencies.json CSS compat analysis
- Decision: Merge results-meta into search toolbar row | Rationale: Eliminates 24px of wasted vertical space; result count shown inline after input | Evidence: exploration-ui-layout.json proposed consumption

## Dependencies
- Depends on: None (self-contained single-file refactor)
- Provides for: Better UX for Cocos Creator editor users working in landscape docked panels

## Technical Constraints (Preserved)
- 17 $ element binding IDs must exist in HTML template
- 13 IPC message names/data contracts unchanged
- 22 DataManager API method calls preserved
- 7 keyboard shortcuts preserved
- Editor.Panel.extend() single-file pattern
- Electron 2-4 compat: NO flexbox gap, use margin
- Keep svgIcon system, keep i18n t() pattern
