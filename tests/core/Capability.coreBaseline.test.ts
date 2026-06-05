/**
 * Capability core baseline 解耦测试 (Wave 2 T29).
 *
 * 底线: 删掉所有 capability, core (StateController + StateSelect) 仍能基础切 state.
 *   - 不依赖 PropertyControlCapability 也能切 state (PropertyControlService 仍可用)
 *   - 不依赖 AutoSyncCapability 也能切 state
 *   - 不依赖 RecordingCapability 录制也能切 state (Topic 3 实装在 core 里, 不依赖 capability)
 *   - 不依赖 MigrationCapability 也能加载老数据
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
const { StateController } = require("../../assets/script/controller/StateControllerV2");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { StateSelect } = require("../../assets/script/controller/StateSelectV2");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { CapabilityRegistry } = require("../../assets/script/controller/CapabilityRegistry");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { EnumPropName } = require("../../assets/script/controller/StateEnumV2");

function setupCtrl() {
    const ccLocal = (globalThis as any).cc;
    const root = new ccLocal.Node("Root");
    const ctrlNode = new ccLocal.Node("CtrlNode");
    root.addChild(ctrlNode);
    const selectNode = new ccLocal.Node("SelectNode");
    ctrlNode.addChild(selectNode);

    const ctrl = ctrlNode.addComponent(StateController);
    (ctrl as any).__preload();
    const select = selectNode.addComponent(StateSelect);
    (select as any).__preload();
    (ctrl as any).markCacheDirty();

    return { ctrl, select, selectNode };
}

describe("Capability core baseline (Wave 2 T29)", () => {
    it("全部 unregister 后, 切 state 仍工作", () => {
        // 全清, 包括内置 capability
        const allCaps = CapabilityRegistry.list().map((c: any) => c.name);
        for (const name of allCaps) {
            CapabilityRegistry.unregister(name);
        }
        expect(CapabilityRegistry.list().length).toBe(0);

        const { ctrl } = setupCtrl();
        // 不抛, 切 state 不依赖 capability
        expect(() => { ctrl.selectedIndex = 1; }).not.toThrow();
        expect(ctrl.selectedIndex).toBe(1);
        expect(() => { ctrl.selectedIndex = 0; }).not.toThrow();
        expect(ctrl.selectedIndex).toBe(0);

        // 重注册回内置 capability (避免污染后续测试)
        require("../../assets/script/controller/capabilities/PropertyControlCapability");
        require("../../assets/script/controller/capabilities/AutoSyncCapability");
        require("../../assets/script/controller/capabilities/RecordingCapability");
        require("../../assets/script/controller/capabilities/MigrationCapability");
    });

    it("全部 unregister 后, togglePropertyControl 仍工作 (PropertyControlService 不依赖 capability)", () => {
        const allCaps = CapabilityRegistry.list().map((c: any) => c.name);
        for (const name of allCaps) {
            CapabilityRegistry.unregister(name);
        }

        const { ctrl, select, selectNode } = setupCtrl();
        const ccLocal = (globalThis as any).cc;
        ctrl.selectedIndex = 0;
        expect(() => select.togglePropertyControl(EnumPropName.Color, true)).not.toThrow();
        selectNode.color = ccLocal.color(255, 0, 0, 255);
        // commitPropFromNode 是 StateSelect 公共方法, 不依赖 capability
        expect(() => (select as any).commitPropFromNode(EnumPropName.Color)).not.toThrow();
        const propData = (select as any)._ctrlData[ctrl.ctrlId][0];
        expect(propData["cc.Node.color"]).toBeDefined();

        // 重注册回内置 capability
        require("../../assets/script/controller/capabilities/PropertyControlCapability");
        require("../../assets/script/controller/capabilities/AutoSyncCapability");
        require("../../assets/script/controller/capabilities/RecordingCapability");
        require("../../assets/script/controller/capabilities/MigrationCapability");
    });

    it("全部 unregister 后, 录制仍能工作 (实装在 core 里, 不依赖 capability)", () => {
        const allCaps = CapabilityRegistry.list().map((c: any) => c.name);
        for (const name of allCaps) {
            CapabilityRegistry.unregister(name);
        }

        const { ctrl, select, selectNode } = setupCtrl();
        const ccLocal = (globalThis as any).cc;
        ctrl.selectedIndex = 0;
        select.togglePropertyControl(EnumPropName.Position, true);
        selectNode.position = ccLocal.v3(0, 0, 0);

        expect(() => ctrl.startRecording()).not.toThrow();
        selectNode.position = ccLocal.v3(100, 200, 0);
        expect(() => ctrl.stopRecording()).not.toThrow();

        const propData = (select as any)._ctrlData[ctrl.ctrlId][0];
        // 聚合根治: Position 拆子项 cc.Node.x/y/z 存储 (与 auto-opt 一致, 用户本意 x/y/z 独立控制)
        expect(propData["cc.Node.x"]).toBe(100);
        expect(propData["cc.Node.y"]).toBe(200);

        // 重注册回内置 capability
        require("../../assets/script/controller/capabilities/PropertyControlCapability");
        require("../../assets/script/controller/capabilities/AutoSyncCapability");
        require("../../assets/script/controller/capabilities/RecordingCapability");
        require("../../assets/script/controller/capabilities/MigrationCapability");
    });
});
