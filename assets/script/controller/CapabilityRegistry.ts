/**
 * Capability 静态注册表 (Wave 2 Step 2).
 *
 * 单实例, 进程全局共享. 每个 ICapability 通过 name 标识, 同名 register 覆盖 (后注册赢).
 *
 * dispatch(event, ctx) 同步遍历所有 capability, 调对应 hook (缺 hook 跳过, 不抛).
 * ctx 自动注入 namespace helper, 各 capability 用 `ctx.namespace(propData, this.name)` 拿到隔离子空间.
 *
 * 非阻塞设计:
 *  - 当前 Wave 2 不引入异步 / 优先级排序 (dependsOn 仅声明用, 不影响调度);
 *  - hook 抛异常 → 捕获 + 走 StateErrorManager.warn, 不影响其它 capability 执行.
 */

import { CapabilityContext, ICapability } from "./Capability";
import { StateErrorManager } from "./StateErrorManager";

type CapEvent =
    | "onStateWillChange"
    | "onStateChanged"
    | "onPropApply"
    | "onRecordingStart"
    | "onRecordingStop"
    | "onCtrlDataMigrate";

/** namespace helper 注入. 给 propData 设置 / 读取 `$$<capName>$$` 子对象. */
function namespaceHelper(propData: any, capName: string): { [key: string]: unknown } {
    if (!propData) return {};
    const key = `$$${capName}$$`;
    if (propData[key] === undefined || propData[key] === null) {
        propData[key] = {};
    }
    return propData[key];
}

export class CapabilityRegistry {
    private static capabilities = new Map<string, ICapability>();

    /** 注册 capability. 同名覆盖 (后注册赢). */
    public static register(cap: ICapability): void {
        if (!cap || !cap.name) {
            StateErrorManager.warn("CapabilityRegistry.register: cap 缺少 name", {
                component: "CapabilityRegistry",
                method: "register",
            });
            return;
        }
        this.capabilities.set(cap.name, cap);
    }

    /** 卸载 capability (按 name) */
    public static unregister(name: string): void {
        this.capabilities.delete(name);
    }

    /** 按 name 查询 capability */
    public static get(name: string): ICapability | undefined {
        return this.capabilities.get(name);
    }

    /** 列出所有已注册 capability (顺序为注册顺序) */
    public static list(): ICapability[] {
        // ES5 compat: 不用 Array.from(iter), 改 forEach 累积
        const out: ICapability[] = [];
        this.capabilities.forEach(cap => out.push(cap));
        return out;
    }

    /** 全部清空 (测试用) */
    public static clear(): void {
        this.capabilities.clear();
    }

    /**
     * 派发事件. 同步执行所有已注册 capability 的对应 hook.
     *
     * 返回值: hook 返回值的数组 (按注册顺序). 用于 onPropApply 这类有返回值的 hook;
     * 普通 hook 返回值为 undefined 也照样收集 (调用方可忽略).
     */
    public static dispatch(event: CapEvent, ctx: CapabilityContext): unknown[] {
        // 注入 namespace helper, 避免 capability 各自实现一遍
        if (!ctx.namespace) {
            ctx.namespace = namespaceHelper;
        }
        const results: unknown[] = [];
        // 注: 项目 tsconfig target=es5 且未开 downlevelIteration, 不能用 for-of Map.values().
        // 改用 forEach 保证 ES5 兼容.
        this.capabilities.forEach((cap) => {
            const hook = (cap as any)[event] as ((...args: any[]) => any) | undefined;
            if (typeof hook !== "function") return;
            try {
                let r: unknown;
                if (event === "onPropApply") {
                    const prop = ctx.extra && (ctx.extra as any).prop;
                    r = hook.call(cap, ctx, prop);
                }
                else {
                    r = hook.call(cap, ctx);
                }
                results.push(r);
            }
            catch (e) {
                StateErrorManager.warn(`Capability "${cap.name}" hook "${event}" 抛异常`, {
                    component: "CapabilityRegistry",
                    method: "dispatch",
                    params: { error: (e as Error).message },
                });
            }
        });
        return results;
    }
}
