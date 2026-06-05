#!/usr/bin/env node
/* eslint-disable */

/**
 * Migrate Cocos Creator 2.x prefab/fire files from StateController/StateSelect
 * to StateControllerV2/StateSelectV2 serialized component shapes.
 *
 * Default mode is dry-run. Pass --write to update files in place.
 */

const fs = require("fs");
const path = require("path");

const BASE64_KEYS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const DEFAULT_ROOT = process.cwd();
const LEGACY_CONTROLLER_V1_UUID = "16b3e1ab-f9ea-4f09-ac6f-a92d6e80fdee";
const LEGACY_SELECT_V1_UUID = "0f62298b-7153-4520-a6bb-a5219b1b8f86";

const CONTROLLER_V1_META_CANDIDATES = [
    "assets/Script/Cocos/Components/UI/Controller/StateController.ts.meta",
    "assets/script/controller/StateController.ts.meta",
];
const SELECT_V1_META_CANDIDATES = [
    "assets/Script/Cocos/Components/UI/Controller/StateSelect.ts.meta",
    "assets/script/controller/StateSelect.ts.meta",
];
const CONTROLLER_V2_META_CANDIDATES = [
    "assets/Script/Cocos/Components/UI/ControllerV2/StateControllerV2.ts.meta",
    "assets/script/controller/StateControllerV2.ts.meta",
];
const SELECT_V2_META_CANDIDATES = [
    "assets/Script/Cocos/Components/UI/ControllerV2/StateSelectV2.ts.meta",
    "assets/script/controller/StateSelectV2.ts.meta",
];

const ENUM_NAME_TO_VALUE = {
    Non: 0,
    Active: 1,
    Position: 2,
    LabelString: 3,
    LabelOutlineColor: 4,
    SpriteFrame: 5,
    Euler: 6,
    Scale: 7,
    Anchor: 8,
    Size: 9,
    Color: 10,
    Opacity: 11,
    Font: 12,
    SliderProgress: 13,
    EditboxString: 14,
    GrayScale: 15,
    ButtonInteractable: 16,
    ProgressBarProgress: 17,
    ToggleIsChecked: 18,
    RichTextString: 19,
    ScrollViewEnabled: 20,
    MaskEnabled: 21,
    LabelFontSize: 22,
    LabelLineHeight: 23,
    LabelSpacingX: 24,
    LabelWrapEnable: 25,
    SpriteFillRange: 26,
    WidgetEnabled: 27,
    WidgetAlignMode: 28,
    WidgetIsAlignTop: 29,
    WidgetIsAlignBottom: 30,
    WidgetIsAlignLeft: 31,
    WidgetIsAlignRight: 32,
    WidgetIsAlignHorizontalCenter: 33,
    WidgetIsAlignVerticalCenter: 34,
    WidgetTop: 35,
    WidgetBottom: 36,
    WidgetLeft: 37,
    WidgetRight: 38,
    WidgetHorizontalCenter: 39,
    WidgetVerticalCenter: 40,
};

const ENUM_TO_PROPREF = {
    1: "cc.Node.active",
    2: "cc.Node.position",
    3: "cc.Label.string",
    4: "cc.LabelOutline.color",
    5: "cc.Sprite.spriteFrame",
    6: "cc.Node.eulerAngles",
    7: "cc.Node.scale",
    8: "cc.Node.anchorPoint",
    9: "cc.Node.contentSize",
    10: "cc.Node.color",
    11: "cc.Node.opacity",
    12: "cc.Label.font",
    13: "cc.Slider.progress",
    14: "cc.EditBox.string",
    16: "cc.Button.interactable",
    17: "cc.ProgressBar.progress",
    18: "cc.Toggle.isChecked",
    19: "cc.RichText.string",
    20: "cc.ScrollView.enabled",
    21: "cc.Mask.enabled",
    22: "cc.Label.fontSize",
    23: "cc.Label.lineHeight",
    24: "cc.Label.spacingX",
    25: "cc.Label.enableWrapText",
    26: "cc.Sprite.fillRange",
    27: "cc.Widget.enabled",
    28: "cc.Widget.alignMode",
    29: "cc.Widget.isAlignTop",
    30: "cc.Widget.isAlignBottom",
    31: "cc.Widget.isAlignLeft",
    32: "cc.Widget.isAlignRight",
    33: "cc.Widget.isAlignHorizontalCenter",
    34: "cc.Widget.isAlignVerticalCenter",
    35: "cc.Widget.top",
    36: "cc.Widget.bottom",
    37: "cc.Widget.left",
    38: "cc.Widget.right",
    39: "cc.Widget.horizontalCenter",
    40: "cc.Widget.verticalCenter",
};

