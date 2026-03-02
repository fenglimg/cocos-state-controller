'use strict';

const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

/**
 * ccc-state-controller 扩展包主入口
 *
 * 功能：
 * 1. 通过菜单触发安装/更新状态控制器源码
 * 2. 从本地子模块 ccc-state-controller-core 获取源码
 * 3. 安装到用户选择的目标文件夹
 * 4. 智能检测：存在则覆盖，不存在则新建
 * 5. 不生成 .meta 文件
 */

// 子模块路径配置
const SUBMODULE_PATH = path.join(__dirname, 'ccc-state-controller-core');
const SUBMODULE_SRC_PATH = path.join(SUBMODULE_PATH, 'src');

// 鎟始源码路径（作为最终回退)
const LEGACY_SOURCE_PATH = path.join(__dirname, '..', '..', 'assets', 'script', 'Controller');

// 需要安装的文件列表
const FILES_TO_INSTALL = [
    'StateController.ts',
    'StateSelect.ts',
    'StateEnum.ts',
    'StateErrorManager.ts',
    'StatePropHandler.ts',
    'Props/StateComponentProps.ts',
    'Props/StateNodeProps.ts',
    'Props/StateToolsProps.ts',
    'Props/StateWidgetProps.ts',
];

// 版本信息
const CORE_VERSION = '1.0.0';
const GITHUB_REPO = 'https://github.com/fenglimg/ccc-state-controller-core';

/**
 * 从本地子模块获取源码
 * @returns {Promise<Array<{name: string, content: string}>>} 文件列表
 */
+async function fetchSourceFromSubmodule() {
    const files = [];

    for (const filePath of FILES_TO_INSTALL) {
        try {
            const submodulePath = path.join(SUBMODULE_SRC_PATH, filePath);
            if (fs.existsSync(submodulePath)) {
                const content = fs.readFileSync(submodulePath, 'utf-8');
                files.push({
                    name: filePath,
                    content: content
                });
            }
        } catch (error) {
                Editor.warn(`[ccc-state-controller] 从子模块获取文件 ${filePath} 失败: ${error.message}`);
            }
        }
    }
    return files.length > 0 ? files : null;
+}
+/**
 * 从原始位置获取源码（回退方案)
 */
+async function fetchSourceFromLegacy() {
    const files = [];

    for (const filePath of FILES_TO_INSTALL) {
        try {
            const legacyPath = path.join(LEGACY_SOURCE_PATH, filePath);
            if (fs.existsSync(legacyPath)) {
                const content = fs.readFileSync(legacyPath, 'utf-8');
                files.push({
                    name: filePath,
                    content: content
                });
            }
        } catch (error) {
            Editor.warn(`[ccc-state-controller] 从原始位置获取文件 ${filePath} 失败: ${error.message}`);
        }
    }
    return files.length > 0 ? files : null;
+}
+/**
 * 获取源码（优先子模块，回退原始位置)
 */
+async function fetchSourceFiles() {
    // 1. 首先尝试从子模块获取
    let files = await fetchSourceFromSubmodule();
    if (files && files.length > 0) {
        Editor.log('[ccc-state-controller] 从子模块获取源码成功');
        return files;
    }
    // 2. 如果子模块没有，从原始位置获取
    files = await fetchSourceFromLegacy();
    if (files && files.length > 0) {
        Editor.log('[ccc-state-controller] 从原始位置获取源码成功');
        return files;
    }
    return null;
+}
+/**
 * 安装文件到目标文件夹
 * @param {string} targetPath 目标文件夹路径
 * @param {Array} sourceFiles 源文件列表
 * @returns {Object} 安装结果
 */
+async function installFiles(targetPath, sourceFiles) {
    let installed = 0;
    let updated = 0;
    const files = [];

    // 确保目标文件夹存在
    if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true });
    }
    for (const file of sourceFiles) {
        // 计算目标文件路径（移除 src/ 前缀)
        const relativePath = file.name.replace(/^src\//, '');
        const targetFile = path.join(targetPath, relativePath);

        // 确保目标文件的父目录存在
        const targetDir = path.dirname(targetFile);
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        // 检查文件是否存在
        const fileExists = fs.existsSync(targetFile);

        // 写入文件（覆盖或新建)
        fs.writeFileSync(targetFile, file.content);

        if (fileExists) {
            updated++;
        } else {
            installed++;
        }
        files.push(relativePath);
    }
    return {
        installed,
        updated,
        files
    };
+}
+/**
 * 选择目标文件夹
 * @returns {Promise<string|null>} 选中的文件夹路径
 */
+async function selectTargetFolder() {
    return new Promise((resolve) => {
        // 使用 Cocos Creator 的文件夹选择对话框
        Editor.Dialog.open({
            title: '选择安装目标文件夹',
            type: 'directory',
            default: 'assets/script',
            button: [
                {
                    label: '确定',
                    click: () => {
                        const result = Editor.Dialog.getResult();
                        resolve(result || null);
                    }
                }
            ]
        });
    });
+}
+/**
 * 显示安装结果
 * @param {Object} result 安装结果
 */
