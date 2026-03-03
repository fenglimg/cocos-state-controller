# Project Structure

## Directory Layout

```
cocos-state-controller/
├── assets/
│   └── script/
│       └── Controller/          # Core state controller components
│           ├── StateController.ts
│           ├── StateSelect.ts
│           ├── StatePropHandler.ts
│           ├── StateEnum.ts
│           ├── StateErrorManager.ts
│           ├── Props/           # Property decorator classes
│           └── __tests__/       # Unit tests
├── packages/
│   ├── ccc-state-controller/    # Editor extension package
│   │   ├── src/installer/       # Installation modules
│   │   └── panel/               # UI panel
│   ├── ccc-state-controller-core/  # Core source package
│   └── ccc-smart-component-manager/ # Advanced component manager
└── .workflow/                   # Workflow session data
```

## Key Files

| File | Purpose |
|------|---------|
| `StateController.ts` | Main state controller component |
| `StateSelect.ts` | Property binding and execution |
| `StatePropHandler.ts` | Property handler strategies |
| `StateEnum.ts` | Type definitions and enums |
| `StateErrorManager.ts` | Centralized error handling |

## Package Structure

Each package follows Cocos Creator extension conventions:
- `package.json` - Extension manifest
- `main.js` - Extension entry point
- `panel/` - UI panel implementation
- `src/` - Source modules
