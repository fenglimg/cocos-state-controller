/**
 * MigrationCapability 实装契约 (Wave 4 T01)
 *
 * 从 Wave 2 占位 → 可用版本迁移框架:
 *   - registerStep(fromVersion, fn(data) → data)
 *   - migrate(data, fromVersion, toVersion) 链式跑所有匹配 step
 *   - onCtrlDataMigrate hook 路由到 migrate
 *
 * Red: 当前模块只有 name + 占位 onCtrlDataMigrate, 没有 registerStep / migrate / CURRENT_VERSION.
 */

declare global {
    const CC_EDITOR: boolean;
    const cc: any;
    const Editor: any;
}

beforeAll(() => {
    (globalThis as any).CC_EDITOR = true;
    (globalThis as any).Editor = {
        log: () => {}, warn: () => {}, error: () => {},
        Utils: { refreshSelectedInspector: () => {} },
    };
});

describe("MigrationCapability 实装 (Wave 4 T01)", () => {
    it("暴露 CURRENT_VERSION + registerStep + migrate + clearSteps", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { MigrationCapability } = require("../../assets/script/controller/capabilities/MigrationCapability");
        expect(typeof MigrationCapability.CURRENT_VERSION).toBe("number");
        expect(typeof MigrationCapability.registerStep).toBe("function");
        expect(typeof MigrationCapability.migrate).toBe("function");
        expect(typeof MigrationCapability.clearSteps).toBe("function");
    });

    it("没注册 step → migrate 返回原 data (identity)", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { MigrationCapability } = require("../../assets/script/controller/capabilities/MigrationCapability");
        MigrationCapability.clearSteps();
        const data = { foo: 1 };
        const out = MigrationCapability.migrate(data, 1, 3);
        expect(out).toEqual({ foo: 1 });
    });

    it("from === to → identity, 不跑 step", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { MigrationCapability } = require("../../assets/script/controller/capabilities/MigrationCapability");
        MigrationCapability.clearSteps();
        let stepRan = false;
        MigrationCapability.registerStep(1, (d: any) => { stepRan = true; return d; });
        const data = { v: 1 };
        const out = MigrationCapability.migrate(data, 1, 1);
        expect(stepRan).toBe(false);
        expect(out).toBe(data);
    });

    it("单步 migrate(data, 1, 2) 触发 step(1)", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { MigrationCapability } = require("../../assets/script/controller/capabilities/MigrationCapability");
        MigrationCapability.clearSteps();
        MigrationCapability.registerStep(1, (d: any) => ({ ...d, bumped: true }));
        const out = MigrationCapability.migrate({ x: 1 }, 1, 2);
        expect(out).toEqual({ x: 1, bumped: true });
    });

    it("多步链式: 1→2→3 按 from 升序跑", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { MigrationCapability } = require("../../assets/script/controller/capabilities/MigrationCapability");
        MigrationCapability.clearSteps();
        // 故意乱序注册
        MigrationCapability.registerStep(2, (d: any) => ({ ...d, s2: true }));
        MigrationCapability.registerStep(1, (d: any) => ({ ...d, s1: true }));
        const out = MigrationCapability.migrate({ x: 1 }, 1, 3);
        expect(out).toEqual({ x: 1, s1: true, s2: true });
    });

    it("from < 已注册最小 step → 仍能跑 (跳过不存在的 step)", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { MigrationCapability } = require("../../assets/script/controller/capabilities/MigrationCapability");
        MigrationCapability.clearSteps();
        MigrationCapability.registerStep(5, (d: any) => ({ ...d, jumped: true }));
        const out = MigrationCapability.migrate({ x: 1 }, 1, 6);
        expect(out).toEqual({ x: 1, jumped: true });
    });

    it("step 抛异常 → 不再继续, 返回最后一个成功的中间结果, 警告 log", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { MigrationCapability } = require("../../assets/script/controller/capabilities/MigrationCapability");
        MigrationCapability.clearSteps();
        MigrationCapability.registerStep(1, (d: any) => ({ ...d, s1: true }));
        MigrationCapability.registerStep(2, () => { throw new Error("boom"); });
        MigrationCapability.registerStep(3, (d: any) => ({ ...d, s3: true }));
        const out = MigrationCapability.migrate({}, 1, 4);
        // s1 跑了, s2 抛, s3 不跑
        expect(out).toEqual({ s1: true });
    });

    it("onCtrlDataMigrate hook 接 (data, version) → migrate(data, version, CURRENT_VERSION)", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { MigrationCapability } = require("../../assets/script/controller/capabilities/MigrationCapability");
        MigrationCapability.clearSteps();
        MigrationCapability.registerStep(1, (d: any) => ({ ...d, upgraded: true }));
        const out = MigrationCapability.onCtrlDataMigrate({ x: 1 }, 1);
        if (MigrationCapability.CURRENT_VERSION > 1) {
            expect(out).toEqual({ x: 1, upgraded: true });
        } else {
            expect(out).toEqual({ x: 1 });
        }
    });

    it("CURRENT_VERSION ≥ 1 (基线版本)", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { MigrationCapability } = require("../../assets/script/controller/capabilities/MigrationCapability");
        expect(MigrationCapability.CURRENT_VERSION).toBeGreaterThanOrEqual(1);
    });
});
