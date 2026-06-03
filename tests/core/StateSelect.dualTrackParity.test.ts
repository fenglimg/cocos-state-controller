/**
 * TASK-001 (RED): 双轨缺陷对称性红测试 — 内置 prop (老 facade EnumPropName 路径) vs 自定义 prop
 * (propRef string key 路径) 行为对照. 证明 F-6/F-7/F-8/F-9 双轨缺陷存在.
 *
 * 真 cocos 引擎集成测试 (不 mock cc). harness 同 StateSelect.setPropExcluded.test.ts:
 *   root → ctrlNode(StateController) → selectNode(StateSelect + Fixture), 各 __preload(), markCacheDirty().
 *
 * 内置 prop 选 cc.Node.active (EnumPropName.Active=1, 布尔, ENUM_TO_PROPREF / PROPREF_TO_ENUM 命中,
 * 走老 facade togglePropertyControl(EnumPropName.Active) → addPropertyControl).
 *
 * ============ 实测勘误 (RED 阶段必须红的正确原因) ============
 * 任务原始红预期里 F-8 (isPropertyControlledByPropRef 返回 false) 与 F-7 (default 不补种) 在当前
 * harness 默认 auto-opt-in (__preload → autoOptInCustomComponentProps) 下 **不成立**:
 *   - auto-opt 已把 cc.Node.active 以 propRef key 注册到 $$controlledProps$$ → isPropertyControlledByPropRef
 *     已为 true; 经 facade 再接入时 syncPropToAllStatesInternal 也会补 default. 故按字面写会 GREEN.
 * 真实仍存在的双轨缺陷是 facade 路径残留的 **第二条轨**:
 *   - addPropertyControl 往 $$controlledProps$$ 写名字 key "Active" (而非 propRef), 并建 $$propertyData$$
 *     子 bucket — 自定义 prop 这两样都没有. 这正是 X 方案 (T2) 要消除的不对称残留.
 * 因此 F-8 / F-7 改为断言"内置不应出现名字 key / $$propertyData$$ 残留 (与自定义对称)", 红原因 =
 * 双轨残留确实存在. F-6 / F-9 按字面缺陷 (排除不过滤 / apply 双写) 直接红.
 * 详见返回报告"偏离 task 定义的决策".
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
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { EnumPropName } = require("../../assets/script/controller/StateEnum");

const ccL = (globalThis as any).cc;
const ccclass = ccL._decorator.ccclass;
const property = ccL._decorator.property;

/** 自定义组件 — 作为 propRef 单一路径对照基准. */
@ccclass("DualTrackFixture")
class DualTrackFixture extends ccL.Component {
    @property() public heat: number = 0;
}

/** 内置 prop 选用对象: cc.Node.active (布尔, 有 EnumPropName.Active 映射, 走老 facade). */
const BUILTIN_ENUM = EnumPropName.Active;          // = 1
const BUILTIN_PROPREF = "cc.Node.active";
const BUILTIN_NAME_KEY = EnumPropName[EnumPropName.Active]; // "Active"
const CUSTOM_PROPREF = "DualTrackFixture.heat";

function setup() {
    const ccLocal = (globalThis as any).cc;
    const root = new ccLocal.Node("Root");
    const ctrlNode = new ccLocal.Node("CtrlNode");
    root.addChild(ctrlNode);
    const selectNode = new ccLocal.Node("SelectNode");
    ctrlNode.addChild(selectNode);

    const ctrl = ctrlNode.addComponent(StateController);
    (ctrl as any).__preload();
    selectNode.addComponent(DualTrackFixture);
    const select = selectNode.addComponent(StateSelect);
    (select as any).__preload();
    (ctrl as any).markCacheDirty();

    // 保证 ≥2 个 state (F-6 切 state / F-9 apply 触发需要切到另一 state).
    if (ctrl._states.length < 2) {
        const proto = ctrl._states[0];
        const StateValue = proto.constructor as any;
        const ns = ctrl._states.slice();
        ns.push(StateValue.create("S1", ctrl.stateIdAuto++));
        ctrl.states = ns;
    }
    return { ctrl, select, selectNode };
}

