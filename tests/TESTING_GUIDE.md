# Cocos Creator Jest 单元测试编写指南

> 基于 Mine.test.ts 与 VRoomModel.test.ts 提炼的分类策略
> 小而精，按文件类型选择对应策略

---

## 文件类型判断（决策树）

```
你的文件继承了 cc.Component 吗?
│
├─ YES → 【UI 组件策略】
│        场景: Mine.ts, Avatar.ts 等挂载在节点上的组件
│        特征: 有 @property, onLoad, onDestroy 等生命周期
│
└─ NO  → 【纯逻辑策略】
         场景: VRoomModel.ts, Store.ts, Util.ts 等
         特征: 单例/静态类/工具函数，无 UI 节点依赖
```

---

## UI 组件测试策略

> 参考: `tests/assets/Bundles/Main/Script/__tests__/Mine.test.ts`

### 核心步骤

```typescript
// 1. Mock 在 import 之前
jest.mock('assets/Script/Store/Store', () => ({ /* ... */ }));

// 2. 导入被测组件
import MyComponent from 'assets/path/to/MyComponent';

describe('MyComponent', () => {
    let instance: MyComponent;

    beforeEach(() => {
        jest.clearAllMocks();
        app.bizEmitter.clear();

        // 3. 创建场景（必须）
        const scene = new cc.Scene();
        cc.director.runSceneImmediate(scene);

        // 4. 创建节点并设为 inactive（关键）
        const node = new cc.Node();
        scene.addChild(node);
        node.active = false;  // 防止 onLoad 提前触发

        // 5. 用 addComponent 实例化（必须）
        instance = node.addComponent(MyComponent);

        // 6. 绑定 UI 节点（模拟编辑器属性绑定）
        const labelNode = new cc.Node('label');
        node.addChild(labelNode);
        instance['label'] = labelNode.addComponent(cc.Label);
    });
});
```

### describe 组织维度（4 块）

```typescript
describe('MyComponent', () => {
    describe('Lifecycle Methods', () => {
        // onPageShow, onPageTop, onPageHide, onDestroy
        // 验证: 初始化、事件注册/注销、资源清理
    });

    describe('UI Update Methods', () => {
        // 数据 → UI 渲染逻辑
        // 验证: Label.string, ProgressBar.progress, node.active
    });

    describe('Event Handlers', () => {
        // 用户交互: onClick, onTouch
        // 系统事件: bizEmitter 响应
    });

    describe('Edge Cases', () => {
        // null/undefined、边界值、组件销毁后回调
    });
});
```

### UI 组件 Mock 重点

```typescript
// Store（用户数据）
jest.mock('assets/Script/Store/Store', () => ({
    store: {
        userInfo: { uid: 12345, nickname: 'Test' },
        getUid: jest.fn(() => 12345),
    },
}));

// UIManager（UI 打开/关闭）
jest.mock('assets/Script/UI/UIManager', () => ({
    uiManager: {
        open: jest.fn(),
        showToast: jest.fn(),
    },
}));

// API（网络请求）
jest.mock('assets/Script/Server/Http/Api', () => ({
    api: {
        getData: jest.fn(() => Promise.resolve({ data: 'value' })),
    },
}));

// 混合 Mock（保留真实逻辑，仅 Mock 外部依赖）
jest.mock('assets/Script/Utils/Util', () => {
    const actual = jest.requireActual('assets/Script/Utils/Util');
    actual.util.poolMethod = jest.fn();  // 仅 Mock 依赖对象池的方法
    return actual;
});
```

### 测试替身（必须继承 cc.Component）

```typescript
// 用于模拟子组件
class TestAvatar extends cc.Component {
    public setup = jest.fn();
    public update = jest.fn();
}

const avatarNode = new cc.Node();
const testAvatar = avatarNode.addComponent(TestAvatar);
```

---

## 纯逻辑测试策略

> 参考: `tests/assets/Script/Model/__tests__/VRoomModel.test.ts`

### 核心步骤

```typescript
// 1. Mock 在 import 之前
jest.mock('assets/Script/App', () => ({
    app: { bizEmitter: { emit: jest.fn(), clear: jest.fn() } },
}));

// 2. 导入被测模块
import MyModel from 'assets/Script/Model/MyModel';

describe('MyModel', () => {
    let instance: MyModel;

    beforeEach(() => {
        jest.clearAllMocks();

        // 3. 重置单例（如果是单例模式）
        (MyModel as any)._instance = null;
        instance = MyModel.INSTANCE;

        // 4. Mock 平台 API（如需要）
        (globalThis as any).platform = {
            setStorage: jest.fn(({ key, data }) => { /* ... */ }),
            getStorageSync: jest.fn((key) => { /* ... */ }),
        };
    });
});
```

### describe 组织维度

