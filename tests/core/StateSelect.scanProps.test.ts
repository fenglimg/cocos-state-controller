/**
 * StateSelect.scanAvailableProperties (Phase 4.3 part 2)
 *
 * Red→Green bug 修复:
 *
 * 现象: scanAvailableProperties 永远返回 [].
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
const ControllerMod = require("../../assets/script/controller/StateControllerV2");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SelectMod = require("../../assets/script/controller/StateSelectV2");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const EnumMod = require("../../assets/script/controller/StateEnumV2");

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
