/**
 * AutoSyncCapability (Wave 2 T23).
 *
 * 把现有的 StateSelectV2.autoSyncEnabled (硬编码 true) 抽成 capability:
 *  - 切 state 时, 是否保持 inspector 上当前选中的 propKey (autoSync ON, 当前默认行为)
 *  - 还是改用切到的 state 的 lastProp (autoSync OFF)
 *
 * 当前 Wave 2 不主动改 StateSelectV2 内的引用 (autoSyncEnabled 仍是 true), 仅暴露 capability
 * 接口 + isEnabled() 静态查询, 为 Panel / Wave 3 接管时切换做准备.
 *
 * 命名空间: 配置存放在静态字段, 不写入 ctrlData 任何 namespace (这是全局开关, 不分 state).
 */

import { CapabilityRegistry } from "../CapabilityRegistry";
import { ICapability } from "../Capability";

let _enabled = true;

export const AutoSyncCapability: ICapability & {
    isEnabled: () => boolean
    setEnabled: (v: boolean) => void
} = {
    name: "autoSync",
    isEnabled: () => _enabled,
    setEnabled: (v: boolean) => {
        _enabled = !!v;
    },
};

CapabilityRegistry.register(AutoSyncCapability);
