/**
 * 内置 capability bootstrap (Wave 3 T07).
 *
 * 静态注册依赖 module 被 import 才会执行. 用户只 import StateController 时, capability
 * 文件不会被 cocos build 链接到产出, 导致生产 runtime 没有任何 capability 注册.
 *
 * 这个 index 聚合所有 L0 内置 capability, StateController 顶部 import 它即可保证全部注册.
 *
 * L0 内置 = 跟随主仓发布 + 默认启用. 第三方 capability (L1/L2) 由用户自行 import.
 */

import "./AutoSyncCapability";
import "./CodeGenCapability";
import "./EventCapability";
import "./HomePageCapability";
import "./MigrationCapability";
import "./MultiCtrlBindingCapability";
import "./PresetCapability";
import "./PropertyControlCapability";
import "./RecordingCapability";
import "./SelectedPageIdCapability";
import "./TweenCapability";
