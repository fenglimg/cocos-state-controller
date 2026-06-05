/**
 * StateController 删除状态后的数据清理回归测试
 *
 * 验证 B3 bug:「deleteState 不清 _ctrlData[ctrlId][stateId], 状态名复用时数据污染」
 *
 * 场景:
 *   1. 删除中间状态, 后续状态数据应正确前移, 删除位置不应留陈旧数据
 *   2. 删除状态再新增同名状态, 不应继承被删状态的属性值
 *   3. _historyStateName 应随索引正确移位
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
const ControllerMod = require("../../assets/script/controller/StateControllerV2");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SelectMod = require("../../assets/script/controller/StateSelectV2");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const EnumMod = require("../../assets/script/controller/StateEnumV2");

const { StateController, StateValue } = ControllerMod;
const { StateSelect } = SelectMod;
const { EnumPropName } = EnumMod;

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

describe("StateController deleteState soft-delete", () => {
    it("删除中间状态: stateId 数据保留, 后续状态不再前移污染身份", () => {
        const { ctrl, select, selectNode } = setup();

        // 扩展到 3 个 state (默认 __preload 创建 2 个)
        const states = [...ctrl.states, StateValue.create("3", 2)];
        ctrl.states = states;

        // 分别在 state 0/1/2 设置 active = true/false/true
        ctrl.selectedIndex = 0;
        select.togglePropertyControl(EnumPropName.Active, true);
        selectNode.active = true;
        (select as any).setDefaultProp(EnumPropName.Active);

        ctrl.selectedIndex = 1;
        select.togglePropertyControl(EnumPropName.Active, true);
        selectNode.active = false;
        (select as any).setDefaultProp(EnumPropName.Active);

        ctrl.selectedIndex = 2;
        select.togglePropertyControl(EnumPropName.Active, true);
        selectNode.active = true;
        (select as any).setDefaultProp(EnumPropName.Active);

        // 删除中间 state (index 1)
        ctrl.selectedIndex = 1;
        // removeSelectedState 是 private, 用 setter 触发 deleteCurrentState 按钮路径
        ctrl.deleteCurrentState = true;

        // states 应剩 2 个
        expect(ctrl.states.length).toBe(2);

        const pageData = (select as any)._ctrlData[ctrl.ctrlId];
        expect(pageData).toBeDefined();
        // stateId=1 是被软删除的 state, 数据保留用于恢复。
        expect(pageData[1]?.["cc.Node.active"]).toBe(false);
        // stateId=2 仍保持自己的数据, 不因 index 补位而迁到 key=1。
        expect(pageData[2]?.["cc.Node.active"]).toBe(true);
    });

    it("Inspector 原地删除中间状态: stateId 数据保留", () => {
        const { ctrl, select, selectNode } = setup();

        ctrl.states = [...ctrl.states, StateValue.create("3", 2)];

        ctrl.selectedIndex = 0;
        select.togglePropertyControl(EnumPropName.Active, true);
        selectNode.active = true;
        (select as any).setDefaultProp(EnumPropName.Active);

        ctrl.selectedIndex = 1;
        select.togglePropertyControl(EnumPropName.Active, true);
        selectNode.active = false;
        (select as any).setDefaultProp(EnumPropName.Active);

        ctrl.selectedIndex = 2;
        select.togglePropertyControl(EnumPropName.Active, true);
        selectNode.active = true;
        (select as any).setDefaultProp(EnumPropName.Active);

        const states = (ctrl as any)._states;
        states.splice(1, 1);
        ctrl.states = states;

        expect(ctrl.states.length).toBe(2);
        const pageData = (select as any)._ctrlData[ctrl.ctrlId];
        expect(pageData[1]?.["cc.Node.active"]).toBe(false);
        expect(pageData[2]?.["cc.Node.active"]).toBe(true);
    });

    it("删除状态再新增, 新 stateId 不复用被删状态, 不继承被删状态属性", () => {
        const { ctrl, select, selectNode } = setup();

        // state 0: active = false
        ctrl.selectedIndex = 0;
        select.togglePropertyControl(EnumPropName.Active, true);
        selectNode.active = false;
        (select as any).setDefaultProp(EnumPropName.Active);

        // state 1: active = true
        ctrl.selectedIndex = 1;
        select.togglePropertyControl(EnumPropName.Active, true);
        selectNode.active = true;
        (select as any).setDefaultProp(EnumPropName.Active);

        // 删 state 1
        ctrl.selectedIndex = 1;
        const deletedStateId = ctrl.states[1].stateId;
        ctrl.deleteCurrentState = true;
        expect(ctrl.states.length).toBe(1);

        // 新增一个 state (走 states.setter 自动初始化, 应拿新 stateId)
        ctrl.states = [...ctrl.states, undefined as any];
        expect(ctrl.states.length).toBe(2);

        const newStateId = ctrl.states[1].stateId;
        expect(newStateId).not.toBe(deletedStateId);

        // 新增的 state 应该没有 Active 属性数据；被删 state 的数据仍保留在 deletedStateId 下。
        const pageData = (select as any)._ctrlData[ctrl.ctrlId];
        const newStateData = pageData?.[newStateId];

        const hasStaleActive = newStateData != null
            && newStateData["cc.Node.active"] !== undefined;
        expect(hasStaleActive).toBe(false);
        expect(pageData?.[deletedStateId]?.["cc.Node.active"]).toBe(true);
    });

    it("restoreLastDeletedState 恢复被删 stateId 与其录制数据", () => {
        const { ctrl, select, selectNode } = setup();

        ctrl.selectedIndex = 1;
        const deletedStateId = ctrl.states[1].stateId;
        select.togglePropertyControl(EnumPropName.Active, true);
        selectNode.active = true;
        (select as any).setDefaultProp(EnumPropName.Active);

        ctrl.deleteCurrentState = true;
        expect(ctrl.states.find((s: any) => s.stateId === deletedStateId)).toBeUndefined();

        expect((ctrl as any).restoreLastDeletedState()).toBe(true);
        expect(ctrl.states[ctrl.states.length - 1].stateId).toBe(deletedStateId);

        ctrl.selectedIndex = ctrl.states.length - 1;
        expect(selectNode.active).toBe(true);
    });

    it("_historyStateName 应随删除正确移位", () => {
        const { ctrl } = setup();

        // 扩展 3 个 state, 手动命名后两个
        const customStates = [
            StateValue.create("alpha", 0),
            StateValue.create("beta", 1),
            StateValue.create("gamma", 2),
        ];
        ctrl.states = customStates;

        const history = (ctrl as any)._historyStateName as Record<number, string>;
        expect(history?.[0]).toBe("alpha");
        expect(history?.[1]).toBe("beta");
        expect(history?.[2]).toBe("gamma");

        // 删除 index 1 (beta)
        ctrl.selectedIndex = 1;
        ctrl.deleteCurrentState = true;

        // beta 应被清掉, gamma 应从 index 2 移到 index 1
        const newHistory = (ctrl as any)._historyStateName as Record<number, string>;
        expect(newHistory?.[0]).toBe("alpha");
        expect(newHistory?.[1]).toBe("gamma");
        expect(newHistory?.[2]).toBeUndefined();
    });

    // 回归: 删除末位 state 后, 节点视觉必须重绘到补位进来的新选中 state,
    // 不能残留被删 state 的显示 (尤其只剩一个 state / 删的就是当前选中时)。
    // 走面板路径: 直接 set ctrl.states (不预设 _selectedIndex), 复现 handlers.removeState。
    it("删除末位 state 后节点重绘到新选中 state (2→1, 含面板路径)", () => {
        const { ctrl, select, selectNode } = setup();

        // state 0: active = true
        ctrl.selectedIndex = 0;
        select.togglePropertyControl(EnumPropName.Active, true);
        selectNode.active = true;
        (select as any).setDefaultProp(EnumPropName.Active);

        // state 1: active = false
        ctrl.selectedIndex = 1;
        select.togglePropertyControl(EnumPropName.Active, true);
        selectNode.active = false;
        (select as any).setDefaultProp(EnumPropName.Active);

        // 选中末位 state1 (节点此刻显示 false), 面板删除它
        ctrl.selectedIndex = 1;
        expect(selectNode.active).toBe(false);
        ctrl.states = [ctrl.states[0]];

        expect(ctrl.states.length).toBe(1);
        expect(ctrl.selectedIndex).toBe(0);
        // 节点必须重绘成 state0 的值 (true), 而非残留被删 state1 的 false
        expect(selectNode.active).toBe(true);
    });

    it("删除末位 state 后节点重绘到上一个 state (3→2)", () => {
        const { ctrl, select, selectNode } = setup();
        ctrl.states = [...ctrl.states, StateValue.create("3", 99)];

        ctrl.selectedIndex = 1;
        select.togglePropertyControl(EnumPropName.Active, true);
        selectNode.active = false;
        (select as any).setDefaultProp(EnumPropName.Active);

        ctrl.selectedIndex = 2;
        select.togglePropertyControl(EnumPropName.Active, true);
        selectNode.active = true;
        (select as any).setDefaultProp(EnumPropName.Active);

        // 选中末位 state2 (节点显示 true), 删除
        ctrl.selectedIndex = 2;
        ctrl.deleteCurrentState = true;

        expect(ctrl.states.length).toBe(2);
        expect(ctrl.selectedIndex).toBe(1);
        // 节点必须重绘成 state1 的值 (false), 而非残留被删 state2 的 true
        expect(selectNode.active).toBe(false);
    });
});
