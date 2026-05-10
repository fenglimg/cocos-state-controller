import { StateController } from "./controller/StateController";

const { ccclass, property } = cc._decorator;

@ccclass
export default class Helloworld extends cc.Component {
    @property(StateController)
    stateController: StateController = null;

    onClickSwitchMode() {
        this.stateController.selectedIndex = this.stateController.selectedIndex === 0 ? 1 : 0;
    }
}
