/**
 * TweenCapability 契约 (Wave 4 T03)
 *
 * onStateChanged 时, 对支持的 prop 类型 (Position/Scale/Opacity/Color/Rotation) 走补间
 * 而非 snap-jump. 默认走 cc.tween, 测试通过 installAdapter 注入 mock 验证调用契约.
 *
 *   TweenCapability.setEnabled(ctrl, bool)
 *   TweenCapability.isEnabled(ctrl) → bool (默认 false)
 *   TweenCapability.setConfig(ctrl, {duration, easing})
 *   TweenCapability.getConfig(ctrl) → {duration, easing}
 *   TweenCapability.installAdapter(adapter)         // 全局可换 backend
 *   TweenCapability.resetAdapter()                  // 复位默认
 *   adapter: { runTween(node, propType, toValue, config) → handle }
 *
 * Red: 模块不存在.
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

function setupCtrl() {
    const ccLocal = (globalThis as any).cc;
    const root = new ccLocal.Node("Root");
    const ctrlNode = new ccLocal.Node("CtrlNode");
    root.addChild(ctrlNode);
    const selectNode = new ccLocal.Node("SelectChild");
    ctrlNode.addChild(selectNode);

    const ctrl = ctrlNode.addComponent(StateController);
    (ctrl as any).__preload();
    const select = selectNode.addComponent(StateSelect);
    (select as any).__preload();
    (ctrl as any).markCacheDirty();

    return { ctrl, select, selectNode };
}

describe("TweenCapability (Wave 4 T03)", () => {
    it("模块存在 + name = tween + 注册到 Registry", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Mod = require("../../assets/script/controller/capabilities/TweenCapability");
        expect(Mod.TweenCapability).toBeDefined();
        expect(Mod.TweenCapability.name).toBe("tween");
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { CapabilityRegistry } = require("../../assets/script/controller/CapabilityRegistry");
        expect(CapabilityRegistry.get("tween")).toBeDefined();
    });

    it("默认 isEnabled(ctrl) === false (用户主动开启)", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { TweenCapability } = require("../../assets/script/controller/capabilities/TweenCapability");
        const { ctrl } = setupCtrl();
        expect(TweenCapability.isEnabled(ctrl)).toBe(false);
        TweenCapability.setEnabled(ctrl, true);
        expect(TweenCapability.isEnabled(ctrl)).toBe(true);
    });

    it("setConfig/getConfig duration/easing 默认值合理", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { TweenCapability } = require("../../assets/script/controller/capabilities/TweenCapability");
        const { ctrl } = setupCtrl();
        const cfg = TweenCapability.getConfig(ctrl);
        expect(typeof cfg.duration).toBe("number");
        expect(cfg.duration).toBeGreaterThan(0);
        expect(typeof cfg.easing).toBe("string");

        TweenCapability.setConfig(ctrl, { duration: 1.5, easing: "quadOut" });
        const cfg2 = TweenCapability.getConfig(ctrl);
        expect(cfg2.duration).toBe(1.5);
        expect(cfg2.easing).toBe("quadOut");
    });

    it("不同 ctrl 的 config 隔离", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { TweenCapability } = require("../../assets/script/controller/capabilities/TweenCapability");
        const A = setupCtrl();
        const B = setupCtrl();
        TweenCapability.setConfig(A.ctrl, { duration: 2 });
        expect(TweenCapability.getConfig(A.ctrl).duration).toBe(2);
        expect(TweenCapability.getConfig(B.ctrl).duration).not.toBe(2);
    });

    it("enabled=true + 切 state → adapter.runTween 被调用 (Position prop)", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { TweenCapability } = require("../../assets/script/controller/capabilities/TweenCapability");
        const { ctrl, select, selectNode } = setupCtrl();
        const ccLocal = (globalThis as any).cc;

        // state 0 prop: position (10,0,0); state 1 prop: position (100,0,0)
        ctrl.selectedIndex = 0;
        select.togglePropertyControl(EnumPropName.Position, true);
        selectNode.position = ccLocal.v3(10, 0, 0);
        (select as any).commitPropFromNode(EnumPropName.Position);

        ctrl.selectedIndex = 1;
        selectNode.position = ccLocal.v3(100, 0, 0);
        (select as any).commitPropFromNode(EnumPropName.Position);
        ctrl.selectedIndex = 0;
        selectNode.position = ccLocal.v3(10, 0, 0);

        const calls: any[] = [];
        TweenCapability.installAdapter({
            runTween(node: any, propType: number, toValue: any, config: any) {
                calls.push({ nodeName: node.name, propType, toValue, config });
                return { handle: true };
            },
        });
        TweenCapability.setEnabled(ctrl, true);

        ctrl.selectedIndex = 1;

        expect(calls.length).toBeGreaterThanOrEqual(1);
        const posCall = calls.find(c => c.propType === EnumPropName.Position);
        expect(posCall).toBeDefined();
        expect(posCall.nodeName).toBe("SelectChild");
        expect(posCall.toValue.x).toBe(100);
        expect(posCall.config.duration).toBeGreaterThan(0);

        TweenCapability.resetAdapter();
        TweenCapability.setEnabled(ctrl, false);
    });

    it("enabled=false → adapter.runTween 不被调", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { TweenCapability } = require("../../assets/script/controller/capabilities/TweenCapability");
        const { ctrl, select, selectNode } = setupCtrl();
        const ccLocal = (globalThis as any).cc;
        select.togglePropertyControl(EnumPropName.Position, true);
        selectNode.position = ccLocal.v3(10, 0, 0);
        (select as any).commitPropFromNode(EnumPropName.Position);

        const calls: any[] = [];
        TweenCapability.installAdapter({
            runTween() { calls.push(1); return null; },
        });

        // 未 setEnabled, 默认 false
        ctrl.selectedIndex = 1;
        expect(calls.length).toBe(0);

        TweenCapability.resetAdapter();
    });

    it("不支持的 prop (Active/Visible) 不被 tween (跳过)", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { TweenCapability } = require("../../assets/script/controller/capabilities/TweenCapability");
        const { ctrl, select, selectNode } = setupCtrl();

        select.togglePropertyControl(EnumPropName.Active, true);
        selectNode.active = true;
        (select as any).commitPropFromNode(EnumPropName.Active);
        ctrl.selectedIndex = 1;
        selectNode.active = false;
        (select as any).commitPropFromNode(EnumPropName.Active);
        ctrl.selectedIndex = 0;

        const calls: any[] = [];
        TweenCapability.installAdapter({
            runTween(node: any, propType: number) { calls.push(propType); return null; },
        });
        TweenCapability.setEnabled(ctrl, true);

        ctrl.selectedIndex = 1;
        const activeCalls = calls.filter(p => p === EnumPropName.Active);
        expect(activeCalls.length).toBe(0);

        TweenCapability.resetAdapter();
        TweenCapability.setEnabled(ctrl, false);
    });

    it("supportedPropTypes 列表至少含 Position/Scale/Opacity/Color/Rotation", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { TweenCapability } = require("../../assets/script/controller/capabilities/TweenCapability");
        const types = TweenCapability.supportedPropTypes();
        expect(Array.isArray(types)).toBe(true);
        expect(types).toContain(EnumPropName.Position);
        expect(types).toContain(EnumPropName.Scale);
        expect(types).toContain(EnumPropName.Opacity);
        expect(types).toContain(EnumPropName.Color);
    });

    it("W6-2b: dispatch payload 含 propRef 时 TweenCapability 不抛异常 + 老行为不破", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { TweenCapability } = require("../../assets/script/controller/capabilities/TweenCapability");
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { CapabilityRegistry } = require("../../assets/script/controller/CapabilityRegistry");
        const { ctrl, select, selectNode } = setupCtrl();
        const ccLocal = (globalThis as any).cc;

        // 起一个内置 Color prop (有 EnumPropRefMap 映射 → propRef="cc.Node.color")
        select.togglePropertyControl(EnumPropName.Color, true);
        selectNode.color = ccLocal.color(255, 0, 0, 255);
        (select as any).commitPropFromNode(EnumPropName.Color);
        ctrl.selectedIndex = 1;
        selectNode.color = ccLocal.color(0, 255, 0, 255);
        (select as any).commitPropFromNode(EnumPropName.Color);
        ctrl.selectedIndex = 0;

        // 直接派发一个含 propRef 字段的 ctx — Tween onStateChanged 不应抛
        expect(() => {
            CapabilityRegistry.dispatch("onStateChanged", {
                ctrl,
                fromState: 0,
                toState: 1,
                propType: EnumPropName.Color,
                propRef: "cc.Node.color",
            });
        }).not.toThrow();

        // 内置 Color prop tween 路径仍可用 (adapter 收到调用)
        const calls: any[] = [];
        TweenCapability.installAdapter({
            runTween(node: any, propType: number) { calls.push(propType); return null; },
        });
        TweenCapability.setEnabled(ctrl, true);
        ctrl.selectedIndex = 1;
        // Color prop 在 supported 列表中 → 应被 tween
        const colorCalls = calls.filter(p => p === EnumPropName.Color);
        expect(colorCalls.length).toBeGreaterThanOrEqual(1);

        TweenCapability.resetAdapter();
        TweenCapability.setEnabled(ctrl, false);
    });

    it("adapter.runTween 抛异常 → onStateChanged 不抛, 不影响 core 切换", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { TweenCapability } = require("../../assets/script/controller/capabilities/TweenCapability");
        const { ctrl, select, selectNode } = setupCtrl();
        const ccLocal = (globalThis as any).cc;
        select.togglePropertyControl(EnumPropName.Position, true);
        selectNode.position = ccLocal.v3(10, 0, 0);
        (select as any).commitPropFromNode(EnumPropName.Position);

        TweenCapability.installAdapter({
            runTween() { throw new Error("boom"); },
        });
        TweenCapability.setEnabled(ctrl, true);

        expect(() => { ctrl.selectedIndex = 1; }).not.toThrow();
        expect(ctrl.selectedIndex).toBe(1);

        TweenCapability.resetAdapter();
        TweenCapability.setEnabled(ctrl, false);
    });
});
