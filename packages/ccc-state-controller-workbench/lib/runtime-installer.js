'use strict';

const fs = require('fs');
const path = require('path');

const REQUIRED_RUNTIME_FILES = [
  'StateController.ts',
  'StateSelect.ts',
  'StateEnum.ts',
  'StatePropHandler.ts',
];

function getDefaultSourceDir(projectPath) {
  return path.join(projectPath || '', 'assets', 'script', 'Controller');
}

function normalizePath(targetPath) {
  return path.resolve(targetPath || '');
}

function normalizeRelativePath(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function listRuntimeFiles(sourceDir, baseDir) {
  if (!fs.existsSync(sourceDir)) {
    return [];
  }

  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(sourceDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listRuntimeFiles(fullPath, baseDir || sourceDir));
      continue;
    }

    if (!/\.ts$|\.meta$/i.test(entry.name)) {
      continue;
    }

    files.push(normalizeRelativePath(path.relative(baseDir || sourceDir, fullPath)));
  }

  return files.sort();
}

function detectRuntime(targetDir) {
  if (!targetDir || !fs.existsSync(targetDir)) {
    return {
      installed: false,
      matchedFiles: [],
      missingFiles: [...REQUIRED_RUNTIME_FILES],
    };
  }

  const matchedFiles = REQUIRED_RUNTIME_FILES.filter((fileName) => fs.existsSync(path.join(targetDir, fileName)));

  return {
    installed: matchedFiles.length === REQUIRED_RUNTIME_FILES.length,
    matchedFiles,
    missingFiles: REQUIRED_RUNTIME_FILES.filter((fileName) => !matchedFiles.includes(fileName)),
  };
}

function ensureDirectory(targetDir) {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
}

function copyRuntimeTree(sourceDir, targetDir, overwrite) {
  const files = listRuntimeFiles(sourceDir, sourceDir);
  const copiedFiles = [];

  for (const relativeFile of files) {
    const sourceFile = path.join(sourceDir, relativeFile);
    const targetFile = path.join(targetDir, relativeFile);
    const targetFolder = path.dirname(targetFile);

    ensureDirectory(targetFolder);

    if (fs.existsSync(targetFile) && !overwrite) {
      continue;
    }

    fs.copyFileSync(sourceFile, targetFile);
    copiedFiles.push(relativeFile);
  }

  return copiedFiles;
}

function getRuntimeStatus({ projectPath, sourceDir, targetDir }) {
  const resolvedSourceDir = normalizePath(sourceDir || getDefaultSourceDir(projectPath));
  const resolvedTargetDir = normalizePath(targetDir || resolvedSourceDir);
  const sourceFiles = listRuntimeFiles(resolvedSourceDir, resolvedSourceDir);
  const targetStatus = detectRuntime(resolvedTargetDir);
  const sameAsSource = resolvedSourceDir === resolvedTargetDir;

  return {
    sourceDir: resolvedSourceDir,
    targetDir: resolvedTargetDir,
    sourceExists: fs.existsSync(resolvedSourceDir),
    sourceFileCount: sourceFiles.length,
    sourceFiles,
    sameAsSource,
    target: targetStatus,
  };
}

function installRuntime({ projectPath, sourceDir, targetDir, overwrite }) {
  const resolvedSourceDir = normalizePath(sourceDir || getDefaultSourceDir(projectPath));
  const resolvedTargetDir = normalizePath(targetDir || resolvedSourceDir);

  if (!fs.existsSync(resolvedSourceDir)) {
    return {
      success: false,
      action: 'error',
      copiedFiles: [],
      error: `Runtime source not found: ${resolvedSourceDir}`,
    };
  }

  if (resolvedSourceDir === resolvedTargetDir) {
    return {
      success: true,
      action: 'noop',
      copiedFiles: [],
      status: getRuntimeStatus({
        projectPath,
        sourceDir: resolvedSourceDir,
        targetDir: resolvedTargetDir,
      }),
      message: 'Target directory is already the active runtime source.',
    };
  }

  ensureDirectory(resolvedTargetDir);

  try {
    const copiedFiles = copyRuntimeTree(resolvedSourceDir, resolvedTargetDir, overwrite);
    return {
      success: true,
      action: copiedFiles.length > 0 ? 'install' : 'noop',
      copiedFiles,
      status: getRuntimeStatus({
        projectPath,
        sourceDir: resolvedSourceDir,
        targetDir: resolvedTargetDir,
      }),
      message: copiedFiles.length > 0
        ? `Installed ${copiedFiles.length} runtime files.`
        : 'No files copied. Target already contained the same files and overwrite=false.',
    };
  } catch (error) {
    return {
      success: false,
      action: 'error',
      copiedFiles: [],
      error: error.message,
    };
  }
}

module.exports = {
  REQUIRED_RUNTIME_FILES,
  getDefaultSourceDir,
  listRuntimeFiles,
  detectRuntime,
  getRuntimeStatus,
  installRuntime,
};
