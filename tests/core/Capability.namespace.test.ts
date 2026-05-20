/**
 * Capability namespace 数据隔离契约 (Wave 2 T27)
 *
 * 每个 capability 通过 ctx.namespace(propData, name) 读写自己专属的 `$$<name>$$` 子对象,
 * 避免不同 capability 数据互相覆盖。
 *
 * 红预期: 当前 ctx.namespace 已注入 (T19 实装), 但需要验证:
 *   - 默认 namespace 隔离: 写 capA 的 ns 不影响 capB 的 ns
 *   - namespace 在 dispatch 时自动注入到 ctx
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

describe("Capability namespace isolation (Wave 2 T27)", () => {
    it("dispatch 时 ctx.namespace 自动注入", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { CapabilityRegistry } = require("../../assets/script/controller/CapabilityRegistry");

        let receivedNs: any = null;
        const cap = {
            name: "ns_test_a",
            onStateChanged: (ctx: any) => {
                expect(typeof ctx.namespace).toBe("function");
                const propData = {};
                receivedNs = ctx.namespace(propData, cap.name);
                receivedNs.foo = 123;
                // 验证 propData[$$ns_test_a$$] 创建并填值
                expect((propData as any)["$$ns_test_a$$"]).toBeDefined();
                expect((propData as any)["$$ns_test_a$$"].foo).toBe(123);
            },
        };
        CapabilityRegistry.register(cap);
        CapabilityRegistry.dispatch("onStateChanged", {});
        expect(receivedNs).not.toBeNull();
        CapabilityRegistry.unregister("ns_test_a");
    });

    it("两个 capability 的 namespace 不互相覆盖", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { CapabilityRegistry } = require("../../assets/script/controller/CapabilityRegistry");

        const propData: any = {};
        const capA = {
            name: "ns_test_isolated_A",
            onStateChanged: (ctx: any) => { ctx.namespace(propData, "ns_test_isolated_A").val = "A_value"; },
        };
        const capB = {
            name: "ns_test_isolated_B",
            onStateChanged: (ctx: any) => { ctx.namespace(propData, "ns_test_isolated_B").val = "B_value"; },
        };
        CapabilityRegistry.register(capA);
        CapabilityRegistry.register(capB);
        CapabilityRegistry.dispatch("onStateChanged", {});

        expect(propData["$$ns_test_isolated_A$$"]).toBeDefined();
        expect(propData["$$ns_test_isolated_A$$"].val).toBe("A_value");
        expect(propData["$$ns_test_isolated_B$$"]).toBeDefined();
        expect(propData["$$ns_test_isolated_B$$"].val).toBe("B_value");

        // 互不串通: A 的 namespace 不应有 B 的 val
        expect(propData["$$ns_test_isolated_A$$"].val).not.toBe("B_value");

        CapabilityRegistry.unregister("ns_test_isolated_A");
        CapabilityRegistry.unregister("ns_test_isolated_B");
    });

    it("namespace 重复调用同一个 capability 返回同一个对象 (可累积写)", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { CapabilityRegistry } = require("../../assets/script/controller/CapabilityRegistry");

        const propData: any = {};
        const cap = {
            name: "ns_test_acc",
            onStateChanged: (ctx: any) => {
                const ns1 = ctx.namespace(propData, "ns_test_acc");
                ns1.first = 1;
                const ns2 = ctx.namespace(propData, "ns_test_acc");
                ns2.second = 2;
                expect(ns1).toBe(ns2);
                expect(ns2.first).toBe(1);
                expect(ns2.second).toBe(2);
            },
        };
        CapabilityRegistry.register(cap);
        CapabilityRegistry.dispatch("onStateChanged", {});
        CapabilityRegistry.unregister("ns_test_acc");
    });
});
