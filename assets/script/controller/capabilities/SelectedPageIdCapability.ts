/**
 * SelectedPageIdCapability (Wave 3 T06).
 *
 * 用稳定的 stateId 切换 controller, 解决 ctrl.selectedIndex 在 reorder/delete 后下标飘移的问题.
 *
 *   SelectedPageIdCapability.setStateById(ctrl, stateId) → boolean
 *   SelectedPageIdCapability.getSelectedStateId(ctrl)    → 当前 state 的 stateId, 无效 -1
 *   SelectedPageIdCapability.getStateIdByName(ctrl, name) → stateId | -1
 *   SelectedPageIdCapability.listAllStates(ctrl) → [{stateId, name, index}]
 *
 * 不引入新的持久化字段; 全部从 _states[].stateId 派生.
 * 切换走标准 selectedIndex setter, 自动联动 EventCapability / RecordingCapability 等.
 *
 * 用途:
 *   - Panel 用 listAllStates 渲染 state 列表 + setStateById 切换
 *   - 业务代码用 setStateById("home") 等稳定 API, 不依赖临时 index
 */

import { CapabilityRegistry } from "../CapabilityRegistry";
import { ICapability } from "../Capability";

export interface StateInfo {
    index: number
    stateId: number
    name: string
}

function findIndexByStateId(ctrl: any, stateId: number): number {
    const states = ctrl && ctrl._states;
    if (!states) return -1;
    for (let i = 0; i < states.length; i++) {
        const s = states[i];
        if (s && s.stateId === stateId) return i;
    }
    return -1;
}

export const SelectedPageIdCapability: ICapability & {
    setStateById: (ctrl: any, stateId: number) => boolean
    getSelectedStateId: (ctrl: any) => number
    getStateIdByName: (ctrl: any, name: string) => number
    listAllStates: (ctrl: any) => StateInfo[]
} = {
    name: "selectedPageId",

    setStateById(ctrl: any, stateId: number): boolean {
        if (!ctrl) return false;
        const idx = findIndexByStateId(ctrl, stateId);
        if (idx < 0) return false;
        ctrl.selectedIndex = idx;
        return true;
    },

    getSelectedStateId(ctrl: any): number {
        if (!ctrl) return -1;
        const idx = ctrl.selectedIndex;
        const states = ctrl._states;
        if (!states || idx < 0 || idx >= states.length) return -1;
        const s = states[idx];
        return (s && typeof s.stateId === "number") ? s.stateId : -1;
    },

    getStateIdByName(ctrl: any, name: string): number {
        if (!ctrl) return -1;
        const states = ctrl._states;
        if (!states) return -1;
        for (let i = 0; i < states.length; i++) {
            const s = states[i];
            if (s && s.name === name) return s.stateId;
        }
        return -1;
    },

    listAllStates(ctrl: any): StateInfo[] {
        const out: StateInfo[] = [];
        if (!ctrl) return out;
        const states = ctrl._states;
        if (!states) return out;
        for (let i = 0; i < states.length; i++) {
            const s = states[i];
            if (!s) continue;
            out.push({ index: i, stateId: s.stateId, name: s.name });
        }
        return out;
    },
};

CapabilityRegistry.register(SelectedPageIdCapability);
