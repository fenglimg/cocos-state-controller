/**
 * TASK-004 (#F-4): reparent 只转换"当前仍受控且未排除"的轴.
 *
 * 附录A 断言#3: reparent 只转换当前仍受控且未排除的 cc.Node.x/y/z.
 *
 * 根因 (修复前): checkParentChanged gate 与 transPosition 都按"pageData 有值 key"判定,
 * 取消跟随/排除但 propData 残留 baseline 的轴仍被坐标转换. 应改按"受控未排除"判定.
 *
 * 真 cocos 引擎集成测试. harness 同 reparentTransform.test.ts.
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
const { StateController } = require("../../assets/script/controller/StateControllerV2");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { StateSelect } = require("../../assets/script/controller/StateSelectV2");

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

describe("#F-4 reparent 只转受控未排除轴 (附录A 断言#3)", () => {
    it("被排除的轴 (cc.Node.x) 即使 propData 残留 baseline 也不被坐标转换", () => {
        const { ccL, root, ctrl, select, selectNode } = setup();
        const pageData = (select as any)._ctrlData[ctrl.ctrlId];
        pageData[0] = pageData[0] || {};
        // x、y 都有残留数据
        pageData[0]["cc.Node.x"] = 100;
        pageData[0]["cc.Node.y"] = 50;

        // ★ 排除 cc.Node.x (退出跟随), 但 propData['cc.Node.x']=100 残留
        select.setPropExcluded("cc.Node.x", true);
        expect(select.isPropertyControlledByPropRef("cc.Node.x")).toBe(false);

        const parentA = new ccL.Node("PA"); parentA.setPosition(0, 0); root.addChild(parentA);
        const parentB = new ccL.Node("PB"); parentB.setPosition(300, 0); root.addChild(parentB);
        selectNode.removeFromParent(false); parentB.addChild(selectNode);

        (select as any).transPosition(parentA);

        // F-4: x 被排除 → 不转换, 残留值保持 100 (修复前会被转成 -200).
        expect(pageData[0]["cc.Node.x"]).toBe(100);
        // y 仍受控未排除 → 正常转换 (PA→PB 纯 x 平移, y 不变 = 50, 但确认未被破坏).
        expect(pageData[0]["cc.Node.y"]).toBeCloseTo(50, 1);
    });

    it("受控未排除的轴 reparent 仍正常转换 (正路径回归)", () => {
        const { ccL, root, ctrl, select, selectNode } = setup();
        const pageData = (select as any)._ctrlData[ctrl.ctrlId];
        pageData[0] = pageData[0] || {};
        pageData[0]["cc.Node.x"] = 100;
        // cc.Node.x 受控未排除 (auto-opt 注册)
        expect(select.isPropertyControlledByPropRef("cc.Node.x")).toBe(true);

        const parentA = new ccL.Node("PA"); parentA.setPosition(0, 0); root.addChild(parentA);
        const parentB = new ccL.Node("PB"); parentB.setPosition(300, 0); root.addChild(parentB);
        selectNode.removeFromParent(false); parentB.addChild(selectNode);

        (select as any).transPosition(parentA);

        // (100)@PA world(100) → PB(300) 局部 = -200
        expect(pageData[0]["cc.Node.x"]).toBeCloseTo(-200, 1);
    });
});

export {};
