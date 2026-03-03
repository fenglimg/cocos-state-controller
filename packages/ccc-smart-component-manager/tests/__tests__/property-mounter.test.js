const PropertyMounter = require('../../property-mounter');

let mounter;

beforeEach(() => {
    mounter = new PropertyMounter();
});

/**
 * 辅助：用描述对象快速构建节点树
 *   createNodeTree({ name: 'root', children: [{ name: 'A' }, { name: 'B' }] })
 */
function createNodeTree(desc) {
    const node = new cc.Node(desc.name);
    if (desc.children) {
        desc.children.forEach(childDesc => {
            node.addChild(createNodeTree(childDesc));
        });
    }
    return node;
}

// ============================================================
// matchNodeName / flexibleLetterMatch
// ============================================================
describe('matchNodeName', () => {
    test('精确匹配（忽略大小写）', () => {
        const r = mounter.matchNodeName('label', 'Label');
        expect(r.match).toBe(true);
        expect(r.score).toBe(100);
        expect(r.type).toBe('exact');
    });

    test('精确匹配（大小写敏感模式）', () => {
        const r = mounter.matchNodeName('label', 'label', { ignoreCase: false });
        expect(r.match).toBe(true);
        expect(r.score).toBe(100);
    });

    test('大小写不同且关闭忽略 → 不精确匹配', () => {
        const r = mounter.matchNodeName('label', 'Label', { ignoreCase: false });
        expect(r.type).not.toBe('exact');
    });

    test('灵活字母匹配 — 下划线分隔', () => {
        const r = mounter.matchNodeName('startBtn', 'start_btn');
        expect(r.match).toBe(true);
        expect(r.type).toBe('flexible_exact');
        expect(r.score).toBeGreaterThanOrEqual(85);
    });

    test('灵活字母匹配 — 横线分隔', () => {
        const r = mounter.matchNodeName('closeBtn', 'close-btn');
        expect(r.match).toBe(true);
        expect(r.type).toBe('flexible_exact');
    });

    test('字母序列不同 → 不匹配', () => {
        const r = mounter.matchNodeName('label', 'button');
        expect(r.match).toBe(false);
        expect(r.score).toBe(0);
    });

    test('子序列不再匹配（严格模式）', () => {
        const r = mounter.matchNodeName('label', 'labelOut');
        expect(r.match).toBe(false);
    });

    test('空字符串 → 不匹配', () => {
        expect(mounter.matchNodeName('', 'node').match).toBe(false);
        expect(mounter.matchNodeName('prop', '').match).toBe(false);
        expect(mounter.matchNodeName(null, 'node').match).toBe(false);
    });

    test('禁用灵活匹配 → 只精确匹配', () => {
        const r = mounter.matchNodeName('startBtn', 'start_btn', { flexibleMatching: false });
        expect(r.match).toBe(false);
    });
});

// ============================================================
// traverseNodeTree
// ============================================================
describe('traverseNodeTree', () => {
    test('基本 DFS 遍历顺序', () => {
        const root = createNodeTree({
            name: 'root',
            children: [
                { name: 'A', children: [{ name: 'A1' }, { name: 'A2' }] },
                { name: 'B' },
            ],
        });

        const visited = [];
        mounter.traverseNodeTree(root, (node) => visited.push(node.name));
        expect(visited).toEqual(['root', 'A', 'A1', 'A2', 'B']);
    });

    test('maxDepth 限制', () => {
        const root = createNodeTree({
            name: 'L0',
            children: [{ name: 'L1', children: [{ name: 'L2', children: [{ name: 'L3' }] }] }],
        });

        const visited = [];
        mounter.traverseNodeTree(root, (n) => visited.push(n.name), new Set(), 0, 1);
        expect(visited).toEqual(['L0', 'L1']);
    });

    test('maxNodes 限制', () => {
        const root = createNodeTree({
            name: 'root',
            children: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }],
        });

        const visited = [];
        const visitedSet = new Set();
        mounter.traverseNodeTree(root, (n) => visited.push(n.name), visitedSet, 0, 50, 2);
        expect(visited.length).toBeLessThanOrEqual(3);
    });

    test('visited Set 跨调用持久化', () => {
        const root = createNodeTree({
            name: 'root',
            children: [{ name: 'A' }, { name: 'B' }],
        });

        const shared = new Set();
        const firstPass = [];
        mounter.traverseNodeTree(root, (n) => firstPass.push(n.name), shared);
        expect(firstPass).toEqual(['root', 'A', 'B']);

        // 第二次调用同一棵树，所有节点已在 visited 中 → 全部跳过
        const secondPass = [];
        mounter.traverseNodeTree(root, (n) => secondPass.push(n.name), shared);
        expect(secondPass).toEqual([]);
    });

    test('null 节点不崩溃', () => {
        const visited = [];
        mounter.traverseNodeTree(null, (n) => visited.push(n.name));
        expect(visited).toEqual([]);
    });
});

