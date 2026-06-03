import { EnumPropName } from "../StateEnum";
import { StateSelect } from "../StateSelect";

const { ccclass, property } = cc._decorator;
/** 节点基础属性分组 - inspector 中显示为可折叠区域 */
@ccclass("StateNodeProps")
export class StateNodeProps {
    public owner: StateSelect = null;

    @property({ displayName: "显示/隐藏 (Active)", tooltip: "控制节点的显示和隐藏状态" })
    public get propActive() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.Active) : false;
    }

    public set propActive(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.Active, v);
    }

    // #C1/#C7: 聚合勾选框 (位置/缩放/尺寸/旋转/锚点) 已删除 —— auto-opt 以子项 cc.Node.x/y/z 等
    // 独立接管 (聚合不接入), 聚合勾选框查聚合 key 恒未勾(C1 误导) 且 off 删不掉(C7 trapped)。
    // 子项由自动接管管理, 排除走 setPropExcluded 注入徽标, 故聚合手动勾选框冗余且坏, 整组移除。

    @property({ displayName: "颜色 (Color)", tooltip: "节点的颜色属性" })
    public get propColor() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.Color) : false;
    }

    public set propColor(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.Color, v);
    }

    @property({ displayName: "透明度 (Opacity)", tooltip: "节点的透明度" })
    public get propOpacity() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.Opacity) : false;
    }

    public set propOpacity(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.Opacity, v);
    }
}
