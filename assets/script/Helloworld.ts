import { StateControllerV2 } from "./controller/StateControllerV2";

const { ccclass, property } = cc._decorator;

@ccclass
export default class Helloworld extends cc.Component {
    @property(cc.String)
    private lbl: string = "Hello World";
}
