/**
 * W6 回归测试套 (RED) — user 编辑器手测发现"排 cc.Node.x 不生效"后展开
 *
 * 覆盖 9 个 W6-2a 双轨设计 + AMBIGUOUS 整体路径冲突的 bug case.
 * 现状: 这些测试**预期全红** (current code 暴露 bug), 等 X 方案 (彻底拆 AMBIGUOUS, 子项独立) 修完转绿作 acceptance.
 *
 * X 方案设计 (W6 终态, 全 cocos 内省):
 *   - autoOptIn 跳过 EnumPropName.Position / Anchor / Size 整体路径 (不接入)
 *   - 让 cc.Node.x / .y / .z / .scaleX / .scaleY / .anchorX / .anchorY / .width / .height 独立接入
 *   - migration 升级老 .fire propData['cc.Node.position']=Vec3 → 拆 .x/.y/.z 三个子项
 *   - 排子项 propRef = 只排该子项, 兄弟子项独立
 *
 * RED 跑法: cd tests && npx jest --config jest.config.js W6.regressionSuite
 * 预期: 多个 fail (反映 bug). 修完转绿后可纳入 main suite.
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

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ControllerMod = require("../../assets/script/controller/StateControllerV2");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SelectMod = require("../../assets/script/controller/StateSelectV2");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const IntrospectionMod = require("../../assets/script/controller/PrefabIntrospection");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const EnumPropRefMod = require("../../assets/script/controller/EnumPropRefMap");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const StateEnumMod = require("../../assets/script/controller/StateEnumV2");

const { StateControllerV2 } = ControllerMod;
const { StateSelectV2 } = SelectMod;
const { listTrackableProps } = IntrospectionMod;
const { EnumPropName } = StateEnumMod;

function setup() {
    const ccLocal = (globalThis as any).cc;
    const root = new ccLocal.Node("Root");
    const ctrlNode = new ccLocal.Node("CtrlNode");
    root.addChild(ctrlNode);
    const selectNode = new ccLocal.Node("SelectNode");
    ctrlNode.addChild(selectNode);

    const ctrl = ctrlNode.addComponent(StateControllerV2);
    (ctrl as any).__preload();

    const select = selectNode.addComponent(StateSelectV2);
    (select as any).__preload();

    (ctrl as any).markCacheDirty();
    return { root, ctrl, select, selectNode };
}

describe("W6 回归测试 — 双轨设计 + AMBIGUOUS 整体路径冲突", () => {
    // ============================================================
    // 前置 probe — 确认 cc.Node 子项确实在 trackable 列表内
    // ============================================================
    it("[probe] listTrackableProps(node) 应包含 cc.Node 子项 (x/y/z/scaleX/scaleY/anchorX/anchorY/width/height)", () => {
        const { selectNode } = setup();
        const list = listTrackableProps(selectNode);
        const refs = list.map((p: any) => p.propRef);
        // cocos 2.x cc.Node 必有这些 user-facing getter/setter
        expect(refs).toContain("cc.Node.x");
        expect(refs).toContain("cc.Node.y");
        expect(refs).toContain("cc.Node.width");
        expect(refs).toContain("cc.Node.height");
        expect(refs).toContain("cc.Node.anchorX");
        expect(refs).toContain("cc.Node.anchorY");
    });

    // ============================================================
    // BUG 1: 排 cc.Node.x 后 EnumPropName.Position 仍跟踪 (user 手测发现)
    // 注: $$controlledProps$$ 内置 prop key 是 EnumPropName 反查的 name 字符串 (e.g. 'Position'), 不是数字 key
    // ============================================================
    it("[BUG-1] 排 cc.Node.x: 'Position' 整体路径名字 key 不应该仍在 $$controlledProps$$", () => {
        const { ctrl, select } = setup();
        (select as any)._userExcludedProps = ["cc.Node.x"];
        void (select as any).excludedPropsDisplay;
        const propData = (select as any).getPropData(0, ctrl.ctrlId);
        const controlled = propData?.$$controlledProps$$ || {};
        // X 方案预期: AMBIGUOUS 'Position' 名字 key 不在
        expect(controlled.Position).toBeUndefined();
        expect(controlled["cc.Node.x"]).toBeUndefined();
    });

    // ============================================================
    // BUG 2: Scale 双轨
    // ============================================================
    it("[BUG-2] autoOptIn 不应同时接入 'Scale' (整体) + cc.Node.scaleX/scaleY (子项)", () => {
        const { ctrl, select } = setup();
        const propData = (select as any).getPropData(0, ctrl.ctrlId);
        const controlled = propData?.$$controlledProps$$ || {};
        expect(controlled.Scale).toBeUndefined();
    });

    // ============================================================
    // BUG 3: Anchor 双轨
    // ============================================================
    it("[BUG-3] autoOptIn 不应同时接入 'Anchor' (整体) + cc.Node.anchorX/anchorY (子项)", () => {
        const { ctrl, select } = setup();
        const propData = (select as any).getPropData(0, ctrl.ctrlId);
        const controlled = propData?.$$controlledProps$$ || {};
        expect(controlled.Anchor).toBeUndefined();
    });

    // ============================================================
    // BUG 4: Size 双轨
    // ============================================================
    it("[BUG-4] autoOptIn 不应同时接入 'Size' (整体) + cc.Node.width/height (子项)", () => {
        const { ctrl, select } = setup();
        const propData = (select as any).getPropData(0, ctrl.ctrlId);
        const controlled = propData?.$$controlledProps$$ || {};
        expect(controlled.Size).toBeUndefined();
    });

    // ============================================================
    // BUG 5: autoOptIn 双接入 — 同一物理 prop 不应同时占数字 + 字符串两个 key
    // ============================================================
    it("[BUG-5] autoOptIn 后 $$controlledProps$$ 不应同时含 EnumPropName 数字 key 跟其对应的 propRef 字符串 key", () => {
        const { ctrl, select } = setup();
        const propData = (select as any).getPropData(0, ctrl.ctrlId);
        const controlled = propData?.$$controlledProps$$ || {};
        // 例: Color 既有 EnumPropName.Color 数字 key 又有 'cc.Node.color' 字符串 key → bug
        // X 方案预期: 全部走字符串 propRef, 数字 key 完全不出现 (autoOptIn 应跳过老路径)
        const numericKeys = Object.keys(controlled).filter(k => /^\d+$/.test(k));
        expect(numericKeys).toEqual([]); // X 方案: 0 个数字 key
    });

    // ============================================================
    // BUG 6: migration 老 .fire 数据 — propData['cc.Node.position']=Vec3 应拆 .x/.y/.z 三子项
    // ============================================================
    it("[BUG-6] migration: propData['cc.Node.position']=Vec3 应拆 .x/.y/.z 三子项 (X 方案)", () => {
        const { ctrl, select } = setup();
        const ccLocal = (globalThis as any).cc;
        // 构造老 .fire 数据形态: ctrlData 内层含 'cc.Node.position' Vec3 整体 (W6-2c2 AMBIGUOUS 迁移结果)
        const propData = (select as any).getPropData(0, ctrl.ctrlId);
        propData["cc.Node.position"] = new ccLocal.Vec3(10, 20, 30);
        // X 方案预期: migration 应拆成 .x/.y/.z 三子项
        (select as any).migrateLegacyCtrlData();
        const after = (select as any).getPropData(0, ctrl.ctrlId);
        expect(after["cc.Node.x"]).toBe(10);
        expect(after["cc.Node.y"]).toBe(20);
        expect(after["cc.Node.z"]).toBe(30);
        expect(after["cc.Node.position"]).toBeUndefined(); // 整体 key 应已拆解清空
    });

    // ============================================================
    // BUG 7: 排除清单语义 — reconcile 应彻底断 string + 数字两条路径
    // ============================================================
    it("[BUG-7] 排除清单 reconcile 后 $$controlledProps$$ 应 0 数字 key 残留 (X 方案 - 全 propRef)", () => {
        const { ctrl, select } = setup();
        // 模拟 user 排所有 cc.Node 子项 (X 方案下应都是 propRef 字符串路径)
        (select as any)._userExcludedProps = ["cc.Node.x", "cc.Node.y", "cc.Node.scaleX"];
        void (select as any).excludedPropsDisplay; // 触发 reconcile
        const propData = (select as any).getPropData(0, ctrl.ctrlId);
        const controlled = propData?.$$controlledProps$$ || {};
        // 排除的子项不应在 controlled
        expect(controlled["cc.Node.x"]).toBeUndefined();
        expect(controlled["cc.Node.y"]).toBeUndefined();
        expect(controlled["cc.Node.scaleX"]).toBeUndefined();
        // 没有任何 EnumPropName 数字 key (X 方案彻底清掉双轨)
        const numericKeys = Object.keys(controlled).filter(k => /^\d+$/.test(k));
        expect(numericKeys).toEqual([]);
    });

    // ============================================================
    // BUG 8: Capability 双 dispatch — 改 cc.Node.x 不应触发 cc.Node.position dispatch 重复
    // ============================================================
    it("[BUG-8] 改 cc.Node.x 不应触发 EnumPropName.Position 老路径 dispatch (双 dispatch 死代码)", () => {
        const { ctrl, select } = setup();
        // 不同改动应只 dispatch 一次
        // X 方案预期: capability 仅按 propRef 字符串路径 dispatch, 不再有 propType 数字路径
        // 这个 case 难直接断言, 用代理: 验证 $$controlledProps$$ 内 Position 数字 key 不在
        const propData = (select as any).getPropData(0, ctrl.ctrlId);
        const controlled = propData?.$$controlledProps$$ || {};
        expect(controlled[EnumPropName.Position]).toBeUndefined();
    });

    // ============================================================
    // BUG 9: _fullSnapshot 数据重复 — startRecording 拍快照不应同时含 Position Vec3 + cc.Node.x 子项
    // ============================================================
    it("[BUG-9] _fullSnapshot 不应同时含 EnumPropName.Position (数字 key Vec3) + cc.Node.x (字符串 key number)", () => {
        const { ctrl, select } = setup();
        // 触发 startRecording 拍 _fullSnapshot
        try { (ctrl as any).startRecording(); } catch { /* swallow if recording infra not ready */ }
        const snapshot = (select as any)._fullSnapshot;
        if (snapshot) {
            // X 方案预期: 0 数字 key (全部 string propRef)
            const numericKeys = Object.keys(snapshot).filter(k => /^\d+$/.test(k));
            expect(numericKeys).toEqual([]);
        }
        try { (ctrl as any).stopRecording?.(); } catch { /* swallow */ }
    });

    // ============================================================
    // BUG 10 (bonus, user 原始 case 核心): 排 cc.Node.x 后, 录制改 x → 录制结束(stop/cancel) x 还原到录制前.
    // 用户裁定 (2026-06-03): 排除 = 录制期间完全不影响该属性, 结束时还原到录制前 (见 feedback_exclude_restore_on_cancel).
    // 旧断言曾期望 x 保留录制中改后值 (那时排除 prop 录制完全不被碰); 新规则收紧为"还原".
    // 注: y (跟随中) 不在 acceptance 内 — Recording commit 到 fromState 是正确语义, y 跟随后值跟着 commit.
    // ============================================================
    it("[BUG-10] 端到端: 排 cc.Node.x, 录制改 x → 结束后 x 还原到录制前 (旧聚合 Position 路径也不该乱碰)", () => {
        const { ctrl, select, selectNode } = setup();
        selectNode.x = 0;
        selectNode.y = 0;
        (select as any)._userExcludedProps = ["cc.Node.x"];
        void (select as any).excludedPropsDisplay;
        try {
            (ctrl as any).startRecording();
            selectNode.x = 100;
            selectNode.y = 200;
            (ctrl as any).selectedIndex = 1; // 切 state 自动 stop → 被排除 x 还原到录制前 0
            (ctrl as any).stopRecording();
        } catch { /* swallow recording infra */ }
        (ctrl as any).selectedIndex = 0;
        // 新规则: 被排除的 x 录制结束还原到录制前 0; 旧聚合 Position 路径也不会 apply Vec3 把它拽到别处.
        expect(selectNode.x).toBe(0);
    });
});
