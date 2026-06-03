/**
 * TASK-005 (专项A-1): StateController move↑↓ / dup / delete 触发器改组件 inspector visible:true.
 *
 * 设计 (SPEC 专项A / line 235): StateController 的 move↑↓ / dup / delete @property 触发器
 * 由 visible:false (panel 时代隐藏) 翻为 visible:true, 让用户不依赖面板即可在组件 inspector
 * 直接操作整个 State 列表 (增删改切由 states 数组 UI + 这 4 个触发器闭环).
 *
 * 本测试源码可证 visible:true; 编辑器 dogfood (T8) 另行取证.
 * 同时回归: 翻可见后, setter 仍正确代理到对应 state 列表操作 (顺序/复制/删除).
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
const { StateController, StateValue } = require("../../assets/script/controller/StateController");

const DELIMETER = "$_$";

function getVisibleAttr(ctor: any, propKey: string): unknown {
    const attrs = (globalThis as any).cc.Class.Attr.getClassAttrs(ctor);
    return attrs[propKey + DELIMETER + "visible"];
}

function setup() {
    const ccL = (globalThis as any).cc;
    const root = new ccL.Node("TVR_Root");
    const ctrlNode = new ccL.Node("TVR_CtrlNode");
    root.addChild(ctrlNode);
    const ctrl = ctrlNode.addComponent(StateController);
    (ctrl as any).__preload();
    // 准备 3 个 state 供 move/dup/delete 操作 (用 StateValue.create 走正规构造)
    ctrl.states = [
        StateValue.create("A", (ctrl as any).stateIdAuto++),
        StateValue.create("B", (ctrl as any).stateIdAuto++),
        StateValue.create("C", (ctrl as any).stateIdAuto++),
    ];
    return { ccL, root, ctrl };
}

describe("专项A-1 StateController 触发器 (折叠组重构后)", () => {
    const opsTriggers = ["moveStateUp", "moveStateDown", "duplicateCurrentState", "deleteCurrentState"];
    const recordTriggers = ["recordTrigger", "cancelRecordTrigger"];

    it("4 个状态操作触发器已从 StateController 顶层 @property 移除 (改由 stateOps 折叠组承载)", () => {
        for (const key of opsTriggers) {
            // 顶层不再注册 @property → visible 属性 undefined (普通访问器仍在原型上, 仅不直显)
            expect({ propKey: key, visible: getVisibleAttr(StateController, key) })
                .toEqual({ propKey: key, visible: undefined });
        }
    });

    it("stateOps 折叠组对 inspector 可见, 组内 4 个触发器 visible !== false + displayName 注入", () => {
        const { ctrl } = setup();
        expect((ctrl as any).stateOps).toBeTruthy();
        expect(getVisibleAttr(StateController, "stateOps")).not.toBe(false);
        const groupAttrs = (globalThis as any).cc.Class.Attr.getClassAttrs((ctrl as any).stateOps);
        const expectName: Record<string, string> = {
            moveStateUp: "状态上移", moveStateDown: "状态下移",
            duplicateCurrentState: "复制当前状态", deleteCurrentState: "删除当前状态",
        };
        for (const key of opsTriggers) {
            expect(groupAttrs[key + DELIMETER + "visible"]).not.toBe(false);
            expect(groupAttrs[key + DELIMETER + "displayName"]).toBe(expectName[key]);
        }
    });

    it("recording 折叠组对 inspector 可见, 组内录制/撤销触发器 visible !== false", () => {
        const { ctrl } = setup();
        expect((ctrl as any).recording).toBeTruthy();
        expect(getVisibleAttr(StateController, "recording")).not.toBe(false);
        const groupAttrs = (globalThis as any).cc.Class.Attr.getClassAttrs((ctrl as any).recording);
        for (const key of recordTriggers) {
            expect(groupAttrs[key + DELIMETER + "visible"]).not.toBe(false);
        }
    });

    it("普通访问器路径仍可用: ctrl.moveStateUp setter 代理到顺序调整 (回归)", () => {
        const { ctrl } = setup();
        ctrl.selectedIndex = 1; // 选中 B
        ctrl.moveStateUp = true; // B 上移
        expect(ctrl.states.map((s: any) => s.name)).toEqual(["B", "A", "C"]);
    });

    it("折叠组路径: ctrl.stateOps.moveStateUp setter 代理到同一顺序调整", () => {
        const { ctrl } = setup();
        ctrl.selectedIndex = 1; // 选中 B
        (ctrl as any).stateOps.moveStateUp = true;
        expect(ctrl.states.map((s: any) => s.name)).toEqual(["B", "A", "C"]);
    });

    it("折叠组路径: stateOps.duplicateCurrentState 代理到复制 (后插独立副本)", () => {
        const { ctrl } = setup();
        ctrl.selectedIndex = 0; // 选中 A
        (ctrl as any).stateOps.duplicateCurrentState = true;
        const names = ctrl.states.map((s: any) => s.name);
        expect(names.length).toBe(4);
        expect(names[0]).toBe("A");
        expect(names[2]).toBe("B");
    });

    it("折叠组路径: stateOps.deleteCurrentState 代理到删除 (至少留 1)", () => {
        const { ctrl } = setup();
        ctrl.selectedIndex = 1; // 选中 B
        (ctrl as any).stateOps.deleteCurrentState = true;
        expect(ctrl.states.map((s: any) => s.name)).toEqual(["A", "C"]);
    });

    it("折叠组路径: recording.recordTrigger 代理 toggle 录制态", () => {
        const { ctrl } = setup();
        expect(ctrl.isRecording).toBe(false);
        (ctrl as any).recording.recordTrigger = true; // toggle on
        expect(ctrl.isRecording).toBe(true);
        (ctrl as any).recording.recordTrigger = false; // toggle off
        expect(ctrl.isRecording).toBe(false);
    });
});

export {};
