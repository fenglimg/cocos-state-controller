/**
 * MigrationCapability 占位测试 (Wave 2 T26).
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

describe("MigrationCapability placeholder (Wave 2 T26)", () => {
    it("name === migration 且注册到 Registry", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require("../../assets/script/controller/capabilities/MigrationCapability");
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { CapabilityRegistry } = require("../../assets/script/controller/CapabilityRegistry");
        const cap = CapabilityRegistry.get("migration");
        expect(cap).toBeDefined();
        expect(cap.name).toBe("migration");
    });

    it("onCtrlDataMigrate 占位 (Wave 2 不迁移, 直接返回原 data)", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { MigrationCapability } = require("../../assets/script/controller/capabilities/MigrationCapability");
        const data = { foo: 1 };
        expect(MigrationCapability.onCtrlDataMigrate(data, 1)).toBe(data);
    });
});
