/**
 * StateController 回收站 (软删 → 恢复 / 硬删) 行为测试
 *
 * 覆盖 index→stateId 迁移后的删除语义:
 *   1. listDeletedStates 列出软删暂存项
 *   2. restoreDeletedState 按 stateId 恢复任意暂存项 (非仅最后一个), 数据接回
 *   3. purgeDeletedState 硬删: 从回收站移除 + 清掉所有受控 select 的 _ctrlData[stateId]
 *   4. purgeAllDeletedStates 清空: 全部硬删
 *   5. 硬删后再恢复同 stateId 不复活数据 (页数据已清)
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

const { StateController, StateValue } = ControllerMod;
const { StateSelect } = SelectMod;
const { EnumPropName } = EnumMod;

function setup() {
    const ccLocal = (globalThis as any).cc;
    const root = new ccLocal.Node("Root");
    const ctrlNode = new ccLocal.Node("CtrlNode");
    root.addChild(ctrlNode);
    const selectNode = new ccLocal.Node("SelectNode");
    ctrlNode.addChild(selectNode);

    const ctrl = ctrlNode.addComponent(StateController);
    (ctrl as any).__preload();

    const select = selectNode.addComponent(StateSelect);
    (select as any).__preload();

    (ctrl as any).markCacheDirty();

    return { root, ctrlNode, selectNode, ctrl, select };
}

// 给 state index 录一个 active 值, 用 setDefaultProp 落到 _ctrlData[stateId]
function recordActive(ctrl: any, select: any, selectNode: any, index: number, value: boolean) {
    ctrl.selectedIndex = index;
    select.togglePropertyControl(EnumPropName.Active, true);
    selectNode.active = value;
    select.setDefaultProp(EnumPropName.Active);
}

describe("StateController 回收站", () => {
    it("listDeletedStates 列出软删暂存项", () => {
        const { ctrl } = setup();
        ctrl.states = [...ctrl.states, StateValue.create("3", 2)];

        expect((ctrl as any).listDeletedStates()).toEqual([]);

        ctrl.selectedIndex = 1;
        const deletedId = ctrl.states[1].stateId;
        ctrl.deleteCurrentState = true;

        const bin = (ctrl as any).listDeletedStates();
        expect(bin.length).toBe(1);
        expect(bin[0].stateId).toBe(deletedId);
    });

    it("restoreDeletedState 按 stateId 恢复任意项, 数据接回", () => {
        const { ctrl, select, selectNode } = setup();
        ctrl.states = [...ctrl.states, StateValue.create("3", 2)];

        recordActive(ctrl, select, selectNode, 1, false);
        recordActive(ctrl, select, selectNode, 2, true);

        // 删 index 2 再删 index 1 → 回收站有两项 [id2, id1]
        const id2 = ctrl.states[2].stateId;
        const id1 = ctrl.states[1].stateId;
        ctrl.selectedIndex = 2;
        ctrl.deleteCurrentState = true;
        ctrl.selectedIndex = 1;
        ctrl.deleteCurrentState = true;
        expect((ctrl as any).listDeletedStates().length).toBe(2);

        // 恢复较早删的 id2 (不是最后一个), 验证可按 id 精确恢复
        expect((ctrl as any).restoreDeletedState(id2)).toBe(true);
        expect(ctrl.states[ctrl.states.length - 1].stateId).toBe(id2);
        expect((ctrl as any).listDeletedStates().length).toBe(1);
        // 数据接回: 切到恢复的 state, active 应为录制时的 true
        ctrl.selectedIndex = ctrl.states.length - 1;
        expect(selectNode.active).toBe(true);

        // id1 仍在回收站
        expect((ctrl as any).listDeletedStates()[0].stateId).toBe(id1);
    });

    it("purgeDeletedState 硬删: 出回收站 + 清掉 _ctrlData[stateId]", () => {
        const { ctrl, select, selectNode } = setup();
        ctrl.states = [...ctrl.states, StateValue.create("3", 2)];

        recordActive(ctrl, select, selectNode, 2, true);
        const id2 = ctrl.states[2].stateId;

        ctrl.selectedIndex = 2;
        ctrl.deleteCurrentState = true;

        const pageData = (select as any)._ctrlData[ctrl.ctrlId];
        // 软删后页数据仍在
        expect(pageData[id2]).toBeDefined();

        expect((ctrl as any).purgeDeletedState(id2)).toBe(true);
        // 出回收站
        expect((ctrl as any).listDeletedStates()).toEqual([]);
        // 页数据被清
        expect(pageData[id2]).toBeUndefined();
        // 不影响其它 state
        expect(pageData.$$default$$).toBeDefined();
    });

    it("硬删后恢复同 stateId, 数据不复活", () => {
        const { ctrl, select, selectNode } = setup();
        ctrl.states = [...ctrl.states, StateValue.create("3", 2)];

        recordActive(ctrl, select, selectNode, 2, true);
        const id2 = ctrl.states[2].stateId;
        ctrl.selectedIndex = 2;
        ctrl.deleteCurrentState = true;

        // 硬删
        (ctrl as any).purgeDeletedState(id2);
        // 已不在回收站, 无法再恢复
        expect((ctrl as any).restoreDeletedState(id2)).toBe(false);
        const pageData = (select as any)._ctrlData[ctrl.ctrlId];
        expect(pageData[id2]).toBeUndefined();
    });

    it("purgeAllDeletedStates 清空: 全部硬删", () => {
        const { ctrl, select, selectNode } = setup();
        ctrl.states = [...ctrl.states, StateValue.create("3", 2)];

        recordActive(ctrl, select, selectNode, 1, false);
        recordActive(ctrl, select, selectNode, 2, true);
        const id1 = ctrl.states[1].stateId;
        const id2 = ctrl.states[2].stateId;

        ctrl.selectedIndex = 2;
        ctrl.deleteCurrentState = true;
        ctrl.selectedIndex = 1;
        ctrl.deleteCurrentState = true;
        expect((ctrl as any).listDeletedStates().length).toBe(2);

        expect((ctrl as any).purgeAllDeletedStates()).toBe(true);
        expect((ctrl as any).listDeletedStates()).toEqual([]);

        const pageData = (select as any)._ctrlData[ctrl.ctrlId];
        expect(pageData[id1]).toBeUndefined();
        expect(pageData[id2]).toBeUndefined();
    });

    it("空回收站时各操作安全返回 false", () => {
        const { ctrl } = setup();
        expect((ctrl as any).restoreDeletedState(999)).toBe(false);
        expect((ctrl as any).purgeDeletedState(999)).toBe(false);
        expect((ctrl as any).purgeAllDeletedStates()).toBe(false);
        expect((ctrl as any).restoreLastDeletedState()).toBe(false);
    });
});

describe("StateController 回收站 inspector 折叠组", () => {
    it("getDeletedStatesDisplay + 折叠组 deletedList 代理", () => {
        const { ctrl } = setup();
        ctrl.states = [...ctrl.states, StateValue.create("3", 2)];
        ctrl.selectedIndex = 2;
        ctrl.deleteCurrentState = true;

        expect((ctrl as any).getDeletedStatesDisplay()).toEqual(["3 (id 2)"]);
        // 折叠组只读列表 facade 代理到 owner
        expect((ctrl as any).recycleBin.deletedList).toEqual(["3 (id 2)"]);
        // owner 回引已接好
        expect((ctrl as any).recycleBin.owner).toBe(ctrl);
    });

    it("折叠组 restoreTarget 下拉 (value=1) 恢复第一个选项", () => {
        const { ctrl } = setup();
        ctrl.states = [...ctrl.states, StateValue.create("3", 2)];
        ctrl.selectedIndex = 2;
        const id = ctrl.states[2].stateId;
        ctrl.deleteCurrentState = true;
        expect((ctrl as any).listDeletedStates().length).toBe(1);

        // 经折叠组下拉 setter 触发 (value=1 = 第一个真实选项, value=0 是 sentinel)
        (ctrl as any).recycleBin.restoreTarget = 1;
        expect((ctrl as any).listDeletedStates()).toEqual([]);
        expect(ctrl.states[ctrl.states.length - 1].stateId).toBe(id);
    });

    it("彻底删除下拉需确认: 取消(默认)不删, 确认则硬删", () => {
        const { ctrl, select, selectNode } = setup();
        ctrl.states = [...ctrl.states, StateValue.create("3", 2)];
        recordActive(ctrl, select, selectNode, 2, true);
        const id = ctrl.states[2].stateId;
        ctrl.selectedIndex = 2;
        ctrl.deleteCurrentState = true;
        const pageData = (select as any)._ctrlData[ctrl.ctrlId];
        expect(pageData[id]).toBeDefined();

        // 无 Editor.Dialog + jsdom → showDialog 回 defaultId=1 (取消), 不删
        (ctrl as any).recyclePurgePick(1);
        expect(pageData[id]).toBeDefined();
        expect((ctrl as any).listDeletedStates().length).toBe(1);

        // 注入确认 (idx=0) → 硬删
        const prevEditor = (globalThis as any).Editor;
        (globalThis as any).Editor = Object.assign({}, prevEditor, {
            Dialog: { messageBox: (_opts: any, cb: any) => { if (cb) cb(0); return 0; } },
        });
        try {
            (ctrl as any).recyclePurgePick(1);
        }
        finally {
            (globalThis as any).Editor = prevEditor;
        }
        expect(pageData[id]).toBeUndefined();
        expect((ctrl as any).listDeletedStates()).toEqual([]);
    });

    it("折叠组 previewTarget 下拉进入预览 + 退出预览按钮", () => {
        const { ctrl, select, selectNode } = setup();
        ctrl.states = [...ctrl.states, StateValue.create("3", 2)];
        recordActive(ctrl, select, selectNode, 0, false);
        recordActive(ctrl, select, selectNode, 2, true);
        ctrl.selectedIndex = 2;
        const id2 = ctrl.states[2].stateId;
        ctrl.deleteCurrentState = true;
        ctrl.selectedIndex = 0;
        expect(selectNode.active).toBe(false);

        // 经折叠组 previewTarget 下拉 (value=1) 进入预览
        (ctrl as any).recycleBin.previewTarget = 1;
        expect((ctrl as any).isPreviewing).toBe(true);
        expect((ctrl as any).previewingStateId).toBe(id2);
        expect(selectNode.active).toBe(true);          // 预览叠加
        expect(ctrl.selectedIndex).toBe(0);            // 不改激活态
        // 折叠组退出按钮 getter 反映预览态
        expect((ctrl as any).recycleBin.exitPreviewTrigger).toBe(true);

        // 经折叠组退出按钮 setter 退出
        (ctrl as any).recycleBin.exitPreviewTrigger = true;
        expect((ctrl as any).isPreviewing).toBe(false);
        expect(selectNode.active).toBe(false);         // 快照还原
    });

    it("refreshRecycleBinEnums 注入下拉 enumList + 反查表", () => {
        const ccLocal = (globalThis as any).cc;
        const { ctrl } = setup();
        ctrl.states = [...ctrl.states, StateValue.create("3", 2)];
        ctrl.selectedIndex = 2;
        const id = ctrl.states[2].stateId;
        ctrl.deleteCurrentState = true;

        // 反查表已就绪: value=1 → 被删 stateId
        expect((ctrl as any)._recycleBinOptionIds).toEqual([id]);
        // enumList 注入到 CtrlRecycleBinGroup 类上 (sentinel + 1 项)
        const GroupsMod = require("../../assets/script/controller/props/CtrlInspectorGroups");
        const attrs = ccLocal.Class.Attr.getClassAttrs(GroupsMod.CtrlRecycleBinGroup);
        const restoreEnum = attrs["restoreTarget$_$enumList"];
        expect(Array.isArray(restoreEnum)).toBe(true);
        expect(restoreEnum[0].value).toBe(0);
        expect(restoreEnum[1]).toEqual({ name: "3 (id 2)", value: 1 });
    });
});

describe("StateController 回收态只读预览", () => {
    // 删一个录过数据的 state 入回收站, 回到 state0, 返回被删 stateId
    function setupWithBin() {
        const ctx = setup();
        const { ctrl, select, selectNode } = ctx;
        ctrl.states = [...ctrl.states, StateValue.create("3", 2)];
        recordActive(ctrl, select, selectNode, 0, false);   // state0 active=false
        recordActive(ctrl, select, selectNode, 2, true);    // state2 active=true
        ctrl.selectedIndex = 2;
        const binId = ctrl.states[2].stateId;
        ctrl.deleteCurrentState = true;                     // 删 state2 → 回收站
        ctrl.selectedIndex = 0;                             // 明确回到 state0 (active=false)
        return { ...ctx, binId };
    }

    it("预览叠加到节点显示, 不改 selectedIndex; 退出按快照精确还原", () => {
        const { ctrl, selectNode, binId } = setupWithBin();
        expect(selectNode.active).toBe(false);
        const selBefore = ctrl.selectedIndex;

        expect((ctrl as any).previewDeletedState(binId)).toBe(true);
        expect((ctrl as any).isPreviewing).toBe(true);
        expect((ctrl as any).previewingStateId).toBe(binId);
        expect(ctrl.selectedIndex).toBe(selBefore);   // 激活态不变
        expect(selectNode.active).toBe(true);         // 回收态叠加显示
        expect((ctrl as any).exitPreview()).toBe(true);
        expect((ctrl as any).isPreviewing).toBe(false);
        expect(selectNode.active).toBe(false);        // 还原回 state0
    });

    it("切换激活态自动退出预览", () => {
        const { ctrl, binId } = setupWithBin();
        (ctrl as any).previewDeletedState(binId);
        expect((ctrl as any).isPreviewing).toBe(true);

        ctrl.selectedIndex = 1;   // 切到别的激活态
        expect((ctrl as any).isPreviewing).toBe(false);
        expect((ctrl as any).previewingStateId).toBe(-1);
    });

    it("预览另一个回收态: 先按快照还原上一个再叠加新的 (单实例)", () => {
        const { ctrl, select, selectNode } = setup();
        ctrl.states = [...ctrl.states, StateValue.create("3", 2), StateValue.create("4", 3)];
        recordActive(ctrl, select, selectNode, 0, false);
        recordActive(ctrl, select, selectNode, 2, true);
        recordActive(ctrl, select, selectNode, 3, false);
        // 删 state3(false) 和 state2(true) 入回收站
        const id3 = ctrl.states[3].stateId;
        const id2 = ctrl.states[2].stateId;
        ctrl.selectedIndex = 3; ctrl.deleteCurrentState = true;
        ctrl.selectedIndex = 2; ctrl.deleteCurrentState = true;
        ctrl.selectedIndex = 0;
        expect(selectNode.active).toBe(false);

        (ctrl as any).previewDeletedState(id2);   // true
        expect(selectNode.active).toBe(true);
        (ctrl as any).previewDeletedState(id3);   // 切预览 → 先还原(回false)再叠加 id3(false)
        expect((ctrl as any).previewingStateId).toBe(id3);
        expect(selectNode.active).toBe(false);
        (ctrl as any).exitPreview();
        expect(selectNode.active).toBe(false);
    });

    it("硬删正在预览的回收态: 先退出预览(还原)再清数据", () => {
        const { ctrl, select, selectNode, binId } = setupWithBin();
        (ctrl as any).previewDeletedState(binId);
        expect(selectNode.active).toBe(true);

        (ctrl as any).purgeDeletedState(binId);
        expect((ctrl as any).isPreviewing).toBe(false);
        expect(selectNode.active).toBe(false);                       // 已还原
        const pageData = (select as any)._ctrlData[ctrl.ctrlId];
        expect(pageData[binId]).toBeUndefined();                     // 数据已硬删
    });

    it("守卫: 不在回收站的 stateId → false; 空回收站 → false", () => {
        const { ctrl, binId } = setupWithBin();
        expect((ctrl as any).previewDeletedState(99999)).toBe(false);
        expect((ctrl as any).isPreviewing).toBe(false);
        // 在回收站的可以
        expect((ctrl as any).previewDeletedState(binId)).toBe(true);
        // 重复预览同一个 → true (no-op)
        expect((ctrl as any).previewDeletedState(binId)).toBe(true);
        (ctrl as any).exitPreview();
        // 未预览时退出 → false
        expect((ctrl as any).exitPreview()).toBe(false);
    });
});
