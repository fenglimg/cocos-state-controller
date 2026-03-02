import { StateSelect } from "../StateSelect";

const { ccclass, property } = cc._decorator;

/** 工具按钮分组 - inspector 中显示为可折叠区域 */
@ccclass("StateToolsProps")
export class StateToolsProps {
    public owner: StateSelect = null;

    @property({
        displayName: "🔧 手动刷新检查器",
        tooltip: "强制刷新属性检查器界面，用于解决界面显示异常问题",
    })
    public get manualRefreshInspector() {
        return false;
    }

    public set manualRefreshInspector(v: boolean) {
        if (this.owner && CC_EDITOR && v) this.owner.forceRefreshInspector();
    }

    @property({
        displayName: "📥 从内存同步数据",
        tooltip: "从内存中获取已保存的属性数据并更新当前的属性列表显示",
    })
    public get syncFromMemory() {
        return false;
    }

    public set syncFromMemory(v: boolean) {
        if (this.owner && CC_EDITOR && v) this.owner.syncDataFromMemory();
    }

    @property({
        displayName: "🔄 刷新属性列表",
        tooltip: "重新检测当前节点支持的属性类型并更新复选框列表",
    })
    public get refreshPropList() {
        return false;
    }

    public set refreshPropList(v: boolean) {
        if (this.owner && CC_EDITOR && v) this.owner.updateAvailableProps();
    }

    @property({
        displayName: "🗑️ 删除当前属性",
        tooltip: "真正删除内存中的当前属性数据（需要二次确认）",
    })
    public get deleteCurrentProperty() {
        return false;
    }

    public set deleteCurrentProperty(v: boolean) {
        if (this.owner && CC_EDITOR && v) this.owner.deletePropertyWithConfirmation();
    }

    @property({
        displayName: "🔄 重新获取控制器",
        tooltip: "手动获取和刷新当前StateSelect组件管理的StateController实例\n\n用途：当StateController发生变化或初始化异常时使用",
    })
    public get reloadController() {
        return false;
    }

    public set reloadController(v: boolean) {
        if (this.owner && CC_EDITOR && v) this.owner.manualReloadController();
    }
}
