/**
 * PresetCapability (Wave 4 T02).
 *
 * 把某 ctrl 某 state 的 propData 序列化为可携带的 PresetData, 跨 ctrl/state apply.
 *
 *   PresetCapability.savePreset(ctrl, stateIndex) → PresetData
 *   PresetCapability.applyPreset(ctrl, stateIndex, preset) → boolean
 *   PresetCapability.serializePreset(preset) → string  (JSON)
 *   PresetCapability.deserializePreset(str) → PresetData | null
 *
 * PresetData 结构:
 *   {
 *       version: number,            // = MigrationCapability.CURRENT_VERSION
 *       sourceCtrlName: string,
 *       sourceStateName: string,
 *       sources: [{ selectName, propData }, ...]
 *   }
 *
 * 跨 ctrl apply 时按 StateSelect 节点 name 匹配; 找不到匹配的 source 静默跳过 (不抛).
 * apply 时若 preset.version < CURRENT_VERSION, 自动经 MigrationCapability.migrate 升级.
 */

import { CapabilityRegistry } from "../CapabilityRegistry";
import { ICapability } from "../Capability";
import { StateErrorManager } from "../StateErrorManager";
import { MigrationCapability } from "./MigrationCapability";

export interface PresetSource {
    selectName: string;
    propData: { [key: string]: unknown };
}

export interface PresetData {
    version: number;
    sourceCtrlName: string;
    sourceStateName: string;
    sources: PresetSource[];
}

/**
 * 深拷贝纯数据 (含 cc.Vec3 / cc.Color 等带 _ 字段的对象).
 * 走 JSON.parse(JSON.stringify(...)) 即可 — propData 都是可序列化的值.
 */
function deepClone<T>(v: T): T {
    if (v === null || v === undefined) return v;
    return JSON.parse(JSON.stringify(v));
}

/**
 * 找 ctrl 直接控制的所有 StateSelect (不跨 child ctrl).
 * 用节点树 walk, 不依赖 StateController 的私有 cache (避免在 capability 里乱碰 core 内部).
 */
function collectDirectSelects(ctrl: any): any[] {
    const out: any[] = [];
    if (!ctrl || !ctrl.node) return out;

    const ccLocal: any = (globalThis as any).cc;
    if (!ccLocal) return out;

    function walk(node: any) {
        if (!node) return;
        // 当前节点是不是 StateSelect
        const sel = node.getComponent("StateSelect");
        if (sel) out.push(sel);

        if (!node.children) return;
        for (let i = 0; i < node.children.length; i++) {
            const child = node.children[i];
            // 跳过子 ctrl 的子树 (避免拿到子 ctrl 直辖的 select)
            const childCtrl = child.getComponent("StateController");
            if (childCtrl && childCtrl !== ctrl) continue;
            walk(child);
        }
    }
    walk(ctrl.node);
    return out;
}

export const PresetCapability: ICapability & {
    savePreset: (ctrl: any, stateIndex: number) => PresetData | null,
    applyPreset: (ctrl: any, stateIndex: number, preset: PresetData | null) => boolean,
    serializePreset: (preset: PresetData) => string,
    deserializePreset: (str: string) => PresetData | null,
} = {
    name: "preset",

    savePreset(ctrl: any, stateIndex: number): PresetData | null {
        if (!ctrl) return null;
        if (typeof stateIndex !== "number") return null;

        const selects = collectDirectSelects(ctrl);
        const sources: PresetSource[] = [];
        for (let i = 0; i < selects.length; i++) {
            const sel = selects[i];
            const ctrlBucket = sel._ctrlData && sel._ctrlData[ctrl.ctrlId];
            if (!ctrlBucket) continue;
            const stateData = ctrlBucket[stateIndex];
            if (!stateData) continue;
            const cleanProp = deepClone(stateData);
            // 至少有一个 key 才记录
            if (cleanProp && Object.keys(cleanProp).length > 0) {
                sources.push({
                    selectName: (sel.node && sel.node.name) || "",
                    propData: cleanProp,
                });
            }
        }

        const states = ctrl._states || [];
        const sourceStateName = (states[stateIndex] && states[stateIndex].name) || "";

        return {
            version: MigrationCapability.CURRENT_VERSION,
            sourceCtrlName: ctrl.ctrlName || "",
            sourceStateName,
            sources,
        };
    },

    applyPreset(ctrl: any, stateIndex: number, preset: PresetData | null): boolean {
        if (!ctrl) return false;
        if (!preset || !Array.isArray(preset.sources)) return false;
        if (typeof stateIndex !== "number") return false;

        // 版本不匹配 → 经 MigrationCapability 升级
        let working = preset;
        if (preset.version !== MigrationCapability.CURRENT_VERSION) {
            try {
                const migrated = MigrationCapability.migrate(
                    preset,
                    preset.version,
                    MigrationCapability.CURRENT_VERSION
                ) as PresetData;
                if (migrated) working = migrated;
            }
            catch (e) {
                StateErrorManager.warn("PresetCapability.applyPreset migrate 异常, 用原 preset", {
                    component: "PresetCapability",
                    method: "applyPreset",
                    params: { error: (e as Error).message },
                });
            }
        }

        const selects = collectDirectSelects(ctrl);
        const byName: { [k: string]: any } = {};
        for (let i = 0; i < selects.length; i++) {
            const sel = selects[i];
            if (sel.node) byName[sel.node.name] = sel;
        }

        for (let i = 0; i < working.sources.length; i++) {
            const src = working.sources[i];
            const sel = byName[src.selectName];
            if (!sel) continue;
            if (!sel._ctrlData) sel._ctrlData = {};
            if (!sel._ctrlData[ctrl.ctrlId]) sel._ctrlData[ctrl.ctrlId] = {};
            sel._ctrlData[ctrl.ctrlId][stateIndex] = deepClone(src.propData);
        }

        return true;
    },

    serializePreset(preset: PresetData): string {
        return JSON.stringify(preset);
    },

    deserializePreset(str: string): PresetData | null {
        try {
            const parsed = JSON.parse(str);
            if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.sources)) return null;
            return parsed as PresetData;
        }
        catch (_) {
            return null;
        }
    },
};

CapabilityRegistry.register(PresetCapability);
