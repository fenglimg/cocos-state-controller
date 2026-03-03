# Planning Context: Optimize Component Auto-Mount Search Order

## Source Evidence
- `exploration-patterns.json` - Current search always uses `cc.director.getScene()` as root; traverseNodeTree() is downward-only DFS with visited Set, maxDepth=50, maxNodes=5000
- `exploration-integration-points.json` - Three call sites in scene-accessor.js (lines 450, 510, 563) all pass scene root; `node` parameter already available but unused for search scope
- `exploration-dependencies.json` - cc.Node.parent API available in Cocos Creator 2.x for upward traversal; lazy require pattern for property-mounter.js
- `scene-accessor.js:442` - performAutoMount(component, node, comName, totalMountResults) receives `node` (current node) but ignores it, uses `cc.director.getScene()` at line 450
- `property-mounter.js:23` - traverseNodeTree() only traverses downward via node.children
- `property-mounter.js:415` - autoMountProperties(component, rootNode, options) accepts rootNode as search scope
- `property-mounter.js:456` - Single traverseNodeTree(rootNode, callback) call per property - this is where two-phase search must be introduced

## Understanding
- **Current State**: Auto-mount searches the entire scene tree (from scene root downward) for every property, finding the highest-scoring match globally. The `node` parameter (current node where component was added) is passed to performAutoMount but only used for logging, not search scope.
- **Problem**: When a component has properties that match nearby nodes, the global search may find distant nodes first (DFS order dependent). Users expect properties to bind to the nearest matching nodes.
- **Approach**: Two-phase nearest-first search strategy:
  1. Phase 1: Search downward from the current node's subtree using existing traverseNodeTree
  2. Phase 2: If no match found, walk upward via node.parent; at each ancestor, search its full subtree (excluding already-visited branches via shared visited Set); stop at first level that finds a match
  3. Direct replacement (no configuration option) - new strategy becomes the only behavior

## Key Decisions
- Decision: Pass current node instead of scene root to autoMountProperties | Rationale: The `node` parameter is already available at all 3 call sites in scene-accessor.js | Evidence: scene-accessor.js:442, 510, 563
- Decision: Implement two-phase search inside autoMountProperties per-property loop | Rationale: Each property independently needs nearest-first search; reuse existing traverseNodeTree for each subtree scan | Evidence: property-mounter.js:452-479
- Decision: Stop at first ancestor level that has any match | Rationale: User clarification selected "first match level stops" for simplicity and predictability | Evidence: User clarification #3
- Decision: Search ancestor full subtrees excluding visited branches | Rationale: User clarification selected most comprehensive upward search option | Evidence: User clarification #1
- Decision: Direct replacement, no configuration | Rationale: User clarification selected direct replacement as simplest approach | Evidence: User clarification #2

## Dependencies
- Depends on: None (self-contained change within 2 files)
- Provides for: Improved auto-mount UX with nearest-node-first binding behavior
