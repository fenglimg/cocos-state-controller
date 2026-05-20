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
