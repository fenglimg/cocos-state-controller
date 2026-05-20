/**
 * StateController inspector 极简形态契约 (T14/T16 of PLN-001 Wave 1)
 *
 * Wave 1 后, inspector 中 StateController 字段大幅删减, 仅保留:
 *   - ctrlName (input)
 *   - selectedIndex (enum 下拉)
 *   - currentStateLabel (readonly, 显示当前 state 的格式化字符串)
 *   - onClickRecord (按钮 stub, 点击 cc.warn "尚未实装")
 *   - onClickOpenPanel (按钮 stub, 点击 cc.warn "尚未实装")
 *
 * 此文件先暴露 T14 (currentStateLabel) 红用例; T16 会追加按钮 stub describe。
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
const ControllerMod = require("../../assets/script/controller/StateController");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SelectMod = require("../../assets/script/controller/StateSelect");

const { StateController, StateValue } = ControllerMod;
const { StateSelect } = SelectMod;

function setup() {
    const ccL = (globalThis as any).cc;
    const root = new ccL.Node("CI_Root");
    const ctrlNode = new ccL.Node("CI_CtrlNode");
    root.addChild(ctrlNode);
    const selectNode = new ccL.Node("CI_SelectNode");
    ctrlNode.addChild(selectNode);

    const ctrl = ctrlNode.addComponent(StateController);
    (ctrl as any).__preload();
    const select = selectNode.addComponent(StateSelect);
    (select as any).__preload();
    (ctrl as any).markCacheDirty();

    return { ctrl, select, ctrlNode, selectNode };
}

describe("StateController inspector 极简形态", () => {
    describe("[T14] currentStateLabel getter", () => {
        it("应返回 `${index}. ${stateName}` 形式的当前 state 标签", () => {
            const { ctrl } = setup();
            const states = [...ctrl.states, StateValue.create("pressed", 99)];
            states[0].name = "normal";
            states[1].name = "hover";
            ctrl.states = states;

            ctrl.selectedIndex = 0;
            expect(ctrl.currentStateLabel).toBe("0. normal");

            ctrl.selectedIndex = 2;
            expect(ctrl.currentStateLabel).toBe("2. pressed");
        });

        it("selectedIndex 越界时不应崩溃, 返回字符串 fallback", () => {
            const { ctrl } = setup();
            ctrl.selectedIndex = 0;
            // 强制清空 states
            (ctrl as any)._states = [];
            expect(() => ctrl.currentStateLabel).not.toThrow();
            expect(typeof ctrl.currentStateLabel).toBe("string");
        });
    });

    describe("[T16] 录制 / Panel 按钮 stub", () => {
        it("recordTrigger setter 调用不抛错, 触发 cc.warn (\"尚未实现\")", () => {
            const { ctrl } = setup();
            // 期望存在 recordTrigger 布尔字段 (button stub 形态: set true 触发动作)
            // 与 manualRefreshTrigger 同形态
            expect("recordTrigger" in (ctrl as any).__proto__ || "recordTrigger" in ctrl).toBe(true);
            const warnSpy = jest.spyOn((globalThis as any).cc, "warn").mockImplementation(() => {});
            try {
                expect(() => { (ctrl as any).recordTrigger = true; }).not.toThrow();
                expect(warnSpy).toHaveBeenCalled();
            }
            finally {
                warnSpy.mockRestore();
            }
        });

        it("openPanelTrigger setter 调用不抛错, 触发 cc.warn (\"尚未实现\")", () => {
            const { ctrl } = setup();
            expect("openPanelTrigger" in (ctrl as any).__proto__ || "openPanelTrigger" in ctrl).toBe(true);
            const warnSpy = jest.spyOn((globalThis as any).cc, "warn").mockImplementation(() => {});
            try {
                expect(() => { (ctrl as any).openPanelTrigger = true; }).not.toThrow();
                expect(warnSpy).toHaveBeenCalled();
            }
            finally {
                warnSpy.mockRestore();
            }
        });
    });
});
