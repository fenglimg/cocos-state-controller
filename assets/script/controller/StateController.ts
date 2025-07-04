/**
 * 控制器已知问题：
 * 1.有些属性只能从PropValue设置没有监听方法如：Label_String,Opacity,Font等等。
 * 2.SpirteFrame不能在PropValue设置，只能从编辑器设置
 */

const { ccclass, property, menu, executeInEditMode } = cc._decorator;
import { EnumStateName, EnumUpdataType } from './StateEnum';
import { StateSelect } from './StateSelect';

cc.Enum(EnumStateName)

@ccclass("stateValue")
export class StateValue {
    @property(cc.String)
    name: string = "";
    @property({ type: cc.Integer, readonly: true })
    stateId: number = 0;
    constructor(name: string, stateId: number) {
        let itself = this;
        itself.name = name;
        itself.stateId = stateId;
    }
}
@ccclass('StateController')
@executeInEditMode()
export class StateController extends cc.Component {
    @property({ visible: false })
    private stateIdAuto = 0;
    /** 控制器唯一id，如果使用uuid每次打开编辑器就会变 */
    @property({ visible: false })
    _ctrlId = Date.now();
    /** 选中的状态下标 */
    @property(EnumStateName)
    private _selectedIndex: EnumStateName = 0;
    /** 状态名字列表 */
    @property(StateValue)
    private _pageNames: StateValue[] = [];
    /** 上一次选中的下标 */
    private _previousIndex: number = -1;
    /** 控制器名字 */
    @property(cc.String)
    private _ctrlName: string = "";
    /** 是否正在改变 */
    changing?: boolean;
    /** 是否初始 ,假设编辑器默认状态是2，代码里面正好第一次状态也是2，会导致selecteindex那里不刷新状态。 */
    isInit: boolean = true;


    protected __preload() {
        let itself = this;
        if (!CC_EDITOR) {
            return;
        }
        if (!itself._pageNames.length) {
            itself._pageNames = [new StateValue("0", itself.stateIdAuto++), new StateValue("1", itself.stateIdAuto++)]
        }
        let array = itself.states.map((val, i) => {
            return { name: val.name, value: i };
        })
        //@ts-ignore
        cc.Class.Attr.setClassAttr(itself, "selectedIndex", "enumList", array);
        if (!itself._ctrlName) {
            itself.ctrlName = `ctrl_${Date.now().toString()}`;
        }
        itself.updateState(EnumUpdataType.init);
    }
    protected onLoad() {
        let itself = this;
        if (!CC_EDITOR) {
            return;
        }
        setTimeout(() => {
            itself.updateState(EnumUpdataType.state)
        });
    }
    protected onDestroy() {
        let itself = this;
        if (CC_EDITOR) {
            itself.updateState(EnumUpdataType.delete)
        }
    }

    @property({ displayName: "name", tooltip: "控制器唯一名称" })
    get ctrlName() {
        return this._ctrlName;
    }
    set ctrlName(value: string) {
        let itself = this;
        itself._ctrlName = value;
        if (CC_EDITOR) {
            itself.updateState(EnumUpdataType.name);
        }
    }

    /** 选择的状态下标 */
    @property({ type: EnumStateName, displayName: "selectedPage", tooltip: "当前选中的状态" })
    public get selectedIndex() {
        return this._selectedIndex;
    }
    public set selectedIndex(value: EnumStateName) {
        let itself = this;
        // 🔧 只在状态真正改变时才进行更新，避免不必要的重复处理
        if (itself.isInit || itself._selectedIndex != value) {
            itself.isInit = false;

            // 🔧 边界检查：确保状态索引在有效范围内
            if (value > itself._pageNames.length - 1) {
                throw "index out of bounds:（越界） " + value;
            }

            // 🔧 状态切换流程：标记正在变化 → 保存上一状态 → 更新当前状态 → 触发更新
            itself.changing = true;
            itself._previousIndex = itself._selectedIndex;
            itself._selectedIndex = value;

            // 🔧 通知所有相关组件状态已改变
            itself.updateState(EnumUpdataType.state);

            // 🔧 编辑器环境下同步属性更新
            if (CC_EDITOR) {
                itself.updateState(EnumUpdataType.prop);
            }

            itself.changing = false;
        }
    }

