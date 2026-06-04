/**
 * StateSelectV2 公共 API 契约测试 (Phase 4.3)
 *
 * 覆盖:
 *   - isPropertyAvailable: 节点基础 prop 恒为 true; 组件 prop 看节点是否挂组件
 *   - isPropertyControlled: 切换控制后状态反映正确
 *   - togglePropertyControl(true/false): 启用 / 解除 控制
 *
 * scanAvailableProperties / autoConfigureAllProperties 拆到
 * StateSelectV2.scanProps.test.ts 单独走 red→green (Phase 4.3 发现 cc.Enum 副作用 bug).
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

const { StateControllerV2 } = ControllerMod;
const { StateSelectV2 } = SelectMod;
const { EnumPropName } = EnumMod;

function setupCtrlAndSelect() {
    const ccL = (globalThis as any).cc;
    const root = new ccL.Node("API_Root");
    const ctrlNode = new ccL.Node("API_CtrlNode");
    root.addChild(ctrlNode);
    const selectNode = new ccL.Node("API_SelectNode");
    ctrlNode.addChild(selectNode);

    const ctrl = ctrlNode.addComponent(StateControllerV2);
    (ctrl as any).__preload();

    const select = selectNode.addComponent(StateSelectV2);
    (select as any).__preload();
    (ctrl as any).markCacheDirty();

    return { root, ctrlNode, selectNode, ctrl, select };
}

describe("StateSelectV2.isPropertyAvailable", () => {
    it("节点基础 8 prop 在任何节点上都返回 true", () => {
        const { select } = setupCtrlAndSelect();
        const basic = [
            EnumPropName.Active, EnumPropName.Position, EnumPropName.Scale,
            EnumPropName.Color, EnumPropName.Size, EnumPropName.Euler,
            EnumPropName.Anchor, EnumPropName.Opacity,
        ];
        for (const p of basic) {
            expect(select.isPropertyAvailable(p)).toBe(true);
        }
    });

    it("组件 prop 在缺组件时返回 false, 加上组件后返回 true", () => {
        const ccL = (globalThis as any).cc;
        const { select, selectNode } = setupCtrlAndSelect();

        expect(select.isPropertyAvailable(EnumPropName.LabelString)).toBe(false);
        selectNode.addComponent(ccL.Label);
        expect(select.isPropertyAvailable(EnumPropName.LabelString)).toBe(true);
    });
});

describe("StateSelectV2.togglePropertyControl + isPropertyControlled", () => {
    it("启用前 isPropertyControlled = false, 启用后 = true", () => {
        const { select } = setupCtrlAndSelect();
        // TASK-003: __preload 自动接入 Opacity, 先 opt-out 验证 toggle 路径仍正常
        select.togglePropertyControl(EnumPropName.Opacity, false);
        expect(select.isPropertyControlled(EnumPropName.Opacity)).toBe(false);
        select.togglePropertyControl(EnumPropName.Opacity, true);
        expect(select.isPropertyControlled(EnumPropName.Opacity)).toBe(true);
    });

    it("启用后再禁用, isPropertyControlled 应回到 false", () => {
        const { select } = setupCtrlAndSelect();
        select.togglePropertyControl(EnumPropName.Scale, true);
        expect(select.isPropertyControlled(EnumPropName.Scale)).toBe(true);

        select.togglePropertyControl(EnumPropName.Scale, false);
        expect(select.isPropertyControlled(EnumPropName.Scale)).toBe(false);
    });

    it("禁用某 prop 不影响其他已启用 prop 的控制状态", () => {
        const { select } = setupCtrlAndSelect();
        select.togglePropertyControl(EnumPropName.Active, true);
        select.togglePropertyControl(EnumPropName.Opacity, true);

        select.togglePropertyControl(EnumPropName.Active, false);

        expect(select.isPropertyControlled(EnumPropName.Active)).toBe(false);
        expect(select.isPropertyControlled(EnumPropName.Opacity)).toBe(true);
    });
});

