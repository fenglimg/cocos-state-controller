/**
 * MigrationCapability (Wave 4 T01 实装).
 *
 * 数据版本迁移框架. 用途:
 *   - prefab 反序列化时, 老格式 _ctrlData → 当前格式
 *   - 未来字段重命名 / 结构调整, 不破坏老 scene
 *
 * 使用方式:
 *   MigrationCapability.registerStep(1, function(data){
 *       data.newField = computeFromOld(data);
 *       delete data.oldField;
 *       return data;
 *   });
 *   // 反序列化路径自动调:
 *   const upgraded = MigrationCapability.migrate(oldData, oldVersion, MigrationCapability.CURRENT_VERSION);
 *
 * step(fromVersion) 表示 "把版本 N 的数据升到版本 N+1". migrate() 按 from 升序依次跑.
 *
 * 错误兜底: step 抛异常 → 停止后续, 返回最后一个成功的中间结果 (尽力升级而非崩盘).
 *
 * 当前 CURRENT_VERSION = 1 (基线). 未来真要改数据格式时, ++ 并注册对应 step.
 */

import { CapabilityRegistry } from "../CapabilityRegistry";
import { ICapability } from "../Capability";
import { StateErrorManager } from "../StateErrorManagerV2";

type MigrationStep = (data: unknown) => unknown;

const steps: Map<number, MigrationStep> = new Map();

export const MigrationCapability: ICapability & {
    CURRENT_VERSION: number
    registerStep: (fromVersion: number, fn: MigrationStep) => void
    migrate: (data: unknown, fromVersion: number, toVersion: number) => unknown
    clearSteps: () => void
} = {
    name: "migration",
    CURRENT_VERSION: 1,

    registerStep(fromVersion: number, fn: MigrationStep): void {
        if (typeof fn !== "function") return;
        steps.set(fromVersion, fn);
    },

    clearSteps(): void {
        steps.clear();
    },

    migrate(data: unknown, fromVersion: number, toVersion: number): unknown {
        if (fromVersion === toVersion) return data;
        if (fromVersion > toVersion) {
            StateErrorManager.warn("MigrationCapability.migrate: fromVersion > toVersion, 不支持降级", {
                component: "MigrationCapability",
                method: "migrate",
                params: { fromVersion, toVersion },
            });
            return data;
        }

        const sortedKeys: number[] = [];
        steps.forEach((_, k) => {
            sortedKeys.push(k);
        });
        sortedKeys.sort((a, b) => a - b);

        let current: unknown = data;
        for (let i = 0; i < sortedKeys.length; i++) {
            const v = sortedKeys[i];
            if (v < fromVersion) continue;
            if (v >= toVersion) break;
            const step = steps.get(v);
            if (!step) continue;
            try {
                current = step(current);
            }
            catch (e) {
                StateErrorManager.warn(`MigrationCapability step(v=${v}) 抛异常, 停止后续`, {
                    component: "MigrationCapability",
                    method: "migrate",
                    params: { fromVersion, toVersion, failedStepFrom: v, error: (e as Error).message },
                });
                return current;
            }
        }
        return current;
    },

    onCtrlDataMigrate(data: unknown, version: number): unknown {
        return MigrationCapability.migrate(data, version, MigrationCapability.CURRENT_VERSION);
    },
};

CapabilityRegistry.register(MigrationCapability);
