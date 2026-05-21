/**
 * scene-accessor.js 烟雾测试 (Wave 3 Panel scaffold).
 *
 * 仅验证模块可加载 + 路由表完整. 业务行为已在 handlers.test.ts 覆盖.
 * 真实 IPC 路由 (getNodeByUuid / event.reply) 依赖 cocos 编辑器 scene 上下文,
 * 留给 Gemini 接入 UI 后做编辑器实测.
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

describe("scene-accessor.js (smoke)", () => {
    it("模块可加载, 暴露 v0.2 §2 全部 IPC 路由名", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const accessor = require("../../packages/state-controller-panel/scene-accessor");
        const expected = [
            "get-ctrl-snapshot",
            "set-selected-index",
            "set-state-by-id",
            "set-home-page",
            "set-recording",
            "add-state",
            "remove-state",
            "add-property",
            "list-ctrls",
            "dispose-all-bridges",
        ];
        for (const name of expected) {
            expect(typeof accessor[name]).toBe("function");
        }
    });

    it("ctrl 找不到时, handler 调 event.reply 而不抛", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const accessor = require("../../packages/state-controller-panel/scene-accessor");
        const replied: any[] = [];
        const event = { reply: (err: any, result: any) => replied.push({ err, result }) };

        // uuid 不存在 → getCtrlByUuid 返回 null → 回 ctrl not found
        accessor["set-selected-index"](event, { uuid: "nonexistent-uuid", index: 0 });
        expect(replied.length).toBe(1);
        expect(replied[0].err).toMatch(/not found/);
        expect(replied[0].result).toBe(false);
    });
});