describe("StateSelect 双轨对称性 (内置 facade vs 自定义 propRef)", () => {

    describe("F-8: 内置接入后判定/注册应走 propRef 单一路径 (无名字 key 残留)", () => {
        it("自定义 prop: $$controlledProps$$ 仅 propRef key, 无名字 key 残留 (基准对照)", () => {
            const { ctrl, select } = setup();
            const pd = (select as any).getPropData(0, ctrl.ctrlId);
            // 自定义 prop 注册为 propRef self-ref, 不写 "heat" 名字 key.
            expect(select.isPropertyControlledByPropRef(CUSTOM_PROPREF)).toBe(true);
            expect(pd.$$controlledProps$$["heat"]).toBeUndefined();
        });

        it("内置 prop 经 facade 接入后不应残留名字 key 'Active' (与自定义对称) [F-8 红: addPropertyControl 写名字 key]", () => {
            const { ctrl, select } = setup();
            (select as any).togglePropertyControl(BUILTIN_ENUM, true); // 老 facade 接入

            // propRef 判定本身 (auto-opt 已注册, 这一条是 GREEN 前提, 不是缺陷点)
            expect(select.isPropertyControlledByPropRef(BUILTIN_PROPREF)).toBe(true);

            // F-8 红: addPropertyControl(L3356) 往 $$controlledProps$$ 写 propName 名字 key "Active" = propType,
            // 形成与 propRef key 并存的第二条轨; 自定义 prop 无此残留. 双轨统一 (T2) 后应消除.
            const pd = (select as any).getPropData(0, ctrl.ctrlId);
            expect(pd.$$controlledProps$$[BUILTIN_NAME_KEY]).toBeUndefined();
        });
    });

    describe("F-7: 内置接入不应建 $$propertyData$$ 子 bucket (与自定义对称)", () => {
        it("自定义 prop 接入后无 $$propertyData$$ 子 bucket (基准对照)", () => {
            const { ctrl, select } = setup();
            const pd = (select as any).getPropData(0, ctrl.ctrlId);
            // 自定义 prop 值落顶层 propData[propRef], 不建 $$propertyData$$.
            expect(pd.$$propertyData$$).toBeUndefined();
            // default 已由 auto-opt 补种 (propRef 单路径行为).
            const dd = (select as any).getDefaultData(ctrl.ctrlId);
            expect(dd[CUSTOM_PROPREF]).not.toBeUndefined();
        });

        it("内置经 facade 接入后不应建 $$propertyData$$ 子 bucket (与自定义对称) [F-7 红: addPropertyControl 建 $$propertyData$$ 残留轨]", () => {
            const { ctrl, select } = setup();
            (select as any).togglePropertyControl(BUILTIN_ENUM, true); // 老 facade 接入

            // default 补种这一点当前已满足 (syncPropToAllStatesInternal), 作 GREEN 前提保留断言.
            const dd = (select as any).getDefaultData(ctrl.ctrlId);
            expect(dd[BUILTIN_PROPREF]).not.toBeUndefined();

            // F-7 红: addPropertyControl(L3353/3376) 建 $$propertyData$$ 子 bucket 并落值,
            // 形成与顶层 propRef 值并存的第二条数据轨; 自定义 prop 无此 bucket. 双轨统一后应消除.
            const pd = (select as any).getPropData(0, ctrl.ctrlId);
            expect(pd.$$propertyData$$).toBeUndefined();
        });
    });

    describe("F-6: 排除内置 prop 后, 切 state apply 不应把节点值拽回 baseline", () => {
        it("自定义 prop 被排除后切 state, 节点改值不被拽回 (基准对照: applyPropRefKeysToNode 过滤排除)", () => {
            const { ctrl, select, selectNode } = setup();
            const fixture = selectNode.getComponent(DualTrackFixture);
            select.setPropExcluded(CUSTOM_PROPREF, true);
            ctrl.selectedIndex = 0;
            fixture.heat = 123;                  // 改排除后的自定义 prop
            ctrl.selectedIndex = 1;              // 切 state → updateState apply
            // applyPropRefKeysToNode(L2472) 过滤 userExcl → 不写回 baseline.
            expect(fixture.heat).toBe(123);
        });

        it("内置 prop 被排除后切 state, 节点值被错误拽回 baseline [F-6 红: ENUM/batchUpdateUI 路径无排除过滤]", () => {
            const { ctrl, select, selectNode } = setup();
            // baseline: auto-opt 在所有 state 录了 cc.Node.active = true.
            select.setPropExcluded(BUILTIN_PROPREF, true); // 用户排除内置 prop
            ctrl.selectedIndex = 0;
            selectNode.active = false;            // 用户把排除后的内置 prop 改成 false
            ctrl.selectedIndex = 1;               // 切 state → updateState apply

            // 期望 (排除被尊重): 节点保持 false.
            // F-6 红: extractEnumPropTypes(L1814) 仍把 cc.Node.active 反查回 Active → batchUpdateUI(L2513)
            // 写回 baseline true, 该 ENUM 路径无 userExcl/sysExcl 过滤 → active 被拽回 true.
            expect(selectNode.active).toBe(false);
        });
    });

    describe("F-9: 内置 propRef apply 只走一条路径, 无 batchUpdateUI + applyPropRefKeysToNode 双写", () => {
        it("自定义 prop 仅经 applyPropRefKeysToNode apply, 不进 ENUM/batchUpdateUI 路径 (基准对照)", () => {
            const { ctrl, select } = setup();
            const pd = (select as any).getPropData(1, ctrl.ctrlId);
            // 自定义 propRef 只在 propRef apply 轨; extractEnumPropTypes 反查不命中 → 不进 batchUpdateUI.
            const enums = (select as any).extractEnumPropTypes(pd);
            const reEnum = require("../../assets/script/controller/EnumPropRefMap").PROPREF_TO_ENUM[CUSTOM_PROPREF];
            expect(reEnum).toBeUndefined();              // 自定义 prop 无 ENUM 映射
            expect((select as any).extractPropRefKeys(pd).indexOf(CUSTOM_PROPREF)).toBeGreaterThanOrEqual(0);
        });

        it("内置 propRef 同时进 batchUpdateUI(ENUM) 与 applyPropRefKeysToNode(propRef) 两条 apply 轨 [F-9 红: 双写]", () => {
            const { ctrl, select } = setup();
            const spyWritePropRef = jest.spyOn(select as any, "writeNodeValueByPropRef");
            const spyBatch = jest.spyOn(select as any, "batchUpdateUI");

            ctrl.selectedIndex = 1;               // 触发一次 updateState apply

            // 轨 1 (propRef): applyPropRefKeysToNode → writeNodeValueByPropRef('cc.Node.active', ...)
            const propRefWrites = spyWritePropRef.mock.calls.filter((c: any[]) => c[0] === BUILTIN_PROPREF).length;
            // 轨 2 (ENUM): batchUpdateUI 收到含 Active 的 batch (extractEnumPropTypes 反查命中 cc.Node.active → Active)
            const batchArg = (spyBatch.mock.calls[0] && spyBatch.mock.calls[0][0]) || [];
            const enumWroteActive = (batchArg as Array<{ type: number }>).some(u => u.type === BUILTIN_ENUM);

            spyWritePropRef.mockRestore();
            spyBatch.mockRestore();

            // F-9 红: 双写存在 — propRef 轨写了 1 次 且 ENUM 轨也写了同一内置 prop.
            // 双轨统一 (T2) 后内置只应走一条 apply 轨, 此联立断言应不再同时成立.
            expect(propRefWrites).toBe(1);
            expect(enumWroteActive).toBe(false);
        });
    });
});

export {};
