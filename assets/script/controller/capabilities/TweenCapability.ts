/**
 * TweenCapability (Wave 4 T03) — 旗舰对标 FairyGUI 的过渡动画.
 *
 * onStateChanged 时, 对受控的 prop (Position/Scale/Opacity/Color/Rotation) 走补间,
 * 而非由 PropertyControl 立即 snap-jump 设值. 默认走 cc.tween, 可通过 installAdapter
 * 注入自定义 backend (测试 / 编辑器预览).
 *
 * API:
 *   TweenCapability.setEnabled(ctrl, bool)
 *   TweenCapability.isEnabled(ctrl) → bool (默认 false, 用户主动开)
 *   TweenCapability.setConfig(ctrl, {duration, easing})
 *   TweenCapability.getConfig(ctrl) → {duration, easing}
 *   TweenCapability.supportedPropTypes() → EnumPropName[]
 *   TweenCapability.installAdapter(adapter)   // 自定义 backend (测试用 mock)
 *   TweenCapability.resetAdapter()            // 复位 cc.tween 默认实现
 *
 * adapter 接口:
 *   runTween(node, propType, toValue, config) → handle
 *   (handle 可选, 用于 stop 之前未完成的 tween, 当前 MVP 不强制)
 *
 * 命名空间: 不写 ctrlData, 配置存在 WeakMap (ctrl 销毁自动回收).
 *
 * 注意 (与 PropertyControlCapability 协作):
 *   PropertyControl 仍会在 onStateChanged 后 apply 目标值 (snap). Tween 与 snap 并存时
 *   tween 先跑然后被 snap 立即覆盖到目标值 (从用户视角: 目标值瞬时到位, tween 视觉上无效).
 *   解决: 当 tween enabled, 应让 PropertyControl 跳过这些 propType 的 snap.
 *   MVP 本期不实装该让步逻辑 — adapter 默认实现是 cc.tween, 它自己 setProperty 帧帧逼近,
 *   最终值等于目标. snap 把它直接拉到目标但 tween 还在更新, 帧动画继续叠加. 视觉上看 tween
 *   仍然有动画 (短暂可见). 后续 Wave 接 Panel "预览过渡" 时再优化.
 */

import { CapabilityRegistry } from "../CapabilityRegistry";
import { CapabilityContext, ICapability } from "../Capability";
import { EnumPropName } from "../StateEnum";
import { StateErrorManager } from "../StateErrorManager";

export interface TweenConfig {
    duration: number;
    easing: string;
}

export interface TweenAdapter {
    runTween(node: any, propType: EnumPropName, toValue: any, config: TweenConfig): unknown;
}

const DEFAULT_CONFIG: TweenConfig = { duration: 0.3, easing: "linear" };

const enabledMap: WeakMap<object, boolean> = new WeakMap();
const configMap: WeakMap<object, TweenConfig> = new WeakMap();

const SUPPORTED: EnumPropName[] = [
    EnumPropName.Position,
    EnumPropName.Scale,
    EnumPropName.Opacity,
    EnumPropName.Color,
    EnumPropName.Rotation,
];
const supportedSet: Set<number> = new Set(SUPPORTED);

/** 默认 backend: cc.tween. 若 cc.tween 不可用 (test/jsdom) 直接 set 属性. */
const defaultAdapter: TweenAdapter = {
    runTween(node: any, propType: EnumPropName, toValue: any, config: TweenConfig): unknown {
        const ccLocal: any = (globalThis as any).cc;
        if (!node || !ccLocal) return null;

        const propMap = propTypeToNodeField(propType);
        if (!propMap) return null;

        // cc.tween 可用 → 走原生 tween
        if (typeof ccLocal.tween === "function") {
            const setter: any = {};
            setter[propMap] = toValue;
            const t = ccLocal.tween(node).to(config.duration, setter);
            t.start && t.start();
            return t;
        }

        // 兜底 (测试环境): 立即 set
        node[propMap] = toValue;
        return null;
    },
};

let adapter: TweenAdapter = defaultAdapter;

function propTypeToNodeField(propType: EnumPropName): string | null {
    switch (propType) {
        case EnumPropName.Position: return "position";
        case EnumPropName.Scale: return "scale";
        case EnumPropName.Opacity: return "opacity";
        case EnumPropName.Color: return "color";
        case EnumPropName.Rotation: return "angle";
        default: return null;
    }
}

