/**
 * W6-2a 端到端红测试: 自定义 @ccclass 组件 prop 通过 Recording 路径走通
 *
 * 验证 W6-2a 核心成果: ctrlData 双 key 存储 (内置 prop 写 EnumPropName 数字, 自定义 prop 写 propRef 字符串).
 *
 * 端到端链路:
 *   1) 节点挂自定义 @ccclass 组件 + StateSelectV2 → __preload 自动接入 (含自定义 prop)
 *   2) startRecording → 改 fixture prop → stopRecording → ctrlData[state] 存储 fixture 当前值 (string key)
 *   3) selectedIndex 切换 → apply 路径写回 fixture (自定义 prop 也跟随)
 *   4) SYSTEM_EXCLUDE / _userExcludedProps 黑名单不接入
 *
 * 红预期: 当前 StateSelectV2 仅走 EnumPropName 数字 key 路径, 自定义 prop 无任何接入 / 录制 / apply 入口.
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
const ControllerMod = require("../../assets/script/controller/StateControllerV2");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SelectMod = require("../../assets/script/controller/StateSelectV2");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const IntrospectionMod = require("../../assets/script/controller/PrefabIntrospection");

const { StateControllerV2 } = ControllerMod;
const { StateSelectV2 } = SelectMod;

// 自定义 @ccclass fixture (extends cc.Component): 模拟用户业务组件
// W6-2a 跑通后, 节点挂该组件即可被 StateSelectV2 自动追踪/录制/切 state 同步
const ccL = (globalThis as any).cc;
const ccclass = ccL._decorator.ccclass;
const property = ccL._decorator.property;

@ccclass("W6_AutoFixtureA")
class W6_AutoFixtureA extends ccL.Component {
    @property() public heatLevel: number = 0;
    @property() public label: string = "foo";
    @property() public ratio: number = 1.0;
}

function setup(opts?: { withCustom?: boolean }) {
    const withCustom = !opts || opts.withCustom !== false;
    const ccLocal = (globalThis as any).cc;
    const root = new ccLocal.Node("Root");
    const ctrlNode = new ccLocal.Node("CtrlNode");
    root.addChild(ctrlNode);
    const selectNode = new ccLocal.Node("SelectNode");
    ctrlNode.addChild(selectNode);

    const ctrl = ctrlNode.addComponent(StateControllerV2);
    (ctrl as any).__preload();

    // 在挂 StateSelectV2 之前先挂自定义 fixture, 这样 __preload 时能扫到
    let fixture: W6_AutoFixtureA | null = null;
    if (withCustom) {
        fixture = selectNode.addComponent(W6_AutoFixtureA);
    }

    const select = selectNode.addComponent(StateSelectV2);
    (select as any).__preload();

    (ctrl as any).markCacheDirty();

    return { root, ctrl, select, selectNode, fixture: fixture as W6_AutoFixtureA };
}

describe("W6-2a 自定义 @ccclass 组件端到端 (双 key 存储)", () => {
    it("PrefabIntrospection 能列出自定义组件 @property — 前置依赖", () => {
        // 验证 W6-1 listTrackableProps 含自定义 prop, 这是 W6-2a 接入的前置依赖
        const { selectNode } = setup();
        const list = IntrospectionMod.listTrackableProps(selectNode);
        const refs = list.map((p: any) => p.propRef);
        expect(refs).toContain("W6_AutoFixtureA.heatLevel");
        expect(refs).toContain("W6_AutoFixtureA.label");
        expect(refs).toContain("W6_AutoFixtureA.ratio");
    });

    it("__preload 自动接入: 自定义 prop 写入 ctrlData 内层 string key", () => {
        const { ctrl, select } = setup();

        // ctrlData[ctrlId][state0].$$controlledProps$$ 应该含自定义 propRef 作为 string key
        const propData = (select as any).getPropData(ctrl.selectedIndex, ctrl.ctrlId);
        expect(propData).toBeDefined();
        const cp = propData.$$controlledProps$$ || {};

        // 自定义 prop 用 propRef 字符串作 key (双 key 存储的新路径)
        expect(cp["W6_AutoFixtureA.heatLevel"]).toBeDefined();
        expect(cp["W6_AutoFixtureA.label"]).toBeDefined();
        expect(cp["W6_AutoFixtureA.ratio"]).toBeDefined();
    });

    it("isPropertyControlledByPropRef: 自定义 prop 接入后 propRef 查询返回 true", () => {
        const { select } = setup();
        // 新增内部 API: isPropertyControlledByPropRef
        expect(typeof (select as any).isPropertyControlledByPropRef).toBe("function");
        expect((select as any).isPropertyControlledByPropRef("W6_AutoFixtureA.heatLevel")).toBe(true);
        // 不在节点上的 propRef 返回 false
        expect((select as any).isPropertyControlledByPropRef("NoSuchComp.foo")).toBe(false);
    });

    it("录制持久化: 改 fixture.heatLevel + stopRecording → ctrlData 用 string key 存值", () => {
        const { ctrl, select, fixture } = setup();
        ctrl.selectedIndex = 1; // 切到 state 1 (state 0 默认 baseline)

        ctrl.startRecording();
        fixture.heatLevel = 42;
        fixture.label = "hot";
        ctrl.stopRecording();

        const ctrlData = (select as any)._ctrlData[ctrl.ctrlId];
        expect(ctrlData[1]).toBeDefined();
        // 双 key 存储核心契约: 自定义 prop 走 string key 路径
        expect(ctrlData[1]["W6_AutoFixtureA.heatLevel"]).toBe(42);
        expect(ctrlData[1]["W6_AutoFixtureA.label"]).toBe("hot");
    });

    it("切 state apply: selectedIndex 切换时自定义 prop 自动恢复", () => {
        const { ctrl, select, fixture } = setup();

        // 在 state 1 录入 heatLevel=42
        ctrl.selectedIndex = 1;
        ctrl.startRecording();
        fixture.heatLevel = 42;
        ctrl.stopRecording();

        // 切回 state 0 — fixture.heatLevel 应该回到 0 (state 0 的值 / 节点 baseline)
        ctrl.selectedIndex = 0;
        expect(fixture.heatLevel).toBe(0);

        // 再切到 state 1 — 应该 apply 42
        ctrl.selectedIndex = 1;
        expect(fixture.heatLevel).toBe(42);

        // 顺手验证: select.ctrlData 也确实记了 state1 的 42
        const ctrlData = (select as any)._ctrlData[ctrl.ctrlId];
        expect(ctrlData[1]["W6_AutoFixtureA.heatLevel"]).toBe(42);
    });

    it("SYSTEM_EXCLUDE 黑名单 propRef 不接入自定义路径", () => {
        const { ctrl, select } = setup();
        const propData = (select as any).getPropData(ctrl.selectedIndex, ctrl.ctrlId);
        const cp = propData.$$controlledProps$$ || {};
        // SYSTEM_EXCLUDE 全数验证: 不出现在 controlledProps
        for (const excluded of IntrospectionMod.SYSTEM_EXCLUDE) {
            expect(cp[excluded]).toBeUndefined();
        }
    });

    it("_userExcludedProps 黑名单: 用户排除的 propRef 不进自动接入", () => {
        // 流程: 先标记 _userExcludedProps 含 W6_AutoFixtureA.heatLevel, 再重新 __preload
        // 该 propRef 应该不在 $$controlledProps$$ 里
        const ccLocal = (globalThis as any).cc;
        const root = new ccLocal.Node("Root");
        const ctrlNode = new ccLocal.Node("CtrlNode");
        root.addChild(ctrlNode);
        const selectNode = new ccLocal.Node("SelectNode");
        ctrlNode.addChild(selectNode);

        const ctrl = ctrlNode.addComponent(StateControllerV2);
        (ctrl as any).__preload();
        selectNode.addComponent(W6_AutoFixtureA);

        const select = selectNode.addComponent(StateSelectV2);
        // 在 __preload 之前注入用户排除列表
        (select as any)._userExcludedProps = ["W6_AutoFixtureA.heatLevel"];
        (select as any).__preload();
        (ctrl as any).markCacheDirty();

        const propData = (select as any).getPropData(ctrl.selectedIndex, ctrl.ctrlId);
        const cp = propData.$$controlledProps$$ || {};
        // 被排除的 propRef 不接入
        expect(cp["W6_AutoFixtureA.heatLevel"]).toBeUndefined();
        // 其它 propRef 仍接入
        expect(cp["W6_AutoFixtureA.label"]).toBeDefined();
    });

    it("外部 API 不变: togglePropertyControl(EnumPropName) 数字签名仍可用 (双 key 共存)", () => {
        // W6-2a 关键约束: 外部 API 签名不动. EnumPropName.Active (数字) 仍可调用
        const EnumMod = require("../../assets/script/controller/StateEnumV2");
        const { EnumPropName } = EnumMod;
        const { select } = setup();
        // 内置 prop 通过老路径 (数字 key) 仍能查询
        expect(typeof (select as any).isPropertyControlled).toBe("function");
        // EnumPropName.Active 是 cc.Node 的内置 prop, __preload 自动接入
        expect(select.isPropertyControlled(EnumPropName.Active)).toBe(true);
        // togglePropertyControl 接受 enum 仍工作
        expect(() => {
            select.togglePropertyControl(EnumPropName.Active, false);
        }).not.toThrow();
        expect(select.isPropertyControlled(EnumPropName.Active)).toBe(false);
    });
});
