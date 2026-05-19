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
const ControllerMod = require("../../assets/script/controller/StateController");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SelectMod = require("../../assets/script/controller/StateSelect");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const EnumMod = require("../../assets/script/controller/StateEnum");

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

describe("StateController deleteState data cleanup", () => {
    it("删除中间状态: 后续状态数据应前移, 末尾应清空", () => {
        const { ctrl, select, selectNode } = setup();

        // 扩展到 3 个 state (默认 __preload 创建 2 个)
        const states = [...ctrl.states, StateValue.create("3", 2)];
        ctrl.states = states;

        // 分别在 state 0/1/2 设置 active = true/false/true
        ctrl.selectedIndex = 0;
        select.togglePropertyControl(EnumPropName.Active, true);
        selectNode.active = true;
        (select as any).setDefaultPorp(EnumPropName.Active);

        ctrl.selectedIndex = 1;
        select.togglePropertyControl(EnumPropName.Active, true);
        selectNode.active = false;
        (select as any).setDefaultPorp(EnumPropName.Active);

        ctrl.selectedIndex = 2;
        select.togglePropertyControl(EnumPropName.Active, true);
        selectNode.active = true;
        (select as any).setDefaultPorp(EnumPropName.Active);

        // 删除中间 state (index 1)
        ctrl.selectedIndex = 1;
        // removeSelectedState 是 private, 用 setter 触发 deleteCurrentState 按钮路径
        ctrl.deleteCurrentState = true;

        // states 应剩 2 个
        expect(ctrl.states.length).toBe(2);

        // _ctrlData[ctrlId][1] 应是原 state 2 的数据 (active=true, 前移过来)
        const pageData = (select as any)._ctrlData[ctrl.ctrlId];
        expect(pageData).toBeDefined();
        expect(pageData[1]?.[EnumPropName.Active]).toBe(true);

        // _ctrlData[ctrlId][2] 应已被清掉
        expect(pageData[2]).toBeUndefined();
    });

    it("删除状态再新增, 新状态不应继承被删状态的属性", () => {
        const { ctrl, select, selectNode } = setup();

        // state 0: active = false
        ctrl.selectedIndex = 0;
        select.togglePropertyControl(EnumPropName.Active, true);
        selectNode.active = false;
        (select as any).setDefaultPorp(EnumPropName.Active);

        // state 1: active = true
        ctrl.selectedIndex = 1;
        select.togglePropertyControl(EnumPropName.Active, true);
        selectNode.active = true;
        (select as any).setDefaultPorp(EnumPropName.Active);

        // 删 state 1
        ctrl.selectedIndex = 1;
        ctrl.deleteCurrentState = true;
        expect(ctrl.states.length).toBe(1);

        // 新增一个 state (走 states.setter 自动初始化)
        ctrl.states = [...ctrl.states, undefined as any];
        expect(ctrl.states.length).toBe(2);

        // 新增的 state 1 应该没有 Active 属性数据
        // (旧的 state 1 active=true 已被 deleteCurrentState 清掉)
        const pageData = (select as any)._ctrlData[ctrl.ctrlId];
        const newState1 = pageData?.[1];

        // 容忍两种情况: pageData[1] 整个不存在, 或存在但没有 Active key
        const hasStaleActive = newState1 != null
            && newState1[EnumPropName.Active] !== undefined;
        expect(hasStaleActive).toBe(false);
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
});
