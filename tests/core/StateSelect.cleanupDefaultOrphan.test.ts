/**
 * Round1 #C4 历史回归: 旧 index-keyed 删除 state 后会 GC 仅存在于被删 state 的 propRef。
 * stateId-keyed 方案下缩短 states 是软删除, 被删 state 数据与 default 基线保留, 避免误删不可恢复。
 *
 * 双根因:
 *   (a) cleanupDeletedStateProps 用 deletedStateIndex=ctrl.states.length 读 pageData[该槽], 但
 *       migrateStateData 已 delete pageData[statesLength] → deletedStateData 恒 undefined → 整段死代码;
 *   (b) 即便能读到, 只用 extractNumericPropKeys, X 方案下全是 string propRef key → 返回 [].
 * 结果: $$default$$ 孤儿 propRef 永久残留(序列化膨胀)。
 * 当前策略: 缩短 states 只移出可见列表并写入 deleted stash, 不立刻清理 _ctrlData/default。
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
const { StateController, StateValue } = require("../../assets/script/controller/StateControllerV2");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { StateSelect } = require("../../assets/script/controller/StateSelectV2");

const ccL = (globalThis as any).cc;

function setup(stateCount = 3) {
    const root = new ccL.Node("CO_Root");
    const ctrlNode = new ccL.Node("CO_CtrlNode");
    root.addChild(ctrlNode);
    const selectNode = new ccL.Node("CO_SelectNode");
    ctrlNode.addChild(selectNode);
    const ctrl = ctrlNode.addComponent(StateController);
    (ctrl as any).__preload();
    const select = selectNode.addComponent(StateSelect);
    (select as any).__preload();
    (ctrl as any).markCacheDirty();
    while ((ctrl as any)._states.length < stateCount) {
        const ns = (ctrl as any)._states.slice();
        ns.push(StateValue.create("S" + ns.length, (ctrl as any).stateIdAuto++));
        ctrl.states = ns;
    }
    return { ctrl, select };
}

describe("#C4 软删除 state 后 $$default$$ 孤儿 propRef 保留", () => {
    it("仅存在于被删 state 的 string propRef 仍保留, 支持恢复最近删除", () => {
        const { ctrl, select } = setup(3);
        const cid = ctrl.ctrlId;
        const page = (select as any)._ctrlData[cid];
        const state0 = ctrl.states[0].stateId;
        const state1 = ctrl.states[1].stateId;
        const state2 = ctrl.states[2].stateId;
        page[state0] = page[state0] || {};
        page[state1] = page[state1] || {};
        page[state2] = page[state2] || {};
        page.$$default$$ = page.$$default$$ || {};
        // orphan: 只在 state[1] + default, 不在 state[0]/[2]
        page[state1]["OrphanComp.lonely"] = 42;
        page.$$default$$["OrphanComp.lonely"] = 0;
        // 另一个 propRef 在多个 state, 不应被删
        page[state0]["SharedComp.keep"] = 1;
        page[state2]["SharedComp.keep"] = 2;
        page.$$default$$["SharedComp.keep"] = 0;

        // 删除 state[1]
        ctrl.selectedIndex = 1;
        ctrl.deleteCurrentState = true;

        expect(ctrl.states.length).toBe(2);
        expect(page[state1]["OrphanComp.lonely"]).toBe(42);
        expect(page.$$default$$["OrphanComp.lonely"]).toBe(0);
        expect(page.$$default$$["SharedComp.keep"]).toBe(0);
    });

    it("仅存在于被删 state 的 number key (遗留) 也保留", () => {
        const { ctrl, select } = setup(3);
        const cid = ctrl.ctrlId;
        const page = (select as any)._ctrlData[cid];
        const state0 = ctrl.states[0].stateId;
        const state1 = ctrl.states[1].stateId;
        const state2 = ctrl.states[2].stateId;
        page[state0] = page[state0] || {};
        page[state1] = page[state1] || {};
        page[state2] = page[state2] || {};
        page.$$default$$ = page.$$default$$ || {};
        // 遗留 number key 99 只在 state[1] + default
        page[state1][99] = "x";
        page.$$default$$[99] = "base";

        ctrl.selectedIndex = 1;
        ctrl.deleteCurrentState = true;

        expect(page[state1][99]).toBe("x");
        expect(page.$$default$$[99]).toBe("base");
    });
});

export {};
