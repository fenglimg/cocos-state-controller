/**
 * 录制外修改不入库 (Wave 2 T09)
 *
 * 当 ctrl.isRecording = false 时, 修改 selectNode.color 不应自动 commit 到 ctrlData。
 *
 * 红预期: 当前 8 个 cc 事件 hook (position-changed / color-changed / etc) 仍在,
 *        外部改 prop 会经 setDefaultProp 路径写 ctrlData. T10/T11 删 hook 后转绿。
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
const ControllerMod = require("../../assets/script/controller/StateController");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SelectMod = require("../../assets/script/controller/StateSelect");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const EnumMod = require("../../assets/script/controller/StateEnum");

const { StateController } = ControllerMod;
const { StateSelect } = SelectMod;
const { EnumPropName } = EnumMod;

function setup() {
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

    return { root, ctrl, select, selectNode };
}

describe("Recording outside recording (Wave 2 T09)", () => {
    it("isRecording=false 时, 改节点 color 不应写入 ctrlData", () => {
        const { ctrl, select, selectNode } = setup();
        const ccLocal = (globalThis as any).cc;

        ctrl.selectedIndex = 0;
        select.togglePropertyControl(EnumPropName.Color, true);

        // 录制中先记一个 baseline (state0 = WHITE)
        ctrl.startRecording();
        selectNode.color = ccLocal.color(255, 255, 255, 255);
        ctrl.stopRecording();

        const baseline = (select as any)._ctrlData[ctrl.ctrlId][0][EnumPropName.Color];
        // 可能 undefined (snapshot 后 stop 时 diff 与 snapshot 相同, 不 commit) 或 WHITE
        const baselineR = baseline ? baseline.r : 255;

        // 现在录制外, 触发 cc 事件 (模拟编辑器拖拽 color → 派发 color-changed)
        selectNode.color = ccLocal.color(0, 255, 0, 255);
        selectNode.emit && selectNode.emit("color-changed", selectNode.color);

        const after = (select as any)._ctrlData[ctrl.ctrlId][0] && (select as any)._ctrlData[ctrl.ctrlId][0][EnumPropName.Color];
        // 期望: 录制外的改动不应入 ctrlData; ctrlData 仍是 baseline 或 undefined
        if (after) {
            expect(after.r).toBe(baselineR);
            expect(after.g).not.toBe(255); // 不应被改成 GREEN
        }
    });

    it("isRecording=false 时, 改 position 不写入 ctrlData", () => {
        const { ctrl, select, selectNode } = setup();
        const ccLocal = (globalThis as any).cc;

        ctrl.selectedIndex = 0;
        select.togglePropertyControl(EnumPropName.Position, true);

        // 不进入录制, 直接改 position
        selectNode.position = ccLocal.v3(100, 200, 0);
        selectNode.emit && selectNode.emit("position-changed");

        const stored = (select as any)._ctrlData[ctrl.ctrlId][0] && (select as any)._ctrlData[ctrl.ctrlId][0][EnumPropName.Position];
        // 录制外改动不应入库
        if (stored) {
            // 严格说应该不存在; 但若 setDefaultProp 兜底写了空值是另一回事
            // 至少 100/200 这个值不应进 ctrlData
            expect(stored.x === 100 && stored.y === 200).toBe(false);
        }
    });
});
