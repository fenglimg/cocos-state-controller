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

        it("openPanelTrigger setter 调 Editor.Panel.open('state-controller-panel')", () => {
            const { ctrl } = setup();
            expect("openPanelTrigger" in (ctrl as any).__proto__ || "openPanelTrigger" in ctrl).toBe(true);
            const openMock = jest.fn();
            const prev = (globalThis as any).Editor;
            (globalThis as any).Editor = { Panel: { open: openMock } };
            try {
                expect(() => { (ctrl as any).openPanelTrigger = true; }).not.toThrow();
                expect(openMock).toHaveBeenCalledWith("state-controller-panel");
            }
            finally {
                (globalThis as any).Editor = prev;
            }
        });
    });

    describe("homePageState 下拉 (无插件闭环)", () => {
        it("默认值 -1 表示 (无), getter 返回 -1", () => {
            const { ctrl } = setup();
            expect(ctrl.homePageState).toBe(-1);
            expect((ctrl as any)._homePageStateId).toBe(-1);
        });

        it("setter 写入存在的 stateId 后, _homePageStateId 同步; getter 回写一致", () => {
            const { ctrl } = setup();
            const targetId = ctrl._states[1].stateId;
            ctrl.homePageState = targetId;
            expect((ctrl as any)._homePageStateId).toBe(targetId);
            expect(ctrl.homePageState).toBe(targetId);
        });

        it("setter 写入 -1 表示清空 homepage", () => {
            const { ctrl } = setup();
            const targetId = ctrl._states[0].stateId;
            ctrl.homePageState = targetId;
            expect((ctrl as any)._homePageStateId).toBe(targetId);
            ctrl.homePageState = -1;
            expect((ctrl as any)._homePageStateId).toBe(-1);
        });

        it("setter 写入不存在的 stateId 应被拒, 回退 -1 + 不抛", () => {
            const { ctrl } = setup();
            expect(() => { ctrl.homePageState = 9999; }).not.toThrow();
            expect((ctrl as any)._homePageStateId).toBe(-1);
        });

        it("enumList 注入: __preload + states setter 后, homePageState 下拉项 = [(无),...states]", () => {
            const { ctrl } = setup();
            const ccL = (globalThis as any).cc;
            // 注: cocos 的 setClassAttr(instance, ...) 写到 instance.__attrs__, 不是 class
            const attrs = ccL.Class.Attr.getClassAttrs(ctrl);
            const homePageEnumList = attrs["homePageState$_$enumList"];
            expect(Array.isArray(homePageEnumList)).toBe(true);
            expect(homePageEnumList.length).toBe(1 + ctrl._states.length);
            expect(homePageEnumList[0]).toEqual({ name: "(无)", value: -1 });
            // value 必须是 stateId (reorder/delete 稳定), 不是 index
            for (let i = 0; i < ctrl._states.length; i++) {
                expect(homePageEnumList[i + 1].value).toBe(ctrl._states[i].stateId);
                expect(homePageEnumList[i + 1].name).toBe(ctrl._states[i].name);
            }
        });
    });
});
