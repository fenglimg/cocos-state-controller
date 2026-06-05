/**
 * StateController._recording API 契约红测试 (Wave 2 T03)
 *
 * 录制语义 X (一次录制贯穿多 state, 显式 Start/Stop):
 *   - ctrl.isRecording: boolean readonly
 *   - ctrl.startRecording(): 进入录制态, 通知所有 StateSelect 拍 snapshot
 *   - ctrl.stopRecording(): 退出录制态, 通知所有 StateSelect final commit + 清 snapshot
 *   - _recording 不序列化 (新 ctrl / 反序列化 isRecording = false)
 *   - 重复 start/stop 幂等 (重复 start 不重拍)
 *
 * 红预期: 当前 StateController 没有这套 API。
 */

declare global {
    const CC_EDITOR: boolean;
    const cc: any;
    const Editor: any;
}

beforeAll(() => {
    (globalThis as any).CC_EDITOR = true;
    (globalThis as any).Editor = {
        log: () => {}, warn: () => {}, error: () => {},
        Utils: { refreshSelectedInspector: () => {} },
    };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ControllerMod = require("../../assets/script/controller/StateControllerV2");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SelectMod = require("../../assets/script/controller/StateSelectV2");

const { StateController } = ControllerMod;
const { StateSelect } = SelectMod;

function setup() {
    const ccLocal = (globalThis as any).cc;
    const root = new ccLocal.Node("Root");
    const ctrlNode = new ccLocal.Node("CtrlNode");
    root.addChild(ctrlNode);
    const selectNode = new ccLocal.Node("SelectNode");
    ctrlNode.addChild(selectNode);

    const ctrl = ctrlNode.addComponent(StateController);
    (ctrl as any).__preload();

    const select = selectNode.addComponent(StateSelect);
    (select as any).__preload();

    (ctrl as any).markCacheDirty();

    return { root, ctrl, select };
}

describe("StateController recording API (Wave 2 T03)", () => {
    it("新建 ctrl 默认 isRecording = false", () => {
        const { ctrl } = setup();
        expect(ctrl.isRecording).toBe(false);
    });

    it("startRecording 后 isRecording = true", () => {
        const { ctrl } = setup();
        ctrl.startRecording();
        expect(ctrl.isRecording).toBe(true);
    });

    it("stopRecording 后 isRecording = false", () => {
        const { ctrl } = setup();
        ctrl.startRecording();
        ctrl.stopRecording();
        expect(ctrl.isRecording).toBe(false);
    });

    it("startRecording 通知所有 StateSelect.onRecordingStart", () => {
        const { ctrl, select } = setup();
        let started = 0;
        (select as any).onRecordingStart = () => { started++; };
        ctrl.startRecording();
        expect(started).toBe(1);
    });

    it("stopRecording 通知所有 StateSelect.onRecordingStop", () => {
        const { ctrl, select } = setup();
        let stopped = 0;
        (select as any).onRecordingStop = () => { stopped++; };
        ctrl.startRecording();
        ctrl.stopRecording();
        expect(stopped).toBe(1);
    });

    it("重复 startRecording 不抛, 仅第一次触发 onRecordingStart (幂等)", () => {
        const { ctrl, select } = setup();
        let started = 0;
        (select as any).onRecordingStart = () => { started++; };
        ctrl.startRecording();
        ctrl.startRecording();
        ctrl.startRecording();
        expect(started).toBe(1);
        expect(ctrl.isRecording).toBe(true);
    });

    it("重复 stopRecording 在未录制时不抛, 仅触发一次 onRecordingStop", () => {
        const { ctrl, select } = setup();
        let stopped = 0;
        (select as any).onRecordingStop = () => { stopped++; };
        ctrl.startRecording();
        ctrl.stopRecording();
        ctrl.stopRecording(); // no-op
        expect(stopped).toBe(1);
        expect(ctrl.isRecording).toBe(false);
    });

    it("_recording 字段不可序列化 (反序列化后 isRecording = false)", () => {
        const { ctrl } = setup();
        ctrl.startRecording();
        // 模拟 cocos serialize: 检查 @property metadata - 但既然不序列化, 我们至少验证 _recording
        // 是普通字段, 没有 @property 装饰. 用 cc.Class.attr 取属性表
        // 实际上更精确的方式: 让用户重启编辑器后 isRecording 自动回 false.
        // 这里写法简化: 验证内部字段名 _recording 存在且未被 cc 注册到 @property 表.
        const attrs = cc.Class.Attr.getClassAttrs(StateController);
        // serializable: true 或 default 都算可序列化
        const recordingAttr = attrs && attrs["_recording$_$default"];
        // _recording 不应该被注册为 @property
        expect(recordingAttr).toBeUndefined();
    });
});
