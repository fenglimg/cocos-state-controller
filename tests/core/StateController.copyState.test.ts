/**
 * StateController.copySelectedState 红测试 (T01/T02 of PLN-001)
 *
 * Bug A: copySelectedState 注释说"插入到下一位", 实际 insertIndex = newStates.length 把新 state 塞末尾
 *        (StateController.ts:497-498)
 * Bug B: 复制状态只生成新 name + stateId, 没有触发 StateSelect 深拷贝 pageData,
 *        新 state 的 _ctrlData[ctrlId][newStateId] 是空对象, 用户必须重配 prop
 *
 * 当前 T01 先暴露 Bug A; T02 (后续 commit) 追加暴露 Bug B。
 */

declare global {
    const CC_EDITOR: boolean;
    const cc: any;
    const Editor: any;
}

beforeAll(() => {
    (globalThis as any).CC_EDITOR = true;
    (globalThis as any).Editor = {
        log: () => {},
        warn: () => {},
        error: () => {},
        Utils: { refreshSelectedInspector: () => {} },
    };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ControllerMod = require("../../assets/script/controller/StateController");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SelectMod = require("../../assets/script/controller/StateSelect");

const { StateController, StateValue } = ControllerMod;
const { StateSelect } = SelectMod;

function setup() {
    const ccLocal = (globalThis as any).cc;
    const root = new ccLocal.Node("Root");
    const ctrlNode = new ccLocal.Node("CtrlNode");
    root.addChild(ctrlNode);
    const selectNode = new ccLocal.Node("SelectNode");
    ctrlNode.addChild(selectNode);

    const ctrl = ctrlNode.addComponent(StateController);
    (ctrl as any).__preload();

    const select = selectNode.addComponent(StateSelect);
    (select as any).__preload();

    (ctrl as any).markCacheDirty();

    return { root, ctrlNode, selectNode, ctrl, select };
}

describe("StateController copySelectedState", () => {
    it("[Bug A] 复制 hover (index=1) 应插入到 index=2, 而非数组末尾", () => {
        const { ctrl } = setup();

        // 扩展到 3 个 state: [normal(0), hover(1), pressed(2)]
        const states = [...ctrl.states, StateValue.create("pressed", 99)];
        states[0].name = "normal";
        states[1].name = "hover";
        ctrl.states = states;

        // 选中 hover (index = 1)
        ctrl.selectedIndex = 1;

        // 触发复制
        ctrl.duplicateCurrentState = true;

        // 应有 4 个 state
        expect(ctrl.states.length).toBe(4);

        // 新 state 应紧邻 hover, 即 index = 2
        // 期望布局: [normal, hover, hover_copy, pressed]
        expect(ctrl.states[2].name).toBe("hover_copy");
        expect(ctrl.states[3].name).toBe("pressed");

        // selectedIndex 应跳到新插入位置 = 2
        expect(ctrl.selectedIndex).toBe(2);
    });
});
