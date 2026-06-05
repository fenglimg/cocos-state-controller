/**
 * brief 必删清单: StateSelect inspector 上的 "工具" 分组 (5 个治标按钮) 应物理删除.
 *
 * 原因: panel 时代的兜底操作 (手动刷新检查器 / 同步内存 / 重新获取控制器等),
 * "架构应自愈" — 现在 inspector 自动同步, 这些按钮失效. UI 入口删, 方法保留作 public API.
 *
 * 契约:
 *   1. StateSelect.__props__ 不含 "toolsProps"
 *   2. assets/script/controller/props/StateToolsProps.ts 文件不存在
 *   3. assets/script/controller/StateSelect.ts 源码不含 "StateToolsProps" 字符串 (import / type 引用)
 */

declare global {
    const CC_EDITOR: boolean;
    const cc: any;
    const Editor: any;
}

beforeAll(() => {
    (globalThis as any).CC_EDITOR = true;
    (globalThis as any).Editor = {
        log: () => {},
        warn: () => {},
        error: () => {},
        Utils: { refreshSelectedInspector: () => {} },
    };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require("fs");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require("path");

describe("StateSelect 工具组按钮已物理删除 (brief 必删 §6)", () => {
    it("StateSelect.__props__ 不含 'toolsProps'", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { StateSelect } = require("../../assets/script/controller/StateSelectV2");
        const props = (StateSelect as any).__props__ as string[];
        expect(Array.isArray(props)).toBe(true);
        expect(props).not.toContain("toolsProps");
    });

    it("assets/script/controller/props/StateToolsProps.ts 文件不存在", () => {
        const p = path.resolve(__dirname, "../../assets/script/controller/props/StateToolsProps.ts");
        expect(fs.existsSync(p)).toBe(false);
    });

    it("StateSelect.ts 源码不含 'StateToolsProps' 引用", () => {
        const p = path.resolve(__dirname, "../../assets/script/controller/StateSelectV2.ts");
        const src = fs.readFileSync(p, "utf8");
        expect(src).not.toMatch(/StateToolsProps/);
        expect(src).not.toMatch(/toolsProps/);
    });
});
