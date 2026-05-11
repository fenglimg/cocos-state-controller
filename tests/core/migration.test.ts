/**
 * StateSelect _migrate v1 → v2 单元测试 (M3-B3 历史数据清扫)
 *
 * 验证:
 *  - dead stateId (不在 controller.states 中) 在迁移后被清除
 *  - valid stateId 数据迁移后完整保留
 *  - _flatData Map 与 _ctrlData 保持同步
 *  - 完成后 _serializedVersion === 3
 */

declare global {
    const cc: any;
    const CC_EDITOR: boolean;
    const Editor: any;
}

// 保证 CC_EDITOR === true / Editor mock 已就绪 (与 StatePropHandler.test.ts 同源策略)
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

/**
 * 构造一个 lightweight StateSelect 实例 (绕过 Cocos 组件挂载, 直接 new 拿一个对象用于纯函数级单测)
 * 注: StateSelect 继承 cc.Component, 直接 new 在 jsdom 下可创建实例 (cc.Component 构造允许 zero-arg)
 */
function makeSelect(): StateSelect {
    // @ts-ignore — cc.Component 允许无 arg 构造
    const inst = new StateSelect();
    return inst;
}

function makeController(ctrlId: number, stateIds: number[]): StateController {
    // @ts-ignore
    const ctrl = new StateController();
    ctrl.ctrlId = ctrlId;
    // states 是 @property; setter 会做大量 editor 校验, 直接用反射写底层 _states
    (ctrl as any)._states = stateIds.map(sid => ({ name: `state_${sid}`, stateId: sid }));
    return ctrl;
}

