import { StateSelect } from "../StateSelect";

const { ccclass } = cc._decorator;

/**
 * @deprecated M2 起原 16 项混杂属性已拆分到三个独立分组类:
 * - {@link StateTextProps} (Label / RichText / Font / LabelOutline 等 8 个文本相关属性)
 * - {@link StateSpriteProps} (SpriteFrame / SpriteFillRange / GrayScale 等 3 个图片属性)
 * - {@link StateBehaviorProps} (Slider / EditBox / Button / Toggle / ProgressBar / ScrollView / Mask 等 7 个交互行为属性)
 *
 * 本类保留为空 @ccclass 兼容壳, 仅用于让旧场景反序列化 `__type__: "StateComponentProps"` 时不报错。
 *
 * ⚠️ 类名字符串 "StateComponentProps" 不可修改 — 会破坏现有 .fire / .prefab 反序列化。
 *
 * 后续 M3 将通过 _migrate(v1 -> v2) 把旧 componentProps 字段中残留的受控属性
 * 自动迁移到新拆分类对应的 group 字段中, 然后可考虑彻底删除本兼容壳。
 */
@ccclass("StateComponentProps")
export class StateComponentProps {
    /**
     * @deprecated 仅为兼容旧场景保留, 新代码请使用 StateSelect.textProps / spriteProps / behaviorProps 三个分组字段。
     */
    public owner: StateSelect = null;
}
