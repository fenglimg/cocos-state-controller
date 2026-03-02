'use strict';

const path = require('path');
const fs = require('fs');
const https = require('https');

/**
 * ccc-state-controller 扩展包主入口
 *
 * 功能：
 * 1. 通过菜单触发安装状态控制器源码
 * 2. 从 GitHub 仓库获取源码并安装到用户选择的目标文件夹
 * 3. 智能检测：存在则覆盖，不存在则新建
 * 4. 不生成 .meta 文件
 */

// GitHub 仓库配置
const GITHUB_REPO = 'fenglimg/ccc-state-controller-core';
const GITHUB_BRANCH = 'main';
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/contents`;

// 需要安装的文件列表
const FILES_TO_INSTALL = [
    'src/StateController.ts',
    'src/StateSelect.ts',
    'src/StateEnum.ts',
    'src/StateErrorManager.ts',
    'src/StatePropHandler.ts',
    'src/Props/StateComponentProps.ts',
    'src/Props/StateNodeProps.ts',
    'src/Props/StateToolsProps.ts',
    'src/Props/StateWidgetProps.ts',
];

module.exports = {
    load() {
        // 扩展包加载时的初始化逻辑
        console.log('[ccc-state-controller] 扩展包已加载');
    },

    unload() {
        // 扩展包卸载时的清理逻辑
        console.log('[ccc-state-controller] 扩展包已卸载');
    },

    // 注册 IPC 消息
    messages: {
        // 打开面板
        'open'() {
            Editor.Panel.open('ccc-state-controller');
        },

        // 打招呼（保留原有功能）
        'say-hello'() {
            Editor.log('Hello World!');
            Editor.Ipc.sendToPanel('ccc-state-controller', 'ccc-state-controller:hello');
        },

        // 按钮点击（保留原有功能）
        'clicked'() {
            Editor.log('Button clicked!');
        },

        /**
         * 安装状态控制器
         * 触发流程：菜单 -> 选择文件夹 -> 获取源码 -> 安装文件 -> 显示结果
         */
        'install'() {
            installController();
        },
    },
};

/**
 * 安装控制器核心逻辑
 */
async function installController() {
    try {
        // 1. 让用户选择目标文件夹
        const targetPath = await selectTargetFolder();
        if (!targetPath) {
            Editor.log('[ccc-state-controller] 用户取消了安装');
            return;
        }

        Editor.log(`[ccc-state-controller] 目标文件夹: ${targetPath}`);

        // 2. 从 GitHub 获取源码
        Editor.log('[ccc-state-controller] 正在从 GitHub 获取源码...');
        const sourceFiles = await fetchSourceFromGitHub();

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
}

/**
 * 选择目标文件夹
 * @returns {Promise<string|null>} 选中的文件夹路径，取消返回 null
 */
function selectTargetFolder() {
    return new Promise((resolve) => {
        // 使用 Cocos Creator 的文件夹选择对话框
        Editor.Dialog.open({
            title: '选择安装目标文件夹',
            type: 'directory',
            defaultPath: 'assets/script',
            button: [
                {
                    label: '取消',
                    click: () => {
                        resolve(null);
                    }
                },
                {
                    label: '选择',
                    click: (selectedPath) => {
                        resolve(selectedPath);
                    }
                }
            ]
        });
    });
}

/**
 * 从 GitHub 获取源码
 * @returns {Promise<Array<{name: string, content: string}>>} 文件列表
 */
async function fetchSourceFromGitHub() {
    const files = [];

    for (const filePath of FILES_TO_INSTALL) {
        try {
            const content = await fetchFileFromGitHub(filePath);
            files.push({
                name: filePath,
                content: content
            });
        } catch (error) {
            Editor.warn(`[ccc-state-controller] 获取文件 ${filePath} 失败: ${error.message}`);
        }
    }

    return files;
}
/**
 * 从 GitHub 获取单个文件内容
 * @param {string} filePath 文件路径
 * @returns {Promise<string>} 文件内容
 */
async function fetchFileFromGitHub(filePath) {
    return new Promise((resolve, reject) => {
        const url = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/${filePath}`;

        https.get(url, (res) => {
            if (res.statusCode === 200) {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    resolve(data);
                });
            } else {
                reject(new Error(`HTTP ${res.statusCode}`));
            }
        }).on('error', reject);
    });
}
/**
 * 安装文件到目标文件夹
 * @param {string} targetPath 目标文件夹路径
 * @param {Array<{name: string, content: string}>} sourceFiles 源文件列表
 * @returns {Promise<{installed: number, updated: number, files: string[]}>} 安装结果
 */
async function installFiles(targetPath, sourceFiles) {
    const result = {
        installed: 0,
        updated: 0,
        files: []
    };

    // 确保目标文件夹存在
    if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true });
    }

    for (const file of sourceFiles) {
        // 计算目标文件路径（移除 src/ 前缀）
        const relativePath = file.name.replace(/^src\//, '');
        const targetFile = path.join(targetPath, relativePath);

        // 确保目标文件的父目录存在
        const targetDir = path.dirname(targetFile);
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        // 检查文件是否存在
        const fileExists = fs.existsSync(targetFile);

        // 写入文件（覆盖或新建）
        fs.writeFileSync(targetFile, file.content);

        if (fileExists) {
            result.updated++;
            result.files.push(`更新: ${relativePath}`);
        } else {
            result.installed++;
            result.files.push(`新建: ${relativePath}`);
        }
    }

    return result;
}
/**
 * 显示安装结果
 * @param {{installed: number, updated: number, files: string[]}} 安装结果
 */
function showInstallResult(result) {
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
