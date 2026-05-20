/**
 * StateSelect inspector 极简形态契约 (T19 of PLN-001 Wave 1)
 *
 * Wave 1 后 StateSelect inspector 只保留:
 *   - currentStateProps (readonly string[], 美化值列表 "Color: ...")
 *   - recordTrigger (T21 占位按钮)
 *   - openPanelTrigger (T21 占位按钮)
 *
 * 此文件先暴露 T19 (currentStateProps) 红用例; T21 会追加按钮 stub describe。
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
// eslint-disable-next-line @typescript-eslint/no-var-requires
const EnumMod = require("../../assets/script/controller/StateEnum");

const { StateController } = ControllerMod;
const { StateSelect } = SelectMod;
const { EnumPropName } = EnumMod;

function setup() {
    const ccL = (globalThis as any).cc;
    const root = new ccL.Node("SI_Root");
    const ctrlNode = new ccL.Node("SI_CtrlNode");
    root.addChild(ctrlNode);
    const selectNode = new ccL.Node("SI_SelectNode");
    ctrlNode.addChild(selectNode);

    const ctrl = ctrlNode.addComponent(StateController);
    (ctrl as any).__preload();
    const select = selectNode.addComponent(StateSelect);
    (select as any).__preload();
    (ctrl as any).markCacheDirty();

    return { ctrl, select, selectNode };
}

describe("StateSelect inspector 极简形态", () => {
    describe("[T19] currentStateProps 美化值列表", () => {
        it("currentStateProps 应为 string[] 类型", () => {
            const { select } = setup();
            const v = (select as any).currentStateProps;
            expect(Array.isArray(v)).toBe(true);
            for (const item of v) {
                expect(typeof item).toBe("string");
            }
        });

        it("当前 state 勾了 Color, 列表应包含 'Color: ...' 格式条目", () => {
            const { ctrl, select, selectNode } = setup();
            const ccL = (globalThis as any).cc;

            ctrl.selectedIndex = 0;
            select.togglePropertyControl(EnumPropName.Color, true);
            selectNode.color = ccL.color(192, 192, 255, 255);
            (select as any).setDefaultProp(EnumPropName.Color);

            const list: string[] = (select as any).currentStateProps;
            expect(list.length).toBeGreaterThan(0);
            // 至少有一行 Color: ...
            const colorEntry = list.find(s => /^Color:/.test(s));
            expect(colorEntry).toBeDefined();
            // 整体格式: 大写英文开头, ": ", 值 (非空)
            for (const item of list) {
                expect(item).toMatch(/^[A-Z][a-zA-Z]+: .+$/);
            }
        });

        it("没勾任何 prop 时, currentStateProps 应为空数组", () => {
            const { select } = setup();
            const list: string[] = (select as any).currentStateProps;
            expect(list).toEqual([]);
        });
    });
});
