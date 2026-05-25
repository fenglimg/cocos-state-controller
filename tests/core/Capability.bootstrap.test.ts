/**
 * Capability 自动注册契约 (Wave 3 T07)
 *
 * 生产 runtime 里, 用户只 import StateController, capability 文件们没有被 import,
 * 静态注册的 side effect 不会触发. 这会让 EventCapability / SelectedPageIdCapability 等
 * 在 build 后失效.
 *
 * 修法: 加 capabilities/index.ts 聚合所有内置 capability + StateController 顶部 import.
 *
 * 红预期: 只 require StateController, list() 不会包含 event/homePage/selectedPageId.
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

describe("Capability 自动注册 (Wave 3 T07)", () => {
    it("import StateController 后, 内置 capability 全部自动注册到 Registry", () => {
        // 隔离: 清掉 module cache + Registry
        jest.resetModules();
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { CapabilityRegistry } = require("../../assets/script/controller/CapabilityRegistry");
        CapabilityRegistry.clear();
        expect(CapabilityRegistry.list().length).toBe(0);

        // 只 import StateController, 不显式 require 任何 capability
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require("../../assets/script/controller/StateController");

        const names = CapabilityRegistry.list().map((c: any) => c.name).sort();
        expect(names).toEqual(expect.arrayContaining([
            "autoSync",
            "event",
            "migration",
            "propertyControl",
            "recording",
            "selectedPageId",
        ]));
    });
});
