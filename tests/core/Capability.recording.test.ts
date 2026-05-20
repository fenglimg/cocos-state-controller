/**
 * RecordingCapability 接入契约 (Wave 2 T24)
 *
 * Topic 3 录制路径 (T03-T17 已实装) 应改走 capability dispatch:
 *   - RecordingCapability.name === "recording"
 *   - 注册到 CapabilityRegistry
 *   - 现有 ctrl.startRecording/stopRecording / select.onRecordingStart/Stop /
 *     onStateWillChange/Changed 全部保留 (不破坏 Topic 3 e2e 测试)
 *   - capability 暴露 hook (onStateWillChange/Changed/RecordingStart/Stop) 让其它 capability 能监听
 *
 * 关键: 不重构 Topic 3 实装 (高风险), 只新增一层 capability 注册让架构成型.
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

describe("RecordingCapability (Wave 2 T24)", () => {
    it("模块存在 + name = recording", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Mod = require("../../assets/script/controller/capabilities/RecordingCapability");
        expect(Mod.RecordingCapability).toBeDefined();
        expect(Mod.RecordingCapability.name).toBe("recording");
    });

    it("注册到 CapabilityRegistry", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require("../../assets/script/controller/capabilities/RecordingCapability");
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { CapabilityRegistry } = require("../../assets/script/controller/CapabilityRegistry");
        expect(CapabilityRegistry.get("recording")).toBeDefined();
    });

    it("暴露 onRecordingStart / onRecordingStop hook (可选, 让其它 capability 监听)", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { RecordingCapability } = require("../../assets/script/controller/capabilities/RecordingCapability");
        expect(typeof RecordingCapability.onRecordingStart).toBe("function");
        expect(typeof RecordingCapability.onRecordingStop).toBe("function");
    });

    it("StateController 在 startRecording/stopRecording 时 dispatch RecordingCapability", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require("../../assets/script/controller/capabilities/RecordingCapability");
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { CapabilityRegistry } = require("../../assets/script/controller/CapabilityRegistry");
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { StateController } = require("../../assets/script/controller/StateController");

        const ccLocal = (globalThis as any).cc;
        const root = new ccLocal.Node("Root");
        const ctrlNode = new ccLocal.Node("Ctrl");
        root.addChild(ctrlNode);
        const ctrl = ctrlNode.addComponent(StateController);
        (ctrl as any).__preload();

        // 注册一个监听 capability
        let startCount = 0;
        let stopCount = 0;
        const listener = {
            name: "rec_test_listener",
            onRecordingStart: () => { startCount++; },
            onRecordingStop: () => { stopCount++; },
        };
        CapabilityRegistry.register(listener);

        ctrl.startRecording();
        ctrl.stopRecording();

        expect(startCount).toBeGreaterThanOrEqual(1);
        expect(stopCount).toBeGreaterThanOrEqual(1);

        CapabilityRegistry.unregister("rec_test_listener");
    });
});
