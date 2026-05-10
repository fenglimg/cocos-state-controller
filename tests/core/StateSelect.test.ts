/**
 * StateSelect / StateController M3 Bug B3 + B1 单元测试
 *
 * 验证:
 *  - B3: deleteState(stateId) 触发 updateDelete 清理 _ctrlData[ctrlId][stateId] 与 _flatData
 *  - B1: _stateSelectCache 按 ctrlId 分桶; markCacheDirty(ctrlId) 不串扰其他 ctrlId 的 cache
 */

declare global {
    const cc: any;
    const CC_EDITOR: boolean;
    const Editor: any;
}

beforeAll(() => {
    (global as any).CC_EDITOR = true;
    if (!(global as any).Editor) {
        (global as any).Editor = {
            log: () => {},
            warn: () => {},
            error: () => {},
        };
    }
});

import { StateController } from "../../assets/script/controller/StateController";
import { StateSelect } from "../../assets/script/controller/StateSelect";

function makeSelect(): StateSelect {
    // @ts-ignore
    return new StateSelect();
}

function makeController(ctrlId: number, stateIds: number[]): StateController {
    // @ts-ignore
    const ctrl = new StateController();
    ctrl.ctrlId = ctrlId;
    (ctrl as any)._states = stateIds.map(sid => ({ name: `state_${sid}`, stateId: sid }));
    return ctrl;
}

describe("StateSelect.updateDelete (M3-B3 孤儿 _ctrlData 清理)", () => {
    test("updateDelete(ctrl, stateId) 清理 _ctrlData[ctrlId][stateId] 与 _flatData 对应键", () => {
        const select = makeSelect();
        const ctrl = makeController(1, [100, 200]);

        (select as any)._ctrlsMap = { 1: ctrl };
        (select as any)._ctrlData = {
            1: {
                100: { 1: true },             // EnumPropName.Active=1
                200: { 1: false, 2: { x: 0, y: 0 } },  // 2=Position
            },
        };

        const flatData = (select as any)._flatData as Map<string, any>;
        flatData.set("1_100_1", { value: true, ctrlId: 1, stateId: 100, propType: 1 });
        flatData.set("1_200_1", { value: false, ctrlId: 1, stateId: 200, propType: 1 });
        flatData.set("1_200_2", { value: { x: 0, y: 0 }, ctrlId: 1, stateId: 200, propType: 2 });

        // 调用 updateDelete 删除 stateId=200
        select.updateDelete(ctrl, 200);

        // 断言 _ctrlData
        expect((select as any)._ctrlData[1][200]).toBeUndefined();
        expect((select as any)._ctrlData[1][100]).toBeDefined();
        // 断言 _flatData 同步删除
        expect(flatData.has("1_200_1")).toBe(false);
        expect(flatData.has("1_200_2")).toBe(false);
        expect(flatData.has("1_100_1")).toBe(true);
    });

    test("updateDelete(ctrl) 不带 stateId 时走旧逻辑 (整 controller 数据清空)", () => {
        const select = makeSelect();
        const ctrl = makeController(1, [100]);

        (select as any)._ctrlsMap = { 1: ctrl };
        (select as any)._ctrlData = {
            1: {
                100: { 1: true },
            },
            // 不同 ctrlId 数据应保留
            2: {
                300: { 1: false },
            },
        };
        // currCtrlId 设为 2, 避免触发 _onPreDestroy 路径 (当前 ctrl=1 != currCtrlId=2)
        (select as any)._currCtrlId = 2;

        // 模拟 updateCtrlName 防御 (空 stub, 防止 setTimeout fallback 内部访问 ctrl.node 报错)
        (select as any).updateCtrlName = () => {};

        // 同步预填 _flatData 的旧扁平键, 验证 fallback 是否清理
        const flatData: Map<string, unknown> = (select as any)._flatData;
        flatData.set("1_100_1", "ctrl1-state100-prop1");
        flatData.set("2_300_1", "ctrl2-state300-prop1");

        // 不传 stateId, 走旧逻辑
        select.updateDelete(ctrl);

        // 整个 _ctrlData[1] 被清除
        expect((select as any)._ctrlData[1]).toBeUndefined();
        // 不同 ctrlId 数据保留
        expect((select as any)._ctrlData[2]).toBeDefined();
        expect((select as any)._ctrlData[2][300][1]).toBe(false);

        // 🔧 M3 Gemini review CRITICAL fix: _flatData 中 ctrlId=1 的扁平键也应被清理, 不影响 ctrlId=2
        expect(flatData.has("1_100_1")).toBe(false);
        expect(flatData.has("2_300_1")).toBe(true);
    });

    test("StateController.deleteState(stateId) 通过分发链调用 StateSelect.updateDelete 清理孤儿条目", () => {
        const select = makeSelect();
        const ctrl = makeController(1, [100, 200]);

        // 通过 stub 的方式直接把 select 注入 controller 的缓存 (跳过 BFS 真实场景树)
        (ctrl as any)._stateSelectCache = new Map<number, StateSelect[]>();
        (ctrl as any)._stateSelectCache.set(ctrl.ctrlId, [select]);

        // 给 select.node 一个 isValid + active mock, 防止 updateState 跳过
        Object.defineProperty(select, "node", {
            value: { active: true, isValid: true },
            configurable: true,
        });

        (select as any)._ctrlsMap = { 1: ctrl };
        (select as any)._ctrlData = {
            1: {
                100: { 1: true },
                200: { 1: false },
            },
        };
        const flatData = (select as any)._flatData as Map<string, any>;
        flatData.set("1_100_1", { value: true });
        flatData.set("1_200_1", { value: false });

        // 触发 deleteState
        ctrl.deleteState(200);

        // 通过事件链, _ctrlData[1][200] 应被清空
        expect((select as any)._ctrlData[1][200]).toBeUndefined();
        expect((select as any)._ctrlData[1][100]).toBeDefined();
        expect(flatData.has("1_200_1")).toBe(false);
    });
});

