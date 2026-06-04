/**
 * MultiCtrlBindingCapability (Wave 5 T02).
 *
 * 声明式跨 ctrl 状态联动: ctrlA 切到 stateId X → ctrlB 自动切到 stateId Y.
 *
 *   addBinding(sourceCtrl, sourceStateId, targetCtrl, targetStateId) → boolean
 *   removeBinding(sourceCtrl, sourceStateId, targetCtrl) → boolean
 *   listBindings(sourceCtrl) → [{sourceStateId, targetCtrl, targetStateId}]
 *   clearAllBindings(sourceCtrl)
 *
 * 内部用 EventCapability.on 监听 source 切换, 命中 sourceStateId 后走
 * SelectedPageIdCapability.setStateById 切 target.
 *
 * 重要约束:
 *  - 同 (source, sourceStateId, target) 重复 add 覆盖
 *  - 循环防护: 当 binding 正在 dispatch, 嵌套触发的子 binding 跳过 (一帧只允许 1 跳传播深度).
 *    A → B → A 不会死循环.
 *  - clearAllBindings 解 EventCapability listener, 避免 listener 泄漏
 *
 * 数据存储: 进程级 Map<sourceCtrl, Map<sourceStateId, Map<targetCtrl, {targetStateId, listenerHandle}>>>.
 * sourceCtrl / targetCtrl 用 WeakMap 持有避免泄漏. (内层 Map 用普通 Map 因 key 是 number/object 混合.)
 */

import { CapabilityRegistry } from "../CapabilityRegistry";
import { ICapability } from "../Capability";
import { StateErrorManagerV2 } from "../StateErrorManagerV2";
import { EventCapability, StateChangedPayload } from "./EventCapability";
import { SelectedPageIdCapability } from "./SelectedPageIdCapability";

interface BindingEntry {
    targetStateId: number;
    target: object;
}

interface SourceListener {
    /** sourceStateId → list of bindings */
    byState: Map<number, BindingEntry[]>;
    /** EventCapability 注册的回调引用 (用于卸载) */
    listener: (payload: StateChangedPayload) => void;
}

const sourceMap: WeakMap<object, SourceListener> = new WeakMap();

/** 循环防护: 当正在 dispatch binding, 后续切换不再触发 binding. 单帧 boolean 即可. */
let dispatching = false;

function ensureSourceListener(sourceCtrl: any): SourceListener {
    let entry = sourceMap.get(sourceCtrl);
    if (entry) return entry;

    const byState = new Map<number, BindingEntry[]>();

    const listener: (payload: StateChangedPayload) => void = function (payload) {
        if (dispatching) return;
        const sId = SelectedPageIdCapability.getSelectedStateId(payload.ctrl);
        const bindings = byState.get(sId);
        if (!bindings || bindings.length === 0) return;

        dispatching = true;
        try {
            for (let i = 0; i < bindings.length; i++) {
                const b = bindings[i];
                try {
                    SelectedPageIdCapability.setStateById(b.target, b.targetStateId);
                }
                catch (e) {
                    StateErrorManagerV2.warn("MultiCtrlBinding setStateById 异常", {
                        component: "MultiCtrlBindingCapability",
                        method: "dispatch",
                        params: { error: (e as Error).message, targetStateId: b.targetStateId },
                    });
                }
            }
        }
        finally {
            dispatching = false;
        }
    };

    entry = { byState, listener };
    sourceMap.set(sourceCtrl, entry);
    EventCapability.on(sourceCtrl, "stateChanged", listener);
    return entry;
}

export interface BindingDescriptor {
    sourceStateId: number;
    targetCtrl: any;
    targetStateId: number;
}

export const MultiCtrlBindingCapability: ICapability & {
    addBinding: (source: any, sourceStateId: number, target: any, targetStateId: number) => boolean,
    removeBinding: (source: any, sourceStateId: number, target: any) => boolean,
    listBindings: (source: any) => BindingDescriptor[],
    clearAllBindings: (source: any) => void,
} = {
    name: "multiCtrlBinding",
    dependsOn: ["event", "selectedPageId"],

    addBinding(source: any, sourceStateId: number, target: any, targetStateId: number): boolean {
        if (!source || !target) return false;
        if (typeof sourceStateId !== "number" || typeof targetStateId !== "number") return false;

        const entry = ensureSourceListener(source);
        let bindings = entry.byState.get(sourceStateId);
        if (!bindings) {
            bindings = [];
            entry.byState.set(sourceStateId, bindings);
        }
        // 覆盖同 target 的旧 binding
        const existIdx = bindings.findIndex(b => b.target === target);
        if (existIdx >= 0) {
            bindings[existIdx] = { targetStateId, target };
        }
        else {
            bindings.push({ targetStateId, target });
        }
        return true;
    },

    removeBinding(source: any, sourceStateId: number, target: any): boolean {
        if (!source || !target) return false;
        const entry = sourceMap.get(source);
        if (!entry) return false;
        const bindings = entry.byState.get(sourceStateId);
        if (!bindings) return false;
        const idx = bindings.findIndex(b => b.target === target);
        if (idx < 0) return false;
        bindings.splice(idx, 1);
        if (bindings.length === 0) entry.byState.delete(sourceStateId);
        return true;
    },

    listBindings(source: any): BindingDescriptor[] {
        if (!source) return [];
        const entry = sourceMap.get(source);
        if (!entry) return [];
        const out: BindingDescriptor[] = [];
        entry.byState.forEach((bindings, sId) => {
            bindings.forEach(b => {
                out.push({ sourceStateId: sId, targetCtrl: b.target, targetStateId: b.targetStateId });
            });
        });
        return out;
    },

    clearAllBindings(source: any): void {
        if (!source) return;
        const entry = sourceMap.get(source);
        if (!entry) return;
        EventCapability.off(source, "stateChanged", entry.listener);
        sourceMap.delete(source);
    },
};

CapabilityRegistry.register(MultiCtrlBindingCapability);
