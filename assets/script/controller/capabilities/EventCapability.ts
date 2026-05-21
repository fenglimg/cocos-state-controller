/**
 * EventCapability (Wave 3 T02).
 *
 * runtime 事件订阅 capability. 让代码通过 capability 接口订阅 controller 的 state 切换:
 *
 *   EventCapability.on(ctrl, "stateChanged", cb)
 *   EventCapability.off(ctrl, "stateChanged", cb)
 *   EventCapability.once(ctrl, "stateChanged", cb)
 *
 * payload: { ctrl, fromState, toState, fromName, toName }
 *
 * 实装路径:
 *   - StateController.selectedIndex.setter 已 dispatch("onStateChanged", ...)
 *   - EventCapability.onStateChanged hook 在被 dispatch 时, 查 ctrl-local listener Map 并 fanout
 *   - listener 存在 WeakMap<ctrl, Map<eventName, Set<cb>>>
 *
 * 命名空间: 不写 ctrlData (运行期 listener 不持久化), 仅内存里维持订阅表.
 *
 * 内存安全: 提供 clear(ctrl) 供 ctrl.onDestroy 调用; 用 WeakMap 保证 ctrl GC 后自动释放.
 */

import { CapabilityRegistry } from "../CapabilityRegistry";
import { CapabilityContext, ICapability } from "../Capability";
import { StateErrorManager } from "../StateErrorManager";

export type EventName = "stateChanged";

export interface StateChangedPayload {
    ctrl: any;
    fromState: number;
    toState: number;
    fromName: string | null;
    toName: string | null;
}

type Listener = (payload: StateChangedPayload) => void;

const listenerMap: WeakMap<object, Map<EventName, Listener[]>> = new WeakMap();
const onceFlag: WeakSet<Listener> = new WeakSet();

function getOrInitListeners(ctrl: object, event: EventName): Listener[] {
    let perCtrl = listenerMap.get(ctrl);
    if (!perCtrl) {
        perCtrl = new Map();
        listenerMap.set(ctrl, perCtrl);
    }
    let arr = perCtrl.get(event);
    if (!arr) {
        arr = [];
        perCtrl.set(event, arr);
    }
    return arr;
}

function stateNameAt(ctrl: any, idx: number): string | null {
    const states = ctrl && ctrl._states;
    if (!states || idx < 0 || idx >= states.length) return null;
    const s = states[idx];
    return (s && s.name) ? s.name : null;
}

export const EventCapability: ICapability & {
    on: (ctrl: any, event: EventName, cb: Listener) => void,
    off: (ctrl: any, event: EventName, cb: Listener) => void,
    once: (ctrl: any, event: EventName, cb: Listener) => void,
    clear: (ctrl: any) => void,
    listenerCount: (ctrl: any, event: EventName) => number,
} = {
    name: "event",

    on(ctrl: any, event: EventName, cb: Listener): void {
        if (!ctrl || typeof cb !== "function") return;
        getOrInitListeners(ctrl, event).push(cb);
    },

    off(ctrl: any, event: EventName, cb: Listener): void {
        if (!ctrl) return;
        const perCtrl = listenerMap.get(ctrl);
        if (!perCtrl) return;
        const arr = perCtrl.get(event);
        if (!arr) return;
        const i = arr.indexOf(cb);
        if (i >= 0) arr.splice(i, 1);
    },

    once(ctrl: any, event: EventName, cb: Listener): void {
        if (!ctrl || typeof cb !== "function") return;
        const wrapper: Listener = (payload) => {
            EventCapability.off(ctrl, event, wrapper);
            cb(payload);
        };
        onceFlag.add(wrapper);
        getOrInitListeners(ctrl, event).push(wrapper);
    },

    clear(ctrl: any): void {
        if (!ctrl) return;
        listenerMap.delete(ctrl);
    },

    listenerCount(ctrl: any, event: EventName): number {
        const perCtrl = listenerMap.get(ctrl);
        if (!perCtrl) return 0;
        const arr = perCtrl.get(event);
        return arr ? arr.length : 0;
    },

    onStateChanged(ctx: CapabilityContext): void {
        const ctrl = ctx.ctrl;
        if (!ctrl) return;
        const perCtrl = listenerMap.get(ctrl);
        if (!perCtrl) return;
        const arr = perCtrl.get("stateChanged");
        if (!arr || arr.length === 0) return;

        const fromState = (ctx.fromState === undefined || ctx.fromState === null) ? -1 : ctx.fromState;
        const toState = (ctx.toState === undefined || ctx.toState === null) ? ctrl.selectedIndex : ctx.toState;
        const payload: StateChangedPayload = {
            ctrl,
            fromState,
            toState,
            fromName: stateNameAt(ctrl, fromState),
            toName: stateNameAt(ctrl, toState),
        };

        // 拷贝快照 避免 listener 内部 off 改动遍历中数组
        const snapshot = arr.slice();
        for (let i = 0; i < snapshot.length; i++) {
            const cb = snapshot[i];
            try {
                cb(payload);
            }
            catch (e) {
                StateErrorManager.warn("EventCapability listener 抛异常", {
                    component: "EventCapability",
                    method: "onStateChanged",
                    params: { error: (e as Error).message },
                });
            }
        }
    },
};

CapabilityRegistry.register(EventCapability);