describe("StateController._stateSelectCache (M3-B1 按 ctrlId 分桶)", () => {
    test("_stateSelectCache 类型为 Map<number, StateSelect[]>", () => {
        // @ts-ignore
        const ctrl = new StateController();
        const cache = (ctrl as any)._stateSelectCache;
        expect(cache).toBeInstanceOf(Map);
    });

    test("markCacheDirty(ctrlId) 仅清除指定 ctrlId 的 cache, 不串扰其他 ctrlId", () => {
        // @ts-ignore
        const ctrl = new StateController();
        ctrl.ctrlId = 1;

        const cache = (ctrl as any)._stateSelectCache as Map<number, StateSelect[]>;

        // 模拟父 ctrl 与子 ctrl 各自缓存 (实际上是同一个 ctrl 实例的 Map 内含 2 个 ctrlId 桶,
        // 这里我们用同一 controller 模拟多 ctrlId 共存 — 验证 Map 分桶语义)
        const select1 = makeSelect();
        const select2 = makeSelect();
        cache.set(1, [select1]);
        cache.set(2, [select2]);

        // 仅失效 ctrlId=1 的缓存
        ctrl.markCacheDirty(1);

        expect(cache.has(1)).toBe(false);
        expect(cache.has(2)).toBe(true);                // 其他 ctrlId 不应受影响
        expect(cache.get(2)).toEqual([select2]);
    });

    test("markCacheDirty() 不带参数清除所有 ctrlId 的 cache (兼容旧语义)", () => {
        // @ts-ignore
        const ctrl = new StateController();
        const cache = (ctrl as any)._stateSelectCache as Map<number, StateSelect[]>;

        cache.set(1, [makeSelect()]);
        cache.set(2, [makeSelect()]);
        cache.set(3, [makeSelect()]);

        ctrl.markCacheDirty();   // 不传参 → 全清

        expect(cache.size).toBe(0);
    });

    test("多 controller 嵌套 BFS cache 不串扰: 父 ctrl markCacheDirty 不影响子 ctrl 缓存", () => {
        // 父子两个独立的 StateController 实例 (每个有独立的 _stateSelectCache Map)
        const parentCtrl = makeController(1, [100, 200]);
        const childCtrl = makeController(2, [300]);

        // 分别填入各自缓存
        const parentCache = (parentCtrl as any)._stateSelectCache as Map<number, StateSelect[]>;
        const childCache = (childCtrl as any)._stateSelectCache as Map<number, StateSelect[]>;

        const childSelect1 = makeSelect();
        const childSelect2 = makeSelect();
        parentCache.set(parentCtrl.ctrlId, [childSelect1]);
        childCache.set(childCtrl.ctrlId, [childSelect2]);

        // 父 ctrl 触发 markCacheDirty(parentCtrl.ctrlId)
        parentCtrl.markCacheDirty(parentCtrl.ctrlId);

        // 父 cache 已失效
        expect(parentCache.has(parentCtrl.ctrlId)).toBe(false);
        // 子 ctrl 缓存完全未受影响
        expect(childCache.has(childCtrl.ctrlId)).toBe(true);
        expect(childCache.get(childCtrl.ctrlId)).toEqual([childSelect2]);
    });
});
