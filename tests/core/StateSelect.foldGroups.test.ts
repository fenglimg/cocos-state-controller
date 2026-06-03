/**
 * inspector 折叠组重构: StateSelect 把「排除管理 / 录制 / 值搬运」搬进 owner 回引的折叠子类
 * (excludeGroup / recording / valueOps), 顶层不再直显这些触发器; 普通访问器保留作 API.
 *
 * 本测试验证: 折叠组存在 + 组内 @property 可见性/displayName + 代理到 owner 同名访问器双向生效.
 * 真 cocos 引擎集成测试. inspector 实际折叠视觉 (编辑器 e2e) 另行取证.
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
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { StateSelect } = require("../../assets/script/controller/StateSelect");

const DELIMETER = "$_$";

function attrsOf(obj: any): Record<string, unknown> {
    return (globalThis as any).cc.Class.Attr.getClassAttrs(obj);
}

function setup() {
    const ccL = (globalThis as any).cc;
    const root = new ccL.Node("FG_Root");
    const ctrlNode = new ccL.Node("FG_CtrlNode");
    root.addChild(ctrlNode);
    const selectNode = new ccL.Node("FG_SelectNode");
    ctrlNode.addChild(selectNode);

    const ctrl = ctrlNode.addComponent(StateController);
    (ctrl as any).__preload();
    ctrl.states = [
        StateValue.create("A", (ctrl as any).stateIdAuto++),
        StateValue.create("B", (ctrl as any).stateIdAuto++),
        StateValue.create("C", (ctrl as any).stateIdAuto++),
    ];
    const select = selectNode.addComponent(StateSelect);
    (select as any).__preload();
    (ctrl as any).markCacheDirty();
    return { ccL, root, ctrl, select };
}

describe("StateSelect inspector 折叠组结构", () => {
    it("三个折叠组字段存在且 owner 已注入", () => {
        const { select } = setup();
        for (const g of ["excludeGroup", "recording", "valueOps"]) {
            expect((select as any)[g]).toBeTruthy();
            expect((select as any)[g].owner).toBe(select);
        }
    });

    it("折叠组字段在 StateSelect 上 @property 可见 (visible !== false) + displayName 注入", () => {
        const sa = attrsOf(StateSelect);
        const expectName: Record<string, string> = {
            excludeGroup: "排除管理", recording: "录制", valueOps: "值搬运",
        };
        for (const g of Object.keys(expectName)) {
            expect(sa[g + DELIMETER + "visible"]).not.toBe(false);
            expect(sa[g + DELIMETER + "displayName"]).toBe(expectName[g]);
        }
    });

    it("旧触发器已从 StateSelect 顶层 @property 移除 (改由折叠组承载)", () => {
        const sa = attrsOf(StateSelect);
        // cancelRecordTrigger 仍是 StateSelect 上的普通访问器(顶层不直显), 但 2026-06-03 起折叠组也不再
        // 直显它的按钮(回退改用 Ctrl+Z), 故不列入"折叠组承载"清单.
        const moved = [
            "excludedPropsDisplay", "addExcludeTrigger",
            "recordTrigger",
            "swapValueWithNext", "copyValueToNext",
        ];
        for (const key of moved) {
            expect({ key, visible: sa[key + DELIMETER + "visible"] }).toEqual({ key, visible: undefined });
        }
    });

    it("currentStateProps / ctrlState / refreshInspectorTrigger 保持顶层可见 (回归)", () => {
        const sa = attrsOf(StateSelect);
        for (const key of ["currentStateProps", "ctrlState", "refreshInspectorTrigger"]) {
            expect(sa[key + DELIMETER + "visible"]).not.toBe(false);
        }
    });

    it("recording 折叠组: recordTrigger 代理 toggle 录制态 (双向)", () => {
        const { ctrl, select } = setup();
        expect(ctrl.isRecording).toBe(false);
        (select as any).recording.recordTrigger = true;
        expect(ctrl.isRecording).toBe(true);
        // getter 也镜像
        expect((select as any).recording.recordTrigger).toBe(true);
        (select as any).recording.recordTrigger = false;
        expect(ctrl.isRecording).toBe(false);
    });

    it("valueOps 折叠组: swap/copy 代理到 owner 同名访问器", () => {
        const { ctrl, select } = setup();
        const cid = (ctrl as any).ctrlId;
        // 种子: A(state0) 有 propData, B(state1) 空
        const page = (select as any)._ctrlData[cid] || ((select as any)._ctrlData[cid] = {});
        page["0"] = { "cc.Node.x": 11 };
        // copy 当前(A=0) → 下一(B=1)
        ctrl.selectedIndex = 0;
        (select as any).valueOps.copyValueToNext = true;
        expect((select as any)._ctrlData[cid]["1"]).toEqual({ "cc.Node.x": 11 });
    });

    it("excludeGroup 折叠组: userExcludedProps 代理同一份 owner._userExcludedProps", () => {
        const { select } = setup();
        (select as any)._userExcludedProps = ["Foo.bar"];
        expect((select as any).excludeGroup.userExcludedProps).toEqual(["Foo.bar"]);
        // 经组 setter 回写
        (select as any).excludeGroup.userExcludedProps = ["Baz.qux"];
        expect((select as any)._userExcludedProps).toEqual(["Baz.qux"]);
    });
});

export {};
