/**
 * PropertyControlCapability 接入契约 (Wave 2 T20)
 *
 * 把现有的 StatePropertyControlService 包成一个 capability, 注册到 CapabilityRegistry.
 *   - PropertyControlCapability.name === "propertyControl"
 *   - 暴露原 service 的 API (isPropertyAvailable / isPropertyControlled / scanAvailableProperties)
 *   - 现有调用方 (StateSelect.isPropertyAvailable / isPropertyControlled) 保持 API 不变 (backward compat)
 *
 * 红预期: PropertyControlCapability 模块不存在。
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

describe("PropertyControlCapability (Wave 2 T20)", () => {
    it("PropertyControlCapability 模块存在并自注册", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Mod = require("../../assets/script/controller/capabilities/PropertyControlCapability");
        expect(Mod.PropertyControlCapability).toBeDefined();
        expect(Mod.PropertyControlCapability.name).toBe("propertyControl");
    });

    it("PropertyControlCapability 注册后能从 CapabilityRegistry 取到", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require("../../assets/script/controller/capabilities/PropertyControlCapability");
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { CapabilityRegistry } = require("../../assets/script/controller/CapabilityRegistry");
        const cap = CapabilityRegistry.get("propertyControl");
        expect(cap).toBeDefined();
        expect(cap.name).toBe("propertyControl");
    });

    it("PropertyControlCapability 暴露 isPropertyAvailable / isPropertyControlled / scanAvailableProperties", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { PropertyControlCapability } = require("../../assets/script/controller/capabilities/PropertyControlCapability");
        expect(typeof PropertyControlCapability.isPropertyAvailable).toBe("function");
        expect(typeof PropertyControlCapability.isPropertyControlled).toBe("function");
        expect(typeof PropertyControlCapability.scanAvailableProperties).toBe("function");
    });

    it("现有 PropertyControlService API 仍可用 (backward compat, 不破坏 StateSelect 引用)", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Mod = require("../../assets/script/controller/StatePropertyControlService");
        expect(Mod.PropertyControlService).toBeDefined();
        expect(typeof Mod.PropertyControlService.isPropertyAvailable).toBe("function");
    });
});

/**
 * W6-2b: 公开 propRef 字符串 API + capability hooks payload 加 propRef 字段 (向后兼容).
 *
 * 契约:
 *  - togglePropertyControl / isPropertyControlled 接受 EnumPropName | string 联合类型.
 *  - 内部 dispatch 的 payload 同时含 propType (number, 可选) + propRef (string, 可选).
 *  - 内置 prop 用 EnumPropName 调用 → payload 同时含 propType + propRef (propRef 派生自 EnumPropRefMap).
 *  - 自定义 prop 用 string propRef 调用 → payload 仅含 propRef (propType 为 undefined 或 EnumPropName.Non).
 *  - AMBIGUOUS 内置 prop (Position / Anchor / Size / GrayScale) 无 EnumPropRefMap 映射 → payload propRef 为 undefined.
 */
describe("PropertyControlCapability (W6-2b) — propRef 字段派发", () => {
    function setupSelect() {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { StateController } = require("../../assets/script/controller/StateController");
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { StateSelect } = require("../../assets/script/controller/StateSelect");
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

    function installCapture() {
        // 注册一个临时 capability 捕获 dispatch 的 ctx
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { CapabilityRegistry } = require("../../assets/script/controller/CapabilityRegistry");
        const captured: any[] = [];
        const cap = {
            name: "__captureW6_2b__",
            onPropertyControlled(ctx: any) {
                captured.push({ event: "onPropertyControlled", ctx });
            },
            onPropertyReleased(ctx: any) {
                captured.push({ event: "onPropertyReleased", ctx });
            },
        };
        CapabilityRegistry.register(cap);
        return {
            captured,
            uninstall: () => CapabilityRegistry.unregister("__captureW6_2b__"),
        };
    }

    it("togglePropertyControl 签名接受 EnumPropName | string 联合类型 (内置 prop 用 number)", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { EnumPropName } = require("../../assets/script/controller/StateEnum");
        const { select } = setupSelect();
        // number 路径 (老路径) — 不应抛
        expect(() => select.togglePropertyControl(EnumPropName.Active, true)).not.toThrow();
        expect(select.isPropertyControlled(EnumPropName.Active)).toBe(true);
        // string 路径 (新路径)
        expect(() => select.togglePropertyControl("cc.Node.active", false)).not.toThrow();
    });

    it("内置 prop 用 EnumPropName 调用 → dispatch payload 含 propType (number) + propRef (string, 派生自 EnumPropRefMap)", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { EnumPropName } = require("../../assets/script/controller/StateEnum");
        const { select } = setupSelect();
        const cap = installCapture();
        try {
            select.togglePropertyControl(EnumPropName.Active, true);
            // 至少 1 个 onPropertyControlled, 含 propType=Active + propRef="cc.Node.active"
            const events = cap.captured.filter(c => c.event === "onPropertyControlled");
            expect(events.length).toBeGreaterThanOrEqual(1);
            const ev = events[events.length - 1];
            expect(ev.ctx.propType).toBe(EnumPropName.Active);
            expect(ev.ctx.propRef).toBe("cc.Node.active");
        } finally {
            cap.uninstall();
        }
    });

    it("自定义 prop 用 string propRef 调用 → dispatch payload 含 propRef, propType 为 undefined 或 Non", () => {
        const { select } = setupSelect();
        const cap = installCapture();
        try {
            select.togglePropertyControl("MyCustomComp.heatLevel", true);
            const events = cap.captured.filter(c => c.event === "onPropertyControlled");
            expect(events.length).toBeGreaterThanOrEqual(1);
            const ev = events[events.length - 1];
            expect(ev.ctx.propRef).toBe("MyCustomComp.heatLevel");
            // propType 字段应当 undefined 或 0 (EnumPropName.Non) — 自定义 prop 没有 enum 映射
            expect(ev.ctx.propType === undefined || ev.ctx.propType === 0).toBe(true);
        } finally {
            cap.uninstall();
        }
    });

    it("togglePropertyControl(false) 也派发 onPropertyReleased 含 propType + propRef 双字段", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { EnumPropName } = require("../../assets/script/controller/StateEnum");
        const { select } = setupSelect();
        select.togglePropertyControl(EnumPropName.Color, true);
        const cap = installCapture();
        try {
            select.togglePropertyControl(EnumPropName.Color, false);
            const events = cap.captured.filter(c => c.event === "onPropertyReleased");
            expect(events.length).toBeGreaterThanOrEqual(1);
            const ev = events[events.length - 1];
            expect(ev.ctx.propType).toBe(EnumPropName.Color);
            expect(ev.ctx.propRef).toBe("cc.Node.color");
        } finally {
            cap.uninstall();
        }
    });

    it("isPropertyControlled 接受 string propRef 联合类型", () => {
        const { select } = setupSelect();
        select.togglePropertyControl("MyCustomComp.heatLevel", true);
        expect(select.isPropertyControlled("MyCustomComp.heatLevel")).toBe(true);
        expect(select.isPropertyControlled("MyCustomComp.notControlled")).toBe(false);
    });
});