describe("StateSelect._migrate v1 → v2 (M3-B3 历史数据清扫)", () => {
    test("_migrate v1→v2 扫除 dead stateId, 保留 valid stateId", () => {
        const select = makeSelect();
        const ctrl = makeController(1, [100]);  // 仅 stateId=100 合法

        // 写入 _ctrlsMap
        (select as any)._ctrlsMap = { 1: ctrl };

        // 写入 _ctrlData: stateId=100 合法; stateId=999 已 dead
        (select as any)._ctrlData = {
            1: {
                100: { 1: true },         // EnumPropName.Active=1 → Active prop
                999: { 1: false },        // dead stateId
            },
        };

        // 同步 _flatData
        const flatData = (select as any)._flatData as Map<string, any>;
        flatData.set("1_100_1", { value: true, ctrlId: 1, stateId: 100, propType: 1 });
        flatData.set("1_999_1", { value: false, ctrlId: 1, stateId: 999, propType: 1 });

        // 设 version 为 1, 触发 v1→v3 迁移
        (select as any)._serializedVersion = 1;

        // 调用 _migrate (protected → cast any)
        (select as any)._migrate(1);

        // ──── 断言 ────
        expect((select as any)._ctrlData[1][999]).toBeUndefined();
        expect((select as any)._ctrlData[1][100]).toBeDefined();
        expect((select as any)._ctrlData[1][100][1]).toBe(true);

        // _flatData 同步
        expect(flatData.has("1_999_1")).toBe(false);
        expect(flatData.has("1_100_1")).toBe(true);

        // _serializedVersion 已升级
        expect((select as any)._serializedVersion).toBe(3);
    });

    test("_migrate 不破坏 valid 数据 (全部合法 stateId)", () => {
        const select = makeSelect();
        const ctrl = makeController(1, [100, 200, 300]);

        (select as any)._ctrlsMap = { 1: ctrl };

        const ctrlDataBeforeMigration = {
            1: {
                100: { 1: true, 2: { x: 0, y: 0 } },
                200: { 1: false },
                300: { 1: true, 2: { x: 10, y: 20 } },
            },
        };
        (select as any)._ctrlData = JSON.parse(JSON.stringify(ctrlDataBeforeMigration));

        const flatData = (select as any)._flatData as Map<string, any>;
        flatData.set("1_100_1", { value: true, ctrlId: 1, stateId: 100, propType: 1 });
        flatData.set("1_100_2", { value: { x: 0, y: 0 }, ctrlId: 1, stateId: 100, propType: 2 });
        flatData.set("1_200_1", { value: false, ctrlId: 1, stateId: 200, propType: 1 });
        flatData.set("1_300_1", { value: true, ctrlId: 1, stateId: 300, propType: 1 });
        flatData.set("1_300_2", { value: { x: 10, y: 20 }, ctrlId: 1, stateId: 300, propType: 2 });

        (select as any)._serializedVersion = 1;
        (select as any)._migrate(1);

        // 全部 stateId 应被保留, 数据完整等价
        expect((select as any)._ctrlData).toEqual(ctrlDataBeforeMigration);

        // _flatData 全部保留
        expect(flatData.has("1_100_1")).toBe(true);
        expect(flatData.has("1_100_2")).toBe(true);
        expect(flatData.has("1_200_1")).toBe(true);
        expect(flatData.has("1_300_1")).toBe(true);
        expect(flatData.has("1_300_2")).toBe(true);

        expect((select as any)._serializedVersion).toBe(3);
    });

    test("_migrate 跳过未在 _ctrlsMap 中的 ctrlId (不破坏未知数据)", () => {
        const select = makeSelect();
        // _ctrlsMap 为空 — 没有任何 controller 已建立映射
        (select as any)._ctrlsMap = {};

        const dataBefore = {
            7: {
                42: { 1: true },
            },
        };
        (select as any)._ctrlData = JSON.parse(JSON.stringify(dataBefore));
        (select as any)._serializedVersion = 1;

        (select as any)._migrate(1);

        // 因 _ctrlsMap[7] 未建立, 数据应原样保留, 等待后续 updateCtrlName 重建映射后再清扫
        expect((select as any)._ctrlData).toEqual(dataBefore);
        // 🔧 M3 (Gemini review WARNING fix): 跳过的 ctrlId 不 bump 版本, 等下次 onLoad 重试
        expect((select as any)._serializedVersion).toBe(1);
    });

    test("_migrate 多 controller 同时清扫 dead stateId (混合场景)", () => {
        const select = makeSelect();
        const ctrl1 = makeController(1, [100, 200]);
        const ctrl2 = makeController(2, [50]);

        (select as any)._ctrlsMap = { 1: ctrl1, 2: ctrl2 };
        (select as any)._ctrlData = {
            1: {
                100: { 1: true },
                200: { 1: false },
                999: { 1: true },     // dead under ctrl 1
            },
            2: {
                50: { 1: false },
                88: { 1: true },      // dead under ctrl 2
            },
        };
        const flatData = (select as any)._flatData as Map<string, any>;
        flatData.set("1_999_1", { value: true });
        flatData.set("2_88_1", { value: true });
        flatData.set("1_100_1", { value: true });
        flatData.set("2_50_1", { value: false });

        (select as any)._serializedVersion = 1;
        (select as any)._migrate(1);

        // dead 应被清扫
        expect((select as any)._ctrlData[1][999]).toBeUndefined();
        expect((select as any)._ctrlData[2][88]).toBeUndefined();
        // valid 应保留
        expect((select as any)._ctrlData[1][100]).toBeDefined();
        expect((select as any)._ctrlData[1][200]).toBeDefined();
        expect((select as any)._ctrlData[2][50]).toBeDefined();
        // _flatData 同步
        expect(flatData.has("1_999_1")).toBe(false);
        expect(flatData.has("2_88_1")).toBe(false);
        expect(flatData.has("1_100_1")).toBe(true);
        expect(flatData.has("2_50_1")).toBe(true);

        expect((select as any)._serializedVersion).toBe(3);
    });

    test("_migrate 当 _ctrlsMap 不完整时保留旧版本号 (待重试) — Gemini WARNING fix", () => {
        const select = makeSelect();
        const ctrl1 = makeController(1, [100]);
        // ctrl2 故意不放入 _ctrlsMap, 模拟 onLoad 时序差导致 _ctrlsMap 尚未建立
        (select as any)._ctrlsMap = { 1: ctrl1 };
        (select as any)._ctrlData = {
            1: { 100: { 1: true } },
            2: { 50: { 1: false } }, // ctrlId=2 _ctrlsMap 缺失 → 跳过
        };

        (select as any)._serializedVersion = 1;
        (select as any)._migrate(1);

        // ctrlId=1 已迁移; ctrlId=2 跳过
        expect((select as any)._ctrlData[1][100]).toBeDefined();
        expect((select as any)._ctrlData[2][50]).toBeDefined();
        // _serializedVersion 保持 1, 等下次 onLoad 重试
        expect((select as any)._serializedVersion).toBe(1);
    });
});
