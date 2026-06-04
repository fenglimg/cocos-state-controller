/**
 * M1-1: inspector 状态行为可视化 — scene handler getPropStateValues 契约.
 *
 * 纯函数: 接收 StateSelectV2 实例 (+ 可选 ctrl), 读 _ctrlData[ctrlId] 里每个受控
 * propRef 在各 state 的存储值, 返回:
 *   { ok, hasSelect, states: [{index, stateId, name}],
 *     props: { [propRef]: { variesAcrossStates, valueByState: {[idx]: serialized}, defaultValue } } }
 *
 * variesAcrossStates = 该 propRef 在各 state 的(已定义)值是否存在 ≥2 个不同 → 状态机真正驱动的属性.
 * 不依赖 plugin 侧 require 项目源: 值序列化在 plugin 内 duck-type cc 类型 (Vec2/3/Color/Size/Quat).
 *
 * 红预期: handlers.getPropStateValues 不存在.
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
const handlers = require("../../packages/state-controller-v2-panel/lib/handlers");

function fakeCtrl(ctrlId: number, stateNames: string[]) {
    return {
        ctrlId,
        _states: stateNames.map((name, i) => ({ stateId: 100 + i, name })),
    };
}

describe("M1-1 getPropStateValues — pure contract", () => {
    it("暴露 getPropStateValues", () => {
        expect(typeof handlers.getPropStateValues).toBe("function");
    });

    it("无 select → hasSelect:false, props 空", () => {
        const r = handlers.getPropStateValues(null, null);
        expect(r.ok).toBe(true);
        expect(r.hasSelect).toBe(false);
        expect(r.props).toEqual({});
    });

    it("跨 state 不同的 propRef → variesAcrossStates:true + 各 state 值表", () => {
        const ctrl = fakeCtrl(7, ["normal", "hover", "pressed"]);
        const select = {
            currCtrlId: 7,
            _ctrlsMap: { 7: ctrl },
            _ctrlData: {
                7: {
                    $$default$$: { "MyComp.heat": 0, "cc.Node.opacity": 255 },
                    0: { "MyComp.heat": 0, "cc.Node.opacity": 255, $$controlledProps$$: {} },
                    1: { "MyComp.heat": 5, "cc.Node.opacity": 255, $$controlledProps$$: {} },
                    2: { "MyComp.heat": 9, "cc.Node.opacity": 255, $$controlledProps$$: {} },
                },
            },
        };
        const r = handlers.getPropStateValues(select, ctrl);
        expect(r.hasSelect).toBe(true);
        expect(r.states.map((s: any) => s.name)).toEqual(["normal", "hover", "pressed"]);

        const heat = r.props["MyComp.heat"];
        expect(heat).toBeDefined();
        expect(heat.variesAcrossStates).toBe(true);
        expect(heat.valueByState).toEqual({ 0: 0, 1: 5, 2: 9 });
        expect(heat.defaultValue).toBe(0);

        // opacity 各 state 相同 → 不标
        const op = r.props["cc.Node.opacity"];
        expect(op).toBeDefined();
        expect(op.variesAcrossStates).toBe(false);
    });

    it("跳过 $$ 内部 key 与 legacy number key", () => {
        const ctrl = fakeCtrl(3, ["a", "b"]);
        const select = {
            currCtrlId: 3,
            _ctrlsMap: { 3: ctrl },
            _ctrlData: {
                3: {
                    0: { "cc.Node.x": 1, $$lastProp$$: 9, $$changedProp$$: {}, 12: 999 },
                    1: { "cc.Node.x": 2 },
                },
            },
        };
        const r = handlers.getPropStateValues(select, ctrl);
        expect(Object.keys(r.props)).toEqual(["cc.Node.x"]);
        expect(r.props["cc.Node.x"].variesAcrossStates).toBe(true);
    });

    it("cc 类型 (Color/Vec2) 序列化 + 差异判定", () => {
        const ctrl = fakeCtrl(1, ["s0", "s1"]);
        const select = {
            currCtrlId: 1,
            _ctrlsMap: { 1: ctrl },
            _ctrlData: {
                1: {
                    0: { "cc.Sprite.color": { r: 255, g: 0, b: 0, a: 255 }, "cc.Node.pos2": { x: 1, y: 2 } },
                    1: { "cc.Sprite.color": { r: 0, g: 255, b: 0, a: 255 }, "cc.Node.pos2": { x: 1, y: 2 } },
                },
            },
        };
        const r = handlers.getPropStateValues(select, ctrl);
        expect(r.props["cc.Sprite.color"].variesAcrossStates).toBe(true);
        expect(r.props["cc.Sprite.color"].valueByState[0]).toMatchObject({ r: 255, g: 0, b: 0 });
        // Vec2 各 state 相同 → 不标
        expect(r.props["cc.Node.pos2"].variesAcrossStates).toBe(false);
    });

    it("M1-3: selectedIndex 处值≠default → overriddenAtCurrent:true", () => {
        const ctrl: any = fakeCtrl(9, ["normal", "hover"]);
        ctrl.selectedIndex = 1; // 当前在 hover
        const select = {
            currCtrlId: 9,
            _ctrlsMap: { 9: ctrl },
            _ctrlData: {
                9: {
                    $$default$$: { "cc.Node.opacity": 255, "MyComp.heat": 3 },
                    0: { "cc.Node.opacity": 255, "MyComp.heat": 3 },
                    1: { "cc.Node.opacity": 100, "MyComp.heat": 3 },
                },
            },
        };
        const r = handlers.getPropStateValues(select, ctrl);
        expect(r.selectedIndex).toBe(1);
        // opacity 在 hover(=100) ≠ default(255) → 覆盖
        expect(r.props["cc.Node.opacity"].overriddenAtCurrent).toBe(true);
        // heat 在 hover(=3) == default(3) → 未覆盖
        expect(r.props["MyComp.heat"].overriddenAtCurrent).toBe(false);
    });

    it("M1-3: selectedIndex=0 处与 default 相同 → 不覆盖", () => {
        const ctrl: any = fakeCtrl(11, ["a", "b"]);
        ctrl.selectedIndex = 0;
        const select = {
            currCtrlId: 11,
            _ctrlsMap: { 11: ctrl },
            _ctrlData: {
                11: {
                    $$default$$: { "cc.Node.x": 7 },
                    0: { "cc.Node.x": 7 },
                    1: { "cc.Node.x": 99 },
                },
            },
        };
        const r = handlers.getPropStateValues(select, ctrl);
        expect(r.props["cc.Node.x"].overriddenAtCurrent).toBe(false);
        expect(r.props["cc.Node.x"].variesAcrossStates).toBe(true);
    });

    it("ctrl 未显式传入时, 从 select._ctrlsMap[currCtrlId] 推导", () => {
        const ctrl = fakeCtrl(42, ["x", "y"]);
        const select = {
            currCtrlId: 42,
            _ctrlsMap: { 42: ctrl },
            _ctrlData: { 42: { 0: { "cc.Node.x": 1 }, 1: { "cc.Node.x": 9 } } },
        };
        const r = handlers.getPropStateValues(select);
        expect(r.states.length).toBe(2);
        expect(r.props["cc.Node.x"].variesAcrossStates).toBe(true);
    });
});

describe("M1-1 getPropStateValues — 真 cc 引擎集成", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { StateControllerV2 } = require("../../assets/script/controller/StateControllerV2");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { StateSelectV2 } = require("../../assets/script/controller/StateSelectV2");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { EnumPropName } = require("../../assets/script/controller/StateEnumV2");

    function setup() {
        const ccL = (globalThis as any).cc;
        const root = new ccL.Node("Root");
        const ctrlNode = new ccL.Node("CtrlNode");
        root.addChild(ctrlNode);
        const selectNode = new ccL.Node("SelectNode");
        ctrlNode.addChild(selectNode);
        const ctrl = ctrlNode.addComponent(StateControllerV2);
        (ctrl as any).__preload();
        const select = selectNode.addComponent(StateSelectV2);
        (select as any).__preload();
        (ctrl as any).markCacheDirty();
        return { ctrl, select, selectNode };
    }

    it("两个 state 给 Opacity 写不同值 → handler 标 variesAcrossStates", () => {
        const env = setup();
        // 确保至少 2 个 state
        if (env.ctrl._states.length < 2) {
            const proto = env.ctrl._states[0];
            const StateValue = proto.constructor as any;
            const ns = env.ctrl._states.slice();
            ns.push(StateValue.create("S1", env.ctrl.stateIdAuto++));
            env.ctrl.states = ns;
        }

        env.ctrl.selectedIndex = 0;
        env.select.togglePropertyControl(EnumPropName.Opacity, true);
        env.selectNode.opacity = 255;
        (env.select as any).setDefaultProp(EnumPropName.Opacity);

        env.ctrl.selectedIndex = 1;
        env.select.togglePropertyControl(EnumPropName.Opacity, true);
        env.selectNode.opacity = 80;
        (env.select as any).setDefaultProp(EnumPropName.Opacity);

        const r = handlers.getPropStateValues(env.select, env.ctrl);
        expect(r.hasSelect).toBe(true);
        // opacity propRef 应在结果里且标 varies
        const opKey = Object.keys(r.props).find(k => k.toLowerCase().indexOf("opacity") >= 0);
        expect(opKey).toBeDefined();
        expect(r.props[opKey as string].variesAcrossStates).toBe(true);
    });
});

export {};
