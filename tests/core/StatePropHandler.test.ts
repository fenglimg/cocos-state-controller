/**
 * StatePropHandler Unit Tests
 *
 * Test Coverage:
 * - IMPL-006.8: Handler registration, retrieval, and invocation
 */

import { PropHandlerManager } from "../../../assets/script/controller/PropHandlerManager";
import { EnumPropName } from "../../../assets/script/controller/StateEnum";
import { TPropValue } from "../../../assets/script/controller/types";
// 副作用 import: 触发 41 个内置 PropHandler 注册到 PropHandlerManager
import "../../../assets/script/controller/BuiltinPropHandlers";

// Mock Cocos Creator environment
declare global {
    const CC_EDITOR: boolean;
    const cc: any;
    const Editor: any;
}

// Setup mock environment
beforeAll(() => {
    global.CC_EDITOR = true;
    global.cc = {
        Vec3: jest.fn((x = 0, y = 0, z = 0) => ({ x, y, z, constructor: jest.fn() })),
        Vec2: jest.fn((x = 0, y = 0) => ({ x, y, constructor: jest.fn() })),
        Color: jest.fn((r = 255, g = 255, b = 255, a = 255) => ({ r, g, b, a, constructor: jest.fn() })),
        Size: jest.fn((width = 100, height = 100) => ({ width, height, constructor: jest.fn() })),
        v3: jest.fn((x = 0, y = 0, z = 0) => ({ x, y, z })),
        v2: jest.fn((x = 0, y = 0) => ({ x, y })),
        color: jest.fn((r = 255, g = 255, b = 255, a = 255) => ({ r, g, b, a })),
        size: jest.fn((width = 100, height = 100) => ({ width, height })),
        Label: { name: "cc.Label" },
        Sprite: { name: "cc.Sprite" },
        Button: { name: "cc.Button" },
        Widget: { name: "cc.Widget" },
        Slider: { name: "cc.Slider" },
        EditBox: { name: "cc.EditBox" },
        ProgressBar: { name: "cc.ProgressBar" },
        Toggle: { name: "cc.Toggle" },
        RichText: { name: "cc.RichText" },
        ScrollView: { name: "cc.ScrollView" },
        Mask: { name: "cc.Mask" },
        LabelOutline: { name: "cc.LabelOutline" },
        Asset: class Asset { name = "asset"; },
        Font: class Font { name = "font"; },
        SpriteFrame: class SpriteFrame { name = "spriteFrame"; },
    };
    global.Editor = {
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    };
});

// Create mock node factory
const createMockNode = (overrides: any = {}) => ({
    uuid: "test-uuid",
    name: "TestNode",
    active: true,
    isValid: true,
    position: { x: 0, y: 0, z: 0 },
    eulerAngles: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    anchorX: 0.5,
    anchorY: 0.5,
    opacity: 255,
    color: { r: 255, g: 255, b: 255, a: 255 },
    getContentSize: jest.fn(() => ({ width: 100, height: 100 })),
    setContentSize: jest.fn(),
    setAnchorPoint: jest.fn(),
    getComponent: jest.fn(),
    ...overrides,
});

