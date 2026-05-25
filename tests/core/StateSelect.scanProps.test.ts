/**
 * StateSelect.scanAvailableProperties / autoConfigureAllProperties (Phase 4.3 part 2)
 *
 * Red→Green bug 修复:
 *
 * 现象: scanAvailableProperties 永远返回 []; autoConfigureAllProperties 永远 enabled=0.
 *
 * 根因: StateSelect.ts 顶部调用 `cc.Enum(EnumPropName)` 之后,
 * cocos 引擎把 EnumPropName 上的数字 key (反向映射) 设为 enumerable: false,
 * 所以 `for (const propKey in EnumPropName)` 只能拿到名字 key ("Active", "Position", ...).
 * scanAvailableProperties 里 `parseInt(propKey)` 对名字一律得到 NaN → 全 continue → 返回 [].
 *
 * 影响: 编辑器 "一键配置所有属性" 按钮无效, 用户点了没反应.
 *
 * 修法: 不依赖 parseInt(propKey), 直接读 `EnumPropName[propKey]` 拿数字值再判断.
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

function setupCtrlAndSelect() {
    const ccL = (globalThis as any).cc;
    const root = new ccL.Node("Scan_Root");
    const ctrlNode = new ccL.Node("Scan_CtrlNode");
    root.addChild(ctrlNode);
    const selectNode = new ccL.Node("Scan_SelectNode");
    ctrlNode.addChild(selectNode);

    const ctrl = ctrlNode.addComponent(StateController);
    (ctrl as any).__preload();

    const select = selectNode.addComponent(StateSelect);
    (select as any).__preload();
    (ctrl as any).markCacheDirty();

    return { root, ctrlNode, selectNode, ctrl, select };
}

describe("StateSelect.scanAvailableProperties", () => {
    it("空白节点应只列出 8 个节点基础 prop", () => {
        const { select } = setupCtrlAndSelect();
        const available = select.scanAvailableProperties();
        expect(available.length).toBe(8);
        expect(available).toContain(EnumPropName.Active);
        expect(available).toContain(EnumPropName.Position);
        expect(available).not.toContain(EnumPropName.LabelString);
    });

    it("加 cc.Label 后应额外列出 Label 字段相关 prop", () => {
        const ccL = (globalThis as any).cc;
        const { select, selectNode } = setupCtrlAndSelect();
        selectNode.addComponent(ccL.Label);

        const available = select.scanAvailableProperties();
        expect(available).toContain(EnumPropName.LabelString);
        expect(available).toContain(EnumPropName.LabelFontSize);
        expect(available).toContain(EnumPropName.LabelLineHeight);
        expect(available).toContain(EnumPropName.LabelSpacingX);
        expect(available).toContain(EnumPropName.LabelWrapEnable);
        expect(available).toContain(EnumPropName.Font);
    });

    it("不应列出 Non(0) 占位枚举", () => {
        const { select } = setupCtrlAndSelect();
        const available = select.scanAvailableProperties();
        expect(available).not.toContain(EnumPropName.Non);
    });
});

describe("StateSelect.autoConfigureAllProperties", () => {
    it("空白节点上调一次, 应启用 8 个节点基础 prop, skipped=0 failed=0", () => {
        const { select } = setupCtrlAndSelect();
        // TASK-003: __preload 自动接入 8 个节点基础 prop, 先逐个 opt-out 回到旧基线
        for (const p of [EnumPropName.Active, EnumPropName.Position, EnumPropName.Euler,
                         EnumPropName.Scale, EnumPropName.Anchor, EnumPropName.Size,
                         EnumPropName.Color, EnumPropName.Opacity]) {
            select.togglePropertyControl(p, false);
        }
        const result = select.autoConfigureAllProperties();

        expect(result.enabled).toBe(8);
        expect(result.skipped).toBe(0);
        expect(result.failed).toBe(0);

        expect(select.isPropertyControlled(EnumPropName.Active)).toBe(true);
        expect(select.isPropertyControlled(EnumPropName.Opacity)).toBe(true);
    });

    it("先启用一部分再调, 已启用的进 skipped", () => {
        const { select } = setupCtrlAndSelect();
        // TASK-003: __preload 自动接入 8 个, 先全 opt-out 回到旧基线
        for (const p of [EnumPropName.Active, EnumPropName.Position, EnumPropName.Euler,
                         EnumPropName.Scale, EnumPropName.Anchor, EnumPropName.Size,
                         EnumPropName.Color, EnumPropName.Opacity]) {
            select.togglePropertyControl(p, false);
        }
        select.togglePropertyControl(EnumPropName.Active, true);
        select.togglePropertyControl(EnumPropName.Opacity, true);

        const result = select.autoConfigureAllProperties();
        // 8 节点 prop 中 2 已启用 → skipped 2, enabled 6
        expect(result.enabled).toBe(6);
        expect(result.skipped).toBe(2);
        expect(result.failed).toBe(0);
    });

    it("挂了 cc.Toggle 应额外启用 ToggleIsChecked", () => {
        const ccL = (globalThis as any).cc;
        const { select, selectNode } = setupCtrlAndSelect();
        selectNode.addComponent(ccL.Toggle);

        select.autoConfigureAllProperties();
        expect(select.isPropertyControlled(EnumPropName.ToggleIsChecked)).toBe(true);
    });
});
