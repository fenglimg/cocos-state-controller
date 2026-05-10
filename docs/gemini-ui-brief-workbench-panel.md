# Gemini UI Brief — `ccc-state-controller-workbench` Panel

> **Audience**: Gemini CLI (UI implementation).
> **Goal**: Implement the full panel UI (`panel/styles.css` + `panel/template.html` + `panel/logic.js`) for the State Controller Workbench plugin in Cocos Creator 2.4.13. This brief is the contract; do **not** read runtime source.
>
> **Deliverable**: replace the placeholder `panel/{styles.css, template.html, logic.js}`. After editing, run `node packages/ccc-state-controller-workbench/panel/build.js` to assemble the final `panel/index.js`.

---

## 1. Data Contract — `controllerGraph`

`Editor.Scene.callSceneScript('ccc-state-controller-workbench', 'list-controllers', {}, cb)` returns a JSON-safe object:

```ts
type AnomalyTag =
  | 'duplicate-name'
  | 'no-states'
  | 'invalid-selected-index'
  | 'missing-name'
  | 'orphan-controller'
  | 'no-controlled-props';

type ControllerGraph = {
    summary: {
        controllerCount: number;
        selectCount: number;
        orphanSelectCount: number;
        totalControlledProps: number;
        controllersWithIssues: number;
    };
    controllers: Array<{
        ctrlId: number;
        ctrlName: string;
        selectedIndex: number;
        states: Array<{ stateId: number; name: string }>;
        nodeUuid: string;
        nodePath: string;
        anomalies: AnomalyTag[];      // subset of the 6 tags
    }>;
    selects: Array<{
        nodeUuid: string;
        nodeName: string;
        currCtrlId: number;
        ctrlState: number;
        controlledProps: number[];     // EnumPropName values
        _ctrlData: Record<string, Record<string, Record<string, any>>>;  // shallow copy
        anomalies: AnomalyTag[];
    }>;
    orphanSelects: ControllerGraph['selects'];   // same shape, filtered
};
```

Everything in this object is **plain JSON** — no `cc.Node` instances, no `cc.Vec3`. Pass it through IPC freely.

---

## 2. IPC Message Surface

All IPC goes through `Editor.Scene.callSceneScript('ccc-state-controller-workbench', <message>, <payload>, callback)`.

### M4 (already implemented in `scene-accessor.js`)

| message | payload | reply |
|---|---|---|
| `list-controllers` | `{}` | `(err, ControllerGraph)` |
| `install-runtime` | `{ sourceDir?, targetDir?, overwrite? }` | `(err, { action, filesAffected, backupPath })` |
| `get-runtime-status` | `{ sourceDir?, targetDir? }` | `(err, { source, target, missing[], modified[] })` |
| `set-property-undo-aware` | `{ id, path, type, value }` | `(err, { ok: true })` |
| `snapshot-begin` | `{ label }` | `(err, { ok: true })` |
| `snapshot-end` | `{ label }` | `(err, { ok: true })` |

`install-runtime` actions: `'install'` (only adds), `'updated'` (modifies), `'noop'` (source==target or no-op needed), `'failed'` (fs error → `{ error, rolledBack? }`).

### M5 (now implemented in scene-accessor.js + lib/health-check.js)

The 7 mutation handlers below are wired and Undo-aware:

| message | payload | reply | semantics |
|---|---|---|---|
| `set-state-name` | `{ ctrlId, stateId, newName }` | `(err, {ok})` | scene:set-property to `_states.<idx>.name` (String) |
| `add-state` | `{ ctrlId, stateName }` | `(err, {ok})` | scene:snapshot wrapping `controller.addState(name)` |
| `delete-state` | `{ ctrlId, stateId }` | `(err, {ok})` | scene:snapshot wrapping `controller.deleteState(stateId)`. Cascades to all StateSelect via M3 fix — **single Ctrl+Z restores everything** including `_ctrlData` and `_flatData` |
| `cleanup-orphans` | `{}` | `(err, {totalIssues, autofixCount, fixed[]})` | scene:snapshot wrapping bulk autofix (resets orphan `currCtrlId` to 0) |
| `copy-state-props` | `{ srcCtrlId, srcStateId, dstStateId }` | `(err, {ok})` | scene:snapshot wrapping per-prop scene:set-property to `_ctrlData.<ctrlId>.<dstStateId>.<propType>` |
| `set-selected-index` | `{ ctrlId, newIndex }` | `(err, {ok})` | scene:set-property `selectedIndex` (Number) |
| `set-prop-value` | `{ nodeUuid, ctrlId, stateId, propType, value }` | `(err, {ok})` | scene:set-property nested path `_ctrlData.<ctrlId>.<stateId>.<propType>` (Object) |
| `health-detect` | `{}` | `(err, {issues})` | calls `lib/health-check.detect(graph)`; returns the issue list |

