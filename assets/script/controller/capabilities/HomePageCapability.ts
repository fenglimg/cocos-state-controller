/**
 * HomePageCapability (Wave 3 T04).
 *
 * 让设计师在编辑器里把某个 state 标记为 "home", runtime 启动时自动跳到该 state.
 *
 *   HomePageCapability.setHomePage(ctrl, stateIdOrName | -1)  // -1 清除
 *   HomePageCapability.getHomePage(ctrl) → stateId | -1
 *   HomePageCapability.getHomePageIndex(ctrl) → 当前 _states[] 里 home 的下标, -1 表示无效/未设
 *
 * 数据持久化: 通过 StateController._homePageStateId @property(visible:false).
 * 用 stateId 而不是 index, 跨 reorder/delete 稳定.
 *
 * Runtime 自动 apply: 监听 onRuntimeInit hook (StateController.onLoad runtime path 触发),
 * 若 _homePageStateId 有效, ctrl.selectedIndex = 对应 index.
 *
 * 命名空间: 不写 ctrlData (homePage 是 ctrl 级别, 非 prop 级别). 数据在 ctrl 本体上.
 */

import { CapabilityRegistry } from "../CapabilityRegistry";
import { CapabilityContext, ICapability } from "../Capability";
import { StateErrorManager } from "../StateErrorManager";

function findStateById(ctrl: any, stateId: number): { index: number, stateId: number } | null {
    const states = ctrl && ctrl._states;
    if (!states) return null;
    for (let i = 0; i < states.length; i++) {
        const s = states[i];
        if (s && s.stateId === stateId) return { index: i, stateId };
    }
    return null;
}

function findStateByName(ctrl: any, name: string): { index: number, stateId: number } | null {
    const states = ctrl && ctrl._states;
    if (!states) return null;
    for (let i = 0; i < states.length; i++) {
        const s = states[i];
        if (s && s.name === name) return { index: i, stateId: s.stateId };
    }
    return null;
}

export const HomePageCapability: ICapability & {
    setHomePage: (ctrl: any, stateIdOrName: number | string) => void,
    getHomePage: (ctrl: any) => number,
    getHomePageIndex: (ctrl: any) => number,
} = {
    name: "homePage",

    setHomePage(ctrl: any, stateIdOrName: number | string): void {
        if (!ctrl) return;
        if (stateIdOrName === -1) {
            ctrl._homePageStateId = -1;
            return;
        }

        let found: { index: number, stateId: number } | null = null;
        if (typeof stateIdOrName === "number") {
            found = findStateById(ctrl, stateIdOrName);
        }
        else if (typeof stateIdOrName === "string") {
            found = findStateByName(ctrl, stateIdOrName);
        }

        if (!found) {
            StateErrorManager.warn("HomePageCapability.setHomePage: 找不到对应 state", {
                component: "HomePageCapability",
                method: "setHomePage",
                params: { stateIdOrName },
            });
            return;
        }
        ctrl._homePageStateId = found.stateId;
    },

    getHomePage(ctrl: any): number {
        if (!ctrl) return -1;
        const id = ctrl._homePageStateId;
        return (typeof id === "number") ? id : -1;
    },

    getHomePageIndex(ctrl: any): number {
        const id = HomePageCapability.getHomePage(ctrl);
        if (id === -1) return -1;
        const found = findStateById(ctrl, id);
        return found ? found.index : -1;
    },

    onRuntimeInit(ctx: CapabilityContext): void {
        const ctrl = ctx.ctrl;
        const idx = HomePageCapability.getHomePageIndex(ctrl);
        if (idx < 0) return;
        if (ctrl.selectedIndex === idx) return;
        try {
            ctrl.selectedIndex = idx;
        }
        catch (e) {
            StateErrorManager.warn("HomePageCapability.onRuntimeInit: selectedIndex 赋值异常", {
                component: "HomePageCapability",
                method: "onRuntimeInit",
                params: { error: (e as Error).message, homePageStateId: ctrl._homePageStateId, idx },
            });
        }
    },
};

CapabilityRegistry.register(HomePageCapability);