describe("StatePropHandler", () => {
    let mockNode: any;

    beforeEach(() => {
        jest.clearAllMocks();
        mockNode = createMockNode();
    });

    // ================== IMPL-006.8: Handler Registration Tests ==================

    describe("Handler Registration (IMPL-006.8)", () => {
        it("should have Active handler registered", () => {
            const handler = PropHandlerManager.getHandler(EnumPropName.Active);

            expect(handler).toBeDefined();
            expect(handler.getValue).toBeDefined();
            expect(handler.setValue).toBeDefined();
            expect(handler.getDefaultValue).toBeDefined();
        });

        it("should have Position handler registered", () => {
            const handler = PropHandlerManager.getHandler(EnumPropName.Position);

            expect(handler).toBeDefined();
        });

        it("should have Opacity handler registered", () => {
            const handler = PropHandlerManager.getHandler(EnumPropName.Opacity);

            expect(handler).toBeDefined();
        });

        it("should have Color handler registered", () => {
            const handler = PropHandlerManager.getHandler(EnumPropName.Color);

            expect(handler).toBeDefined();
        });

        it("should have Scale handler registered", () => {
            const handler = PropHandlerManager.getHandler(EnumPropName.Scale);

            expect(handler).toBeDefined();
        });

        it("should have Anchor handler registered", () => {
            const handler = PropHandlerManager.getHandler(EnumPropName.Anchor);

            expect(handler).toBeDefined();
        });

        it("should have Size handler registered", () => {
            const handler = PropHandlerManager.getHandler(EnumPropName.Size);

            expect(handler).toBeDefined();
        });

        it("should have Euler handler registered", () => {
            const handler = PropHandlerManager.getHandler(EnumPropName.Euler);

            expect(handler).toBeDefined();
        });

        it("should have LabelString handler registered", () => {
            const handler = PropHandlerManager.getHandler(EnumPropName.LabelString);

            expect(handler).toBeDefined();
        });

        it("should have SpriteFrame handler registered", () => {
            const handler = PropHandlerManager.getHandler(EnumPropName.SpriteFrame);

            expect(handler).toBeDefined();
        });

        it("should return undefined for unregistered handler", () => {
            // Use a very high number that won't be registered
            const handler = PropHandlerManager.getHandler(99999 as EnumPropName);

            expect(handler).toBeUndefined();
        });
    });

    // ================== Handler Invocation Tests - Node Properties ==================

    describe("Handler Invocation - Node Properties", () => {
        describe("Active Property", () => {
            it("should get active value", () => {
                const value = PropHandlerManager.getValue(EnumPropName.Active, mockNode);

                expect(value).toBe(true);
            });

            it("should set active value", () => {
                PropHandlerManager.setValue(EnumPropName.Active, mockNode, false);

                expect(mockNode.active).toBe(false);
            });

            it("should get default active value", () => {
                const value = PropHandlerManager.getDefaultValue(EnumPropName.Active, mockNode);

                expect(value).toBe(true);
            });
        });

        describe("Position Property", () => {
            it("should get position value", () => {
                mockNode.position = { x: 10, y: 20, z: 30 };

                const value = PropHandlerManager.getValue(EnumPropName.Position, mockNode);

                expect(value).toEqual({ x: 10, y: 20, z: 30 });
            });

            it("should set position value", () => {
                const newPos = { x: 100, y: 200, z: 300 };

                PropHandlerManager.setValue(EnumPropName.Position, mockNode, newPos);

                expect(mockNode.position).toEqual(newPos);
            });

            it("should get default position value", () => {
                mockNode.position = { x: 5, y: 10, z: 15 };

                const value = PropHandlerManager.getDefaultValue(EnumPropName.Position, mockNode);

                expect(value).toEqual({ x: 5, y: 10, z: 15 });
            });
        });

        describe("Euler Angles Property", () => {
            it("should get euler angles value", () => {
                mockNode.eulerAngles = { x: 0, y: 45, z: 90 };

                const value = PropHandlerManager.getValue(EnumPropName.Euler, mockNode);

                expect(value).toEqual({ x: 0, y: 45, z: 90 });
            });

            it("should set euler angles value", () => {
                const newEuler = { x: 10, y: 20, z: 30 };

                PropHandlerManager.setValue(EnumPropName.Euler, mockNode, newEuler);

                expect(mockNode.eulerAngles).toEqual(newEuler);
            });
        });

        describe("Scale Property", () => {
            it("should get scale value", () => {
                mockNode.scale = { x: 2, y: 2, z: 2 };

                const value = PropHandlerManager.getValue(EnumPropName.Scale, mockNode);

                expect(value).toEqual({ x: 2, y: 2, z: 2 });
            });

            it("should set scale value", () => {
                PropHandlerManager.setValue(EnumPropName.Scale, mockNode, { x: 3, y: 3, z: 3 });

                expect(mockNode.scale).toEqual({ x: 3, y: 3, z: 3 });
            });
        });

        describe("Opacity Property", () => {
            it("should get opacity value", () => {
                mockNode.opacity = 128;

                const value = PropHandlerManager.getValue(EnumPropName.Opacity, mockNode);

                expect(value).toBe(128);
            });

            it("should set opacity value", () => {
                PropHandlerManager.setValue(EnumPropName.Opacity, mockNode, 200);

                expect(mockNode.opacity).toBe(200);
            });
        });

        describe("Color Property", () => {
            it("should get color value", () => {
                mockNode.color = { r: 255, g: 0, b: 0, a: 255 };

                const value = PropHandlerManager.getValue(EnumPropName.Color, mockNode) as cc.Color;

                expect(value.r).toBe(255);
                expect(value.g).toBe(0);
                expect(value.b).toBe(0);
            });

            it("should set color value", () => {
                const newColor = { r: 0, g: 255, b: 0, a: 200 };

                PropHandlerManager.setValue(EnumPropName.Color, mockNode, newColor);

                expect(mockNode.color).toEqual(newColor);
            });
        });

        describe("Anchor Property", () => {
            it("should get anchor value", () => {
                mockNode.anchorX = 0.5;
                mockNode.anchorY = 0.5;

                const value = PropHandlerManager.getValue(EnumPropName.Anchor, mockNode);

                expect(value).toEqual({ x: 0.5, y: 0.5 });
            });

            it("should set anchor value using setAnchorPoint", () => {
                const newAnchor = { x: 0, y: 1 };

                PropHandlerManager.setValue(EnumPropName.Anchor, mockNode, newAnchor);

                expect(mockNode.setAnchorPoint).toHaveBeenCalledWith(newAnchor);
            });
        });

        describe("Size Property", () => {
            it("should get size value", () => {
                mockNode.getContentSize.mockReturnValue({ width: 200, height: 100 });

                const value = PropHandlerManager.getValue(EnumPropName.Size, mockNode);

                expect(value).toEqual({ width: 200, height: 100 });
            });

            it("should set size value using setContentSize", () => {
                const newSize = { width: 300, height: 150 };

                PropHandlerManager.setValue(EnumPropName.Size, mockNode, newSize);

                expect(mockNode.setContentSize).toHaveBeenCalledWith(newSize);
            });
        });
    });

    // ================== Handler Invocation Tests - Component Properties ==================

    describe("Handler Invocation - Component Properties", () => {
        describe("Label String Property", () => {
            it("should get label string value", () => {
                const mockLabel = { string: "Hello World" };
                mockNode.getComponent.mockReturnValue(mockLabel);

                const value = PropHandlerManager.getValue(EnumPropName.LabelString, mockNode);

                expect(value).toBe("Hello World");
            });

            it("should return undefined when no Label component", () => {
                mockNode.getComponent.mockReturnValue(null);

                const value = PropHandlerManager.getValue(EnumPropName.LabelString, mockNode);

                expect(value).toBeUndefined();
            });

            it("should set label string value", () => {
                const mockLabel = { string: "" };
                mockNode.getComponent.mockReturnValue(mockLabel);

                PropHandlerManager.setValue(EnumPropName.LabelString, mockNode, "New Text");

                expect(mockLabel.string).toBe("New Text");
            });
        });

        describe("Label Font Size Property", () => {
            it("should get label font size value", () => {
                const mockLabel = { fontSize: 24 };
                mockNode.getComponent.mockReturnValue(mockLabel);

                const value = PropHandlerManager.getValue(EnumPropName.LabelFontSize, mockNode);

                expect(value).toBe(24);
            });

            it("should set label font size value", () => {
                const mockLabel = { fontSize: 16 };
                mockNode.getComponent.mockReturnValue(mockLabel);

                PropHandlerManager.setValue(EnumPropName.LabelFontSize, mockNode, 32);

                expect(mockLabel.fontSize).toBe(32);
            });
        });

        describe("Label Line Height Property", () => {
            it("should get label line height value", () => {
                const mockLabel = { lineHeight: 30 };
                mockNode.getComponent.mockReturnValue(mockLabel);

                const value = PropHandlerManager.getValue(EnumPropName.LabelLineHeight, mockNode);

                expect(value).toBe(30);
            });

            it("should set label line height value", () => {
                const mockLabel = { lineHeight: 20 };
                mockNode.getComponent.mockReturnValue(mockLabel);

                PropHandlerManager.setValue(EnumPropName.LabelLineHeight, mockNode, 40);

                expect(mockLabel.lineHeight).toBe(40);
            });
        });

        describe("Label Outline Color Property", () => {
            it("should get label outline color value", () => {
                const mockOutline = { color: { r: 0, g: 0, b: 0, a: 255 } };
                mockNode.getComponent.mockReturnValue(mockOutline);

                const value = PropHandlerManager.getValue(EnumPropName.LabelOutlineColor, mockNode);

                expect(value).toEqual({ r: 0, g: 0, b: 0, a: 255 });
            });

            it("should return undefined when no LabelOutline component", () => {
                mockNode.getComponent.mockReturnValue(null);

                const value = PropHandlerManager.getValue(EnumPropName.LabelOutlineColor, mockNode);

                expect(value).toBeUndefined();
            });

            it("should set label outline color value", () => {
                const mockOutline = { color: { r: 255, g: 255, b: 255, a: 255 } };
                mockNode.getComponent.mockReturnValue(mockOutline);

                PropHandlerManager.setValue(EnumPropName.LabelOutlineColor, mockNode, { r: 0, g: 0, b: 0, a: 128 });

                expect(mockOutline.color).toEqual({ r: 0, g: 0, b: 0, a: 128 });
            });
        });

        describe("Sprite Frame Property", () => {
            it("should get sprite frame value", () => {
                const mockFrame = { name: "test-frame" };
                const mockSprite = { spriteFrame: mockFrame };
                mockNode.getComponent.mockReturnValue(mockSprite);

                const value = PropHandlerManager.getValue(EnumPropName.SpriteFrame, mockNode);

                expect(value).toBe(mockFrame);
            });

            it("should return undefined when no Sprite component", () => {
                mockNode.getComponent.mockReturnValue(null);

                const value = PropHandlerManager.getValue(EnumPropName.SpriteFrame, mockNode);

                expect(value).toBeUndefined();
            });

            it("should set sprite frame value", () => {
                const newFrame = { name: "new-frame" };
                const mockSprite = { spriteFrame: null };
                mockNode.getComponent.mockReturnValue(mockSprite);

                PropHandlerManager.setValue(EnumPropName.SpriteFrame, mockNode, newFrame);

                expect(mockSprite.spriteFrame).toBe(newFrame);
            });
        });

        describe("Button Interactable Property", () => {
            it("should get button interactable value", () => {
                const mockButton = { interactable: true };
                mockNode.getComponent.mockReturnValue(mockButton);

                const value = PropHandlerManager.getValue(EnumPropName.ButtonInteractable, mockNode);

                expect(value).toBe(true);
            });

            it("should return undefined when no Button component", () => {
                mockNode.getComponent.mockReturnValue(null);

                const value = PropHandlerManager.getValue(EnumPropName.ButtonInteractable, mockNode);

                expect(value).toBeUndefined();
            });

            it("should set button interactable value", () => {
                const mockButton = { interactable: true };
                mockNode.getComponent.mockReturnValue(mockButton);

                PropHandlerManager.setValue(EnumPropName.ButtonInteractable, mockNode, false);

                expect(mockButton.interactable).toBe(false);
            });
        });

        describe("Slider Progress Property", () => {
            it("should get slider progress value", () => {
                const mockSlider = { progress: 0.5 };
                mockNode.getComponent.mockReturnValue(mockSlider);

                const value = PropHandlerManager.getValue(EnumPropName.SliderProgress, mockNode);

                expect(value).toBe(0.5);
            });

            it("should set slider progress value", () => {
                const mockSlider = { progress: 0 };
                mockNode.getComponent.mockReturnValue(mockSlider);

                PropHandlerManager.setValue(EnumPropName.SliderProgress, mockNode, 0.8);

                expect(mockSlider.progress).toBe(0.8);
            });
        });

        describe("EditBox String Property", () => {
            it("should get editbox string value", () => {
                const mockEditBox = { string: "input text" };
                mockNode.getComponent.mockReturnValue(mockEditBox);

                const value = PropHandlerManager.getValue(EnumPropName.EditboxString, mockNode);

                expect(value).toBe("input text");
            });

            it("should set editbox string value", () => {
                const mockEditBox = { string: "" };
                mockNode.getComponent.mockReturnValue(mockEditBox);

                PropHandlerManager.setValue(EnumPropName.EditboxString, mockNode, "new input");

                expect(mockEditBox.string).toBe("new input");
            });
        });

        describe("ProgressBar Progress Property", () => {
            it("should get progressbar progress value", () => {
                const mockProgress = { progress: 0.75 };
                mockNode.getComponent.mockReturnValue(mockProgress);

                const value = PropHandlerManager.getValue(EnumPropName.ProgressBarProgress, mockNode);

                expect(value).toBe(0.75);
            });

            it("should set progressbar progress value", () => {
                const mockProgress = { progress: 0 };
                mockNode.getComponent.mockReturnValue(mockProgress);

                PropHandlerManager.setValue(EnumPropName.ProgressBarProgress, mockNode, 1.0);

                expect(mockProgress.progress).toBe(1.0);
            });
        });

        describe("Toggle IsChecked Property", () => {
            it("should get toggle isChecked value", () => {
                const mockToggle = { isChecked: true };
                mockNode.getComponent.mockReturnValue(mockToggle);

                const value = PropHandlerManager.getValue(EnumPropName.ToggleIsChecked, mockNode);

                expect(value).toBe(true);
            });

            it("should set toggle isChecked value", () => {
                const mockToggle = { isChecked: false };
                mockNode.getComponent.mockReturnValue(mockToggle);

                PropHandlerManager.setValue(EnumPropName.ToggleIsChecked, mockNode, true);

                expect(mockToggle.isChecked).toBe(true);
            });
        });

        describe("RichText String Property", () => {
            it("should get richtext string value", () => {
                const mockRichText = { string: "<color=red>rich</color>" };
                mockNode.getComponent.mockReturnValue(mockRichText);

                const value = PropHandlerManager.getValue(EnumPropName.RichTextString, mockNode);

                expect(value).toBe("<color=red>rich</color>");
            });

            it("should set richtext string value", () => {
                const mockRichText = { string: "" };
                mockNode.getComponent.mockReturnValue(mockRichText);

                PropHandlerManager.setValue(EnumPropName.RichTextString, mockNode, "<b>bold</b>");

                expect(mockRichText.string).toBe("<b>bold</b>");
            });
        });

        describe("ScrollView Enabled Property", () => {
            it("should get scrollview enabled value", () => {
                const mockScrollView = { enabled: true };
                mockNode.getComponent.mockReturnValue(mockScrollView);

                const value = PropHandlerManager.getValue(EnumPropName.ScrollViewEnabled, mockNode);

                expect(value).toBe(true);
            });

            it("should set scrollview enabled value", () => {
                const mockScrollView = { enabled: true };
                mockNode.getComponent.mockReturnValue(mockScrollView);

                PropHandlerManager.setValue(EnumPropName.ScrollViewEnabled, mockNode, false);

                expect(mockScrollView.enabled).toBe(false);
            });
        });

        describe("Mask Enabled Property", () => {
            it("should get mask enabled value", () => {
                const mockMask = { enabled: true };
                mockNode.getComponent.mockReturnValue(mockMask);

                const value = PropHandlerManager.getValue(EnumPropName.MaskEnabled, mockNode);

                expect(value).toBe(true);
            });

            it("should set mask enabled value", () => {
                const mockMask = { enabled: true };
                mockNode.getComponent.mockReturnValue(mockMask);

                PropHandlerManager.setValue(EnumPropName.MaskEnabled, mockNode, false);

                expect(mockMask.enabled).toBe(false);
            });
        });
    });

    // ================== Handler Invocation Tests - Widget Properties ==================

    describe("Handler Invocation - Widget Properties", () => {
        describe("Widget Enabled Property", () => {
            it("should get widget enabled value", () => {
                const mockWidget = { enabled: true };
                mockNode.getComponent.mockReturnValue(mockWidget);

                const value = PropHandlerManager.getValue(EnumPropName.WidgetEnabled, mockNode);

                expect(value).toBe(true);
            });

            it("should set widget enabled value", () => {
                const mockWidget = { enabled: false };
                mockNode.getComponent.mockReturnValue(mockWidget);

                PropHandlerManager.setValue(EnumPropName.WidgetEnabled, mockNode, true);

                expect(mockWidget.enabled).toBe(true);
            });
        });

        describe("Widget Align Mode Property", () => {
            it("should get widget align mode value", () => {
                const mockWidget = { alignMode: 1 };
                mockNode.getComponent.mockReturnValue(mockWidget);

                const value = PropHandlerManager.getValue(EnumPropName.WidgetAlignMode, mockNode);

                expect(value).toBe(1);
            });

            it("should set widget align mode value", () => {
                const mockWidget = { alignMode: 0 };
                mockNode.getComponent.mockReturnValue(mockWidget);

                PropHandlerManager.setValue(EnumPropName.WidgetAlignMode, mockNode, 2);

                expect(mockWidget.alignMode).toBe(2);
            });
        });

        describe("Widget IsAlignTop Property", () => {
            it("should get widget isAlignTop value", () => {
                const mockWidget = { isAlignTop: true };
                mockNode.getComponent.mockReturnValue(mockWidget);

                const value = PropHandlerManager.getValue(EnumPropName.WidgetIsAlignTop, mockNode);

                expect(value).toBe(true);
            });

            it("should set widget isAlignTop value", () => {
                const mockWidget = { isAlignTop: false };
                mockNode.getComponent.mockReturnValue(mockWidget);

                PropHandlerManager.setValue(EnumPropName.WidgetIsAlignTop, mockNode, true);

                expect(mockWidget.isAlignTop).toBe(true);
            });
        });

        describe("Widget Top Property", () => {
            it("should get widget top value", () => {
                const mockWidget = { top: 10 };
                mockNode.getComponent.mockReturnValue(mockWidget);

                const value = PropHandlerManager.getValue(EnumPropName.WidgetTop, mockNode);

                expect(value).toBe(10);
            });

            it("should set widget top value", () => {
                const mockWidget = { top: 0 };
                mockNode.getComponent.mockReturnValue(mockWidget);

                PropHandlerManager.setValue(EnumPropName.WidgetTop, mockNode, 20);

                expect(mockWidget.top).toBe(20);
            });
        });

        describe("Widget Bottom Property", () => {
            it("should get widget bottom value", () => {
                const mockWidget = { bottom: 15 };
                mockNode.getComponent.mockReturnValue(mockWidget);

                const value = PropHandlerManager.getValue(EnumPropName.WidgetBottom, mockNode);

                expect(value).toBe(15);
            });

            it("should set widget bottom value", () => {
                const mockWidget = { bottom: 0 };
                mockNode.getComponent.mockReturnValue(mockWidget);

                PropHandlerManager.setValue(EnumPropName.WidgetBottom, mockNode, 25);

                expect(mockWidget.bottom).toBe(25);
            });
        });

        describe("Widget Left Property", () => {
            it("should get widget left value", () => {
                const mockWidget = { left: 5 };
                mockNode.getComponent.mockReturnValue(mockWidget);

                const value = PropHandlerManager.getValue(EnumPropName.WidgetLeft, mockNode);

                expect(value).toBe(5);
            });

            it("should set widget left value", () => {
                const mockWidget = { left: 0 };
                mockNode.getComponent.mockReturnValue(mockWidget);

                PropHandlerManager.setValue(EnumPropName.WidgetLeft, mockNode, 10);

                expect(mockWidget.left).toBe(10);
            });
        });

        describe("Widget Right Property", () => {
            it("should get widget right value", () => {
                const mockWidget = { right: 8 };
                mockNode.getComponent.mockReturnValue(mockWidget);

                const value = PropHandlerManager.getValue(EnumPropName.WidgetRight, mockNode);

                expect(value).toBe(8);
            });

            it("should set widget right value", () => {
                const mockWidget = { right: 0 };
                mockNode.getComponent.mockReturnValue(mockWidget);

                PropHandlerManager.setValue(EnumPropName.WidgetRight, mockNode, 16);

                expect(mockWidget.right).toBe(16);
            });
        });
    });

    // ================== Edge Cases ==================

    describe("Edge Cases", () => {
        it("should handle null node gracefully in getValue", () => {
            expect(() => {
                PropHandlerManager.getValue(EnumPropName.Active, null as any);
            }).not.toThrow();
        });

        it("should handle null node gracefully in setValue", () => {
            expect(() => {
                PropHandlerManager.setValue(EnumPropName.Active, null as any, false);
            }).not.toThrow();
        });

        it("should handle undefined handler gracefully in setValue", () => {
            expect(() => {
                PropHandlerManager.setValue(99999 as EnumPropName, mockNode, "value");
            }).not.toThrow();
        });

        it("should handle undefined handler gracefully in getValue", () => {
            const value = PropHandlerManager.getValue(99999 as EnumPropName, mockNode);

            expect(value).toBeUndefined();
        });

        it("should handle missing component gracefully", () => {
            mockNode.getComponent.mockReturnValue(null);

            const value = PropHandlerManager.getValue(EnumPropName.LabelString, mockNode);

            expect(value).toBeUndefined();
        });

        it("should not throw when setting value on missing component", () => {
            mockNode.getComponent.mockReturnValue(null);

            expect(() => {
                PropHandlerManager.setValue(EnumPropName.LabelString, mockNode, "text");
            }).not.toThrow();
        });
    });

    // ================== Custom Handler Registration ==================

    describe("Custom Handler Registration", () => {
        it("should allow registering custom handler", () => {
            const customPropType = 9999 as EnumPropName;
            const customHandler = {
                getValue: jest.fn(() => "custom"),
                setValue: jest.fn(),
                getDefaultValue: jest.fn(() => "default"),
            };

            PropHandlerManager.register(customPropType, customHandler);

            const retrieved = PropHandlerManager.getHandler(customPropType);
            expect(retrieved).toBe(customHandler);
        });

        it("should override existing handler on re-registration", () => {
            const originalHandler = PropHandlerManager.getHandler(EnumPropName.Active);
            const newHandler = {
                getValue: jest.fn(() => "overridden"),
                setValue: jest.fn(),
                getDefaultValue: jest.fn(),
            };

            PropHandlerManager.register(EnumPropName.Active, newHandler);

            const retrieved = PropHandlerManager.getHandler(EnumPropName.Active);
            expect(retrieved).toBe(newHandler);

            // Restore original for other tests
            PropHandlerManager.register(EnumPropName.Active, originalHandler);
        });
    });
});
