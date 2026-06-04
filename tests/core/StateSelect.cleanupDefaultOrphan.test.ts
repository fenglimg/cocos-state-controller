/**
 * Round1 #C4: 删除 state 后, 仅存在于被删 state 的 propRef 应从 $$default$$ GC 掉.
 *
 * 双根因:
 *   (a) cleanupDeletedStateProps 用 deletedStateIndex=ctrl.states.length 读 pageData[该槽], 但
 *       migrateStateData 已 delete pageData[statesLength] → deletedStateData 恒 undefined → 整段死代码;
 *   (b) 即便能读到, 只用 extractNumericPropKeys, X 方案下全是 string propRef key → 返回 [].
 * 结果: $$default$$ 孤儿 propRef 永久残留(序列化膨胀)。
 * 修复: 删除前捕获被删 state 数据传入 cleanup, 并 numeric + propRef 双 key 清理。
 *
 * 真 cocos 引擎集成测试.
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
const { StateControllerV2, StateValue } = require("../../assets/script/controller/StateControllerV2");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { StateSelectV2 } = require("../../assets/script/controller/StateSelectV2");

const ccL = (globalThis as any).cc;

function setup(stateCount = 3) {
    const root = new ccL.Node("CO_Root");
    const ctrlNode = new ccL.Node("CO_CtrlNode");
    root.addChild(ctrlNode);
    const selectNode = new ccL.Node("CO_SelectNode");
    ctrlNode.addChild(selectNode);
    const ctrl = ctrlNode.addComponent(StateControllerV2);
    (ctrl as any).__preload();
    const select = selectNode.addComponent(StateSelectV2);
    (select as any).__preload();
    (ctrl as any).markCacheDirty();
    while ((ctrl as any)._states.length < stateCount) {
        const ns = (ctrl as any)._states.slice();
        ns.push(StateValue.create("S" + ns.length, (ctrl as any).stateIdAuto++));
        ctrl.states = ns;
    }
    return { ctrl, select };
}

describe("#C4 删 state 后 $$default$$ 孤儿 propRef 被 GC", () => {
    it("仅存在于被删 state 的 string propRef 从 $$default$$ 删除", () => {
        const { ctrl, select } = setup(3);
        const cid = ctrl.ctrlId;
        const page = (select as any)._ctrlData[cid];
        page[0] = page[0] || {};
        page[1] = page[1] || {};
        page[2] = page[2] || {};
        page.$$default$$ = page.$$default$$ || {};
        // orphan: 只在 state[1] + default, 不在 state[0]/[2]
        page[1]["OrphanComp.lonely"] = 42;
        page.$$default$$["OrphanComp.lonely"] = 0;
        // 另一个 propRef 在多个 state, 不应被删
        page[0]["SharedComp.keep"] = 1;
        page[2]["SharedComp.keep"] = 2;
        page.$$default$$["SharedComp.keep"] = 0;

        // 删除 state[1]
        ctrl.selectedIndex = 1;
        ctrl.deleteCurrentState = true;

        expect(ctrl.states.length).toBe(2);
        // 孤儿被 GC
        expect(page.$$default$$["OrphanComp.lonely"]).toBeUndefined();
        // 多 state 共享的不被误删
        expect(page.$$default$$["SharedComp.keep"]).toBe(0);
    });

    it("仅存在于被删 state 的 number key (遗留) 也从 $$default$$ 删除 (回归)", () => {
        const { ctrl, select } = setup(3);
        const cid = ctrl.ctrlId;
        const page = (select as any)._ctrlData[cid];
        page[0] = page[0] || {};
        page[1] = page[1] || {};
        page[2] = page[2] || {};
        page.$$default$$ = page.$$default$$ || {};
        // 遗留 number key 99 只在 state[1] + default
        page[1][99] = "x";
        page.$$default$$[99] = "base";

        ctrl.selectedIndex = 1;
        ctrl.deleteCurrentState = true;

        expect(page.$$default$$[99]).toBeUndefined();
    });
});

export {};