```typescript
describe('MyModel', () => {
    describe('Lifecycle / Singleton', () => {
        // 单例行为、初始化
    });

    describe('Core Logic', () => {
        // 核心业务方法
        // 按功能模块细分 describe
    });

    describe('State Management', () => {
        // getter/setter、状态变更
    });

    describe('Edge Cases', () => {
        // 网络离线、null 值、超时处理
    });
});
```

### 纯逻辑 Mock 重点

```typescript
// App 事件系统
jest.mock('assets/Script/App', () => ({
    app: {
        bizEmitter: {
            emit: jest.fn(),
            clear: jest.fn(),
        },
    },
}));

// 网络连接状态
jest.mock('assets/Script/Server/Socket/connectors', () => ({
    mainWS: {
        getIsOffline: jest.fn(),
    },
}));

// 服务层请求
jest.mock('assets/Script/Server/Services/ServiceRoom', () => ({
    createRoomReq: jest.fn(),
    doSitReq: jest.fn(),
}));

// 日志（静默处理）
jest.mock('assets/Script/Core/Logger', () => ({
    __esModule: true,
    default: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    },
}));
```

---

## 通用规范

### Mock 设置顺序（必须）

```typescript
// ✅ 正确: Mock 在 import 之前
jest.mock('assets/Script/Store/Store', () => ({ /* ... */ }));
import Component from 'assets/Component';

// ❌ 错误: Mock 在 import 之后（不生效）
import Component from 'assets/Component';
jest.mock('assets/Script/Store/Store', () => ({ /* ... */ }));
```

### 私有成员访问

```typescript
// ✅ 推荐: 保持类型检查
instance['privateMethod']();
expect(instance['label'].string).toBe('value');

// ⚠️ 可接受（但不推荐）
(instance as any).privateMethod();
```

### 事件测试三要素

```typescript
test('事件注册 → 触发 → 移除', () => {
    // 1. 注册
    instance['onPageShow']({});
    expect(app.bizEmitter.hasListener('Event')).toBe(true);

    // 2. 触发并验证状态更新
    app.bizEmitter.emit('Event', { data: '新值' });
    expect(instance['label'].string).toBe('新值');

    // 3. 移除
    instance['onPageHide']({});
    expect(app.bizEmitter.hasListener('Event')).toBe(false);
});
```

### 异步测试

```typescript
// Promise
test('异步方法', async () => {
    await instance['asyncMethod']();
    expect(mockAPI.call).toHaveBeenCalled();
});

// 防抖
test('防抖方法', () => {
    jest.useFakeTimers();
    instance['debounced']();
    jest.advanceTimersByTime(500);
    expect(mockAPI.call).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
});

// 超时
test('超时处理', async () => {
    jest.useFakeTimers();
    const p = instance['methodWithTimeout']();
    jest.advanceTimersByTime(1000);
    const result = await p;
    expect(result.size).toBe(0);
    jest.useRealTimers();
});
```

### 代码缺陷标注

```typescript
// TODO: 源代码缺陷 - Component.ts:123 缺少 catch 处理
test.skip('应该处理 API 失败', async () => {
    // 此测试被跳过，因为源代码存在 unhandled rejection
    // 修复方案: 在 api.call().then(...) 后添加 .catch()
});
```

---

## 断言速查表

```typescript
// Mock 验证
expect(mock).toHaveBeenCalled()
expect(mock).toHaveBeenCalledWith(arg1, arg2)
expect(mock).toHaveBeenCalledTimes(2)
expect(mock).not.toHaveBeenCalled()

// 状态验证
expect(instance['label'].string).toBe('value')
expect(instance['progressBar'].progress).toBeCloseTo(0.75, 2)
expect(instance['node'].active).toBe(true)

// 事件验证
expect(app.bizEmitter.hasListener('Event')).toBe(true)

// 异常验证
expect(() => fn()).not.toThrow()
expect(() => fn()).toThrow('error message')

// 异步验证
await expect(promise).resolves.toEqual({ data: 'value' })
await expect(promise).rejects.toBe('错误信息')

// 对象/数组
expect(obj).toEqual({ key: 'value' })
expect(arr).toHaveLength(3)
expect(arr).toContain('item')
```

---

## 最佳实践清单

### 开始前确认

- [ ] 判断文件类型 → 选择对应策略
- [ ] Mock 在 import 之前
- [ ] beforeEach 中调用 `jest.clearAllMocks()`

### UI 组件专用

- [ ] 使用 `node.addComponent()` 实例化
- [ ] 创建节点后设置 `node.active = false`
- [ ] 测试替身继承 `cc.Component`
- [ ] 清空事件系统 `app.bizEmitter.clear()`
- [ ] 覆盖 4 个 describe 维度

### 纯逻辑专用

- [ ] 重置单例 `(Class as any)._instance = null`
- [ ] Mock 平台 API（如 storage）
- [ ] 按功能模块组织 describe

### 通用

- [ ] 使用 `instance['member']` 访问私有成员
- [ ] 测试事件注册、触发、移除
- [ ] 验证资源清理逻辑
- [ ] 处理 null/边界值/错误码
- [ ] 用 `test.skip + TODO` 标注源代码缺陷

