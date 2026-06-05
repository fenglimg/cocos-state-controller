import { EnumStateName } from "../StateEnumV2";
import type { StateControllerV2 } from "../StateControllerV2";

const { ccclass, property } = cc._decorator;

// 本文件早于 StateControllerV2 内的 cc.Enum(EnumStateName) 被 import,
// 这里先注册一次 (idempotent), 保证回收站下拉的 @property type 能解析到枚举。
cc.Enum(EnumStateName);

/**
 * StateControllerV2「状态操作」分组 — inspector 可折叠区域.
 *
 * 设计同 StateNodeProps: 自身不持状态, 仅作 inspector 视图 facade, getter/setter
 * 全部代理到 owner (StateControllerV2) 的同名访问器 (真实逻辑仍在 controller 上,
 * 测试 / 代码可继续走 ctrl.moveStateUp 老路径). owner 在 __preload 中注入.
 */
@ccclass("CtrlStateOpsGroup")
export class CtrlStateOpsGroup {
    public owner: StateControllerV2 = null;

    @property({ displayName: "状态上移", tooltip: "将当前选中的状态上移一位" })
    public get moveStateUp() {
        return false;
    }

    public set moveStateUp(v: boolean) {
        if (this.owner) this.owner.moveStateUp = v;
    }

    @property({ displayName: "状态下移", tooltip: "将当前选中的状态下移一位" })
    public get moveStateDown() {
        return false;
    }

    public set moveStateDown(v: boolean) {
        if (this.owner) this.owner.moveStateDown = v;
    }

    @property({ displayName: "复制当前状态", tooltip: "以当前状态为模板复制并插入到下一位" })
    public get duplicateCurrentState() {
        return false;
    }

    public set duplicateCurrentState(v: boolean) {
        if (this.owner) this.owner.duplicateCurrentState = v;
    }

    @property({ displayName: "删除当前状态", tooltip: "删除当前选中的状态并自动选择相邻状态" })
    public get deleteCurrentState() {
        return false;
    }

    public set deleteCurrentState(v: boolean) {
        if (this.owner) this.owner.deleteCurrentState = v;
    }
}

/**
 * StateControllerV2「回收站」分组 — inspector 可折叠区域.
 *
 * 让"软删 → 恢复 / 彻底删除"在 inspector 内闭环 (无需插件面板). facade 同 SelectExcludeGroup:
 *  - deletedList 只读展示回收站内容 (name + id)。
 *  - restoreTarget / purgeTarget 下拉的动态 enumList 由 owner.refreshRecycleBinEnums 注入到本组类上;
 *    getter 恒返 0 (sentinel "选一个…"), 选项 value 从 1 起, 选中即触发动作并自动回到 sentinel。
 *  - purgeTarget / purgeAll 是硬删 (不可恢复), 经 owner.showDialog 弹窗二次确认。
 */
@ccclass("CtrlRecycleBinGroup")
export class CtrlRecycleBinGroup {
    public owner: StateControllerV2 = null;

    @property({ type: [cc.String], readonly: true, displayName: "回收站内容", tooltip: "已移除的状态 (软删, 数据保留)。下方可恢复或彻底删除" })
    public get deletedList(): string[] {
        return this.owner ? this.owner.getDeletedStatesDisplay() : [];
    }

    @property({ type: EnumStateName, displayName: "↩ 恢复状态", tooltip: "选择要恢复的状态, 追加到状态列表尾部 (具体数据自动接回)" })
    public get restoreTarget(): number {
        return 0;
    }

    public set restoreTarget(v: number) {
        if (this.owner) this.owner.recycleRestorePick(v);
    }

    @property({ type: EnumStateName, displayName: "🗑 彻底删除", tooltip: "选择要彻底删除的状态 (清空其数据, 不可恢复)" })
    public get purgeTarget(): number {
        return 0;
    }

    public set purgeTarget(v: number) {
        if (this.owner) this.owner.recyclePurgePick(v);
    }

    @property({ type: EnumStateName, displayName: "👁 预览", tooltip: "选择一个回收态只读预览 (叠加到节点, 不改当前选中)。改选中/录制会自动退出预览" })
    public get previewTarget(): number {
        return 0;
    }

    public set previewTarget(v: number) {
        if (this.owner) this.owner.recyclePreviewPick(v);
    }

    @property({ displayName: "⏹ 退出预览", tooltip: "退出回收态预览, 按快照把节点精确还原到预览前" })
    public get exitPreviewTrigger(): boolean {
        return this.owner ? this.owner.isPreviewing : false;
    }

    public set exitPreviewTrigger(_v: boolean) {
        if (this.owner) this.owner.recycleExitPreview();
    }

    @property({ displayName: "清空回收站", tooltip: "彻底删除回收站内全部状态数据, 不可恢复" })
    public get purgeAll(): boolean {
        return false;
    }

    public set purgeAll(v: boolean) {
        if (this.owner && v) this.owner.recyclePurgeAll();
    }
}

/**
 * StateControllerV2「录制」分组 — inspector 可折叠区域.
 * recordTrigger 镜像 owner.isRecording (经 owner.recordTrigger getter), 点击 toggle 起停.
 */
@ccclass("CtrlRecordGroup")
export class CtrlRecordGroup {
    public owner: StateControllerV2 = null;

    @property({ displayName: "🔴 录制", tooltip: "进入/退出录制模式. 录制中, 节点改动自动写入当前 state. 要回退整次录制用编辑器 Ctrl+Z" })
    public get recordTrigger() {
        return this.owner ? this.owner.recordTrigger : false;
    }

    public set recordTrigger(v: boolean) {
        if (this.owner) this.owner.recordTrigger = v;
    }
}
