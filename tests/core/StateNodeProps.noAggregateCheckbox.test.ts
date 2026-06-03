/**
 * Round1 #C1/#C7: 删除组件 inspector 里 5 个聚合勾选框 (Position/Scale/Size/Euler/Anchor).
 *
 * 实测根因: auto-opt 注册子项 cc.Node.x/y/z (聚合不接入), 但 StateNodeProps 的聚合勾选框
 * 调 isPropertyControlled(EnumPropName.Position) 查聚合 key 'cc.Node.position'(子项独立下恒 false)
 *   → C1: 勾选框恒显未勾(误导);
 *   → C7: 手动勾上后 addPropertyControl 用 enumToPropRef 存 'cc.Node.position'(与子项双重注册),
 *         off 路径用 ENUM_TO_PROPREF(聚合无映射)删不掉 → trapped。
 * (C2 reparent 实测正常: auto-opt 一直控 cc.Node.x → isAxisConvertible 命中 → 已证伪。)
 *
 * 用户决策: 这 5 个聚合勾选框冗余(auto-opt 已管子项)且坏, 直接删除。保留 Active/Color/Opacity
 * (单值属性, 直 propRef, 工作正常)。删后无手动聚合接入路径 → C1/C7 根除, 子项自动接管不丢功能。
 */

declare global {
    const CC_EDITOR: boolean;
    const cc: any;
    const Editor: any;
}

beforeAll(() => {
    (globalThis as any).CC_EDITOR = true;
    (globalThis as any).Editor = {
        log: () => {}, warn: () => {}, error: () => {},
        Utils: { refreshSelectedInspector: () => {} },
    };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { StateNodeProps } = require("../../assets/script/controller/props/StateNodeProps");

function propKeys(): string[] {
    return ((StateNodeProps as any).__props__ as string[]) || [];
}

describe("#C1/#C7 StateNodeProps 移除聚合勾选框", () => {
    const removed = ["propPosition", "propScale", "propSize", "propEuler", "propAnchor"];
    const kept = ["propActive", "propColor", "propOpacity"];

    for (const k of removed) {
        it(`聚合勾选框 ${k} 已删除 (不再是 @property)`, () => {
            expect(propKeys()).not.toContain(k);
            // 实例上也不应再有该 getter
            expect(typeof (new StateNodeProps() as any)[k]).toBe("undefined");
        });
    }

    for (const k of kept) {
        it(`单值勾选框 ${k} 保留`, () => {
            expect(propKeys()).toContain(k);
        });
    }
});

export {};
