/**
 * RecordingCapability (Wave 2 T25).
 *
 * Topic 3 录制路径 (T03-T17) 已实装在 StateControllerV2 / StateSelectV2 内部.
 * 本 capability 不重复录制逻辑, 仅作为"录制能力的对外接口":
 *   - 暴露 isRecording(ctrl) 静态查询
 *   - 提供 onRecordingStart/Stop hook (默认空实现, 其它 capability 可监听录制态)
 *   - 注册到 CapabilityRegistry, 让 dispatch 走 capability 路径时, 录制态能广播给监听者
 *
 * 命名空间: Topic 3 数据 (snapshot, ctrlData diff) 都不写 namespace, 直接复用 ctrlData[state][prop].
 *   - snapshot 是 StateSelectV2 实例字段, 不需要 namespace
 *   - diff commit 写 propData[propType], 与 PropertyControl 同一份数据 (录制是"写入工具", 不是"独立存储")
 *
 * 后续扩展位 (Wave 3+):
 *   - 录制历史 (回放) - 需要 $$recording$$ namespace 存 timeline
 *   - 多片段录制 - 同上
 */

import { CapabilityRegistry } from "../CapabilityRegistry";
import { CapabilityContext, ICapability } from "../Capability";
import { StateErrorManagerV2 } from "../StateErrorManagerV2";

export const RecordingCapability: ICapability & {
    isRecording: (ctrl: any) => boolean,
} = {
    name: "recording",

    isRecording: (ctrl: any) => !!(ctrl && ctrl.isRecording),

    onRecordingStart(ctx: CapabilityContext): void {
        StateErrorManagerV2.debug("RecordingCapability.onRecordingStart", {
            component: "RecordingCapability",
            method: "onRecordingStart",
            params: { ctrlName: ctx.ctrl?.ctrlName },
        });
    },

    onRecordingStop(ctx: CapabilityContext): void {
        StateErrorManagerV2.debug("RecordingCapability.onRecordingStop", {
            component: "RecordingCapability",
            method: "onRecordingStop",
            params: { ctrlName: ctx.ctrl?.ctrlName },
        });
    },

    onStateWillChange(ctx: CapabilityContext): void {
        // 录制中切 state, Topic 3 的 StateSelectV2.onStateWillChange 已直接处理 diff commit,
        // 这里仅作 capability 路径上的 log, 让其它监听者 (如 timeline / undo) 知道发生.
        if (ctx.ctrl?.isRecording) {
            StateErrorManagerV2.debug("RecordingCapability.onStateWillChange (recording)", {
                component: "RecordingCapability",
                method: "onStateWillChange",
                params: { fromState: ctx.fromState },
            });
        }
    },

    onStateChanged(ctx: CapabilityContext): void {
        if (ctx.ctrl?.isRecording) {
            StateErrorManagerV2.debug("RecordingCapability.onStateChanged (recording)", {
                component: "RecordingCapability",
                method: "onStateChanged",
                params: { toState: ctx.ctrl.selectedIndex },
            });
        }
    },
};

CapabilityRegistry.register(RecordingCapability);
