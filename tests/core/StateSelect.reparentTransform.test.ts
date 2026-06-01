/**
 * M3-2 修 #2/#3 (M3-1 finding): reparent 坐标转换读废弃聚合/number Position key.
 *
 * W6-2c2/X 方案后 Position 以子项 cc.Node.x/y/z 存; 聚合 'cc.Node.position' 与 number key 2
 * 被 migration/sweepDecomposeAmbiguous 删除。原 checkParentChanged gate 读 [EnumPropName.Position]、
 * transPosition 读 readPropByEnum(Position) → 恒 undefined → 改父节点时各 state 存的位置不被换算,
 * 切回这些 state 时位置错乱 (世界坐标跳变)。
 *
 * 修复: gate + transPosition 改读/写子项 cc.Node.x/y/z。真 cocos 引擎集成测试。
 * 红预期: 读聚合 key → pos undefined → 存储位置不变。
 */

declare global {
    const CC_EDITOR: boolean;
    const cc: any;
    const Editor: any;
}

beforeAll(() => {
    (globalThis as any).CC_EDITOR = true;
    (globalThis as any).Editor = {
        log: () => {}, warn: () => {}, error: () => {},
        Utils: { refreshSelectedInspector: () => {} },
    };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { StateController } = require("../../assets/script/controller/StateController");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { StateSelect } = require("../../assets/script/controller/StateSelect");

function setup() {
    const ccL = (globalThis as any).cc;
    const root = new ccL.Node("Root");
    const ctrlNode = new ccL.Node("CtrlNode");
    root.addChild(ctrlNode);
    const selectNode = new ccL.Node("SelectNode");
    ctrlNode.addChild(selectNode);
    const ctrl = ctrlNode.addComponent(StateController);
    (ctrl as any).__preload();
    const select = selectNode.addComponent(StateSelect);
    (select as any).__preload();
    (ctrl as any).markCacheDirty();
    return { ccL, root, ctrl, select, selectNode };
}

describe("M3-2 #2/#3 reparent 坐标转换 (子项 key)", () => {
    it("transPosition: 改父节点后各 state 存的子项位置被换算到新父空间", () => {
        const { ccL, root, ctrl, select, selectNode } = setup();
        const pageData = (select as any)._ctrlData[ctrl.ctrlId];
        pageData[0] = pageData[0] || {};
        // state[0] 存位置 (parentA 局部空间)
        pageData[0]["cc.Node.x"] = 100;
        pageData[0]["cc.Node.y"] = 50;

        const parentA = new ccL.Node("PA"); parentA.setPosition(0, 0); root.addChild(parentA);
        const parentB = new ccL.Node("PB"); parentB.setPosition(300, 0); root.addChild(parentB);
        // 模拟 reparent 已发生: node 现在 parentB 下, oldParent = parentA
        selectNode.removeFromParent(false); parentB.addChild(selectNode);

        (select as any).transPosition(parentA);

        // (100,50)@PA = world(100,50); 在 PB(300,0) 局部 = (-200, 50)
        expect(pageData[0]["cc.Node.x"]).toBeCloseTo(-200, 1);
        expect(pageData[0]["cc.Node.y"]).toBeCloseTo(50, 1);
    });

    it("transPosition: 父空间相同则位置不变 (转换无副作用回归)", () => {
        const { ccL, root, ctrl, select, selectNode } = setup();
        const pageData = (select as any)._ctrlData[ctrl.ctrlId];
        pageData[0] = pageData[0] || {};
        pageData[0]["cc.Node.x"] = 70;
        pageData[0]["cc.Node.y"] = 30;

        const parentA = new ccL.Node("PA"); parentA.setPosition(0, 0); root.addChild(parentA);
        const parentB = new ccL.Node("PB"); parentB.setPosition(0, 0); root.addChild(parentB);
        selectNode.removeFromParent(false); parentB.addChild(selectNode);

        (select as any).transPosition(parentA);

        expect(pageData[0]["cc.Node.x"]).toBeCloseTo(70, 1);
        expect(pageData[0]["cc.Node.y"]).toBeCloseTo(30, 1);
    });

    it("checkParentChanged gate: 子项位置受控时 reparent 触发坐标转换", () => {
        const { ccL, ctrl, select, selectNode } = setup();
        const ctrlNode = selectNode.parent; // ctrl 所在节点
        const pageData = (select as any)._ctrlData[ctrl.ctrlId];
        pageData[0] = pageData[0] || {};
        pageData[0]["cc.Node.x"] = 100;
        pageData[0]["cc.Node.y"] = 0;

        // parentB 挂在同一 ctrlNode 下 (同 ctrl 子树, handleControllerTransition no-op, 保 ctrl 链)
        const parentB = new ccL.Node("PB"); parentB.setPosition(200, 0); ctrlNode.addChild(parentB);
        const oldParent = selectNode.parent; // = ctrlNode (world 0,0)
        (select as any).lastParent = oldParent;
        selectNode.removeFromParent(false); parentB.addChild(selectNode);

        (select as any).checkParentChanged();

        // gate 识别子项受控 → transPosition: (100,0)@ctrlNode(world 0,0) → world(100,0) → PB(200,0) 局部 = (-100,0)
        expect(pageData[0]["cc.Node.x"]).toBeCloseTo(-100, 1);
    });
});

export {};
