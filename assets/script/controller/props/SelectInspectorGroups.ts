import { EnumExcludeSlot } from "../StateEnum";
import { StateSelect } from "../StateSelect";

const { ccclass, property } = cc._decorator;

// 本文件被 StateSelect import 的时机早于 StateSelect 内的 cc.Enum(EnumExcludeSlot),
// 这里先注册一次 (idempotent), 保证 addExcludeTrigger 的 @property type 能解析到枚举.
cc.Enum(EnumExcludeSlot);

/**
 * StateSelect「排除管理」分组 — inspector 可折叠区域.
 *
 * facade 同 StateNodeProps: getter/setter 代理到 owner. 注意:
 *  - excludedPropsDisplay getter 内含 reconcile 副作用 (owner 侧), inspector 渲染时触发.
 *  - userExcludedProps 代理同一份 owner._userExcludedProps 数组引用 (序列化字段仍在 owner 上,
 *    不挪路径), cocos 数组 +/- 走 setter 回写 owner.
 *  - addExcludeTrigger 的动态 enumList 由 owner.refreshExcludeEnumLists 注入到本组类上.
 */
@ccclass("SelectExcludeGroup")
export class SelectExcludeGroup {
    public owner: StateSelect = null;

    @property({ displayName: "排除跟随", tooltip: "当前被排除的 prop 列表 (系统 + 用户). 系统部分不可恢复.", readonly: true })
    public get excludedPropsDisplay(): string[] {
        return this.owner ? this.owner.excludedPropsDisplay : [];
    }

    @property({ type: EnumExcludeSlot, displayName: "+ 添加排除", tooltip: "从当前跟随中选一个 prop 加入排除清单 (用 cocos 数组 - 按钮恢复跟随)" })
    public get addExcludeTrigger(): number { return 0; }
    public set addExcludeTrigger(v: number) { if (this.owner) this.owner.addExcludeTrigger = v; }

    @property({
        type: [cc.String],
        displayName: "用户排除清单",
        tooltip: "用户手动排除的 prop 列表 (除 SYSTEM_EXCLUDE 外). 用 +/- 按钮增删数组项 (不要直接编辑文本: 加项请走 '+ 添加排除' 下拉). 删项 = 重新跟随.",
        readonly: true,
    })
    public get userExcludedProps(): string[] {
        return this.owner ? this.owner._userExcludedProps : [];
    }
    public set userExcludedProps(v: string[]) {
        if (this.owner) this.owner._userExcludedProps = v;
    }
}

/**
 * StateSelect「录制」分组 — inspector 可折叠区域.
 * 镜像 currCtrl.isRecording, 与 StateController 录制态共享 (经 owner.recordTrigger getter/setter).
 */
@ccclass("SelectRecordGroup")
export class SelectRecordGroup {
    public owner: StateSelect = null;

    @property({ displayName: "🔴 录制", tooltip: "进入/退出录制模式. 录制中, 节点改动自动写入当前 state. 要回退整次录制用编辑器 Ctrl+Z" })
    public get recordTrigger() { return this.owner ? this.owner.recordTrigger : false; }
    public set recordTrigger(v: boolean) { if (this.owner) this.owner.recordTrigger = v; }
}

/**
 * StateSelect「值搬运」分组 — inspector 可折叠区域.
 * 节点级局部操作: 当前 state ↔ 下一 state 的值数据 (不改 state 数量 / 选中).
 */
@ccclass("SelectValueOpsGroup")
export class SelectValueOpsGroup {
    public owner: StateSelect = null;

    @property({ displayName: "⇄ 与下一 state 交换值", tooltip: "把本节点当前 state 的值数据与下一 state 互换 (仅本节点, 不改 state 数量/选中)" })
    public get swapValueWithNext(): boolean { return false; }
    public set swapValueWithNext(v: boolean) { if (this.owner) this.owner.swapValueWithNext = v; }

    @property({ displayName: "⎘ 复制值到下一 state", tooltip: "把本节点当前 state 的值数据深拷到下一 state (仅本节点, 不改 state 数量/选中)" })
    public get copyValueToNext(): boolean { return false; }
    public set copyValueToNext(v: boolean) { if (this.owner) this.owner.copyValueToNext = v; }
}