const LEGACY_DROPPED_ENUMS = new Set([15]);

const AMBIGUOUS_DECOMPOSE = {
    "cc.Node.position": (value) => {
        if (!value || typeof value !== "object") return null;
        if (typeof value.x !== "number" || typeof value.y !== "number" || typeof value.z !== "number") return null;
        return [["cc.Node.x", value.x], ["cc.Node.y", value.y], ["cc.Node.z", value.z]];
    },
    "cc.Node.anchorPoint": (value) => {
        if (!value || typeof value !== "object") return null;
        if (typeof value.x !== "number" || typeof value.y !== "number") return null;
        return [["cc.Node.anchorX", value.x], ["cc.Node.anchorY", value.y]];
    },
    "cc.Node.contentSize": (value) => {
        if (!value || typeof value !== "object") return null;
        if (typeof value.width !== "number" || typeof value.height !== "number") return null;
        return [["cc.Node.width", value.width], ["cc.Node.height", value.height]];
    },
};

const AMBIGUOUS_SUB_REFS = {
    "cc.Node.position": ["cc.Node.x", "cc.Node.y", "cc.Node.z"],
    "cc.Node.anchorPoint": ["cc.Node.anchorX", "cc.Node.anchorY"],
    "cc.Node.contentSize": ["cc.Node.width", "cc.Node.height"],
};

function printUsage() {
    console.log([
        "Usage:",
        "  node tools/migration/migrate-prefab-v1-to-v2.js [--write] [--backup] <file-or-dir...>",
        "",
        "Options:",
        "  --write       Write migrated JSON back to disk. Default is dry-run.",
        "  --backup      With --write, create <file>.bak before overwriting.",
        "  --root <dir>  Project root. Defaults to current working directory.",
        "  --help        Show this help.",
    ].join("\n"));
}

function parseArgs(argv) {
    const options = {
        root: DEFAULT_ROOT,
        write: false,
        backup: false,
        targets: [],
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--help" || arg === "-h") {
            options.help = true;
            continue;
        }
        if (arg === "--write") {
            options.write = true;
            continue;
        }
        if (arg === "--backup") {
            options.backup = true;
            continue;
        }
        if (arg === "--root") {
            const value = argv[++i];
            if (!value) throw new Error("--root requires a directory");
            options.root = path.resolve(value);
            continue;
        }
        if (arg.startsWith("--")) {
            throw new Error(`Unknown option: ${arg}`);
        }
        options.targets.push(arg);
    }

    return options;
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readFirstMetaUuid(root, candidates, fallbackUuid) {
    for (const relativePath of candidates) {
        const metaPath = path.join(root, relativePath);
        if (!fs.existsSync(metaPath)) continue;
        const meta = readJson(metaPath);
        if (!meta.uuid) throw new Error(`Missing uuid in ${metaPath}`);
        return meta.uuid;
    }
    if (fallbackUuid) return fallbackUuid;
    throw new Error(`Cannot find any meta file: ${candidates.join(", ")}`);
}

function compressUuid(uuid) {
    const hex = String(uuid).replace(/-/g, "");
    if (!/^[0-9a-fA-F]{32}$/.test(hex)) {
        throw new Error(`Invalid uuid: ${uuid}`);
    }

    let out = hex.slice(0, 5);
    for (let i = 5; i < 32; i += 3) {
        const a = parseInt(hex[i], 16);
        const b = parseInt(hex[i + 1], 16);
        const c = parseInt(hex[i + 2], 16);
        out += BASE64_KEYS[(a << 2) | (b >> 2)];
        out += BASE64_KEYS[((b & 3) << 4) | c];
    }
    return out;
}