`lib/health-check.js` (use only `detect()` from the panel; `fix()` is a thin wrapper around RPC):

```ts
type Issue = {
    type: AnomalyTag | 'dead-ctrl-data-refs' | 'state-name-collision';
    controllerCtrlId?: number;
    nodeUuid?: string;
    stateId?: number;
    severity: 'info' | 'warning' | 'error';
    autofix: boolean;
    suggestedAction: string;
};
function detect(graph: ControllerGraph): { issues: Issue[] };
function fix(issue: Issue, rpc): Promise<{ok: boolean, reason?: string}>;
```

#### Installer rollback (M5)

`install-runtime` reply now includes failure handling:

```ts
type InstallResult =
  | { action: 'install' | 'updated', filesAffected: string[], backupPath: string }
  | { action: 'noop',   filesAffected: [],      backupPath: string|null }
  | {
      action: 'failed',
      error: string,
      partiallyWrittenFiles: string[],
      filesAffected: string[],
      backupPath: string|null,
      rolledBack: boolean,
    };
```

When `action === 'failed'` AND `rolledBack === true`, the target directory has been restored from the backup. UI should:
- show an error banner (red) with `error` text
- show the backup path so the user can investigate manually
- offer a "Retry" button

---

## 3. Panel Build Constraints (Cocos 2.4)

- **NEVER edit `panel/index.js` directly** — it is a build artifact.
- Source files:
  - `panel/styles.css` — CSS (no `<style>` tags); the build script wraps it in a template literal.
  - `panel/template.html` — HTML body; the build script wraps it in a template literal.
  - `panel/logic.js` — must end with `module.exports = { … }` (the panel definition object). `require(...)` statements above the export are preserved.
- Build command: `node packages/ccc-state-controller-workbench/panel/build.js`. After editing the three source files, ALWAYS rebuild.
- Panel size: dockable, **420 × 360** initial, min 320 × 240. Optimize layouts for that footprint.
- DOM access: panels run inside Cocos's web-component runtime. Use `this.shadowRoot ? this.shadowRoot.querySelector(…) : document.querySelector(…)` to support both code paths.
- The `$` shorthand: declarations like `$: { btn: '#btn' }` give you `this.btn` references after `ready()`.
- Only `ui-*` Cocos custom elements survive across editor versions — but plain `<div>` / `<button>` / `<input>` work fine and are easier for layout.

---

## 4. Recommended Tab Layout (4 tabs)

### 4.1 Dashboard (M4 wired to `list-controllers`)
- Header: summary card (controller count, select count, issues, orphans).
- List of controllers: each row shows `ctrlName` + `[ctrlId]` + `selectedIndex / states.length` + anomaly badges (chip per `AnomalyTag`).
- Empty state: "No controllers in scene."
- Refresh button (top-right).

