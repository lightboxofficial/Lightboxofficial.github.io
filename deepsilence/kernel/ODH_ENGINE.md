# OriginalDeepsilenceHeart (ODH) · 窗口引擎完整技术文档

> 版本：v1.0.0 · 生成日期：2026-11-18
> 适用对象：希望理解、使用、扩展或二次开发 ODH 窗口引擎的开发者。
> 阅读目标：读完本文后，你应当能独立为 ODH 添加指令、事件与窗口，并理解从「双击 index.html」到「窗口渲染完毕」的完整链路。

---

## 目录

1. [概述与设计理念](#1-概述与设计理念)
2. [目录结构](#2-目录结构)
3. [启动流程：从双击到窗口出现](#3-启动流程从双击到窗口出现)
4. [三件套数据格式](#4-三件套数据格式)
   - 4.1 [commands.json — 指令集](#41-commandsjson--指令集)
   - 4.2 [events.json — 事件定义](#42-eventsjson--事件定义)
   - 4.3 [layouts/\*.json — 窗口排版](#43-layoutsjson--窗口排版)
5. [指令系统](#5-指令系统)
   - 5.1 [指令文本语法](#51-指令文本语法)
   - 5.2 [解析与执行全链路](#52-解析与执行全链路)
   - 5.3 [参数解析 parseCallArgs](#53-参数解析-parsecallargs)
   - 5.4 [内置指令 builtins 详解](#54-内置指令-builtins-详解)
   - 5.5 [自定义指令 run 字段](#55-自定义指令-run-字段)
6. [事件系统](#6-事件系统)
7. [窗口系统 LBWindow](#7-窗口系统-lbwindow)
   - 7.1 [窗口对象模型](#71-窗口对象模型)
   - 7.2 [normalizeLayout 规范化](#72-normalizelayout-规范化)
   - 7.3 [窗口状态与持久化](#73-窗口状态与持久化)
   - 7.4 [侧边栏页面 setPage](#74-侧边栏页面-setpage)
   - 7.5 [拖拽 / 缩放 / 最大化 / 最小化](#75-拖拽--缩放--最大化--最小化)
   - 7.6 [属性浮窗](#76-属性浮窗)
   - 7.7 [iframe 内容层](#77-iframe-内容层)
8. [桌面 UI](#8-桌面-ui)
9. [资源加载：Sources 与 mirror.js](#9-资源加载sources-与-mirrorjs)
10. [对外 API](#10-对外-api)
11. [CSS 变量与主题](#11-css-变量与主题)
12. [开发指南](#12-开发指南)
13. [常见问题与排错](#13-常见问题与排错)

---

## 1. 概述与设计理念

**OriginalDeepsilenceHeart（ODH）** 是一个运行在浏览器里的「窗口引擎」。它把一个网页变成桌面环境：可以打开多个带标题栏的窗口，窗口里渲染 HTML/CSS/JS，窗口之间可以通过**指令**互相驱动。

### 1.1 核心设计：三件套分离

ODH 把所有可配置内容拆成三类 JSON 文件，彻底分离「能力」「流程」「界面」：

| 文件 | 职责 | 谁来读 |
|------|------|--------|
| `events/commands.json` | **指令集**：定义引擎「能做什么」。每条指令声明名称、参数、实现。 | `Kernel.loadCommands()` |
| `events/events.json` | **事件定义**：把若干指令串成一段可复用的流程。`root` 事件是启动入口，其余事件可在 HTML 里用 `parent.ODH.runEvent('事件名')` 触发。 | `Kernel.loadEvents()` + `Kernel.runEvent()` |
| `layouts/*.json` | **窗口排版**：一个窗口长什么样（标题、图标、尺寸、侧边栏页面、内嵌 HTML）。 | `Kernel.loadLayout()` |

这样的好处：
- **能力与内容解耦**：引擎只负责执行指令，业务全写在 JSON 里。
- **事件可复用**：同一段指令序列可以被多个窗口、多个按钮复用。
- **纯数据驱动**：没有任何 DSL 标记语言，窗口内容就是原生 HTML/CSS/JS。

### 1.2 技术栈

- **纯原生 JavaScript**（ES5 兼容，IIFE 封装，不依赖任何框架）
- **原生 CSS**（CSS 变量驱动主题，毛玻璃 `backdrop-filter`）
- **JSON** 作为唯一配置格式
- **iframe + srcdoc** 承载窗口内容（提供样式隔离）
- **localStorage** 持久化窗口位置/尺寸与壁纸

### 1.3 一句话理解运行模型

```
启动 → 读 commands.json（我能做什么）
     → 读 events.json（启动时该做什么）
     → 执行 root 事件（比如 window(welcome)）
     → 读 layouts/welcome.json（窗口长什么样）
     → 渲染窗口
用户点击窗口内按钮 → parent.ODH.runEvent('xxx') → 执行对应指令序列
```

---

## 2. 目录结构

```
deepsilence/kernel/
├── index.html              # 桌面外壳：启动器、状态栏、日志面板、dock、toast 容器
├── engine.css              # 引擎全部样式（窗口、UI、动画、CSS 变量）
├── engine.js               # 引擎本体（IIFE，暴露 window.ODH）
├── mirror.js               # file:// 离线镜像（三件套的内联副本，自动生成）
├── events/
│   ├── commands.json       # 指令集定义
│   └── events.json         # 事件定义（含 root 启动事件）
└── layouts/
    └── welcome.json        # 窗口排版示例
```

**关键约束**：
- `index.html` 必须先加载 `mirror.js`，再加载 `engine.js`。
- `mirror.js` 仅在 `file://` 协议下生效；`http(s)` 下引擎直接读真实文件。
- 任何对三件套 JSON 的修改都需要重新生成 `mirror.js`（见 [9.3 节](#93-重新生成-mirrorjs)）。

---

## 3. 启动流程：从双击到窗口出现

以 `file://` 双击 `index.html` 为例，完整时序如下：

```
[浏览器] 加载 index.html
  ↓ 解析 <head>
加载 engine.css
  ↓ 解析 <body>
创建桌面 DOM（启动器 / 日志面板 / dock / toasts）
  ↓
加载 mirror.js → window.ODH_MIRROR = { "layouts/welcome.json": "...", "events/...": "..." }
  ↓
加载 engine.js → IIFE 执行
  ├─ 定义工具函数（num / clamp / px / escapeHtml 等）
  ├─ 定义 Sources（资源加载器）
  ├─ 定义 parseCallArgs / parseCommandText（指令解析）
  ├─ 定义 normalizeLayout（排版规范化）
  ├─ 定义 buildFrameDoc（iframe 文档构造）
  ├─ 定义 LBWindow 类（窗口）
  ├─ 定义 Kernel 对象（内核：指令、事件、窗口注册表）
  ├─ 定义 UI 对象（桌面 UI）
  ├─ 暴露 window.ODH = Kernel
  └─ DOMContentLoaded → Kernel.boot()
       ├─ Sources.registerInline(window.ODH_MIRROR)   // 注册离线镜像
       ├─ UI.bind()                                     // 绑定桌面交互
       ├─ 读 localStorage 壁纸 / 加载默认壁纸
       ├─ loadCommands('events/commands.json')          // 注册 11 条指令
       ├─ loadEvents('events/events.json')              // 注册 4 个事件
       ├─ runEvent('root')                              // 执行启动事件
       │    ├─ window(welcome) → loadLayout → new LBWindow
       │    └─ notify('ODH 已就绪') → 顶部 toast
       └─ UI.status('v1.0.0 · 11 指令 · 执行 2 条')
[用户看到] welcome 窗口出现在桌面
```

**两个关键点**：
1. `boot()` 是严格串行的 Promise 链：指令集 → 事件 → root 事件。任何一步失败都会进入 `.catch`，状态栏显示「启动失败」并弹出错误 toast。
2. `runEvent('root')` 是启动的「主程序」。你想让引擎启动时做什么，就改 `events.json` 里的 `root` 数组。

---

## 4. 三件套数据格式

### 4.1 commands.json — 指令集

```json
{
  "id": "commands.json",
  "name": "ODH 指令集",
  "version": 1,
  "about": "定义有哪些指令可用。",
  "instructions": {
    "指令名": {
      "desc": "一句话说明",
      "args": ["参数1", "参数2"],
      "builtin": "内置实现名",
      "run": "可选的自定义 JS 代码字符串"
    }
  }
}
```

#### 字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | 否 | 指令集标识，用于日志显示 |
| `name` / `about` | 否 | 人类可读说明，不参与执行 |
| `instructions` | 是 | 指令字典，key 是指令名 |
| `desc` | 否 | 指令描述，仅文档用途 |
| `args` | 是 | 参数名数组。决定位置参数如何映射到命名参数 |
| `builtin` | 二选一 | 指向 `Kernel.builtins` 里的内置实现名 |
| `run` | 二选一 | 一段 JS 代码字符串，用 `new Function('args','kernel','source', run)` 执行 |

**实现优先级**：`run` 优先于 `builtin`。两者都没填则执行时报错「指令 xxx() 没有可执行的实现」。

#### 指令名规则

- 必须以字母、`_` 或 `$` 开头，后续可含字母、数字、`_`、`$`。
- 调用时形如 `指令名(参数)`，括号可省略（无参数时）。

### 4.2 events.json — 事件定义

```json
{
  "id": "events.json",
  "name": "ODH 事件定义",
  "about": "每个事件是一段指令序列。",
  "events": {
    "root": [
      "window(welcome)",
      "notify('OriginalDeepsilenceHeart (ODH) 已就绪')"
    ],
    "openWelcome": [
      "window(welcome)"
    ],
    "resetWallpaper": [
      "setwall()"
    ]
  }
}
```

#### 字段说明

| 字段 | 说明 |
|------|------|
| `events` | 事件字典，key 是事件名 |
| 事件值 | 必须是**字符串数组**，每个元素是一条指令文本 |

**`root` 事件的特殊性**：引擎启动时自动执行 `runEvent('root')`。没有 `root` 事件则启动后桌面为空。

**事件值的两种形态**：
- 数组（推荐）：`["window(welcome)", "notify('hi')"]`
- 字符串（兼容）：`"window(welcome)\nnotify('hi')"`，会被 `parseCommandText` 拆成多条。

### 4.3 layouts/*.json — 窗口排版

一个排版文件定义一个窗口的全部信息。以 `welcome.json` 为例的完整结构：

```json
{
  "id": "welcome",
  "name": "欢迎窗口",
  "version": 1,
  "win": {
    "id": "welcome",
    "title": "OriginalDeepsilenceHeart",
    "icon": "<svg>...</svg>",
    "x": 120, "y": 90, "w": 820, "h": 560,
    "minWidth": 480, "minHeight": 360,
    "opacity": 0.94,
    "resizable": true,
    "sidebar": [
      { "id": "overview", "label": "概览", "icon": "<svg>...</svg>" },
      { "id": "structure", "label": "结构", "icon": "<svg>...</svg>" }
    ],
    "startPage": "overview"
  },
  "page": {
    "html": "<style>...</style><button onclick='parent.ODH.runEvent(\"openWelcome\")'>...</button>"
  },
  "items": {
    "overview": {
      "label": "概览",
      "html": "<div>窗口内容 HTML</div>"
    },
    "structure": {
      "label": "结构",
      "html": "<div>...</div>"
    }
  }
}
```

#### 顶层字段

| 字段 | 说明 |
|------|------|
| `id` | 排版标识，同时用作窗口默认 id |
| `name` | 排版名称，仅日志显示 |
| `win` | 窗口元数据（见下） |
| `page` | **窗口级** HTML（所有页面共享，如右下角悬浮按钮） |
| `items` | 侧边栏页面对象，key 是页面 id |

#### `win` 字段

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `id` | 排版 id | 窗口唯一标识 |
| `title` | 排版 id | 标题栏文字 |
| `icon` | `◆` | 标题栏图标（内联 SVG 或字符） |
| `x` / `y` | 居中 | 初始位置 |
| `w` / `h` | 720 / 520 | 初始宽高 |
| `minWidth` / `minHeight` | 320 / 220 | 最小尺寸 |
| `opacity` | 0.94 | 窗口不透明度 |
| `resizable` | true | 是否可缩放 |
| `sidebar` | `[]` | 侧边栏页面定义数组 |
| `startPage` | 第一个页面 id | 启动时显示的页面 |

#### `page` 与 `items[*]` 字段

| 字段 | 说明 |
|------|------|
| `label` | 侧边栏标签 |
| `icon` | 侧边栏图标 |
| `html` | 内联 HTML 字符串（直接塞进 iframe） |
| `htmlSrc` | 外部 HTML 文件路径（与 `html` 二选一） |

**合并规则**（`setPage` 时）：
- 最终 HTML = `page.html` + `items[当前页].html`（窗口级内容始终保留，页面内容追加其后）。
- 这使得「右下角悬浮按钮」这类窗口级元素在所有页面都可见。
- 如果没有 `html` 但有 `htmlSrc`，则通过 `Sources.tryText()` 加载外部文件。

#### `sidebar` 的简写形式

`sidebar` 也可以是字符串数组，此时每个字符串既是页面 id 也是 label，icon 为空：

```json
"sidebar": ["概览", "结构", "交互"]
```

---

## 5. 指令系统

### 5.1 指令文本语法

一条指令的基本形态：

```
指令名(参数1, 参数2, key=value, ...)
```

**语法规则**：

| 规则 | 说明 |
|------|------|
| 指令名 | 字母 / `_` / `$` 开头，后续字母数字 `_$` |
| 参数分隔 | 逗号 `,` |
| 位置参数 | 直接写值：`window(welcome)` |
| 命名参数 | `key=value`：`set(id=welcome, key=opacity, value=0.8)` |
| 字符串 | 单引号或双引号：`notify('你好')`、`notify("你好")` |
| 数字 / 布尔 | 直接写：`123`、`true`、`false`、`null` |
| 嵌套引号 | 字符串内可包含另一类引号，或用 `\` 转义 |
| 注释 | 行内 `#` 或 `//` 之后的内容被忽略 |
| 多条指令 | 换行或分号 `;` 分隔 |

**示例**：

```
# 打开 welcome 窗口
window(welcome)

# 命名参数打开窗口并指定位置
window(layout=welcome, x=100, y=100, w=900, h=600)

# 连续执行（分号分隔）
notify('开始'); window(settings); log('done')

// 也支持 // 注释
set(welcome, opacity, 0.8)
```

### 5.2 解析与执行全链路

```
指令文本 "window(welcome, x=100)"
  │
  ├─ parseCommandText(text)        → 拆成单条语句数组
  │    （处理换行/分号/引号/注释）
  │
  └─ 对每条语句 runStatement(stmt, source)
       │
       ├─ 正则匹配：/^([A-Za-z_$][\w$]*)\s*(?:\(([\s\S]*)\))?\s*$/
       │    → name="window", argText="welcome, x=100"
       │
       ├─ parseCallArgs(argText)    → [{value:"welcome"}, {key:"x", value:100}]
       │
       └─ invoke(name, callList, source)
            │
            ├─ 查 instructions.get(name) → spec
            ├─ 组装 args 对象：{ __pos:["welcome"], x:100, __source, __name }
            ├─ 位置参数映射到命名参数（按 spec.args 顺序）
            │
            ├─ spec.run 存在 → new Function('args','kernel','source', run)(args, Kernel, source)
            └─ 否则 spec.builtin → Kernel.builtins[spec.builtin](args)
```

**source 参数**：记录指令来源，用于错误日志。值为 `'event:事件名'`、`'<action>'` 或 `'boot'` 等。

### 5.3 参数解析 parseCallArgs

输入参数字符串，输出数组，每个元素是 `{ key?, value }`。

**解析规则**：

| 输入片段 | 输出 |
|----------|------|
| `welcome` | `{ value: "welcome" }`（字符串） |
| `100` | `{ value: 100 }`（数字） |
| `true` / `false` / `null` | `{ value: true/false/null }` |
| `'hello'` | `{ value: "hello" }` |
| `x=100` | `{ key: "x", value: 100 }` |
| `text="a,b"` | `{ key: "text", value: "a,b" }`（引号内逗号不分隔） |

**引号处理**：支持单引号 `'` 和双引号 `"`，引号内的逗号、括号不参与分隔。`parseLiteral` 用 `JSON.parse` 还原带引号的字符串，因此支持 `\n`、`\t`、`\"` 等转义。

**顶层分隔 `splitTop`**：在引号外、括号深度为 0 时按逗号分割。这意味着 `exec("notify('a,b')")` 不会被错误拆分。

### 5.4 内置指令 builtins 详解

以下是 `commands.json` 中 11 条指令对应的内置实现，均位于 `Kernel.builtins`：

| 指令 | builtin | 参数 | 行为 |
|------|---------|------|------|
| `window` | `window` | `layout`, `x`, `y`, `w`, `h`, `opacity` | 打开窗口。若同 id 窗口已存在则聚焦。 |
| `close` | `close` | `id` | 关闭窗口。省略 id 关闭当前聚焦窗口。 |
| `minimize` | `minimize` | `id` | 最小化到底部 dock。 |
| `maximize` | `maximize` | `id` | 最大化/还原切换。 |
| `focus` | `focus` | `id` | 召回并聚焦窗口（若最小化则还原）。 |
| `page` | `page` | `id`, `page` | 切换窗口侧边栏页面。 |
| `set` | `set` | `id`, `key`, `value` | 修改窗口属性（见下表）。 |
| `notify` | `notify` | `text` | 顶部轻提示。 |
| `log` | `log` | `text` | 写入内核日志面板。 |
| `exec` | `exec` | `text` | 把一段文本当作新指令序列执行。 |
| `setwall` | `setwall` | `url` | 设置桌面壁纸；留空恢复默认。 |

**`set` 指令的 `key` 可取值**：

| key | 说明 | 实现 |
|-----|------|------|
| `x` / `y` / `w` / `h` | 位置与尺寸 | 改 `state`，`applyState`，`save` |
| `opacity` | 不透明度 | `--lb-opacity` CSS 变量 |
| `radius` | 圆角 | `--lb-radius` CSS 变量 |
| `blur` | 模糊半径 | `--lb-blur` CSS 变量 |
| `padding` | 内容边距 | `--lb-pad` CSS 变量 |
| `title` | 标题 | 改标题栏文字 + `state.title` |

### 5.5 自定义指令 run 字段

如果不想写内置实现，可以在 `commands.json` 里用 `run` 字段直接写 JS：

```json
"myCmd": {
  "desc": "我的自定义指令",
  "args": ["name"],
  "run": "kernel.notify('你好，' + args.name); return args.name;"
}
```

`run` 代码在 `new Function('args', 'kernel', 'source', run)` 中执行，可使用三个参数：
- `args`：组装好的参数对象（含 `__pos` 位置参数数组）
- `kernel`：即 `Kernel` 对象，可调用 `kernel.openWindow()`、`kernel.notify()` 等
- `source`：指令来源字符串

`run` 的返回值会被 `Promise.resolve` 包装，可返回 Promise 实现异步。

---

## 6. 事件系统

### 6.1 事件是什么

事件就是一段给指令序列起的名字。它本身不定义新能力，只是把已有的指令组合成可复用的流程。

```json
"openWelcome": [ "window(welcome)" ]
```

定义后，任何地方都能用 `ODH.runEvent('openWelcome')` 触发它。

### 6.2 runEvent() 执行流程

```javascript
runEvent(name):
  ev = events[name]                    // 查事件定义
  if (!ev) reject("未定义的事件")
  list = Array.isArray(ev) ? ev : parseCommandText(ev)
  log("▶ 事件 name · N 条指令")
  chain = Promise.resolve()
  for stmt in list:
    chain = chain.then(() => runStatement(stmt, 'event:name').catch(log))
  return chain.then(() => list.length)
```

**要点**：
- 事件内的指令**串行执行**，前一条完成才执行下一条。
- 单条指令失败只记日志，不中断后续指令（`.catch` 吞掉错误）。
- 返回值是 Promise，resolve 为执行的指令条数。

### 6.3 root 启动事件

`root` 事件在 `boot()` 中被自动调用，是整个引擎的「开机程序」：

```json
"root": [
  "window(welcome)",
  "notify('OriginalDeepsilenceHeart (ODH) 已就绪')"
]
```

修改 `root` 数组即可改变启动行为，例如启动时打开多个窗口：

```json
"root": [
  "window(welcome)",
  "window(dashboard)",
  "notify('系统就绪')"
]
```

### 6.4 在 HTML 中调用事件

窗口内容运行在 iframe 里，通过 `parent.ODH` 访问父窗口的引擎对象：

```html
<!-- 最简单的调用 -->
<button onclick="parent.ODH.runEvent('openWelcome')">打开欢迎</button>

<!-- 带返回值处理 -->
<button onclick="parent.ODH.runEvent('notifyDemo').then(n => console.log('执行了', n, '条'))">测试</button>
```

也可以直接调用指令（绕过事件）：

```html
<button onclick="parent.ODH.exec('notify(\"hello\")')">发通知</button>
```

**推荐用事件**：把指令序列收敛到 `events.json`，HTML 只负责「触发」，便于统一管理。

---

## 7. 窗口系统 LBWindow

### 7.1 窗口对象模型

每个窗口是 `LBWindow` 的实例，持有以下核心数据：

```javascript
LBWindow {
  id: "welcome",              // 窗口唯一 id
  layout: {...},              // normalizeLayout 后的排版对象
  pages: [...],               // 侧边栏页面数组
  pageId: "overview",         // 当前页面 id
  state: { x, y, w, h, opacity, title },  // 运行时状态
  maximized: false,
  minimized: false,
  prevState: null,            // 最大化前的状态
  dockChip: null,             // dock 上的按钮元素
  el: DOMElement,             // 窗口根 DOM
  bar / frame / body / navEl  // 关键子元素引用
}
```

### 7.2 normalizeLayout 规范化

`loadLayout` 读 JSON 后会调用 `normalizeLayout(raw, path)` 做规范化，确保所有字段有默认值：

| 规范化项 | 规则 |
|----------|------|
| `win.id` | 默认取顶层 `id` |
| `win.title` | 默认取 `win.id` |
| `win.icon` | 默认 `"◆"` |
| `win.x/y` | 默认居中（`(vw-w)/2`, `(vh-h)/2`） |
| `win.w/h` | 默认 720/520 |
| `win.minWidth/minHeight` | 默认 320/220 |
| `win.opacity` | 默认 0.94 |
| `win.sidebar` | 字符串数组 → 转成 `{id, label, icon}` 对象数组 |
| `win.startPage` | 默认第一个页面 id |
| `items` | 字符串 → `{label: it, html:'', htmlSrc:null}` |
| `items[*].html/htmlSrc` | 默认 `''` / `null` |
| `page.html/htmlSrc` | 默认 `''` / `null` |

规范化后的 layout 会被缓存到 `Kernel.layouts`（按 key、path、win.id 三个键各存一份），避免重复加载。

### 7.3 窗口状态与持久化

窗口状态（位置、尺寸、不透明度、标题）保存在 `window.state`，并通过 `save()` 写入 `localStorage`：

```javascript
save():
  localStorage['lb-win-' + id] = JSON.stringify({
    x, y, w, h, opacity, title
  })
```

下次打开同 id 窗口时，`restore()` 会从 localStorage 恢复状态：

```javascript
restore():
  saved = JSON.parse(localStorage['lb-win-' + id] || 'null')
  if (saved) Object.assign(state, saved)
```

**触发保存的时机**：拖拽结束、缩放结束、最大化切换、`set` 指令修改属性。

### 7.4 侧边栏页面 setPage

`setPage(itemId)` 切换当前页面：

1. 在 `pages` 数组中找到对应页面
2. 更新 `pageId`，调用 `highlightNav()` 高亮侧边栏
3. 合并 HTML：`page.html`（窗口级）+ `item.html`（页面级）
4. 调用 `renderFrame(html)` 把 HTML 写入 iframe

**窗口级 HTML 始终保留**：这是实现「右下角悬浮按钮在所有页面都可见」的关键。如果某个页面有自己的 `html`，它会被追加到窗口级 HTML 之后。

### 7.5 拖拽 / 缩放 / 最大化 / 最小化

| 操作 | 实现 |
|------|------|
| **拖拽** | 标题栏 `pointerdown` → `startDrag`，记录起始坐标，`pointermove` 更新 `state.x/y`，`clampPos` 限制范围，`pointerup` 时 `save()`。 |
| **缩放** | 8 个 `.lb-rz` 热区（n/s/e/w/ne/nw/se/sw），`startResize` 按 `data-dir` 计算新的 x/y/w/h，`minWidth/minHeight` 约束，结束时 `save()`。 |
| **最大化** | `toggleMax()`：保存 `prevState`，设 x=8/y=8/w=vw-16/h=vh-72，加 `lb-max` 类（圆角变小）。再次调用恢复。 |
| **最小化** | `minimize()`：加 `lb-hidden` 类（`display:none`），在 dock 添加 chip。`restore()` 还原并聚焦。 |

**clampPos 约束**：
- x 范围：`[-(w-180), vw-180]`（允许部分拖出，但至少留 180px 可见）
- y 范围：`[0, vh-54]`（标题栏始终可见）

### 7.6 属性浮窗

标题栏左侧的「属性」按钮打开属性浮窗（`.lb-pop-settings`），可实时调整：

- 标题文本
- X / Y / W / H
- 不透明度 / 圆角 / 模糊 / 边距

修改时通过 `oninput` 实时调用 `applyField`，失焦或回车时 `save()`。

**浮窗定位**：`placePop()` 检测标题栏上方空间，不足则向下弹出（加 `lb-down` 类）。

### 7.7 iframe 内容层

窗口内容通过 `<iframe class="lb-frame">` 承载，用 `srcdoc` 写入 `buildFrameDoc(html)` 生成的完整文档：

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" ...>
  <style>
    /* iframe 内的基础样式：body 透明、滚动条、选中色等 */
  </style>
</head>
<body>
  <!-- 排版文件中的 html 内容 -->
</body>
</html>
```

**iframe 的 sandbox 属性**：`allow-scripts allow-same-origin allow-forms allow-popups`。
- `allow-scripts`：允许窗口内 JS 执行
- `allow-same-origin`：允许 `parent.ODH` 跨 frame 访问（同源策略）
- 不含 `allow-top-navigation`：窗口内脚本不能跳转整个页面

**为什么用 iframe**：样式隔离。窗口内的 CSS 不会污染桌面，桌面的 CSS（毛玻璃等）也不会影响窗口内容。窗口背景透明，桌面壁纸/毛玻璃能透过显示。

---

## 8. 桌面 UI

桌面 UI 由 `index.html` 提供容器，`UI` 对象负责交互。所有元素在 `UI.bind()` 中绑定。

### 8.1 启动器与状态栏

左上角的圆形 logo 按钮，点击展开状态条：
- `ODH OriginalDeepsilenceHeart` 品牌名
- 状态栏（`lbStatus`）：显示版本、指令数、执行情况
- 「壁纸」按钮：打开壁纸设置浮窗
- 「日志」按钮：打开日志面板

点击桌面空白处自动收起启动器。

### 8.2 日志面板

点击「日志」按钮切换显示。所有 `Kernel.log()` 输出都追加到这里：

```
[HH:MM:SS] 指令集 commands.json 注册 11 条指令
[HH:MM:SS] 事件定义 events.json 注册 4 个事件
[HH:MM:SS] ▶ 事件 root · 2 条指令
[HH:MM:SS] 排版文件 layouts/welcome.json 已载入
...
```

**日志级别**（`kind` 参数）：
- `ok`（默认）：白色，正常信息
- `cmd`：灰色，指令执行
- `warn`：浅灰，警告
- `err`：红色，错误

最多保留 90 条，超出自动滚删；自动滚动到底部。

### 8.3 Dock

底部居中的圆角条。窗口最小化时在此添加一个 chip（图标+标题），点击 chip 还原窗口。窗口关闭时移除 chip。dock 为空时自动隐藏。

### 8.4 Toast 通知

顶部居中的轻提示。`Kernel.notify(text)` → `UI.toast(text, isError)`。

- 普通通知：2.6 秒后淡出
- 错误通知（`isError=true`）：4.2 秒，红点变红色

多条通知纵向堆叠，带入场/出场动画。

### 8.5 壁纸

`UI.applyWallpaper(url)` 把图片设为 `body.style.backgroundImage`，并加 `lb-wall` 类（加深四周暗角，保证文字可读）。

**壁纸来源**：
1. `localStorage['lb-wallpaper']` 保存的自定义壁纸
2. 没有则调用 `applyDefaultWallpaper()` 加载 Bing 每日壁纸
   - 从 `https://lightboxofficial.github.io/Bing-Wallpaper-Action/` 获取 JSON
   - 取 `images[0].urlbase` + `_1920x1080.jpg`
   - 失败则用内置渐变背景

**设置壁纸**：`setwall(url)` 会先预加载图片（`new Image()`），加载成功才应用并保存，失败则报错。`setwall()`（空参数）恢复默认。

---

## 9. 资源加载：Sources 与 mirror.js

### 9.1 Sources 对象

`Sources` 是统一的资源加载器，核心方法：

| 方法 | 说明 |
|------|------|
| `registerInline(map)` | 注册内联文件映射（即 `ODH_MIRROR`） |
| `json(path)` | 加载并解析 JSON。优先查 inline，否则 fetch |
| `tryText(path)` | 加载文本。优先 inline，否则 fetch |
| `inline(path)` | 查内联映射 |
| `http(path)` | fetch 真实文件 |
| `fetch(url, opts)` | 原生 fetch 封装 |

### 9.2 file:// 与 http(s) 的差异

| 协议 | 行为 |
|------|------|
| `http(s)://` | 直接 `fetch` 真实文件 |
| `file://` | 浏览器禁止 fetch 本地文件，**必须**用 `mirror.js` 内联的 `ODH_MIRROR` |

**判断方式**：`location.protocol === 'file:'`。

### 9.3 重新生成 mirror.js

每次修改 `layouts/` 或 `events/` 下的 JSON 后，都要重新生成 `mirror.js`，否则 `file://` 下看到的还是旧内容。

PowerShell 生成脚本：

```powershell
$kernel = '...\deepsilence\kernel'
$files = @('layouts/welcome.json','events/commands.json','events/events.json')
$map = [ordered]@{}
foreach ($f in $files) {
  $full = Join-Path $kernel $f
  $content = [System.IO.File]::ReadAllText($full, [System.Text.Encoding]::UTF8)
  $map[$f] = $content
}
$json = $map | ConvertTo-Json -Depth 4
$out = "/* ODH Kernel · 离线镜像 */`nwindow.ODH_MIRROR = $json;"
[System.IO.File]::WriteAllText((Join-Path $kernel 'mirror.js'), $out, (New-Object System.Text.UTF8Encoding $false))
```

**关键点**：
- 用 `[System.IO.File]::ReadAllText` 而不是 `Get-Content -Raw`，避免 PowerShell 给字符串附加 PSPath 等属性导致 `ConvertTo-Json` 输出膨胀。
- `ConvertTo-Json -Depth 4` 足够（map 的 value 是字符串）。
- 用 `UTF8Encoding $false` 写无 BOM 的 UTF-8。
- map 的 key 必须与引擎请求的路径完全一致（如 `events/commands.json`）。

---

## 10. 对外 API

引擎通过 IIFE 暴露三个全局对象：

### 10.1 window.ODH（= Kernel）

| 属性/方法 | 说明 |
|-----------|------|
| `ODH.version` | 版本号 |
| `ODH.instructions` | `Map`，已注册的指令 |
| `ODH.events` | 对象，已注册的事件 |
| `ODH.layouts` | `Map`，已加载的排版 |
| `ODH.windows` | `Map`，已打开的窗口 |
| `ODH.focused` | 当前聚焦的窗口 |
| `ODH.boot()` | 启动引擎（自动调用） |
| `ODH.runEvent(name)` | 执行事件，返回 `Promise<number>` |
| `ODH.exec(text)` | 执行指令文本，返回 `Promise` |
| `ODH.openWindow(ref, opts)` | 打开窗口 |
| `ODH.closeWindow(id)` | 关闭窗口 |
| `ODH.pickWindow(id)` | 获取窗口实例 |
| `ODH.setPage(id, page)` | 切换页面 |
| `ODH.setWindowProp(id, key, value)` | 设置窗口属性 |
| `ODH.notify(text)` | 弹 toast |
| `ODH.log(text, kind)` | 写日志 |
| `ODH.setWallpaper(url)` | 设壁纸 |
| `ODH.applyDefaultWallpaper(quiet)` | 恢复默认壁纸 |

### 10.2 window.ODHWindow（= LBWindow）

窗口类，可直接 `new ODHWindow(layout, opts)` 创建。

### 10.3 window.ODHPipeline

底层工具，供高级用途：

| 属性 | 说明 |
|------|------|
| `ODHPipeline.Sources` | 资源加载器 |
| `ODHPipeline.parseCommandText(text)` | 指令文本解析 |
| `ODHPipeline.buildFrameDoc(html)` | iframe 文档构造 |

---

## 11. CSS 变量与主题

所有视觉参数由 `:root` CSS 变量驱动，`set` 指令和属性浮窗通过修改变量实时生效：

| 变量 | 默认值 | 控制 |
|------|--------|------|
| `--lb-opacity` | 0.94 | 窗口不透明度 |
| `--lb-radius` | 16px | 窗口圆角 |
| `--lb-blur` | 20px | 毛玻璃模糊半径 |
| `--lb-pad` | 0px | 内容区内边距 |
| `--lb-line` | rgba(255,255,255,0.05) | 边框色 |
| `--lb-ink` | rgba(255,255,255,0.86) | 主文字色 |
| `--lb-dim` | rgba(255,255,255,0.45) | 次要文字色 |
| `--lb-glass` | rgba(10,10,14,0.92) | 窗口玻璃底色 |
| `--lb-glass-soft` | rgba(12,12,16,0.85) | 浮层玻璃底色 |
| `--lb-noise` | svg data-url | 噪点纹理 |
| `--lb-mono` | JetBrains Mono... | 等宽字体 |

**修改主题**：直接改 `engine.css` 的 `:root` 变量即可全局生效。窗口级修改通过 `set(welcome, opacity, 0.8)` 只影响单个窗口（变量设在窗口 DOM 上）。

---

## 12. 开发指南

### 12.1 添加新指令

**方式一：内置指令（推荐用于核心能力）**

1. 在 `engine.js` 的 `Kernel.builtins` 中添加实现：
```javascript
builtins: {
  // ...
  myCmd: function (a) {
    var target = a.target !== undefined ? a.target : a.__pos[0];
    Kernel.notify('执行 myCmd: ' + target);
  }
}
```

2. 在 `commands.json` 中登记：
```json
"myCmd": {
  "desc": "我的指令",
  "args": ["target"],
  "builtin": "myCmd"
}
```

**方式二：自定义指令（无需改 engine.js）**

直接在 `commands.json` 用 `run` 字段：
```json
"myCmd": {
  "desc": "我的指令",
  "args": ["target"],
  "run": "kernel.notify('执行 myCmd: ' + args.target)"
}
```

3. 重新生成 `mirror.js`。

### 12.2 添加新事件

在 `events.json` 的 `events` 对象中添加：

```json
"openSettings": [
  "window(settings)",
  "focus(settings)"
]
```

然后在 HTML 中调用：
```html
<button onclick="parent.ODH.runEvent('openSettings')">设置</button>
```

重新生成 `mirror.js`。

### 12.3 创建新窗口

1. 在 `layouts/` 下创建 `mywindow.json`：
```json
{
  "id": "mywindow",
  "name": "我的窗口",
  "win": {
    "id": "mywindow",
    "title": "我的窗口",
    "icon": "◆",
    "w": 600, "h": 400,
    "sidebar": [
      { "id": "main", "label": "主页", "icon": "◆" }
    ],
    "startPage": "main"
  },
  "page": {
    "html": "<style>.box{padding:20px;color:#fff}</style>"
  },
  "items": {
    "main": {
      "label": "主页",
      "html": "<div class='box'>Hello ODH</div>"
    }
  }
}
```

2. 在 `events.json` 或指令中引用：`window(mywindow)`
3. 重新生成 `mirror.js`。

### 12.4 从 HTML 调用引擎

窗口内 HTML 通过 `parent.ODH` 访问引擎：

```javascript
// 执行事件
parent.ODH.runEvent('openWelcome');

// 直接执行指令
parent.ODH.exec('notify("来自窗口的通知")');

// 打开窗口
parent.ODH.openWindow('settings').then(win => {
  console.log('窗口已打开', win.id);
});

// 关闭自己
parent.ODH.closeWindow('mywindow');

// 切换自己的页面
parent.ODH.setPage('mywindow', 'page2');
```

**注意**：`parent.ODH` 只在 iframe 内有效。如果窗口内容是通过 `htmlSrc` 加载的跨域 HTML，则无法访问 `parent.ODH`。

### 12.5 调试

1. 打开桌面「日志」面板，查看指令执行记录与错误。
2. 浏览器 Console 中直接调用 `ODH.runEvent('xxx')` 或 `ODH.exec('...')` 测试。
3. `file://` 下如果修改了 JSON 但没生效，检查是否重新生成了 `mirror.js`。
4. 窗口内脚本报错不会影响引擎主循环（iframe 隔离），但 `parent.ODH.runEvent` 的错误会在日志面板显示。

---

## 13. 常见问题与排错

**Q：双击 index.html 后桌面空白？**
A：检查「日志」面板。常见原因：
- `mirror.js` 未生成或过期 → 重新生成。
- `events.json` 没有 `root` 事件 → 添加 `root` 事件。
- `commands.json` 语法错误 → JSON.parse 失败，日志会报错。

**Q：窗口内按钮点击没反应？**
A：检查 `onclick` 写法：
- 必须用 `parent.ODH.runEvent('事件名')`，不能直接 `ODH.runEvent`（ODH 在父窗口）。
- 事件名必须在 `events.json` 中定义。
- 打开桌面日志面板看是否有「未定义的事件」错误。

**Q：`set` 指令修改属性不生效？**
A：确认 `key` 是支持的属性名：`x/y/w/h/opacity/radius/blur/padding/title`。其他 key 会被忽略。

**Q：窗口拖不回来？**
A：`clampPos` 允许窗口大部分拖出视口（只留 180px）。如果完全找不到，用 `focus(窗口id)` 指令召回，或在 dock 上点击还原。

**Q：壁纸不显示？**
A：Bing 每日壁纸需要网络。离线环境下 `applyDefaultWallpaper` 会失败并回退到内置渐变背景，日志会有「默认壁纸加载失败」警告。用 `setwall(本地图片路径)` 设置本地壁纸。

**Q：添加了新指令但提示「未定义的指令」？**
A：
1. 确认 `commands.json` 已更新且 JSON 语法正确。
2. 重新生成 `mirror.js`。
3. 刷新页面（`loadCommands` 只在 boot 时执行一次）。

**Q：如何让窗口内页面不共享窗口级 HTML？**
A：窗口级 `page.html` 是强制追加的。如果不需要共享，把 `page.html` 留空，内容全放 `items[*].html`。

**Q：`runEvent` 和 `exec` 的区别？**
A：
- `runEvent('name')`：执行 `events.json` 中预定义的事件，参数是事件名。
- `exec('指令文本')`：直接执行任意指令文本，参数是指令字符串。
- 事件是「已命名的指令序列」，exec 是「即时指令文本」。推荐用事件复用流程，用 exec 做临时调试。

---

## 附录：内置指令速查表

```
window(layout, x, y, w, h, opacity)   打开窗口
close(id)                              关闭窗口
minimize(id)                           最小化
maximize(id)                           最大化/还原
focus(id)                              聚焦窗口
page(id, page)                         切换页面
set(id, key, value)                    设置属性(x/y/w/h/opacity/radius/blur/padding/title)
notify(text)                           顶部通知
log(text)                              写日志
exec(text)                             执行指令文本
setwall(url)                           设置壁纸
```

---

*本文档与 `deepsilence/kernel/` 下的实现严格对应。如引擎有更新，请同步修订对应章节。*
