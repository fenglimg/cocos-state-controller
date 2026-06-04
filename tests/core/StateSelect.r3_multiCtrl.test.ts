/**
 * Round3 #T1 + #T2: 多 controller 边界.
 * T1: isDirectlyControlled 只查父链中间 controller, 不查 targetNode 自身 → 若节点自带 StateControllerV2,
 *     祖先 controller 仍误判直接控制它(双 claim)。
 * T2: handleControllerTransition 改 _currCtrlId 但不 markCacheDirty 新旧 controller → 缓存失同步。
 */
declare global { const CC_EDITOR: boolean; const cc: any; const Editor: any; }
beforeAll(() => {
    (globalThis as any).CC_EDITOR = true;
    (globalThis as any).Editor = { log:()=>{},warn:()=>{},error:()=>{}, Utils:{refreshSelectedInspector:()=>{}} };
});
const { StateControllerV2 } = require("../../assets/script/controller/StateControllerV2");
const { StateSelectV2 } = require("../../assets/script/controller/StateSelectV2");
const ccL = (globalThis as any).cc;

describe("#T1 isDirectlyControlled 应查 targetNode 自身的 controller", () => {
    it("子节点自带 StateControllerV2 时, 祖先 controller 不应直接控制它", () => {
        const root = new ccL.Node("T1_Root");
        const parentNode = new ccL.Node("T1_Parent"); root.addChild(parentNode);
        const childNode = new ccL.Node("T1_Child"); parentNode.addChild(childNode);
        const ctrlA = parentNode.addComponent(StateControllerV2); (ctrlA as any).__preload();
        const ctrlB = childNode.addComponent(StateControllerV2); (ctrlB as any).__preload();

        // A(父) 不应直接控制 child(child 自带 B); B 应直接控制自己这棵子树的节点
        expect((ctrlA as any).isDirectlyControlled(childNode)).toBe(false);
        expect((ctrlB as any).isDirectlyControlled(childNode)).toBe(true);
    });
});

describe("#T2 跨 controller 移动后两 controller 缓存应失效重建", () => {
    it("handleControllerTransition 后 旧/新 controller 都 markCacheDirty", () => {
        const root = new ccL.Node("T2_Root");
        const parentA = new ccL.Node("T2_PA"); root.addChild(parentA);
        const parentB = new ccL.Node("T2_PB"); root.addChild(parentB);
        const ctrlA = parentA.addComponent(StateControllerV2); (ctrlA as any).__preload();
        const ctrlB = parentB.addComponent(StateControllerV2); (ctrlB as any).__preload();
        // ctrlId 默认 Date.now(), 同 tick 创建会碰撞 → 手动赋不同 id 保证是"跨 ctrl"场景
        (ctrlB as any).ctrlId = (ctrlA as any).ctrlId + 1;
        const childNode = new ccL.Node("T2_Child"); parentA.addChild(childNode);
        const select = childNode.addComponent(StateSelectV2); (select as any).__preload();
        (ctrlA as any).markCacheDirty();
        // 稳定到非 dirty (模拟已建缓存)
        (ctrlA as any)._cacheDirty = false;
        (ctrlB as any)._cacheDirty = false;

        // 移动 child A→B 并触发 transition
        childNode.removeFromParent(false); parentB.addChild(childNode);
        (select as any).handleControllerTransition(parentA, parentB);

        // 两 controller 缓存都应被标脏(否则旧A继续更新、新B不接管)
        expect((ctrlA as any)._cacheDirty).toBe(true);
        expect((ctrlB as any)._cacheDirty).toBe(true);
    });
});
export {};