### 4.2 Installer (M4 wired to `install-runtime` / `get-runtime-status`)
- Two read-only path inputs: source / target (defaults to project's `assets/script/controller/`).
- "Refresh status" → calls `get-runtime-status`, shows `missing[]` and `modified[]`.
- "Install runtime" → calls `install-runtime`, shows action result (install / updated / noop / failed). On failed, surface the backup path.

### 4.3 Config (M5 — Gemini implements after this brief)
- Selector: dropdown of controllers from `controllerGraph.controllers`.
- For the chosen controller: editable list of states.
  - Inline rename: input bound to `set-state-name` (debounced).
  - Add: text input + button → `add-state`.
  - Delete: row × button → `delete-state` (with confirm).
  - Copy props: dropdown "from state → to state" → `copy-state-props`.
- For each state, an expandable details pane shows the prop overrides from `controllerGraph.selects` filtered by `currCtrlId == ctrlId`. Allow editing via `set-prop-value`.

### 4.4 Health (M5 — Gemini implements after this brief)
- Calls `health-check.detect(graph)` (will be exposed as a new RPC `'health-detect'` in M5; until then, derive issues client-side from `graph.controllers[*].anomalies` and `graph.orphanSelects`).
- Show issue list grouped by severity (error / warning / info).
- Each issue with `autofix === true` gets a "Fix" button → calls `health-fix(issue)` (M5 RPC) or, where possible, the specific handler from §2.

---

## 5. Interaction Flow (Dashboard example)

```
panel.ready()
  ↓ Editor.Scene.callSceneScript('list-controllers')
        ↓ scene-accessor reflects scene → state-graph.buildControllerGraph
        ↓ returns ControllerGraph
  ← panel.renderDashboard(graph)
        ↓ updates DOM (#dashboard-summary, #dashboard-list)

User clicks "Refresh" → repeat.
User clicks a controller row → highlight in scene via Editor.Selection.select([nodeUuid]).
```

---

## 6. Style Tone

- Match Cocos editor's dark theme (`#2b2b2b` background, `#ddd` foreground, `#3c3c3c` chrome).
- Anomaly badges: red (`#b94a48`) for errors, amber (`#d9822b`) for warnings, blue (`#3a87ad`) for info.
- Typography: 12 px base; the panel is dense — favour information density over whitespace.
- Buttons: flat, 4 px radius, 1 px border `#555`. Hover: bg `#5a5a5a`.
- Use Cocos's editor icons sparingly; small SVGs inline are fine.
- Animations: keep ≤150 ms for affordances. Avoid scroll-jank on the controller list.

---

## 7. Boundaries (Hard Constraints)

1. **Do not** `require('cc')` or any runtime type (`StateController`, `StateSelect`). The panel runs in a separate process where `cc.*` is unavailable.
2. **Do not** mutate `cc.Node` / component instances directly. All writes go through `set-property-undo-aware` (single field) or `snapshot-begin/end` wrapping multiple `set-property-undo-aware` calls (group Undo).
3. **Do not** rely on the panel's DOM living forever — `unload()` may be called; release event listeners.
4. **Do not** edit `panel/index.js`. Edit the three source files and rebuild.
5. The `controllerGraph._ctrlData` is a shallow copy — mutating it locally does **not** persist. Send mutations through IPC.
6. Cocos 2.4 panels are **not** allowed to use `engineSupport: true` style version gates (that's 3.x). Stick to the manifest already declared.

---

## 8. Acceptance Checklist

A finished panel must:

- [ ] Load successfully in Cocos 2.4.13: main menu shows "状态控制器工作台/开启" (zh) or English equivalent.
- [ ] Dashboard tab renders within 100 ms of opening (assuming `list-controllers` returns within 500 ms).
- [ ] Installer tab can run `install-runtime` against `source==target` and surface the `noop` action.
- [ ] Config tab supports CRUD for states with **single Ctrl+Z fully restoring** the deleted/added state (verifies snapshot wiring).
- [ ] Health tab lists every anomaly tag from §1; "Fix" button works for orphan-select and dead-ctrl-data-refs.
- [ ] No console errors on open / tab switch / panel close.
- [ ] `node panel/build.js` succeeds; no manual edits in `panel/index.js`.

---

## 9. References (read these if helpful)

- `packages/ccc-state-controller-workbench/lib/state-graph.js` — graph schema source of truth.
- `packages/ccc-state-controller-workbench/lib/installer.js` — installer return shape.
- `packages/ccc-smart-component-manager/panel/{styles.css,template.html,logic.js}` — sibling plugin you can borrow patterns from (do **not** copy text content).

When in doubt, **prefer fewer features done well** over more features half-done.
