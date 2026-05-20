/**
 * AutoSyncCapability 接入契约 (Wave 2 T22)
 *
 * 现有 StateSelect.autoSyncEnabled 永远为 true (硬编码), 表示"切 state 时保持当前 propKey 选中".
 * 把这个逻辑提炼成 capability, 让未来可以由 panel 关闭 / 由用户配置。
 *   - AutoSyncCapability.name === "autoSync"
 *   - 暴露 isEnabled() 静态方法 (默认 true)
 *   - 暴露 setEnabled(bool) 用于运行期切换
 *
 * 红预期: AutoSyncCapability 不存在。
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

describe("AutoSyncCapability (Wave 2 T22)", () => {
    it("模块存在 + name = autoSync", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Mod = require("../../assets/script/controller/capabilities/AutoSyncCapability");
        expect(Mod.AutoSyncCapability).toBeDefined();
        expect(Mod.AutoSyncCapability.name).toBe("autoSync");
    });

    it("注册到 CapabilityRegistry", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require("../../assets/script/controller/capabilities/AutoSyncCapability");
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { CapabilityRegistry } = require("../../assets/script/controller/CapabilityRegistry");
        expect(CapabilityRegistry.get("autoSync")).toBeDefined();
    });

    it("默认 isEnabled() === true", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { AutoSyncCapability } = require("../../assets/script/controller/capabilities/AutoSyncCapability");
        expect(AutoSyncCapability.isEnabled()).toBe(true);
    });

    it("setEnabled(false) 后 isEnabled() === false", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { AutoSyncCapability } = require("../../assets/script/controller/capabilities/AutoSyncCapability");
        AutoSyncCapability.setEnabled(false);
        expect(AutoSyncCapability.isEnabled()).toBe(false);
        AutoSyncCapability.setEnabled(true); // 复位, 避免污染后续测试
    });
});
