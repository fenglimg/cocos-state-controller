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
        // console.log(CCClass.Attr.getClassAttrs(itself)[`selectedIndex${CCClass.Attr.DELIMETER}enumList`])
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
        if (itself.isInit || itself._selectedIndex != value) {
            itself.isInit = false;
            if (value > itself._pageNames.length - 1) {
                throw "index out of bounds:（越界） " + value;
            }
            itself.changing = true;
            itself._previousIndex = itself._selectedIndex;
            itself._selectedIndex = value;
            itself.updateState(EnumUpdataType.state);
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
        if (value.length < 2) {
            console.error("状态必须大于两个")
            return;
        }

        let oldLen = itself._pageNames.length;
        let newLen = value.length;
        let deleteIndex = -1;
        if (oldLen > newLen) {
            for (let index = 0; index < oldLen; index++) {
                let oldS = itself._pageNames[index];
                let newS = value[index];
                if (!newS || oldS.stateId != newS.stateId) {
                    //被删的index，更新数据
                    deleteIndex = index;
                    setTimeout(() => {
                        if (itself.selectedIndex >= index) {
                            itself.selectedIndex = itself.selectedIndex - 1;
                        }
                    })
                    break;
                }
            }
        } else if (newLen > oldLen) {
            for (let index = itself._pageNames.length, len = value.length; index < len; index++) {
                let val = value[index];
                val.name = "" + itself.stateIdAuto;
                val.stateId = itself.stateIdAuto++;
            }
        }
        itself._pageNames = value;
        let stateMap: { [key: string]: boolean } = {};
        let array = value.map((val, i) => {
            if (val && stateMap[val.name]) {
                console.error("重复的状态值", val, i);
            }
            stateMap[val.name] = true;
            return { name: val.name, value: i };
        })
        itself.updateState(EnumUpdataType.selPage, deleteIndex)
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
    /** 🔧 优化：更新状态，使用更严格的类型定义 */
    private updateState(type: EnumUpdataType, value?: number) {
        let itself = this;

        let updateChild = function (rootNode: cc.Node) {
            let nodeQueue: cc.Node[] = [rootNode];
            let processedNodes = new Set<cc.Node>(); // 防止重复处理

            while (nodeQueue.length > 0) {
                let parent = nodeQueue.shift();

                // 安全检查和重复处理防护
                if (!parent || !parent.children || processedNodes.has(parent)) {
                    continue;
                }
                processedNodes.add(parent);

                let children = parent.children;
                let len = children.length;

                for (let index = 0; index < len; index++) {
                    let child = children[index];

                    let childStateController = child.getComponent(StateController);
                    let stateSelect = child.getComponent(StateSelect);

                    // 如果找到StateSelect组件，处理它
                    if (stateSelect) {
                        if (type == EnumUpdataType.state) {
                            stateSelect.updateState(itself);
                        } else if (type == EnumUpdataType.name) {
                            stateSelect.updateCtrlName(itself.node);
                        } else if (type == EnumUpdataType.selPage) {
                            stateSelect.updateCtrlPage(itself, value);
                        } else if (type == EnumUpdataType.delete) {
                            stateSelect.updateDelete(itself);
                        } else if (type == EnumUpdataType.init) {
                            stateSelect.updatePreLoad(itself);
                        } else if (type == EnumUpdataType.prop) {
                            stateSelect.updateProp(itself);
                        }
                    }

                    if (!childStateController && child.children && child.children.length > 0) {
                        nodeQueue.push(child);
                    }
                }
            }
        }

        updateChild(itself.node);
    }
}