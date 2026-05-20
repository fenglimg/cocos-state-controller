/**
 * Capability + Registry 契约红测试 (Wave 2 T18)
 *
 * 设计 (来自 5_wave_plan §"Capability 框架接口预设"):
 *   interface ICapability {
 *     name: string;                              // 命名空间, 决定 $$<name>$$ 数据隔离
 *     dependsOn?: string[];                      // 依赖
 *     onStateWillChange?(ctx): void;
 *     onStateChanged?(ctx): void;
 *     onPropApply?(ctx, prop): void | TPropValue;  // 可改写 apply
 *     onCtrlDataMigrate?(data, version): any;
 *   }
 *
 *   StateController.registerCapability(cap)
 *   StateController.unregisterCapability(name)
 *   StateController.getCapability(name)
 *   StateController.dispatch(event, ctx)
 *
 * 数据隔离: 每个 capability 通过 ctx.namespace 读写 $$<name>$$ 子空间。
 *
 * 红预期: 这些模块都不存在。
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

describe("Capability framework existence (Wave 2 T18)", () => {
    it("Capability 模块暴露 ICapability 接口 + CapabilityRegistry", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Mod = require("../../assets/script/controller/Capability");
        // ICapability 是 type only, 运行时无导出, 这里至少应能 require 不抛
        expect(Mod).toBeDefined();
    });

    it("CapabilityRegistry 模块暴露 register/unregister/get/dispatch", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Mod = require("../../assets/script/controller/CapabilityRegistry");
        expect(Mod.CapabilityRegistry).toBeDefined();
        const R = Mod.CapabilityRegistry;
        expect(typeof R.register).toBe("function");
        expect(typeof R.unregister).toBe("function");
        expect(typeof R.get).toBe("function");
        expect(typeof R.dispatch).toBe("function");
        expect(typeof R.list).toBe("function");
    });

    it("register / get / unregister 单元行为", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { CapabilityRegistry } = require("../../assets/script/controller/CapabilityRegistry");
        const cap = { name: "test_cap_register" };
        CapabilityRegistry.register(cap);
        expect(CapabilityRegistry.get("test_cap_register")).toBe(cap);
        CapabilityRegistry.unregister("test_cap_register");
        expect(CapabilityRegistry.get("test_cap_register")).toBeUndefined();
    });

    it("重复 register 同名 capability 应抛或覆盖 (定为覆盖, 后注册赢)", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { CapabilityRegistry } = require("../../assets/script/controller/CapabilityRegistry");
        const a = { name: "dup_cap", _tag: "A" };
        const b = { name: "dup_cap", _tag: "B" };
        CapabilityRegistry.register(a);
        CapabilityRegistry.register(b);
        expect((CapabilityRegistry.get("dup_cap") as any)._tag).toBe("B");
        CapabilityRegistry.unregister("dup_cap");
    });

    it("dispatch(event, ctx) 调用每个 capability 上对应 hook", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { CapabilityRegistry } = require("../../assets/script/controller/CapabilityRegistry");
        const calls: string[] = [];
        const capA = {
            name: "disp_a",
            onStateChanged: (_ctx: any) => { calls.push("A"); },
        };
        const capB = {
            name: "disp_b",
            onStateChanged: (_ctx: any) => { calls.push("B"); },
        };
        CapabilityRegistry.register(capA);
        CapabilityRegistry.register(capB);

        CapabilityRegistry.dispatch("onStateChanged", { foo: 1 });

        expect(calls).toContain("A");
        expect(calls).toContain("B");

        CapabilityRegistry.unregister("disp_a");
        CapabilityRegistry.unregister("disp_b");
    });

    it("dispatch 应跳过缺该 hook 的 capability, 不抛", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { CapabilityRegistry } = require("../../assets/script/controller/CapabilityRegistry");
        const capNoHook = { name: "no_hook_cap" };
        CapabilityRegistry.register(capNoHook);
        expect(() => CapabilityRegistry.dispatch("onStateChanged", {})).not.toThrow();
        CapabilityRegistry.unregister("no_hook_cap");
    });

    it("list 返回当前所有已注册 capability", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { CapabilityRegistry } = require("../../assets/script/controller/CapabilityRegistry");
        const cap = { name: "list_cap" };
        CapabilityRegistry.register(cap);
        const all = CapabilityRegistry.list();
        expect(Array.isArray(all)).toBe(true);
        expect(all.some((c: any) => c.name === "list_cap")).toBe(true);
        CapabilityRegistry.unregister("list_cap");
    });
});
