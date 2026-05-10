'use strict';

/**
 * Plugin logger for ccc-state-controller-workbench.
 *
 * Levels (mirrors StateErrorManager enum so brief/dashboard messaging stays consistent):
 *   DEBUG=0 / INFO=1 / WARN=2 / ERROR=3 / SILENT=5
 *
 * Default level is ERROR (only errors surface in editor console).
 *
 * Outputs go through Editor.log/warn/error (does NOT import any runtime types).
 */

const LEVELS = Object.freeze({ DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, SILENT: 5 });

let currentLevel = LEVELS.ERROR;

function setLevel(level) {
    if (typeof level === 'string') {
        const v = LEVELS[level.toUpperCase()];
        if (v !== undefined) currentLevel = v;
        return;
    }
    if (typeof level === 'number') currentLevel = level;
}

function fmt(tag, msg) {
    return `[ccc-state-controller-workbench] [${tag}] ${msg}`;
}

function debug(msg) {
    if (currentLevel <= LEVELS.DEBUG && typeof Editor !== 'undefined' && Editor.log) Editor.log(fmt('DEBUG', msg));
}
function info(msg) {
    if (currentLevel <= LEVELS.INFO && typeof Editor !== 'undefined' && Editor.log) Editor.log(fmt('INFO', msg));
}
function warn(msg) {
    if (currentLevel <= LEVELS.WARN && typeof Editor !== 'undefined' && Editor.warn) Editor.warn(fmt('WARN', msg));
}
function error(msg) {
    if (currentLevel <= LEVELS.ERROR && typeof Editor !== 'undefined' && Editor.error) Editor.error(fmt('ERROR', msg));
}

module.exports = { LEVELS, setLevel, debug, info, warn, error };