function createTypeMap(root) {
    return {
        controllerV1: compressUuid(readFirstMetaUuid(root, CONTROLLER_V1_META_CANDIDATES, LEGACY_CONTROLLER_V1_UUID)),
        selectV1: compressUuid(readFirstMetaUuid(root, SELECT_V1_META_CANDIDATES, LEGACY_SELECT_V1_UUID)),
        controllerV2: compressUuid(readFirstMetaUuid(root, CONTROLLER_V2_META_CANDIDATES)),
        selectV2: compressUuid(readFirstMetaUuid(root, SELECT_V2_META_CANDIDATES)),
    };
}

function walkTargets(targets, root) {
    const out = [];
    const seen = new Set();

    function addFile(filePath) {
        const ext = path.extname(filePath);
        if (ext !== ".prefab" && ext !== ".fire") return;
        const abs = path.resolve(root, filePath);
        if (!seen.has(abs)) {
            seen.add(abs);
            out.push(abs);
        }
    }

    function walk(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.name === "node_modules" || entry.name === "library" || entry.name === "temp" || entry.name === "build") {
                continue;
            }
            const abs = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(abs);
            }
            else if (entry.isFile()) {
                addFile(abs);
            }
        }
    }

    for (const target of targets) {
        const abs = path.resolve(root, target);
        if (!fs.existsSync(abs)) {
            throw new Error(`Target does not exist: ${target}`);
        }
        const stat = fs.statSync(abs);
        if (stat.isDirectory()) walk(abs);
        else addFile(abs);
    }

    return out;
}

function appendSerializedObject(json, object) {
    const id = json.length;
    json.push(object);
    return { __id__: id };
}

function stateIdsFromComponent(component, json) {
    const ids = [];
    for (const ref of component._states || []) {
        const state = ref && json[ref.__id__];
        ids.push(state && typeof state.stateId === "number" ? state.stateId : null);
    }
    return ids;
}

function migratePageData(page, stateIds, stats) {
    if (!page || typeof page !== "object") return;
    if (page.$$stateKeyMode$$ === "stateId") return;

    for (let index = 0; index < stateIds.length; index++) {
        const stateId = stateIds[index];
        if (typeof stateId !== "number" || stateId === index) continue;
        const indexKey = String(index);
        const stateIdKey = String(stateId);
        if (Object.prototype.hasOwnProperty.call(page, indexKey)) {
            if (!Object.prototype.hasOwnProperty.call(page, stateIdKey)) {
                page[stateIdKey] = page[indexKey];
                stats.stateIndexKeysMigrated += 1;
            }
            delete page[indexKey];
        }
    }

    page.$$stateKeyMode$$ = "stateId";
}

function enumToPropRef(value) {
    const enumValue = typeof value === "string" ? ENUM_NAME_TO_VALUE[value] : value;
    if (typeof enumValue !== "number") return undefined;
    return ENUM_TO_PROPREF[enumValue];
}

function propRefsForControlledEntry(key, value) {
    let propRef;
    if (/^\d+$/.test(key)) {
        propRef = enumToPropRef(Number(key));
    }
    else if (ENUM_NAME_TO_VALUE[key] !== undefined) {
        propRef = enumToPropRef(ENUM_NAME_TO_VALUE[key]);
    }
    else if (typeof value === "number") {
        propRef = enumToPropRef(value);
    }
    else if (typeof value === "string" && value.indexOf(".") >= 0) {
        propRef = value;
    }
    else if (key.indexOf(".") >= 0) {
        propRef = key;
    }

    if (!propRef) return [];
    return AMBIGUOUS_SUB_REFS[propRef] || [propRef];
}

function migrateControlledProps(map, stats) {
    if (!map || typeof map !== "object") return;

    for (const key of Object.keys(map)) {
        if (key.startsWith("$$")) continue;

        if (/^\d+$/.test(key) && LEGACY_DROPPED_ENUMS.has(Number(key))) {
            delete map[key];
            stats.propKeysMigrated += 1;
            continue;
        }
        if (ENUM_NAME_TO_VALUE[key] !== undefined && LEGACY_DROPPED_ENUMS.has(ENUM_NAME_TO_VALUE[key])) {
            delete map[key];
            stats.propKeysMigrated += 1;
            continue;
        }

        const refs = propRefsForControlledEntry(key, map[key]);
        if (refs.length === 0) continue;

        for (const ref of refs) {
            if (map[ref] === undefined) map[ref] = ref;
        }
        if (refs.length !== 1 || refs[0] !== key || map[key] !== key) {
            delete map[key];
            stats.propKeysMigrated += 1;
        }
    }
}