    @property({ type: StateValue, tooltip: "状态数量。数组内容为状态名称" })
    get states() {
        return this._pageNames;
    }
    private set states(value: StateValue[]) {
        if (!CC_EDITOR) {
            return;
        }
        let itself = this;

        // 🔧 业务规则：状态控制器必须至少有2个状态
        if (value.length < 2) {
            console.error("状态必须大于两个")
            return;
        }

        // 🔧 状态数组变化检测：比较新旧长度，判断是删除还是新增
        let oldLen = itself._pageNames.length;
        let newLen = value.length;
        let deleteIndex = -1;

        // 🔧 处理状态删除：找到被删除的状态索引
        if (oldLen > newLen) {
            for (let index = 0; index < oldLen; index++) {
                let oldS = itself._pageNames[index];
                let newS = value[index];
                if (!newS || oldS.stateId != newS.stateId) {
                    // 🔧 记录被删除的索引，用于数据清理
                    deleteIndex = index;

                    // 🔧 延迟调整当前选中索引，避免越界
                    setTimeout(() => {
                        if (itself.selectedIndex >= index) {
                            itself.selectedIndex = itself.selectedIndex - 1;
                        }
                    })
                    break;
                }
            }
        }
        // 🔧 处理状态新增：为新状态自动生成名称和ID
        else if (newLen > oldLen) {
            for (let index = itself._pageNames.length, len = value.length; index < len; index++) {
                let val = value[index];
                val.name = "" + itself.stateIdAuto;
                val.stateId = itself.stateIdAuto++;
            }
        }

        // 🔧 更新状态数组
        itself._pageNames = value;

        // 🔧 状态名称唯一性检查：防止重复状态名
        let stateMap: { [key: string]: boolean } = {};
        let array = value.map((val, i) => {
            if (val && stateMap[val.name]) {
                console.error("重复的状态值", val, i);
            }
            stateMap[val.name] = true;
            return { name: val.name, value: i };
        })

        // 🔧 通知相关组件状态列表已更新
        itself.updateState(EnumUpdataType.selPage, deleteIndex)

        // 🔧 动态更新编辑器属性面板的枚举列表
        //@ts-ignore
        cc.Class.Attr.setClassAttr(itself, "selectedIndex", "enumList", array);
    }


    /** 上一次的选中下标 */
    public get previsousIndex(): number {
        return this._previousIndex;
    }
    /** 选择的状态名字 */
    public get selectedPage(): string {
        if (this._selectedIndex == -1)
            return null;
        else
            return this._pageNames[this._selectedIndex].name;
    }
    public set selectedPage(val: string) {
        let itself = this;
        for (let index = 0, len = itself._pageNames.length; index < len; index++) {
            if (itself._pageNames[index].name == val) {
                itself.selectedIndex = index;
                return;
            }
        }
    }
    /** 🔧 核心方法：状态更新通知机制 - 将状态变化通知给所有相关的StateSelect组件 */
    private updateState(type: EnumUpdataType, value?: number) {
        let itself = this;

        /**
         * 🔧 递归子节点更新函数：使用广度优先搜索遍历整个节点树
         * 关键优化点：
         * 1. 队列替代递归，避免深度递归导致的栈溢出
         * 2. 处理节点去重，防止重复处理
         * 3. 智能跳过有子控制器的节点，避免跨控制器污染
         */
        let updateChild = function (rootNode: cc.Node) {
            // 🔧 使用队列实现广度优先搜索，性能更好且避免递归深度问题
            let nodeQueue: cc.Node[] = [rootNode];
            let processedNodes = new Set<cc.Node>(); // 防止重复处理

            while (nodeQueue.length > 0) {
                let parent = nodeQueue.shift();

                // 🔧 安全检查：确保节点有效且未被处理过
                if (!parent || !parent.children || processedNodes.has(parent)) {
                    continue;
                }
                processedNodes.add(parent);

                let children = parent.children;
                let len = children.length;

                // 🔧 遍历所有子节点，寻找StateSelect组件
                for (let index = 0; index < len; index++) {
                    let child = children[index];

                    let childStateController = child.getComponent(StateController);
                    let stateSelect = child.getComponent(StateSelect);

                    // 🔧 找到StateSelect组件，根据更新类型执行相应操作
                    if (stateSelect) {
                        if (type == EnumUpdataType.state) {
                            // 🔧 状态切换：通知StateSelect组件状态已改变
                            stateSelect.updateState(itself);
                        } else if (type == EnumUpdataType.name) {
                            // 🔧 名称更新：通知StateSelect组件控制器名称已更改
                            stateSelect.updateCtrlName(itself.node);
                        } else if (type == EnumUpdataType.selPage) {
                            // 🔧 状态页面更新：通知StateSelect组件状态列表已更改
                            stateSelect.updateCtrlPage(itself, value);
                        } else if (type == EnumUpdataType.delete) {
                            // 🔧 删除通知：通知StateSelect组件控制器即将被删除
                            stateSelect.updateDelete(itself);
                        } else if (type == EnumUpdataType.init) {
                            // 🔧 初始化通知：通知StateSelect组件控制器已完成初始化
                            stateSelect.updatePreLoad(itself);
                        } else if (type == EnumUpdataType.prop) {
                            // 🔧 属性更新：通知StateSelect组件属性已更改
                            stateSelect.updateProp(itself);
                        }
                    }

                    // 🔧 智能遍历策略：如果子节点没有StateController且有子节点，则继续遍历
                    // 这样可以避免跨控制器边界的状态污染
                    if (!childStateController && child.children && child.children.length > 0) {
                        nodeQueue.push(child);
                    }
                }
            }
        }

        // 🔧 从当前控制器节点开始更新所有相关的StateSelect组件
        updateChild(itself.node);
    }
}