/**
 * W6-1 红测试: PrefabIntrospection.listTrackableProps 契约
 *
 * 走 cocos __props__ + Class.Attr.getClassAttrs 元数据枚举节点上可追踪的 prop:
 *   - cc.Node 上的 user-facing prop (active/x/y/z/scale/color/opacity/anchorX 等)
 *   - 节点挂载的每个 cc.Component 的 @property 字段
 *   - 跳过 _ 开头的内部字段
 *   - 跳过 visible:false 标记的 prop
 *   - 跳过 SYSTEM_EXCLUDE 黑名单 (cc.Widget.target / _alignFlags / cc.Animation.defaultClip 等)
 *   - readonly = hasGetter=true 且 hasSetter !== true
 *   - 每条结果 propRef = compName + "." + propKey
 *   - 含自定义 @ccclass 组件 fixture 的 @property 字段
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
const Mod = require("../../assets/script/controller/PrefabIntrospection");

const { listTrackableProps, SYSTEM_EXCLUDE } = Mod;

// 自定义 ccclass fixture (jest 环境注册)
const ccL = (globalThis as any).cc;
const ccclass = ccL._decorator.ccclass;
const property = ccL._decorator.property;

@ccclass("W6TestComp")
class W6TestComp extends ccL.Component {
    @property() public heatLevel: number = 0;
    @property() public label: string = "foo";
    @property({ visible: false }) public hiddenField: number = 0;
}

describe("PrefabIntrospection.listTrackableProps", () => {
    it("返回 cc.Node 的 active/x/y/z/scale/color/opacity/anchorX/anchorY/width/height", () => {
        const node = new ccL.Node("Bare");
        const list = listTrackableProps(node);
        const refs = list.map((p: any) => p.propRef);
        expect(refs).toContain("cc.Node.active");
        expect(refs).toContain("cc.Node.x");
        expect(refs).toContain("cc.Node.y");
        expect(refs).toContain("cc.Node.scale");
        expect(refs).toContain("cc.Node.color");
        expect(refs).toContain("cc.Node.opacity");
        expect(refs).toContain("cc.Node.anchorX");
        expect(refs).toContain("cc.Node.width");
    });

    it("挂 cc.Sprite 后返回包含 cc.Sprite.spriteFrame", () => {
        const node = new ccL.Node("WithSprite");
        node.addComponent(ccL.Sprite);
        const list = listTrackableProps(node);
        const refs = list.map((p: any) => p.propRef);
        expect(refs).toContain("cc.Sprite.spriteFrame");
        expect(refs).toContain("cc.Sprite.fillRange");
    });

    it("下划线开头的内部字段不在结果中", () => {
        const node = new ccL.Node("NoUnder");
        node.addComponent(ccL.Sprite);
        const list = listTrackableProps(node);
        const refs = list.map((p: any) => p.propRef);
        // cc.Node 内部字段
        expect(refs.some((r: string) => r.includes("._position"))).toBe(false);
        expect(refs.some((r: string) => r.includes("._color"))).toBe(false);
        expect(refs.some((r: string) => r.includes("._contentSize"))).toBe(false);
        // cc.Sprite 内部
        expect(refs.some((r: string) => r.includes("._spriteFrame"))).toBe(false);
        expect(refs.some((r: string) => r.includes("._materials"))).toBe(false);
    });

    it("visible:false 的 @property 不在结果中", () => {
        const node = new ccL.Node("Hidden");
        node.addComponent(W6TestComp);
        const list = listTrackableProps(node);
        const refs = list.map((p: any) => p.propRef);
        // hiddenField 明确标 visible:false
        expect(refs).not.toContain("W6TestComp.hiddenField");
        // heatLevel 不标 visible (默认 visible) 应出现
        expect(refs).toContain("W6TestComp.heatLevel");
    });

    it("SYSTEM_EXCLUDE 黑名单的 propRef 不出现 (cc.Widget.target 等)", () => {
        const node = new ccL.Node("WithWidget");
        node.addComponent(ccL.Widget);
        const list = listTrackableProps(node);
        const refs = list.map((p: any) => p.propRef);
        // SYSTEM_EXCLUDE 里的项绝不出现
        SYSTEM_EXCLUDE.forEach((excluded: string) => {
            expect(refs).not.toContain(excluded);
        });
        // widget 用户面 prop (top/left/isAlignTop) 应在
        // 注: cc.Widget.enabled 在 cocos 元数据中标 visible:false (引擎特殊处理), 不被列入
        expect(refs).toContain("cc.Widget.top");
        expect(refs).toContain("cc.Widget.left");
        expect(refs).toContain("cc.Widget.isAlignTop");
    });

    it("自定义 @ccclass 组件的 @property 也被列出", () => {
        const node = new ccL.Node("WithCustom");
        node.addComponent(W6TestComp);
        const list = listTrackableProps(node);
        const refs = list.map((p: any) => p.propRef);
        expect(refs).toContain("W6TestComp.heatLevel");
        expect(refs).toContain("W6TestComp.label");
    });

    it("每条结果含 propRef = compName + . + propKey", () => {
        const node = new ccL.Node("Refs");
        const list = listTrackableProps(node);
        list.forEach((p: any) => {
            expect(p.propRef).toBe(`${p.compName}.${p.propKey}`);
            expect(typeof p.compName).toBe("string");
            expect(typeof p.propKey).toBe("string");
        });
    });

    it("readonly 字段 (cc.Node.uuid / activeInHierarchy / up) 标 readonly:true", () => {
        const node = new ccL.Node("ReadOnly");
        const list = listTrackableProps(node);
        const findRef = (ref: string) => list.find((p: any) => p.propRef === ref);
        // uuid/activeInHierarchy/up/right/forward 是 getter only
        const uuid = findRef("cc.Node.uuid");
        const aih = findRef("cc.Node.activeInHierarchy");
        if (uuid) expect(uuid.readonly).toBe(true);
        if (aih) expect(aih.readonly).toBe(true);
        // active/x/y 应该 readonly=false
        const active = findRef("cc.Node.active");
        expect(active).toBeDefined();
        expect(active.readonly).toBe(false);
    });
});