function migratePropDictionary(dict, stats) {
    if (!dict || typeof dict !== "object") return;

    for (const key of Object.keys(dict)) {
        if (key.startsWith("$$")) continue;
        if (!/^\d+$/.test(key)) continue;

        const enumValue = Number(key);
        if (LEGACY_DROPPED_ENUMS.has(enumValue)) {
            delete dict[key];
            stats.propKeysMigrated += 1;
            continue;
        }

        const propRef = enumToPropRef(enumValue);
        if (!propRef) continue;
        if (dict[propRef] === undefined) dict[propRef] = dict[key];
        delete dict[key];
        stats.propKeysMigrated += 1;
    }

    for (const propRef of Object.keys(AMBIGUOUS_DECOMPOSE)) {
        if (!(propRef in dict)) continue;
        const pairs = AMBIGUOUS_DECOMPOSE[propRef](dict[propRef]);
        if (!pairs) continue;
        for (const [subRef, subValue] of pairs) {
            dict[subRef] = subValue;
        }
        delete dict[propRef];
        stats.propKeysMigrated += 1;
    }
}

function migratePropData(propData, stats) {
    if (!propData || typeof propData !== "object") return;

    migratePropDictionary(propData, stats);
    migrateControlledProps(propData.$$controlledProps$$, stats);

    if (propData.$$propertyData$$ && typeof propData.$$propertyData$$ === "object") {
        migratePropDictionary(propData.$$propertyData$$, stats);
        for (const key of Object.keys(propData.$$propertyData$$)) {
            if (key.startsWith("$$")) continue;
            if (propData[key] === undefined) {
                propData[key] = propData.$$propertyData$$[key];
                stats.propertyDataPromoted += 1;
            }
        }
    }
}

function migrateCtrlDataPropKeys(component, stats) {
    const ctrlData = component._ctrlData;
    if (!ctrlData || typeof ctrlData !== "object") return;

    for (const ctrlId of Object.keys(ctrlData)) {
        const page = ctrlData[ctrlId];
        if (!page || typeof page !== "object") continue;
        for (const stateKey of Object.keys(page)) {
            migratePropData(page[stateKey], stats);
        }
    }
}

function migrateSelectCtrlData(component, controllerStateIdsByCtrlId, stats) {
    const ctrlData = component._ctrlData;
    if (!ctrlData || typeof ctrlData !== "object") return;

    for (const ctrlId of Object.keys(ctrlData)) {
        const stateIds = controllerStateIdsByCtrlId[ctrlId];
        if (!stateIds) continue;
        migratePageData(ctrlData[ctrlId], stateIds, stats);
    }
    migrateCtrlDataPropKeys(component, stats);
}

function migratePrefabJson(json, typeMap) {
    if (!Array.isArray(json)) {
        throw new Error("Prefab/fire JSON root must be an array");
    }

    const stats = {
        controllers: 0,
        selects: 0,
        stateValues: 0,
        stateIndexKeysMigrated: 0,
        propKeysMigrated: 0,
        propertyDataPromoted: 0,
        appendedGroups: 0,
    };
    const controllerStateIdsByCtrlId = {};

    for (const item of json) {
        if (!item || typeof item !== "object") continue;
        if (item.__type__ === "stateValue") {
            item.__type__ = "StateValue";
            stats.stateValues += 1;
        }
    }

    for (const item of json) {
        if (!item || typeof item !== "object") continue;
        if (item.__type__ !== typeMap.controllerV1) continue;

        item.__type__ = typeMap.controllerV2;
        if (item._bindingsData === undefined) item._bindingsData = "";
        if (!Array.isArray(item._deletedStates)) item._deletedStates = [];
        delete item.inspectorRefreshMode;
        delete item.autoRefreshDelay;

        if (!item.stateOps || typeof item.stateOps.__id__ !== "number") {
            item.stateOps = appendSerializedObject(json, { __type__: "CtrlStateOpsGroup" });
            stats.appendedGroups += 1;
        }
        if (!item.recycleBin || typeof item.recycleBin.__id__ !== "number") {
            item.recycleBin = appendSerializedObject(json, { __type__: "CtrlRecycleBinGroup" });
            stats.appendedGroups += 1;
        }

        if (item.ctrlId !== undefined) {
            controllerStateIdsByCtrlId[String(item.ctrlId)] = stateIdsFromComponent(item, json);
        }
        stats.controllers += 1;
    }

    for (const item of json) {
        if (!item || typeof item !== "object") continue;
        if (item.__type__ !== typeMap.selectV1) continue;

        item.__type__ = typeMap.selectV2;
        if (!Array.isArray(item._userExcludedProps)) item._userExcludedProps = [];
        if (!item.excludeGroup || typeof item.excludeGroup.__id__ !== "number") {
            item.excludeGroup = appendSerializedObject(json, { __type__: "SelectExcludeGroup" });
            stats.appendedGroups += 1;
        }
        if (!item.recording || typeof item.recording.__id__ !== "number") {
            item.recording = appendSerializedObject(json, { __type__: "SelectRecordGroup" });
            stats.appendedGroups += 1;
        }
        if (!item.valueOps || typeof item.valueOps.__id__ !== "number") {
            item.valueOps = appendSerializedObject(json, { __type__: "SelectValueOpsGroup" });
            stats.appendedGroups += 1;
        }
        migrateSelectCtrlData(item, controllerStateIdsByCtrlId, stats);
        stats.selects += 1;
    }

    return stats;
}

