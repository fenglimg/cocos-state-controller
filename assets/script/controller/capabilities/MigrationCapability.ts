/**
 * MigrationCapability 占位 (Wave 2 T26).
 *
 * 用途 (Wave 4+): 数据版本迁移 + preset 跨 ctrl 复制时, 老 scene 数据格式迁到新格式.
 *
 * Wave 2 仅注册占位 capability, 不实装具体迁移逻辑.
 * 后续 Wave 4 preset capability 落地时:
 *  - onCtrlDataMigrate(data, version) 接收老格式, 返回新格式
 *  - 注册到 CapabilityRegistry, dispatch("onCtrlDataMigrate", ctx) 时触发
 */

import { CapabilityRegistry } from "../CapabilityRegistry";
import { ICapability } from "../Capability";

export const MigrationCapability: ICapability = {
    name: "migration",
    /** Wave 2 占位: 直接返回原 data, 不做迁移. */
    onCtrlDataMigrate(data: unknown, _version: number): unknown {
        return data;
    },
};

CapabilityRegistry.register(MigrationCapability);
