/**
 * StateControllerV2 inspector 极简形态契约 (T16 of PLN-001 Wave 1)
 *
 * Wave 1 后, inspector 中 StateControllerV2 字段大幅删减, 仅保留:
 *   - ctrlName (input, displayName "控制器 id")
 *   - selectedIndex (enum 下拉, displayName "state")
 *   - recordTrigger (按钮, displayName "🔴 录制")
 *
 * (旧的 readonly 标签 / Panel 入口 / homepage 下拉 / 刷新按钮 已删, panel 接管)
 */

declare global {
    const CC_EDITOR: boolean;
    const cc: any;
    const Editor: any;
}

beforeAll(() => {
    (globalThis as any).CC_EDITOR = true;
    (globalThis as any).Editor = {
        log: () => {},
        warn: () => {},
        error: () => {},
        Utils: { refreshSelectedInspector: () => {} },
    };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ControllerMod = require("../../assets/script/controller/StateControllerV2");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SelectMod = require("../../assets/script/controller/StateSelectV2");

const { StateControllerV2 } = ControllerMod;
const { StateSelectV2 } = SelectMod;

function setup() {
    const ccL = (globalThis as any).cc;
    const root = new ccL.Node("CI_Root");
    const ctrlNode = new ccL.Node("CI_CtrlNode");
    root.addChild(ctrlNode);
    const selectNode = new ccL.Node("CI_SelectNode");
    ctrlNode.addChild(selectNode);

    const ctrl = ctrlNode.addComponent(StateControllerV2);
    (ctrl as any).__preload();
    const select = selectNode.addComponent(StateSelectV2);
    (select as any).__preload();
    (ctrl as any).markCacheDirty();

    return { ctrl, select, ctrlNode, selectNode };
}

describe("StateControllerV2 inspector 极简形态", () => {
    describe("[T16] 录制按钮", () => {
        // Wave 2 T14: recordTrigger 已从 cc.warn stub 升级为真实切换 isRecording.
        // 保留 stub 时代的形状检查 (存在性 + 不抛), 行为校验交给 Recording.controller.test.ts。
        it("recordTrigger setter 调用不抛错 (Wave 2 改为切换 isRecording, 不再 cc.warn)", () => {
            const { ctrl } = setup();
            expect("recordTrigger" in (ctrl as any).__proto__ || "recordTrigger" in ctrl).toBe(true);
            expect(() => { (ctrl as any).recordTrigger = true; }).not.toThrow();
            // Wave 2: recordTrigger=true 进入录制态
            expect((ctrl as any).isRecording).toBe(true);
            // 再 toggle 一次回到非录制态
            expect(() => { (ctrl as any).recordTrigger = false; }).not.toThrow();
            expect((ctrl as any).isRecording).toBe(false);
        });
    });
});
