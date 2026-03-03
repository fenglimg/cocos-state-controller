# Coding Conventions

## TypeScript

- Use strict type checking
- Prefer interfaces over type aliases for object shapes
- Use `const` for immutable references, `let` for mutable
- Use arrow functions for callbacks
- Use template literals for string interpolation

## Naming Conventions

- **Classes**: PascalCase (e.g., `StateController`)
- **Methods/Functions**: camelCase (e.g., `updateState`)
- **Private members**: Prefix with underscore (e.g., `_selectedIndex`)
- **Constants**: UPPER_SNAKE_CASE or PascalCase
- **Files**: Match class name (e.g., `StateController.ts`)

## Cocos Creator Specific

- Use `@property` decorator for inspector-exposed properties
- Follow Cocos Creator component lifecycle (`onLoad`, `start`, `onDestroy`)
- Use `cc.Node` and `cc.Component` types from `cc` namespace

## Code Organization

- One class per file
- Group related files in directories by feature
- Use barrel exports (`index.ts`) for module public API

## Testing Patterns (from TESTING_GUIDE.md)

- **Jest mock order**: `jest.mock()` MUST come before imports
- **UI Component Strategy**: Use `node.addComponent()` with `node.active = false`
- **Pure Logic Strategy**: Reset singletons in `beforeEach`, mock platform APIs
- **Describe organization**: 4-block structure (Lifecycle, UI Update, Event Handlers, Edge Cases)
- **Private access**: Use `instance['member']` syntax for testing private members

## UI/UX Guidelines (from ui-ux-pro-max)

- **Contrast ratio**: Minimum 4.5:1 for normal text
- **Cursor pointer**: Add `cursor: pointer` to all clickable/hoverable elements
- **Focus states**: Visible focus rings on interactive elements
- **No emoji icons**: Use SVG icons, not emojis as UI icons
- **Touch targets**: Minimum 44x44px for mobile interactions
- **Transitions**: 150-300ms for micro-interactions
