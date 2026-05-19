/**
 * StateSelect propValue setter 链路测试 (诊断用户报告 bug)
 *
 * 用户反馈: 组件 prop (LabelString 等) 因为没有 cocos node 事件监听,
 * 依赖在 inspector "当前属性值" (propValue) 字段直接修改. 但用户说"不生效".
 *
 * 这里测试 propValue setter 链路本身是否正确:
 *   - 写到 propData[propKey] 应该让当前 state 记录该 prop 值
 *   - apply 链路应该把新值 setValue 到 node 上的组件
 *
 * 如果测试绿 → setter 链路本身没 bug, 问题在 cocos inspector 不调到 setter
 *               (cocos 2.x 对 getter-only @property 默认 readonly)
 * 如果测试红 → setter 链路本身有 bug, 需要修代码
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

const { StateController } = ControllerMod;
const { StateSelect } = SelectMod;
const { EnumPropName } = EnumMod;

function setupCtrlAndSelect() {
    const ccL = (globalThis as any).cc;
    const root = new ccL.Node("PV_Root");
    const ctrlNode = new ccL.Node("PV_CtrlNode");
    root.addChild(ctrlNode);
    const selectNode = new ccL.Node("PV_SelectNode");
    ctrlNode.addChild(selectNode);

    const ctrl = ctrlNode.addComponent(StateController);
    (ctrl as any).__preload();

    const select = selectNode.addComponent(StateSelect);
    (select as any).__preload();
    (ctrl as any).markCacheDirty();

    return { root, ctrlNode, selectNode, ctrl, select };
}

describe("propValue setter 跨 state 隔离 (复现用户报告 bug)", () => {
    /**
     * 用户报告:
     *   1. stateA 勾选 Active 受控
     *   2. stateA 在 propValue 框设 false
     *   3. 切到 stateB → stateB 的 active 也变成 false
     *   4. stateB 在 propValue 框设 true
     *   5. 切回 stateA → stateA 也变成 true
     *
     * 直接拖节点 / 改 cc.Node 的 active 复选框 (有 cocos 事件监听) 是正常各自记录的.
     * 只有通过 "当前属性值" propValue 改值时, 两个 state 始终同步.
     */

    it("用户实际操作链路 (勾选 + propValue false + 切 + propValue true + 切回)", () => {
        const { ctrl, select, selectNode } = setupCtrlAndSelect();

        // 步骤 1: stateA 勾选 active 受控
        ctrl.selectedIndex = 0;
        select.togglePropertyControl(EnumPropName.Active, true);

        // 步骤 2: stateA 在 propValue 框设 false
        ctrl.selectedIndex = 0;
        (select as any).propValue = false;

        // 步骤 3: 切到 stateB, 看 stateB 的 node.active 和 propValue 显示
        ctrl.selectedIndex = 1;
        const stateB_active_after_switch = selectNode.active;
        const stateB_propValue_after_switch = select.propValue;
        // 期望: stateB 还没改过, 应该是 togglePropertyControl 时 sync 进来的 true (节点默认)
        // 用户报告: stateB 也变成 false ← 这是 bug 现象

        // 步骤 4: stateB propValue 设 true
        (select as any).propValue = true;

        // 步骤 5: 切回 stateA, 看 stateA 的 node.active 和 propValue 显示
        ctrl.selectedIndex = 0;
        const stateA_active_after_switch_back = selectNode.active;
        const stateA_propValue_after_switch_back = select.propValue;
        // 期望: stateA 应该恢复成步骤 2 写的 false
        // 用户报告: stateA 变成 true ← bug 现象

        // 断言 (按"正确"行为, 看是否 fail):
        expect(stateB_active_after_switch).toBe(true);            // 步骤 3 期望 stateB 是 true
        expect(stateB_propValue_after_switch).toBe(true);
        expect(stateA_active_after_switch_back).toBe(false);      // 步骤 5 期望 stateA 是 false
        expect(stateA_propValue_after_switch_back).toBe(false);

        // 也检查 propData 数据层
        const pageData = (select as any).getPageData();
        expect(pageData[0][EnumPropName.Active]).toBe(false);   // stateA 应 false
        expect(pageData[1][EnumPropName.Active]).toBe(true);    // stateB 应 true
    });

    it("在 stateA 通过 propValue 改 Active=false, stateB 的 propData[Active] 不应被改", () => {
        const { ctrl, select, selectNode } = setupCtrlAndSelect();

        ctrl.selectedIndex = 0;
        select.togglePropertyControl(EnumPropName.Active, true);
        // togglePropertyControl 内 syncPropToAllStatesInternal 会把当前 active(true) 写到所有 state
        // 让 stateB 显式记录 true 作为它自己的值
        ctrl.selectedIndex = 1;
        selectNode.active = true;
        (select as any).setDefaultProp(EnumPropName.Active);

        ctrl.selectedIndex = 0;
        // 此刻 stateA propData[Active] 应该是 true; stateB propData[Active] 也是 true

        // 模拟用户在 stateA 的 propValue 框输入 false
        (select as any).propValue = false;

        // stateA propData 应该被改成 false
        const pageData = (select as any).getPageData();
        expect(pageData[0][EnumPropName.Active]).toBe(false);

        // 关键: stateB propData 应该 *不变* (还是 true), 不应该被一起改成 false
        expect(pageData[1][EnumPropName.Active]).toBe(true);

        // 切到 stateB → node.active 应当变回 true
        ctrl.selectedIndex = 1;
        expect(selectNode.active).toBe(true);
    });
});