+function showInstallResult(result) {
    const message = `
[ccc-state-controller] 安装完成!
新建文件: ${result.installed} 个
更新文件: ${result.updated} 个
文件列表:
${result.files.join('\n')}
    `.trim();
    Editor.log(message);

    // 显示成功对话框
    Editor.Dialog.open({
        title: '安装完成',
        type: 'alert',
        message: message,
        button: [
            {
                label: '确定',
                click: () => {}
            }
        ]
    });
}
+/**
 * 获取当前安装版本
 */
+function getCurrentVersion(targetPath) {
    try {
        const versionFile = path.join(targetPath, 'StateEnum.ts');
        if (fs.existsSync(versionFile)) {
            const content = fs.readFileSync(versionFile, 'utf-8');
            // 简单的版本检测 - 检查文件是否包含版本信息
            return content.includes('StateController') ? 'installed' : 'none';
        }
    } catch (error) {
        return 'none';
    }
    return 'none';
+}
+/**
 * 检查更新
 */
+async function checkForUpdates() {
    try {
        // 获取子模块最新版本
        const result = await new Promise((resolve, reject) => {
            exec(`cd ${SUBMODULE_PATH} && git fetch origin && git log -1 --oneline -2>&1 || echo "v1.0.0"`, (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(stdout.trim());
                }
            });
        });
        const latestVersion = result.trim().replace('v', '');

        Editor.log(`[ccc-state-controller] 最新版本: ${latestVersion}`);
        Editor.log(`[ccc-state-controller] 当前版本: ${CORE_VERSION}`);

        if (latestVersion !== CORE_VERSION) {
            Editor.Dialog.open({
                title: '发现新版本',
                type: 'info',
                message: `发现新版本 ${latestVersion}，当前版本 ${CORE_VERSION}\n\n是否更新?`,
                button: [
                    {
                        label: '更新',
                        click: () => {
                        Editor.Ipc.sendToMain('ccc-state-controller:update');
                    }
                },
                    {
                        label: '取消',
                        click: () => {}
                    }
                ]
            });
        } else {
            Editor.log('[ccc-state-controller] 当前已是最新版本');
        }
    } catch (error) {
        Editor.warn(`[ccc-state-controller] 检查更新失败: ${error.message}`);
    }
+}
+/**
 * 更新子模块
 */
+async function updateSubmodule() {
    try {
        Editor.log('[ccc-state-controller] 正在更新子模块...');

        await new Promise((resolve, reject) => {
            exec(`cd ${SUBMODULE_PATH} && git pull origin`, (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(stdout);
                }
            });
        });

        Editor.log('[ccc-state-controller] 子模块更新完成');

        // 重新安装
        await install();
    } catch (error) {
        Editor.error(`[ccc-state-controller] 更新子模块失败: ${error.message}`);
    }
+}
+/**
 * 安装状态控制器
 */
+async function install() {
    try {
        // 1. 选择目标文件夹
        const targetPath = await selectTargetFolder();
        if (!targetPath) {
            Editor.warn('[ccc-state-controller] 未选择目标文件夹');
            return;
        }

        // 2. 获取源码
        Editor.log('[ccc-state-controller] 正在获取源码...');
        const sourceFiles = await fetchSourceFiles();
        if (!sourceFiles || sourceFiles.length === 0) {
            Editor.error('[ccc-state-controller] 获取源码失败');
            return;
        }

        // 3. 安装文件
        const result = await installFiles(targetPath, sourceFiles);

        // 4. 显示结果
        showInstallResult(result);
    } catch (error) {
        Editor.error(`[ccc-state-controller] 安装失败: ${error.message}`);
    }
+}
+module.exports = {
    load() {
        // 扩展包加载时的初始化逻辑
        console.log('[ccc-state-controller] 扩展包已加载');

        // 检查子模块是否存在
        if (!fs.existsSync(SUBMODULE_PATH)) {
            Editor.warn('[ccc-state-controller] 子模块不存在，请先初始化子模块');
        }
    },

    unload() {
        // 扩展包卸载时的清理逻辑
        console.log('[ccc-state-controller] 扩展包已卸载');
    },

    // 注册 IPC 消息
    messages: {
        // 打开面板
        'open'() {
+            Editor.Panel.open('ccc-state-controller');
+        },
+
+        // 安装状态控制器
+        'install'() {
+            install();
+        },
+
+        // 检查更新
+        'check-update'() {
+            checkForUpdates();
+        },
+
+        // 更新
+        'update'() {
+            updateSubmodule();
+        },
+
+        // 打招呼（保留原有功能)
+        'say-hello'() {
+            Editor.log('Hello World!');
+            // send ipc message to panel
+            Editor.Ipc.sendToPanel('ccc-state-controller', 'ccc-state-controller:hello');
+        },
+
+        'clicked'() {
+            Editor.log('Button clicked!');
+        }
+    },
+};
