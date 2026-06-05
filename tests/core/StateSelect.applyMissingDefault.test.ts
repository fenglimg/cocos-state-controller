/**
 * M3-2 修 #1 (apply 漏更新): 单 state 接入自定义 propRef 时未补种 default baseline,
 * 导致切到"无该 key"的 state 时 applyPropRefKeysToNode 无兜底 → 节点残留上个 state 的值。
 *
 * 触发 (M3-1 finding #1): 一个 trackable、非排除 prop 在 auto-opt-in (__preload) **之后**才出现
 * (如挂组件晚于 select.__preload), 故未被 togglePropertyControlByPropRefAllStates 对称写入。
 * 录制期"未跟随 dirty"保存 → promptUntrackedAfterStop → 单 state 版 togglePropertyControlByPropRef
 * 只写当前 state, default 与其它 state 无该 key。
 *
 * 修复: 单 state 接入也补种 default(当前值 baseline), 让 apply 的 default 兜底覆盖所有 state。
 * 真 cocos 引擎集成测试。红预期: default 未补种 → 切 state 残留。
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

const ccL = (globalThis as any).cc;
const ccclass = ccL._decorator.ccclass;
const property = ccL._decorator.property;

@ccclass("M3ApplyFix")
class M3ApplyFix extends ccL.Component {
    @property() public heat: number = 0;
}

/** select.__preload() 先跑 (auto-opt), 之后才挂 M3ApplyFix → heat trackable 但未被自动接入、未排除 */
function setupLateComp() {
    const ccLocal = (globalThis as any).cc;
    const root = new ccLocal.Node("Root");
    const ctrlNode = new ccLocal.Node("CtrlNode");
    root.addChild(ctrlNode);
    const selectNode = new ccLocal.Node("SelectNode");
    ctrlNode.addChild(selectNode);

    const ctrl = ctrlNode.addComponent(StateController);
    (ctrl as any).__preload();
    const select = selectNode.addComponent(StateSelect);
    (select as any).__preload();          // auto-opt 此刻看不到 M3ApplyFix
    const fixture = selectNode.addComponent(M3ApplyFix);  // 晚于 auto-opt
    (ctrl as any).markCacheDirty();

    // 确保 ≥2 个 state
    if (ctrl._states.length < 2) {
        const proto = ctrl._states[0];
        const StateValue = proto.constructor as any;
        const ns = ctrl._states.slice();
        ns.push(StateValue.create("S1", ctrl.stateIdAuto++));
        ctrl.states = ns;
    }
    return { ctrl, select, selectNode, fixture };
}

describe("M3-2 #1 apply 漏更新: 单 state 接入补种 default", () => {
    it("heat 未被 auto-opt 接入 (晚于 __preload 挂的组件)", () => {
        const { select } = setupLateComp();
        expect(select.isPropertyControlledByPropRef("M3ApplyFix.heat")).toBe(false);
    });

    it("togglePropertyControlByPropRef 单 state 接入 → default 也补种 baseline", () => {
        const { ctrl, select, fixture } = setupLateComp();
        ctrl.selectedIndex = 1;
        fixture.heat = 99;
        (select as any).togglePropertyControlByPropRef("M3ApplyFix.heat", true);

        const pageData = (select as any)._ctrlData[ctrl.ctrlId];
        expect(pageData[1]["M3ApplyFix.heat"]).toBe(99);          // 当前 state 写入 (原有)
        expect(pageData.$$default$$["M3ApplyFix.heat"]).toBe(99); // 修复: default 补种 baseline
    });

    it("集成: state[1] 分化为 50、default=99, 切到无值的 state[0] → 节点取 default 99 不残留 50", () => {
        const { ctrl, select, fixture } = setupLateComp();
        ctrl.selectedIndex = 1;
        fixture.heat = 99;
        (select as any).togglePropertyControlByPropRef("M3ApplyFix.heat", true); // default=99, state[1]=99

        const pageData = (select as any)._ctrlData[ctrl.ctrlId];
        pageData[1]["M3ApplyFix.heat"] = 50; // state[1] 分化
        fixture.heat = 50;                    // 节点当前 = state[1] 值

        ctrl.selectedIndex = 0;               // 切到 state[0] (无 heat key)
        // apply: state[0] 无 heat → default(99) 兜底 → node.heat = 99, 不残留 50
        expect(fixture.heat).toBe(99);
    });
});

export {};
