const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.resolve(__dirname, "index.html"), "utf8");
document.documentElement.innerHTML = html;

// ---- Proto runtime bootstrap (for modules that read `wepie.*` at import-time) ----
// Ensure protobuf runtime is globally available before loading generated wepie proto bundle.
try {
    if (!(globalThis).protobuf) {
        require(path.resolve(__dirname, "../../assets/Proto/protobuf.js"));
    }
    if (!(globalThis).wepie) {
        require(path.resolve(__dirname, "../../assets/Proto/wepie-proto-static.js"));
    }
}
catch (e) {
    // 某些测试不依赖 wepie/protobuf；这里失败也不应阻断 cc 环境启动
    // 需要时由具体测试用例自行保证依赖存在
}

var canvas = document.getElementById("GameCanvas");
var option = {
    id: canvas,
    debugMode: 1,
    showFPS: false,
    frameRate: 60,
    groupList: ["default"],
    collisionMatrix: [[true]],
};

cc.game.run(option, () => {});