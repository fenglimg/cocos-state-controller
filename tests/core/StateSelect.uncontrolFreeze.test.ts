/**
 * Round1 #C6: 取消控制(全局)后, 属性冻结 —— 不再随 state 切换而变 (SPEC line53).
 *
 * 用户裁定: 控制是全局 all-or-nothing; 取消 = 该属性整体退出管理(所有 state + default 都去 flag),
 * 之后不管怎么切 state 都保持当前值(冻结), 双端一致。
 *
 * 修复:
 *   (1) togglePropertyControl off 全局移除 flag (所有 state + default), 非仅当前 state;
 *   (2) applyPropRefKeysToNode 按 controlledProps 门控: 该 state/default 的 controlledProps 非空且
 *       不含此 propRef → 不 apply(冻结); controlledProps 缺失/空(老 .fire 未迁 NA-8) → 退回 apply all(向后兼容)。
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
const { StateController } = require("../../assets/script/controller/StateController");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { StateSelect } = require("../../assets/script/controller/StateSelect");

const ccL = (globalThis as any).cc;
const ccclass = ccL._decorator.ccclass;
const property = ccL._decorator.property;

@ccclass("FreezeFixture")
class FreezeFixture extends ccL.Component {
    @property() public heat: number = 0;
}

const REF = "FreezeFixture.heat";

function setup() {
    const root = new ccL.Node("FZ_Root");
    const ctrlNode = new ccL.Node("FZ_Ctrl"); root.addChild(ctrlNode);
    const selectNode = new ccL.Node("FZ_Sel"); ctrlNode.addChild(selectNode);
    const ctrl = ctrlNode.addComponent(StateController); (ctrl as any).__preload();
    const fixture = selectNode.addComponent(FreezeFixture);
    const select = selectNode.addComponent(StateSelect); (select as any).__preload();
    (ctrl as any).markCacheDirty();
    if ((ctrl as any)._states.length < 2) {
        const proto = (ctrl as any)._states[0];
        const SV = proto.constructor as any;
        const ns = (ctrl as any)._states.slice();
        ns.push(SV.create("S1", (ctrl as any).stateIdAuto++));
        ctrl.states = ns;
    }
    return { ctrl, select, selectNode, fixture };
}

describe("#C6 取消控制后属性冻结(全局)", () => {
    it("取消是全局: off 后所有 state 都不再受控", () => {
        const { ctrl, select } = setup();
        expect(select.isPropertyControlledByPropRef(REF)).toBe(true); // auto-opt 接管
        select.togglePropertyControl(REF, false);
        ctrl.selectedIndex = 0;
        expect(select.isPropertyControlledByPropRef(REF)).toBe(false);
        ctrl.selectedIndex = 1;
        expect(select.isPropertyControlledByPropRef(REF)).toBe(false); // 全局
    });

    it("取消后切 state 不再被 apply 拽变 (冻结), 即使各 state 残留不同值", () => {
        const { ctrl, select, fixture } = setup();
        // 各 state 残留不同值
        (select as any).getPropData(0, ctrl.ctrlId)[REF] = 100;
        (select as any).getPropData(1, ctrl.ctrlId)[REF] = 200;

        // 全局取消控制
        select.togglePropertyControl(REF, false);

        ctrl.selectedIndex = 0;
        fixture.heat = 55;        // 用户设当前值
        ctrl.selectedIndex = 1;   // 切 state → updateState apply
        // 冻结: 不被 apply 成 200
        expect(fixture.heat).toBe(55);
        ctrl.selectedIndex = 0;   // 切回
        expect(fixture.heat).toBe(55);
    });

    it("仍受控的 prop 切 state 正常 apply (不被门控误伤)", () => {
        const { ctrl, select, fixture } = setup();
        (select as any).getPropData(0, ctrl.ctrlId)[REF] = 100;
        (select as any).getPropData(1, ctrl.ctrlId)[REF] = 200;
        // 不取消, 保持受控
        ctrl.selectedIndex = 0;
        expect(fixture.heat).toBe(100);
        ctrl.selectedIndex = 1;
        expect(fixture.heat).toBe(200);
    });
});

export {};
