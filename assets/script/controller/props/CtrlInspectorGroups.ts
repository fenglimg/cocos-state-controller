import { StateController } from "../StateController";

const { ccclass, property } = cc._decorator;

/**
 * StateController「状态操作」分组 — inspector 可折叠区域.
 *
 * 设计同 StateNodeProps: 自身不持状态, 仅作 inspector 视图 facade, getter/setter
 * 全部代理到 owner (StateController) 的同名访问器 (真实逻辑仍在 controller 上,
 * 测试 / 代码可继续走 ctrl.moveStateUp 老路径). owner 在 __preload 中注入.
 */
@ccclass("CtrlStateOpsGroup")
export class CtrlStateOpsGroup {
    public owner: StateController = null;

    @property({ displayName: "状态上移", tooltip: "将当前选中的状态上移一位" })
    public get moveStateUp() { return false; }
    public set moveStateUp(v: boolean) { if (this.owner) this.owner.moveStateUp = v; }

    @property({ displayName: "状态下移", tooltip: "将当前选中的状态下移一位" })
    public get moveStateDown() { return false; }
    public set moveStateDown(v: boolean) { if (this.owner) this.owner.moveStateDown = v; }

    @property({ displayName: "复制当前状态", tooltip: "以当前状态为模板复制并插入到下一位" })
    public get duplicateCurrentState() { return false; }
    public set duplicateCurrentState(v: boolean) { if (this.owner) this.owner.duplicateCurrentState = v; }

    @property({ displayName: "删除当前状态", tooltip: "删除当前选中的状态并自动选择相邻状态" })
    public get deleteCurrentState() { return false; }
    public set deleteCurrentState(v: boolean) { if (this.owner) this.owner.deleteCurrentState = v; }
}

/**
 * StateController「录制」分组 — inspector 可折叠区域.
 * recordTrigger 镜像 owner.isRecording (经 owner.recordTrigger getter), 点击 toggle 起停.
 */
@ccclass("CtrlRecordGroup")
export class CtrlRecordGroup {
    public owner: StateController = null;

    @property({ displayName: "🔴 录制", tooltip: "进入/退出录制模式. 录制中, 节点改动自动写入当前 state. 要回退整次录制用编辑器 Ctrl+Z" })
    public get recordTrigger() { return this.owner ? this.owner.recordTrigger : false; }
    public set recordTrigger(v: boolean) { if (this.owner) this.owner.recordTrigger = v; }
}
