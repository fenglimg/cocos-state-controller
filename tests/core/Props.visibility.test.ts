/**
 * Props visibility 契约 — 无插件闭环路线重定向
 *
 * 3 个 props 类 (StateNodeProps / StateComponentProps / StateWidgetProps)
 * 的 @property getter/setter 应全部对 inspector 可见 (visible 属性 undefined 或 true), 让用户
 * 不依赖 panel 即可在 inspector 直接勾 prop.
 *
 * 同时验证: 可见之后, getter/setter 仍正常代理到 owner.togglePropertyControl.
 *
 * 历史:
 *   - panel 时代曾要求 visible:false (panel 独占), 2026-05-21 翻案为 "无插件闭环",
 *     inspector 重新成为 prop 勾选主入口, 这条契约同步翻转.
 *   - 2026-05-25 StateToolsProps (工具组 5 按钮) 整组物理删除, brief §6 必删清单兑现.
 *     方法本身保留 (forceRefreshInspector 等仍是 public API + 各自有单测).
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
const NodePropsMod = require("../../assets/script/controller/props/StateNodeProps");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ComponentPropsMod = require("../../assets/script/controller/props/StateComponentProps");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const WidgetPropsMod = require("../../assets/script/controller/props/StateWidgetProps");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SelectMod = require("../../assets/script/controller/StateSelect");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const EnumMod = require("../../assets/script/controller/StateEnum");

const { StateNodeProps } = NodePropsMod;
const { StateComponentProps } = ComponentPropsMod;
const { StateWidgetProps } = WidgetPropsMod;
const { StateSelect } = SelectMod;
const { EnumPropName } = EnumMod;

const DELIMETER = "$_$";

function listPropertyKeys(ctor: any): string[] {
    // cocos 把 @property 字段记到 __props__
    return ((ctor as any).__props__ as string[]) || [];
}

function getVisibleAttr(ctor: any, propKey: string): unknown {
    const attrs = (cc as any).Class.Attr.getClassAttrs(ctor);
    return attrs[propKey + DELIMETER + "visible"];
}

describe("Props visibility 契约", () => {
    const classes: Array<{ name: string, ctor: any }> = [
        { name: "StateNodeProps", ctor: StateNodeProps },
        { name: "StateComponentProps", ctor: StateComponentProps },
        { name: "StateWidgetProps", ctor: StateWidgetProps },
    ];

    for (const { name, ctor } of classes) {
        it(`[${name}] 所有 @property 不应被静态隐藏 (visible !== false)`, () => {
            const keys = listPropertyKeys(ctor);
            expect(keys.length).toBeGreaterThan(0);
            for (const key of keys) {
                const v = getVisibleAttr(ctor, key);
                // 合法值: undefined (默认可见) / true (固定可见) / function (动态可见, 用于
                // applicable 过滤). 不允许显式 false (那是 panel 时代的整体隐藏).
                expect({ propKey: key, visible: v }).not.toEqual({ propKey: key, visible: false });
            }
        });
    }

    it("StateNodeProps: 可见之后, getter/setter 仍正确代理 owner.togglePropertyControl", () => {
        const ccL = (globalThis as any).cc;
        const root = new ccL.Node("PVR_Root");
        const ctrlNode = new ccL.Node("PVR_CtrlNode");
        root.addChild(ctrlNode);
        const selectNode = new ccL.Node("PVR_SelectNode");
        ctrlNode.addChild(selectNode);

        // 需要一个 controller 让 select 能 preload (避免 currCtrl == null 报错)
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { StateController } = require("../../assets/script/controller/StateController");
        const ctrl = ctrlNode.addComponent(StateController);
        (ctrl as any).__preload();
        const select = selectNode.addComponent(StateSelect);
        (select as any).__preload();
        (ctrl as any).markCacheDirty();

        const np = new StateNodeProps();
        np.owner = select;

        // TASK-003: __preload 自动接入 Active, 先 opt-out 验证 toggle 路径
        select.togglePropertyControl(EnumPropName.Active, false);
        // 初始未控制
        expect(np.propActive).toBe(false);
        // set 后应触发 togglePropertyControl, 进而 isPropertyControlled === true
        np.propActive = true;
        expect(select.isPropertyControlled(EnumPropName.Active)).toBe(true);
        expect(np.propActive).toBe(true);

        // 复位
        np.propActive = false;
        expect(np.propActive).toBe(false);
    });
});
