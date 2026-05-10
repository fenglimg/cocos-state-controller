/**
 * 🔧 状态控制器运行时公开 API barrel
 *
 * 此文件作为 controller 模块的统一公开入口:
 * - 4 大类: StateController, StateSelect, PropHandlerManager, StateErrorManager
 * - 4 大枚举: EnumStateName, EnumCtrlName, EnumPropName, EnumUpdataType
 * - 共享类型: IPropHandler, TPropValue
 *
 * 副作用 import "./BuiltinPropHandlers" 触发 41 个内置 PropHandler 注册。
 * 业务方推荐 import 此 barrel 而非各个子文件，避免漏掉 BuiltinPropHandlers 注册副作用。
 */

// 主类
export { StateController, StateValue } from "./StateController";
export { StateSelect } from "./StateSelect";
export { PropHandlerManager } from "./PropHandlerManager";
export { StateErrorManager } from "./StateErrorManager";

// 枚举
export {
    EnumStateName,
    EnumCtrlName,
    EnumPropName,
    EnumUpdataType,
    InspectorRefreshMode,
} from "./StateEnum";

// 共享类型
export { IPropHandler, TPropValue } from "./types";

// 副作用 import: 确保 41 个内置 PropHandler 在 barrel 被首次 import 时注册到 PropHandlerManager
import "./BuiltinPropHandlers";
