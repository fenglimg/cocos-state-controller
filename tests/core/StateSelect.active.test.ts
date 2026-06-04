/**
 * StateSelectV2 Active 属性回归测试
 *
 * 验证用户报告的 bug：「node 的 active 属性切换现在已经无法记录」
 *
 * 实际根因（修复前）:
 *   StateControllerV2.updateState 内有过滤 `!stateSelect.node.active`,
 *   会跳过当前为 inactive 的 StateSelectV2, 导致"上一个 state 把 active 关掉、
 *   新 state 应该把它重新打开"的场景永远拿不到 apply, active 卡死在 false。
 *
 * 修复后的契约:
 *   1. togglePropertyControl(Active, true) 之后, propData 必须同时具备
 *      legacy 数字 key 和 $$propertyData$$ 命名空间双套数据 (兼容期);
 *   2. 状态切换时不论 select 当前是否 active, 都应该正确收到 apply。
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

// 必须在 cc / CC_EDITOR / Editor 准备好之后 require,
// 否则模块顶层的 @ccclass 装饰器和 cc.Enum 注入会拿不到 globals
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ControllerMod = require("../../assets/script/controller/StateControllerV2");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SelectMod = require("../../assets/script/controller/StateSelectV2");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const EnumMod = require("../../assets/script/controller/StateEnumV2");

const { StateControllerV2 } = ControllerMod;
const { StateSelectV2 } = SelectMod;
const { EnumPropName } = EnumMod;

function setupCtrlAndSelect() {
    const ccLocal = (globalThis as any).cc;
    const root = new ccLocal.Node("TestRoot");
    const ctrlNode = new ccLocal.Node("CtrlNode");
    root.addChild(ctrlNode);
    const selectNode = new ccLocal.Node("SelectNode");
    ctrlNode.addChild(selectNode);

    const ctrl = ctrlNode.addComponent(StateControllerV2);
    (ctrl as any).__preload();

    const select = selectNode.addComponent(StateSelectV2);
    (select as any).__preload();

    // jest 环境里 ctrl.__preload 早于 select 附加, BFS 缓存被锁成空。
    // 模拟 cocos 编辑器在组件增删后会发的 cache 失效通知。
    (ctrl as any).markCacheDirty();

    return { root, ctrlNode, selectNode, ctrl, select };
}

describe("StateSelectV2.active regression", () => {
    it("togglePropertyControl(Active, true) 后 propData 走 propRef 单一路径 (T2 双轨统一)", () => {
        const { select } = setupCtrlAndSelect();

        select.togglePropertyControl(EnumPropName.Active, true);

        const propData = (select as any).getPropData();
        expect(propData).toBeDefined();

        // T2 双轨统一: 内置 prop 收敛到 propRef 字符串单一路径 (与自定义 prop 对称).
        // 契约 1: $$controlledProps$$ 以 propRef 自指 string key 标记受控, 不再写名字 key "Active".
        expect(select.isPropertyControlledByPropRef("cc.Node.active")).toBe(true);
        expect(propData.$$controlledProps$$?.["cc.Node.active"]).toBe("cc.Node.active");
        expect(propData.$$controlledProps$$?.Active).toBeUndefined();

        // 契约 2: 不再建 $$propertyData$$ 子 bucket (旧双轨第二条数据轨已废).
        expect(propData.$$propertyData$$).toBeUndefined();

        // 契约 3: 值落顶层 propData[propRef] (单一数据轨, applyPropRefKeysToNode 据此 apply).
        expect(propData["cc.Node.active"]).toBeDefined();
    });

    it("跨状态切换时 active 值应正确还原 (即使被切到 false 之后)", () => {
        const { ctrl, select, selectNode } = setupCtrlAndSelect();

        // state 0 启用 Active 控制, 记录 active = false
        ctrl.selectedIndex = 0;
        select.togglePropertyControl(EnumPropName.Active, true);
        selectNode.active = false;
        (select as any).setDefaultProp(EnumPropName.Active);

        // state 1 启用 Active 控制, 记录 active = true
        ctrl.selectedIndex = 1;
        select.togglePropertyControl(EnumPropName.Active, true);
        selectNode.active = true;
        (select as any).setDefaultProp(EnumPropName.Active);

        // 切回 state 0 → 应还原为 false
        ctrl.selectedIndex = 0;
        expect(selectNode.active).toBe(false);

        // 切回 state 1 → 应还原为 true
        // 这一步在修复前会失败 — StateControllerV2.updateState 的 `!node.active` 过滤
        // 会跳过当前 inactive 的 select, 导致 active=true 永远 apply 不上
        ctrl.selectedIndex = 1;
        expect(selectNode.active).toBe(true);
    });
});