// ============================================================
// findBestMatchInSubtree
// ============================================================
describe('findBestMatchInSubtree', () => {
    test('在子树中找到精确匹配节点（cc.Node 类型）', () => {
        const root = createNodeTree({
            name: 'root',
            children: [
                { name: 'title' },
                { name: 'content', children: [{ name: 'label' }] },
            ],
        });

        const prop = { name: 'label', type: cc.Node, typeName: 'cc.Node' };
        const result = mounter.findBestMatchInSubtree(root, prop, {}, new Set());

        expect(result).not.toBeNull();
        expect(result.node.name).toBe('label');
        expect(result.matchResult.type).toBe('exact');
    });

    test('在子树中找到组件类型匹配', () => {
        const MyLabel = cc.Class({ extends: cc.Component, properties: {} });

        const root = createNodeTree({
            name: 'root',
            children: [{ name: 'label' }],
        });

        const labelNode = root.children[0];
        labelNode.addComponent(MyLabel);

        const prop = { name: 'label', type: MyLabel, typeName: 'MyLabel' };
        const result = mounter.findBestMatchInSubtree(root, prop, {}, new Set());

        expect(result).not.toBeNull();
        expect(result.node.name).toBe('label');
    });

    test('节点名匹配但无对应组件 → 不返回', () => {
        const SpecialComp = cc.Class({ extends: cc.Component, properties: {} });

        const root = createNodeTree({
            name: 'root',
            children: [{ name: 'special' }],
        });

        const prop = { name: 'special', type: SpecialComp, typeName: 'SpecialComp' };
        const result = mounter.findBestMatchInSubtree(root, prop, {}, new Set());

        expect(result).toBeNull();
    });

    test('visited Set 跳过已访问节点', () => {
        const root = createNodeTree({
            name: 'root',
            children: [{ name: 'label' }],
        });

        const visited = new Set();
        const r1 = mounter.findBestMatchInSubtree(root, { name: 'label', type: cc.Node, typeName: 'cc.Node' }, {}, visited);
        expect(r1).not.toBeNull();

        // 第二次搜索同一棵树，visited 已有所有节点
        const r2 = mounter.findBestMatchInSubtree(root, { name: 'label', type: cc.Node, typeName: 'cc.Node' }, {}, visited);
        expect(r2).toBeNull();
    });
});

