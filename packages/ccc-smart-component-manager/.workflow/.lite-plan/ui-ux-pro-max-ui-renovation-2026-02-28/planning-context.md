# Planning Context: UI Renovation with ui-ux-pro-max Design Intelligence

## Source Evidence
- `exploration-patterns.json` - CSS design token system on :host, emoji icons throughout, missing ARIA labels, prefers-reduced-motion support exists
- `exploration-integration-points.json` - 8 IPC endpoints, 25+ DOM bindings in $ map, InputMatch/ComponentOption data contracts
- `exploration-dependencies.json` - Zero npm deps, no build pipeline, Electron 2-4 CSS constraints, Shadow DOM isolation
- `panel/index.js:14-501` - Inline CSS with custom properties (dark theme, slate/indigo palette)
- `panel/index.js:503-1257` - Inline HTML template with main page, settings page, settings modal
- `panel/index.js:1260-1295` - Element bindings ($ map) connecting template to JS logic
- `.claude/skills/ui-ux-pro-max/SKILL.md` - Design rules: no-emoji-icons, color-contrast 4.5:1, focus-states, aria-labels, touch-target-size 44x44px

## Understanding
- **Current State**: panel/index.js is a 3134-line monolithic file with ~500 lines CSS, ~750 lines HTML, ~1800 lines JS. Uses CSS custom properties for design tokens (well-structured). Has dark theme with indigo accent. Uses emoji characters for all icons. Missing ARIA labels on interactive elements. Has prefers-reduced-motion and prefers-contrast support already.
- **Problem**: Emoji icons violate ui-ux-pro-max no-emoji-icons rule. Missing ARIA labels and role attributes reduce accessibility. CSS design tokens need refinement for consistency. Search UX and list rendering interactions can be improved. Typography and spacing need audit against best practices.
- **Approach**: Keep Editor.Panel.extend() single-file pattern. Reorganize CSS/HTML/JS internally for clarity. Apply ui-ux-pro-max best practices incrementally: (1) replace emojis with CSS/SVG icons, (2) add accessibility attributes, (3) refine design tokens and visual consistency, (4) improve search and list interaction UX.

## Key Decisions
- Decision: Keep single-file architecture | Rationale: Cocos Creator 2.x panel system requires it; user confirmed | Evidence: exploration-dependencies.json constraints
- Decision: Replace emoji icons with inline SVG/CSS | Rationale: ui-ux-pro-max no-emoji-icons rule; SVGs scale better and are accessible | Evidence: SKILL.md line 79
- Decision: Preserve dark theme with indigo accent | Rationale: User chose to keep current style + apply best practices | Evidence: clarification results
- Decision: Use CSS-only icon approach (no external fonts/SVGs) | Rationale: No external CSS/font loading allowed; all must be inline | Evidence: exploration-dependencies.json constraint #5
- Decision: Target all Cocos Creator 2.x versions | Rationale: User specified compatibility requirement | Evidence: clarification results

## Dependencies
- Depends on: None (standalone UI renovation)
- Provides for: Improved accessibility, visual consistency, and UX for the smart component manager panel
