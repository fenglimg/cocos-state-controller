/**
 * Props visibility 契约 (T09 of PLN-001 Wave 1)
 *
 * 4 个 props 类 (StateNodeProps / StateComponentProps / StateWidgetProps / StateToolsProps)
 * 的 @property getter/setter 应全部 visible:false (panel 时代不再让用户在 inspector 里勾 prop)。
 *
 * 同时验证: 加了 visible:false 之后, getter/setter 仍正常工作 (代理到 owner.togglePropertyControl).
 *
 * Red 阶段: 现状 @property 未带 visible, 断言 `<key>$_$visible === false` 必失败。
 * Green 阶段 (T10-T13): 在装饰器参数中追加 visible:false, 测试转绿。
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
const ToolsPropsMod = require("../../assets/script/controller/props/StateToolsProps");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SelectMod = require("../../assets/script/controller/StateSelect");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const EnumMod = require("../../assets/script/controller/StateEnum");

const { StateNodeProps } = NodePropsMod;
const { StateComponentProps } = ComponentPropsMod;
const { StateWidgetProps } = WidgetPropsMod;
const { StateToolsProps } = ToolsPropsMod;
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
        { name: "StateToolsProps", ctor: StateToolsProps },
    ];

    for (const { name, ctor } of classes) {
        it(`[${name}] 所有 @property 应标 visible:false`, () => {
            const keys = listPropertyKeys(ctor);
            expect(keys.length).toBeGreaterThan(0);
            for (const key of keys) {
                const v = getVisibleAttr(ctor, key);
                expect({ propKey: key, visible: v }).toEqual({ propKey: key, visible: false });
            }
        });
    }

    it("StateNodeProps: visible:false 后, getter/setter 仍正确代理 owner.togglePropertyControl", () => {
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