function migrateFile(filePath, typeMap, options) {
    const before = fs.readFileSync(filePath, "utf8");
    const json = JSON.parse(before);
    const stats = migratePrefabJson(json, typeMap);
    const after = `${JSON.stringify(json, null, 2)}\n`;
    const changed = before !== after;

    if (changed && options.write) {
        if (options.backup) {
            fs.copyFileSync(filePath, `${filePath}.bak`);
        }
        fs.writeFileSync(filePath, after);
    }

    return { filePath, changed, stats };
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        printUsage();
        return;
    }
    if (options.targets.length === 0) {
        printUsage();
        process.exitCode = 1;
        return;
    }

    const typeMap = createTypeMap(options.root);
    const files = walkTargets(options.targets, options.root);
    if (files.length === 0) {
        console.log("No .prefab/.fire files found.");
        return;
    }

    const totals = {
        files: 0,
        changedFiles: 0,
        controllers: 0,
        selects: 0,
        stateValues: 0,
        stateIndexKeysMigrated: 0,
        propKeysMigrated: 0,
        propertyDataPromoted: 0,
        appendedGroups: 0,
    };

    for (const filePath of files) {
        const result = migrateFile(filePath, typeMap, options);
        totals.files += 1;
        if (result.changed) totals.changedFiles += 1;
        for (const key of ["controllers", "selects", "stateValues", "stateIndexKeysMigrated", "propKeysMigrated", "propertyDataPromoted", "appendedGroups"]) {
            totals[key] += result.stats[key];
        }

        if (result.changed || result.stats.controllers || result.stats.selects) {
            const rel = path.relative(options.root, result.filePath);
            const mode = options.write ? "written" : "dry-run";
            console.log(`${mode}: ${rel}`);
            console.log(`  controllers=${result.stats.controllers}, selects=${result.stats.selects}, stateValues=${result.stats.stateValues}, stateIndexKeysMigrated=${result.stats.stateIndexKeysMigrated}, propKeysMigrated=${result.stats.propKeysMigrated}, propertyDataPromoted=${result.stats.propertyDataPromoted}, appendedGroups=${result.stats.appendedGroups}`);
        }
    }

    const mode = options.write ? "write" : "dry-run";
    console.log(`${mode} summary: files=${totals.files}, changedFiles=${totals.changedFiles}, controllers=${totals.controllers}, selects=${totals.selects}, stateValues=${totals.stateValues}, stateIndexKeysMigrated=${totals.stateIndexKeysMigrated}, propKeysMigrated=${totals.propKeysMigrated}, propertyDataPromoted=${totals.propertyDataPromoted}, appendedGroups=${totals.appendedGroups}`);
}

if (require.main === module) {
    try {
        main();
    }
    catch (error) {
        console.error(error && error.stack ? error.stack : String(error));
        process.exitCode = 1;
    }
}

module.exports = {
    compressUuid,
    migratePrefabJson,
};