---

## 参考示例

| 类型 | 文件 | 说明 |
|------|------|------|
| UI 组件 | `tests/assets/Bundles/Main/Script/__tests__/Mine.test.ts` | 完整的 UI 组件测试（30+ 用例） |
| 纯逻辑 | `tests/assets/Script/Model/__tests__/VRoomModel.test.ts` | 单例模型测试 |

---

## 测试质量保证

> 核心问题：如何避免测试成为"源代码的复读机"？

### 策略一：测试用例来源清单

**编写测试前，从以下来源收集用例，而不是看着源码写：**

| 来源 | 示例 | 说明 |
|------|------|------|
| **需求文档/PRD** | "信用分低于 500 禁止发言" | 直接测试业务规则 |
| **边界值** | 0, 500, 501, null | 临界点往往是 Bug 高发区 |
| **历史 Bug** | JIRA-123: 昵称为空时崩溃 | 确保不会回归 |
| **等价类** | 正常用户/VIP用户/游客 | 每类取一个代表值 |
| **错误路径** | 网络超时/API 500/权限不足 | 异常处理逻辑 |

```typescript
describe('CreditScore', () => {
    // 来源：需求文档
    describe('根据需求规则', () => {
        test('信用分 >= 500 允许发言');
        test('信用分 < 500 禁止发言并提示');
    });

    // 来源：边界值分析
    describe('边界值', () => {
        test('信用分 = 499 应禁止');
        test('信用分 = 500 应允许');  // 边界点
        test('信用分 = 501 应允许');
    });

    // 来源：历史 Bug
    describe('回归测试', () => {
        test('JIRA-123: 信用分为 null 不应崩溃');
    });
});
```

### 策略二：「杀变异」检查清单

**写完测试后，问自己：如果修改源码，测试能发现吗？**

| 代码结构 | 变异检查 |
|----------|----------|
| `if (a > b)` | 改成 `>=` 会被测试发现吗？ |
| `return value` | 改成 `return null` 会被发现吗？ |
| `array.push(item)` | 删掉这行会被发现吗？ |
| `emitter.on('Event')` | 删掉注册会被发现吗？ |
| `Math.min(x, 1)` | 删掉 Math.min 会被发现吗？ |

```typescript
// 源码
updateProgress() {
    const ratio = this.xp / this.nextLevelXp;
    this.progressBar.progress = Math.min(ratio, 1);
}

// ✅ 好的测试：覆盖变异点
test('进度应该正确计算', () => {
    instance.xp = 75;
    instance.nextLevelXp = 100;
    instance.updateProgress();
    expect(instance.progressBar.progress).toBe(0.75);  // 会发现 / 改成 *
});

test('进度不应超过 1', () => {
    instance.xp = 150;
    instance.nextLevelXp = 100;
    instance.updateProgress();
    expect(instance.progressBar.progress).toBe(1);  // 会发现删掉 Math.min
});
```

### 策略三：无效测试反模式

**避免以下写法：**

#### 反模式 1：只测试 Mock 本身

```typescript
// ❌ 无效
test('mock 返回正确值', () => {
    expect(api.getData()).toBe('mocked');  // 废话！Mock 返回什么当然就是什么
});

// ✅ 有效：验证组件如何使用 API 返回值
test('组件应该显示 API 返回的数据', () => {
    instance.loadData();
    expect(instance.label.string).toBe('mocked');
});
```

#### 反模式 2：重复实现逻辑

```typescript
// ❌ 无效：测试和源码逻辑一样
test('score 60 返回 PASS', () => {
    expect(getGrade(60)).toBe(60 >= 60 ? 'PASS' : 'FAIL');  // 复述条件
});

// ✅ 有效：基于规格而非实现
test('及格分数应返回 PASS', () => {
    expect(getGrade(60)).toBe('PASS');  // 断言预期结果
});
```

#### 反模式 3：过度 Mock 导致测试无意义

```typescript
// ❌ 无效：Mock 了被测对象本身的核心方法
jest.spyOn(instance, 'calculate').mockReturnValue(100);
test('calculate 返回 100', () => {
    expect(instance.calculate()).toBe(100);  // 没有测试任何真实逻辑
});

// ✅ 有效：Mock 外部依赖，测试真实逻辑
jest.mock('./HttpClient');  // 只 Mock 网络层
test('应该正确解析 API 响应', () => {
    // 测试真实的数据处理逻辑
});
```

### 测试质量自检清单

- [ ] 用例来源是需求/边界/历史Bug，而非照抄源码？
- [ ] 边界值（0, null, max, min）都测试了？
- [ ] 修改源码的关键行，测试会失败？
- [ ] Mock 的是外部依赖，而非被测逻辑本身？
- [ ] 断言的是预期结果，而非重复计算过程？

---

**遵循此指南，快速编写高质量的 Cocos Creator 单元测试！**
