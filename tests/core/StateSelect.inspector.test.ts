/**
 * StateSelect inspector 极简形态契约 (T19 of PLN-001 Wave 1)
 *
 * Wave 1 后 StateSelect inspector 只保留:
 *   - currentStateProps (readonly string[], 美化值列表 "Color: ...", displayName "已跟随属性")
 *   - recordTrigger (录制按钮, displayName "🔴 录制")
 *
 * (openPanelTrigger 已删, panel 自带入口)
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
            // TASK-003: __preload 自动接入 8 个节点 prop, 测试需"无勾选"基线, 逐个 opt-out
            for (const p of [EnumPropName.Active, EnumPropName.Position, EnumPropName.Euler,
                             EnumPropName.Scale, EnumPropName.Anchor, EnumPropName.Size,
                             EnumPropName.Color, EnumPropName.Opacity]) {
                select.togglePropertyControl(p, false);
            }
            const list: string[] = (select as any).currentStateProps;
            expect(list).toEqual([]);
        });
    });

    describe("[T21] 录制按钮", () => {
        // Wave 2 T15: recordTrigger 已从 cc.warn stub 升级为镜像 ctrl._recording.
        // 此处保留 stub 时代的 "不抛" 形状检查, 行为校验交给 Recording.* test。
        it("recordTrigger setter 不抛错 (Wave 2 改为镜像 ctrl._recording, 不再 cc.warn)", () => {
            const { select, ctrl } = setup();
            expect(() => { (select as any).recordTrigger = true; }).not.toThrow();
            // Wave 2: setter 通过 ctrl.startRecording 进入录制态, getter 反映 ctrl.isRecording
            expect((select as any).recordTrigger).toBe(true);
            expect(ctrl.isRecording).toBe(true);
            // 再 toggle 退出
            expect(() => { (select as any).recordTrigger = false; }).not.toThrow();
            expect((select as any).recordTrigger).toBe(false);
        });
    });

    describe("StateSelect 上的切 state 入口 (ctrlState) — 无插件闭环", () => {
        it("ctrlState getter 返回 ctrl.selectedIndex", () => {
            const { select, ctrl } = setup();
            expect((select as any).ctrlState).toBe(ctrl.selectedIndex);
            ctrl.selectedIndex = 1;
            expect((select as any).ctrlState).toBe(1);
        });

        it("ctrlState setter 写入会同步改 ctrl.selectedIndex (双向联动)", () => {
            const { select, ctrl } = setup();
            expect(ctrl.selectedIndex).toBe(0);
            (select as any).ctrlState = 1;
            expect(ctrl.selectedIndex).toBe(1);
        });

        it("ctrlState 应对 inspector 可见 (无 visible:false)", () => {
            const ccL = (globalThis as any).cc;
            const { select } = setup();
            const attrs = ccL.Class.Attr.getClassAttrs((select as any).constructor);
            const visible = attrs["ctrlState$_$visible"];
            // 合法: undefined (默认显示) 或 true; 禁止 false
            expect(visible).not.toBe(false);
        });
    });

    describe("prop toggle applicable 过滤 — 节点无对应 cc.Component 时, toggle 应不显示", () => {
        function buildSelectWithNode(extraComps: any[] = []) {
            const ccL = (globalThis as any).cc;
            const root = new ccL.Node("AF_Root");
            const ctrlNode = new ccL.Node("AF_CtrlNode");
            root.addChild(ctrlNode);
            const selectNode = new ccL.Node("AF_SelectNode");
            ctrlNode.addChild(selectNode);
            for (const C of extraComps) selectNode.addComponent(C);
            const ctrl = ctrlNode.addComponent(StateController);
            (ctrl as any).__preload();
            const select = selectNode.addComponent(StateSelect);
            (select as any).__preload();
            return { select };
        }

        function getVisible(propsObj: any, propKey: string): unknown {
            const ccL = (globalThis as any).cc;
            const attrs = ccL.Class.Attr.getClassAttrs(propsObj.constructor);
            return attrs[propKey + "$_$visible"];
        }

        function isVisible(propsObj: any, propKey: string): boolean {
            const v = getVisible(propsObj, propKey);
            if (typeof v === "function") {
                return v.call(propsObj);
            }
            return v !== false;
        }

        it("没挂 cc.Label: propLabelString / propFont 等 Label 系列应不可见", () => {
            const { select } = buildSelectWithNode([]);
            const cp = (select as any).componentProps;
            cp.owner = select; // 测试环境下保证 owner 关联
            expect(isVisible(cp, "propLabelString")).toBe(false);
            expect(isVisible(cp, "propFont")).toBe(false);
            expect(isVisible(cp, "propLabelFontSize")).toBe(false);
        });

        it("挂了 cc.Label: propLabelString 应可见", () => {
            const ccL = (globalThis as any).cc;
            const { select } = buildSelectWithNode([ccL.Label]);
            const cp = (select as any).componentProps;
            cp.owner = select;
            expect(isVisible(cp, "propLabelString")).toBe(true);
        });

        it("没挂 cc.Sprite: propSpriteFrame / propGrayScale 应不可见", () => {
            const { select } = buildSelectWithNode([]);
            const cp = (select as any).componentProps;
            cp.owner = select;
            expect(isVisible(cp, "propSpriteFrame")).toBe(false);
            expect(isVisible(cp, "propGrayScale")).toBe(false);
        });

        it("没挂 cc.Widget: 14 个 propWidget* 全部不可见", () => {
            const { select } = buildSelectWithNode([]);
            const wp = (select as any).widgetProps;
            wp.owner = select;
            const ccL = (globalThis as any).cc;
            const attrs = ccL.Class.Attr.getClassAttrs(wp.constructor);
            const widgetKeys = Object.keys(attrs)
                .filter(k => k.endsWith("$_$visible"))
                .map(k => k.replace("$_$visible", ""))
                .filter(k => k.indexOf("propWidget") === 0);
            expect(widgetKeys.length).toBeGreaterThanOrEqual(14);
            for (const key of widgetKeys) {
                expect({ key, visible: isVisible(wp, key) }).toEqual({ key, visible: false });
            }
        });

        it("挂了 cc.Widget: propWidgetEnabled 应可见", () => {
            const ccL = (globalThis as any).cc;
            const { select } = buildSelectWithNode([ccL.Widget]);
            const wp = (select as any).widgetProps;
            wp.owner = select;
            expect(isVisible(wp, "propWidgetEnabled")).toBe(true);
        });
    });
});