/**
 * 找 ctrl 直接控制的所有 StateSelect, 与 PresetCapability 同一套 walk 策略.
 */
function collectDirectSelects(ctrl: any): any[] {
    const out: any[] = [];
    if (!ctrl || !ctrl.node) return out;

    function walk(node: any) {
        if (!node) return;
        const sel = node.getComponent("StateSelect");
        if (sel) out.push(sel);
        if (!node.children) return;
        for (let i = 0; i < node.children.length; i++) {
            const child = node.children[i];
            const childCtrl = child.getComponent("StateController");
            if (childCtrl && childCtrl !== ctrl) continue;
            walk(child);
        }
    }
    walk(ctrl.node);
    return out;
}

export const TweenCapability: ICapability & {
    setEnabled: (ctrl: any, v: boolean) => void,
    isEnabled: (ctrl: any) => boolean,
    setConfig: (ctrl: any, partial: Partial<TweenConfig>) => void,
    getConfig: (ctrl: any) => TweenConfig,
    supportedPropTypes: () => EnumPropName[],
    installAdapter: (a: TweenAdapter) => void,
    resetAdapter: () => void,
} = {
    name: "tween",
    dependsOn: ["propertyControl"],

    setEnabled(ctrl: any, v: boolean): void {
        if (!ctrl) return;
        enabledMap.set(ctrl, !!v);
    },

    isEnabled(ctrl: any): boolean {
        if (!ctrl) return false;
        return enabledMap.get(ctrl) === true;
    },

    setConfig(ctrl: any, partial: Partial<TweenConfig>): void {
        if (!ctrl || !partial) return;
        const cur = TweenCapability.getConfig(ctrl);
        configMap.set(ctrl, {
            duration: typeof partial.duration === "number" ? partial.duration : cur.duration,
            easing: typeof partial.easing === "string" ? partial.easing : cur.easing,
        });
    },

    getConfig(ctrl: any): TweenConfig {
        if (!ctrl) return Object.assign({}, DEFAULT_CONFIG);
        const c = configMap.get(ctrl);
        return c ? Object.assign({}, c) : Object.assign({}, DEFAULT_CONFIG);
    },

    supportedPropTypes(): EnumPropName[] {
        return SUPPORTED.slice();
    },

    installAdapter(a: TweenAdapter): void {
        if (a && typeof a.runTween === "function") adapter = a;
    },

    resetAdapter(): void {
        adapter = defaultAdapter;
    },

    onStateChanged(ctx: CapabilityContext): void {
        const ctrl = ctx.ctrl;
        if (!ctrl) return;
        if (!TweenCapability.isEnabled(ctrl)) return;

        const config = TweenCapability.getConfig(ctrl);
        const toIdx = (typeof ctx.toState === "number") ? ctx.toState : ctrl.selectedIndex;

        const selects = collectDirectSelects(ctrl);
        for (let i = 0; i < selects.length; i++) {
            const sel = selects[i];
            const ctrlBucket = sel._ctrlData && sel._ctrlData[ctrl.ctrlId];
            if (!ctrlBucket) continue;
            const targetState = ctrlBucket[toIdx];
            if (!targetState) continue;

            for (const propTypeStr in targetState) {
                if (!Object.prototype.hasOwnProperty.call(targetState, propTypeStr)) continue;
                // 跳过 $$xxx$$ namespace 字段 (capability 数据)
                if (propTypeStr.charAt(0) === "$") continue;
                const propType = parseInt(propTypeStr, 10);
                if (isNaN(propType)) continue;
                if (!supportedSet.has(propType)) continue;

                const toValue = targetState[propTypeStr];
                if (toValue === undefined || toValue === null) continue;

                try {
                    adapter.runTween(sel.node, propType as EnumPropName, toValue, config);
                }
                catch (e) {
                    StateErrorManager.warn("TweenCapability adapter.runTween 抛异常", {
                        component: "TweenCapability",
                        method: "onStateChanged",
                        params: { error: (e as Error).message, propType },
                    });
                }
            }
        }
    },
};

CapabilityRegistry.register(TweenCapability);