// ============================================================
// autoMountProperties — 两阶段搜索
// ============================================================
describe('autoMountProperties', () => {
    // 用 cc.Class 定义带属性的组件
    const TestComponent = cc.Class({
        extends: cc.Component,
        properties: {},
    });

    /**
     * 动态设置 TestComponent 的属性定义
     * 直接操作 cc.Class.Attr 内部注册表
     */
    function setupAttrs(propDefs) {
        const attrs = cc.Class.Attr.getClassAttrs(TestComponent) || {};
        // 清理之前的测试属性
        Object.keys(attrs).forEach(k => { delete attrs[k]; });
        Object.entries(propDefs).forEach(([name, def]) => {
            attrs[`${name}$_$ctor`] = def.type;
            attrs[`${name}$_$default`] = null;
        });
    }

    function createComp() {
        // 直接 new 出实例，不通过节点 addComponent
        const comp = new TestComponent();
        return comp;
    }

    test('Phase 1: 子树中找到匹配 → 直接挂载', () => {
        setupAttrs({ title: { type: cc.Node } });

        const currentNode = createNodeTree({
            name: 'current',
            children: [{ name: 'title' }, { name: 'body' }],
        });

        const comp = createComp();
        comp.title = null;

        const { mountResults, pendingMounts } = mounter.autoMountProperties(comp, currentNode);
        expect(mountResults.length).toBe(1);
        expect(mountResults[0].success).toBe(true);
        expect(mountResults[0].nodeName).toBe('title');
        expect(pendingMounts.length).toBe(0);
        expect(comp.title).not.toBeNull();
        expect(comp.title.name).toBe('title');
    });

    test('Phase 2: 子树无匹配 → 向上搜索祖先子树 → 收集到 pendingMounts', () => {
        setupAttrs({ target: { type: cc.Node } });

        const root = createNodeTree({
            name: 'root',
            children: [
                { name: 'panel', children: [{ name: 'current' }] },
                { name: 'target' },
            ],
        });

        const currentNode = root.children[0].children[0]; // 'current'
        const comp = createComp();
        comp.target = null;

        const { mountResults, pendingMounts } = mounter.autoMountProperties(comp, currentNode);
        expect(mountResults.length).toBe(0);
        expect(pendingMounts.length).toBe(1);
        expect(pendingMounts[0].property).toBe('target');
        expect(pendingMounts[0].nodeName).toBe('target');
        // Phase 2 不自动挂载
        expect(comp.target).toBeNull();
    });

    test('Phase 2: 首个有匹配的祖先层级即停止 → pendingMounts', () => {
        setupAttrs({ btn: { type: cc.Node } });

        const root = createNodeTree({
            name: 'root',
            children: [
                {
                    name: 'grandparent',
                    children: [
                        { name: 'parent', children: [{ name: 'current' }] },
                        { name: 'btn' }, // ← 更近
                    ],
                },
                { name: 'btn' }, // ← 更远
            ],
        });

        const currentNode = root.children[0].children[0].children[0]; // 'current'
        const comp = createComp();
        comp.btn = null;

        const { mountResults, pendingMounts } = mounter.autoMountProperties(comp, currentNode);
        expect(mountResults.length).toBe(0);
        expect(pendingMounts.length).toBe(1);
        expect(pendingMounts[0].nodeName).toBe('btn');
        // Phase 2 不自动挂载
        expect(comp.btn).toBeNull();
    });

    test('Phase 2: 跳过已搜索分支（visited 共享） → pendingMounts', () => {
        setupAttrs({ label: { type: cc.Node } });

        const root = createNodeTree({
            name: 'root',
            children: [
                {
                    name: 'parent',
                    children: [
                        { name: 'current' },
                        { name: 'other', children: [{ name: 'label' }] },
                    ],
                },
            ],
        });

        const currentNode = root.children[0].children[0]; // 'current'
        const comp = createComp();
        comp.label = null;

        const { mountResults, pendingMounts } = mounter.autoMountProperties(comp, currentNode);
        expect(mountResults.length).toBe(0);
        expect(pendingMounts.length).toBe(1);
        expect(pendingMounts[0].nodeName).toBe('label');
    });

    test('边界: 当前节点无 parent → 无 Phase 2', () => {
        setupAttrs({ missing: { type: cc.Node } });

        const currentNode = createNodeTree({ name: 'alone' });
        const comp = createComp();
        comp.missing = null;

        const { mountResults, pendingMounts } = mounter.autoMountProperties(comp, currentNode);
        expect(mountResults.length).toBe(0);
        expect(pendingMounts.length).toBe(0);
    });

    test('边界: 全树无匹配 → 返回空结果', () => {
        setupAttrs({ nonExistent: { type: cc.Node } });

        const root = createNodeTree({
            name: 'root',
            children: [
                { name: 'parent', children: [{ name: 'current' }] },
                { name: 'sibling' },
            ],
        });

        const currentNode = root.children[0].children[0];
        const comp = createComp();
        comp.nonExistent = null;

        const { mountResults, pendingMounts } = mounter.autoMountProperties(comp, currentNode);
        expect(mountResults.length).toBe(0);
        expect(pendingMounts.length).toBe(0);
    });

    test('已挂载的属性被跳过', () => {
        setupAttrs({ title: { type: cc.Node } });

        const currentNode = createNodeTree({
            name: 'current',
            children: [{ name: 'title' }],
        });

        const comp = createComp();
        const existing = new cc.Node('existing');
        comp.title = existing;

        const { mountResults } = mounter.autoMountProperties(comp, currentNode);
        expect(mountResults.length).toBe(0);
        expect(comp.title.name).toBe('existing');
    });

    test('多属性: Phase 2 结果进入 pendingMounts', () => {
        setupAttrs({
            btnA: { type: cc.Node },
            btnB: { type: cc.Node },
        });

        const root = createNodeTree({
            name: 'root',
            children: [
                {
                    name: 'parent',
                    children: [
                        { name: 'current' },
                        { name: 'btnA' },
                        { name: 'btnB' },
                    ],
                },
            ],
        });

        const currentNode = root.children[0].children[0];
        const comp = createComp();
        comp.btnA = null;
        comp.btnB = null;

        const { mountResults, pendingMounts } = mounter.autoMountProperties(comp, currentNode);
        // btnA 和 btnB 在 parent 子树中（Phase 2 祖先搜索），进入 pendingMounts
        expect(mountResults.length).toBe(0);
        expect(pendingMounts.length).toBe(2);
        expect(pendingMounts.find(p => p.property === 'btnA')).toBeTruthy();
        expect(pendingMounts.find(p => p.property === 'btnB')).toBeTruthy();
    });

    test('applyPendingMounts: 确认后执行实际挂载', () => {
        setupAttrs({ target: { type: cc.Node } });

        const root = createNodeTree({
            name: 'root',
            children: [
                { name: 'panel', children: [{ name: 'current' }] },
                { name: 'target' },
            ],
        });

        const currentNode = root.children[0].children[0];
        const comp = createComp();
        comp.target = null;

        const { pendingMounts } = mounter.autoMountProperties(comp, currentNode);
        expect(pendingMounts.length).toBe(1);
        expect(comp.target).toBeNull();

        // 确认挂载
        const applyResults = mounter.applyPendingMounts(comp, pendingMounts);
        expect(applyResults.length).toBe(1);
        expect(applyResults[0].success).toBe(true);
        expect(applyResults[0].nodeName).toBe('target');
        expect(comp.target).not.toBeNull();
        expect(comp.target.name).toBe('target');
    });

    test('空组件或空节点 → 返回空', () => {
        const emptyResult = { mountResults: [], pendingMounts: [] };
        expect(mounter.autoMountProperties(null, new cc.Node('n'))).toEqual(emptyResult);
        expect(mounter.autoMountProperties(createComp(), null)).toEqual(emptyResult);
    });
});
