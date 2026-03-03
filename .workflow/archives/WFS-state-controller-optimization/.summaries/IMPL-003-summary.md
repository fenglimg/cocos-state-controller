# Task: IMPL-003 智能属性推断

## Implementation Summary

### Files Modified
- `assets/script/Controller/StateSelect.ts`: Added scanAvailableProperties() and autoConfigureAllProperties() methods
- `assets/script/Controller/Props/StateToolsProps.ts`: Added auto-configuration button

### Content Added

#### StateSelect.ts

**scanAvailableProperties()** (`StateSelect.ts:2042`): Scans node for all available properties based on attached components
- Returns: `EnumPropName[]` - Array of available property types
- Iterates through all EnumPropName values and checks availability via isPropertyAvailable()

**autoConfigureAllProperties()** (`StateSelect.ts:2072`): One-click configuration to enable control for all available properties
- Returns: `{ enabled: number; skipped: number; failed: number }` - Configuration result statistics
- Skips already controlled properties
- Logs each operation via StateErrorManager
- Refreshes inspector after completion

#### Existing Methods Verified (Already Implemented)

**isPropertyAvailable(propType: EnumPropName)** (`StateSelect.ts:1944`): Checks if a property type is available for the current node
- Node basic properties (Active, Position, Scale, Color, Size, Euler, Anchor, Opacity) are always available
- Component properties require corresponding component (Label, Sprite, Button, etc.)

**isPropertyControlled(propType: EnumPropName)** (`StateSelect.ts:1969`): Checks if a property is already under control
- Uses new `$$controlledProps$$` structure
- Falls back to legacy `$$changedProp$$` for compatibility

**togglePropertyControl(propType: EnumPropName, enable: boolean)** (`StateSelect.ts:1995`): Toggles property control state
- Calls addPropertyControl() when enabling
- Calls removePropertyControl() when disabling

#### StateToolsProps.ts

**autoConfigureProps** (`StateToolsProps.ts:70-83`): Button property for one-click auto-configuration
- DisplayName: "⚡ 一键配置属性"
- Calls owner.autoConfigureAllProperties() and logs result

## Outputs for Dependent Tasks

### Available Methods
```typescript
// Scan available properties
const availableProps = stateSelect.scanAvailableProperties();
// Returns: EnumPropName[] (e.g., [EnumPropName.Active, EnumPropName.LabelString, ...])

// One-click auto-configure all available properties
const result = stateSelect.autoConfigureAllProperties();
// Returns: { enabled: number; skipped: number; failed: number }

// Check property availability
const isAvailable = stateSelect.isPropertyAvailable(EnumPropName.LabelString);

// Check if property is controlled
const isControlled = stateSelect.isPropertyControlled(EnumPropName.LabelString);

// Toggle property control
stateSelect.togglePropertyControl(EnumPropName.LabelString, true);  // Enable
stateSelect.togglePropertyControl(EnumPropName.LabelString, false); // Disable
```

### Integration Points
- **StateToolsProps**: Use `autoConfigureProps` getter/setter to trigger one-click configuration
- **Editor Inspector**: "⚡ 一键配置属性" button appears in Tools section

### Supported Component Properties
| Component | Properties |
|-----------|------------|
| cc.Label | LabelString, LabelFontSize, LabelLineHeight, LabelSpacingX, LabelWrapEnable, Font |
| cc.LabelOutline | LabelOutlineColor |
| cc.Sprite | SpriteFrame, SpriteFillRange |
| cc.Button | ButtonInteractable |
| cc.Slider | SliderProgress |
| cc.EditBox | EditboxString |
| cc.ProgressBar | ProgressBarProgress |
| cc.Toggle | ToggleIsChecked |
| cc.RichText | RichTextString |
| cc.ScrollView | ScrollViewEnabled |
| cc.Mask | MaskEnabled |
| cc.Widget | WidgetEnabled, WidgetAlignMode, WidgetIsAlignTop/Bottom/Left/Right, etc. |
| GrayScale | GrayScale |

### Node Basic Properties (Always Available)
- Active, Position, Scale, Color, Size, Euler, Anchor, Opacity

## Status: Completed