describe("propValue setter 链路 (诊断: 组件 prop 在 propValue 处改值是否生效)", () => {
    it("勾选 LabelString 受控 + 写 propValue, 期望 cc.Label.string 被更新", () => {
        const ccL = (globalThis as any).cc;
        const { select, selectNode } = setupCtrlAndSelect();
        selectNode.addComponent(ccL.Label);

        // 模拟用户在 inspector 勾选 LabelString 受控
        select.togglePropertyControl(EnumPropName.LabelString, true);

        // togglePropertyControl 内部会把 _propKey 设为 LabelString, _currentDisplayProp 也是
        // 此时 inspector 显示 "当前属性值" 框, 显示当前 label.string

        // 模拟用户在 propValue 框里输入 "new-text"
        (select as any).propValue = "new-text";

        // 期望:
        // 1. propData 中 LabelString 字段被写入 "new-text"
        const propData = (select as any).getPropData();
        expect(propData[EnumPropName.LabelString]).toBe("new-text");

        // 2. cc.Label.string 被同步更新到 "new-text"
        const label = selectNode.getComponent(ccL.Label);
        expect(label.string).toBe("new-text");
    });

    it("勾选 ToggleIsChecked 受控 + 写 propValue, 期望 cc.Toggle.isChecked 被更新", () => {
        const ccL = (globalThis as any).cc;
        const { select, selectNode } = setupCtrlAndSelect();
        selectNode.addComponent(ccL.Toggle);

        select.togglePropertyControl(EnumPropName.ToggleIsChecked, true);

        // 初始 isChecked 应是 false (默认), 改成 true
        (select as any).propValue = true;

        const propData = (select as any).getPropData();
        expect(propData[EnumPropName.ToggleIsChecked]).toBe(true);

        const toggle = selectNode.getComponent(ccL.Toggle);
        expect(toggle.isChecked).toBe(true);
    });

    it("勾选 LabelFontSize 受控 + 写 propValue (number), 期望 cc.Label.fontSize 被更新", () => {
        const ccL = (globalThis as any).cc;
        const { select, selectNode } = setupCtrlAndSelect();
        selectNode.addComponent(ccL.Label);

        select.togglePropertyControl(EnumPropName.LabelFontSize, true);
        (select as any).propValue = 64;

        const propData = (select as any).getPropData();
        expect(propData[EnumPropName.LabelFontSize]).toBe(64);

        const label = selectNode.getComponent(ccL.Label);
        expect(label.fontSize).toBe(64);
    });
});
