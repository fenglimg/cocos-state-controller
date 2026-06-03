/**
 * StateSelect._snapshot + onRecordingStart 拍 snapshot 契约 (Wave 2 T05)
 *
 * 录制 prefab diff 路径:
 *   - onRecordingStart 时, 遍历当前 controlled props (从 ctrlData[ctrl][currentState].$$controlledProps$$)
 *     调用 PropHandlerManager.getValue 拍 snapshot 存到 _snapshot
 *   - _snapshot 是私有字段 (不序列化, 不加 @property)
 *   - onRecordingStop 时清 snapshot
 *
 * 红预期: 当前 StateSelect 没有 onRecordingStart / onRecordingStop / _snapshot。
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

describe("StateSelect snapshot lifecycle (Wave 2 T05)", () => {
    it("StateSelect 暴露 onRecordingStart 方法", () => {
        const { select } = setup();
        expect(typeof (select as any).onRecordingStart).toBe("function");
    });

    it("StateSelect 暴露 onRecordingStop 方法", () => {
        const { select } = setup();
        expect(typeof (select as any).onRecordingStop).toBe("function");
    });

    it("初始 _snapshot = undefined / 空", () => {
        const { select } = setup();
        expect((select as any)._snapshot == null).toBe(true);
    });

    it("onRecordingStart 拍 snapshot, 内含已控制的 prop 当前值", () => {
        const { ctrl, select, selectNode } = setup();
        const ccLocal = (globalThis as any).cc;

        // 启用 Color 控制, 当前节点 color = RED (255,0,0)
        ctrl.selectedIndex = 0;
        select.togglePropertyControl(EnumPropName.Color, true);
        selectNode.color = ccLocal.color(255, 0, 0, 255);

        // 启动录制 → 触发拍 snapshot
        ctrl.startRecording();

        const snap = (select as any)._snapshot;
        expect(snap).toBeDefined();
        // T2 双轨统一: 内置 Color 收敛 propRef 单一路径, snapshot (readControlledPropsFromNode)
        // 按 string propRef key 存 (typeof ctrlVal==="string" 分支), 不再是 EnumPropName 数字 key.
        expect(snap["cc.Node.color"]).toBeDefined();
        expect(snap["cc.Node.color"].r).toBe(255);
        expect(snap["cc.Node.color"].g).toBe(0);
    });

    it("未受控的 prop 不进 snapshot", () => {
        const { ctrl, select } = setup();
        // TASK-003: __preload 自动接入 8 个节点 prop, 先全 opt-out 回到"无受控" 基线
        for (const p of [EnumPropName.Active, EnumPropName.Position, EnumPropName.Euler,
                         EnumPropName.Scale, EnumPropName.Anchor, EnumPropName.Size,
                         EnumPropName.Color, EnumPropName.Opacity]) {
            select.togglePropertyControl(p, false);
        }
        // 不启用任何 prop, 直接 start
        ctrl.startRecording();

        const snap = (select as any)._snapshot;
        // snapshot 可以是空对象, 但 Position/Color 等不应有值
        expect(snap[EnumPropName.Position]).toBeUndefined();
        expect(snap[EnumPropName.Color]).toBeUndefined();
    });

    it("onRecordingStop 清 snapshot", () => {
        const { ctrl, select, selectNode } = setup();
        const ccLocal = (globalThis as any).cc;
        ctrl.selectedIndex = 0;
        select.togglePropertyControl(EnumPropName.Color, true);
        selectNode.color = ccLocal.color(255, 0, 0, 255);

        ctrl.startRecording();
        expect((select as any)._snapshot).toBeDefined();

        ctrl.stopRecording();
        expect((select as any)._snapshot == null).toBe(true);
    });
});
