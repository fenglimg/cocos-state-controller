/**
 * PresetCapability 契约 (Wave 4 T02)
 *
 * 把某 ctrl 某 state 的 propData 序列化, 跨 ctrl/state apply.
 *
 *   savePreset(ctrl, stateIndex) → PresetData
 *   applyPreset(ctrl, stateIndex, preset) → boolean
 *   serializePreset(preset) → string (JSON)
 *   deserializePreset(str) → PresetData
 *
 * PresetData 结构:
 *   { version, sourceCtrlName, sourceStateName, sources: [{selectName, propData}] }
 *
 * 跨 ctrl apply 按 selectName 匹配目标 ctrl 下的 StateSelect 节点.
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

function setupCtrl(name?: string) {
    const ccLocal = (globalThis as any).cc;
    const root = new ccLocal.Node("Root");
    const ctrlNode = new ccLocal.Node(name || "CtrlNode");
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

describe("PresetCapability (Wave 4 T02)", () => {
    it("模块存在 + name = preset + 注册到 Registry", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Mod = require("../../assets/script/controller/capabilities/PresetCapability");
        expect(Mod.PresetCapability).toBeDefined();
        expect(Mod.PresetCapability.name).toBe("preset");
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { CapabilityRegistry } = require("../../assets/script/controller/CapabilityRegistry");
        expect(CapabilityRegistry.get("preset")).toBeDefined();
    });

    it("savePreset(ctrl, idx) 返回包含 version/sourceCtrlName/sourceStateName/sources 的结构", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { PresetCapability } = require("../../assets/script/controller/capabilities/PresetCapability");
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { MigrationCapability } = require("../../assets/script/controller/capabilities/MigrationCapability");

        const { ctrl, select, selectNode } = setupCtrl();
        const ccLocal = (globalThis as any).cc;
        ctrl.selectedIndex = 0;
        select.togglePropertyControl(EnumPropName.Position, true);
        selectNode.position = ccLocal.v3(100, 200, 0);
        (select as any).commitPropFromNode(EnumPropName.Position);

        const preset = PresetCapability.savePreset(ctrl, 0);
        expect(preset.version).toBe(MigrationCapability.CURRENT_VERSION);
        expect(preset.sourceCtrlName).toBe(ctrl.ctrlName);
        expect(preset.sourceStateName).toBe("1");
        expect(Array.isArray(preset.sources)).toBe(true);
        expect(preset.sources.length).toBeGreaterThanOrEqual(1);

        const src0 = preset.sources[0];
        expect(src0.selectName).toBe("SelectChild");
        expect(src0.propData).toBeDefined();
        expect(src0.propData[EnumPropName.Position]).toBeDefined();
    });

    it("applyPreset 同 ctrl 复制到另一 state", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { PresetCapability } = require("../../assets/script/controller/capabilities/PresetCapability");

        const { ctrl, select, selectNode } = setupCtrl();
        const ccLocal = (globalThis as any).cc;
        ctrl.selectedIndex = 0;
        select.togglePropertyControl(EnumPropName.Position, true);
        selectNode.position = ccLocal.v3(50, 60, 0);
        (select as any).commitPropFromNode(EnumPropName.Position);

        const preset = PresetCapability.savePreset(ctrl, 0);

        // apply 到 state 1
        const ok = PresetCapability.applyPreset(ctrl, 1, preset);
        expect(ok).toBe(true);
        const propDataS1 = (select as any)._ctrlData[ctrl.ctrlId][1];
        expect(propDataS1).toBeDefined();
        expect(propDataS1[EnumPropName.Position]).toBeDefined();
        expect(propDataS1[EnumPropName.Position].x).toBe(50);
    });

    it("applyPreset 跨 ctrl 按 selectName 匹配", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { PresetCapability } = require("../../assets/script/controller/capabilities/PresetCapability");

        const A = setupCtrl("CtrlA");
        const B = setupCtrl("CtrlB");
        const ccLocal = (globalThis as any).cc;

        A.ctrl.selectedIndex = 0;
        A.select.togglePropertyControl(EnumPropName.Position, true);
        A.selectNode.position = ccLocal.v3(11, 22, 0);
        (A.select as any).commitPropFromNode(EnumPropName.Position);

        const preset = PresetCapability.savePreset(A.ctrl, 0);
        const ok = PresetCapability.applyPreset(B.ctrl, 0, preset);
        expect(ok).toBe(true);

        const propData = (B.select as any)._ctrlData[B.ctrl.ctrlId][0];
        expect(propData[EnumPropName.Position]).toBeDefined();
        expect(propData[EnumPropName.Position].x).toBe(11);
    });

    it("applyPreset 找不到匹配 selectName → 静默跳过该 source, 仍返回 true", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { PresetCapability } = require("../../assets/script/controller/capabilities/PresetCapability");

        const A = setupCtrl();
        const B = setupCtrl();
        const ccLocal = (globalThis as any).cc;

        A.ctrl.selectedIndex = 0;
        A.select.togglePropertyControl(EnumPropName.Position, true);
        A.selectNode.position = ccLocal.v3(11, 22, 0);
        (A.select as any).commitPropFromNode(EnumPropName.Position);

        // 改 B 的 select 节点名, 让 selectName 不再匹配
        B.selectNode.name = "DifferentName";

        const preset = PresetCapability.savePreset(A.ctrl, 0);
        const ok = PresetCapability.applyPreset(B.ctrl, 0, preset);
        expect(ok).toBe(true);

        // B 的 _ctrlData 没新数据
        const propData = (B.select as any)._ctrlData[B.ctrl.ctrlId][0];
        expect(propData && propData[EnumPropName.Position]).toBeUndefined();
    });

    it("serializePreset/deserializePreset round-trip", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { PresetCapability } = require("../../assets/script/controller/capabilities/PresetCapability");

        const { ctrl, select, selectNode } = setupCtrl();
        const ccLocal = (globalThis as any).cc;
        ctrl.selectedIndex = 0;
        select.togglePropertyControl(EnumPropName.Position, true);
        selectNode.position = ccLocal.v3(7, 8, 0);
        (select as any).commitPropFromNode(EnumPropName.Position);

        const preset = PresetCapability.savePreset(ctrl, 0);
        const str = PresetCapability.serializePreset(preset);
        expect(typeof str).toBe("string");
        const back = PresetCapability.deserializePreset(str);
        expect(back.sourceCtrlName).toBe(preset.sourceCtrlName);
        expect(back.sources[0].selectName).toBe("SelectChild");
    });

    it("空/null 参数 → 不抛, 返回安全值", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { PresetCapability } = require("../../assets/script/controller/capabilities/PresetCapability");
        expect(PresetCapability.savePreset(null, 0)).toBeNull();
        expect(PresetCapability.applyPreset(null, 0, null)).toBe(false);
        expect(() => PresetCapability.deserializePreset("not json")).not.toThrow();
        expect(PresetCapability.deserializePreset("not json")).toBeNull();
    });

    it("apply 老版本 preset 自动经 MigrationCapability 升级", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { PresetCapability } = require("../../assets/script/controller/capabilities/PresetCapability");
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { MigrationCapability } = require("../../assets/script/controller/capabilities/MigrationCapability");

        MigrationCapability.clearSteps();
        let migrated = false;
        MigrationCapability.registerStep(0, (data: any) => {
            migrated = true;
            return data;
        });

        const { ctrl, select, selectNode } = setupCtrl();
        const ccLocal = (globalThis as any).cc;
        ctrl.selectedIndex = 0;
        select.togglePropertyControl(EnumPropName.Position, true);
        selectNode.position = ccLocal.v3(1, 2, 0);
        (select as any).commitPropFromNode(EnumPropName.Position);

        const preset = PresetCapability.savePreset(ctrl, 0);
        // 故意降版本
        preset.version = 0;
        PresetCapability.applyPreset(ctrl, 1, preset);
        // 只要 CURRENT_VERSION ≥ 1, migration step(0) 应该被跑
        if (MigrationCapability.CURRENT_VERSION >= 1) {
            expect(migrated).toBe(true);
        }
        MigrationCapability.clearSteps();
    });
});
