# DeepSilence 内核 · 指令手册

> 本网站前端由 DeepSilence 制作。所有界面对象均由内核在运行时创建，页面与脚本只负责内容。

## 目录结构

```
Lightboxofficial.github.io/
├─ DeepSilenceFile.txt        内核清单（声明脚本与页面）
└─ deepsilence/
   ├─ core.html               唯一入口，只含骨架
   ├─ core.css                引擎自带样式（所有对象样式都在这里）
   ├─ core.js                 引擎全部逻辑
   ├─ scripts/                可执行脚本（.txt）
   │  ├─ startup.txt          启动文件，页面打开后自动执行
   │  ├─ home.txt
   │  └─ demo.txt
   └─ pages/                  被窗口加载的 HTML
      ├─ home.html
      └─ about.html
```

**引擎的真正价值**：写 HTML 不用管样式，写 txt 不用管实现。`core.css` 里已经定义了窗口、标题栏、侧边栏、按钮、终端等全部对象的外观，你只需要在脚本里声明对象和内容。

## 打开方式

```
http://127.0.0.1:8788/deepsilence/core.html
```

进入后直接显示终端窗口，没有启动加载页。内核读取清单、预加载脚本后，会自动执行启动文件 `scripts/startup.txt`，无需手动触发。

## 启动文件 startup.txt

启动文件路径固定为 `scripts/startup.txt`。页面打开后引擎自动读取并执行它，想改开屏内容（背景、默认窗口、默认页面）直接改这个文件即可，不用碰清单，也不用在终端输入指令。

## 清单文件 DeepSilenceFile.txt

每行一条声明，`#` 开头为注释。

```
script <脚本名> <路径> <说明>
page   <页面名> <路径>
```

示例：

```
script startup scripts/startup.txt 启动文件，自动执行
script demo    scripts/demo.txt   多窗口与侧边栏完整测试
script home    scripts/home.txt   打开主页窗口
page   home    pages/home.html
page   about   pages/about.html
```

清单在启动时读取，脚本内容同时预加载进内存。启动文件 `startup` 由引擎自动执行，无需手动触发；其他脚本在终端输入脚本名即可运行。

## 背景指令

| 指令 | 说明 |
|---|---|
| `bg <图片URL>` | 直接把页面背景设为该图片 |
| `bg` | 查询当前背景 |
| `bginfo <JSON URL>` | 设置壁纸信息源，内核会取 `images[0].url` 作为背景 |

`bginfo` 适用于 Bing 每日壁纸这类接口。已内置的地址：

```
bginfo https://lightboxofficial.github.io/Bing-Wallpaper-Action/data/zh-CN_update.json
```

返回的 `url` 若以 `/` 开头，内核会自动补 `https://cn.bing.com` 前缀。

## 创建与销毁

```
new window <名字> k=v ...
del <名字>
```

`new window` 支持的初始化字段：

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `title` | 字符串 | 对象名 | 标题栏文字 |
| `icon` | SVG 文本 | 默认方块 | 标题栏图标，点击可开合侧边栏 |
| `x` `y` | 数字 | 居中 | 窗口左上角坐标 |
| `w` `h` | 数字 | 700 / 520 | 窗口宽高 |
| `visible` | 布尔 | false | 创建时是否立即显示 |
| `bg` | 字符串 | 引擎默认 | 窗口背景（CSS 值） |
| `blur` | 数字 | 20 | 毛玻璃模糊半径 |
| `radius` | 数字 | 12 | 圆角 |
| `opacity` | 数字 | 1 | 窗口不透明度 |
| `shadow` | 布尔 | true | 是否投影 |
| `movable` | 布尔 | true | 是否可拖动 |
| `resizable` | 布尔 | true | 是否可缩放 |
| `closable` | 布尔 | true | 是否显示关闭按钮 |
| `sidebar` | 布尔 | false | 是否启用侧边栏 |
| `sidebarWidth` | 数字 | 220 | 侧边栏宽度 |
| `src` | 字符串 | 空 | 初始加载的 HTML 路径 |
| `html` | 字符串 | 空 | 初始加载的 HTML 片段 |

对象名必须全局唯一，重复会报错。

## 属性赋值

语法：`<对象>.<属性> = <值>`

| 属性 | 类型 | 说明 |
|---|---|---|
| `title` | 字符串 | 标题文字，侧边栏头部同步 |
| `icon` | 字符串 | SVG 图标 |
| `x` `y` `w` `h` | 数字 | 位置与尺寸 |
| `z` | 数字 | 层级 |
| `visible` | 布尔 | 显示 / 隐藏 |
| `bg` | 字符串 | 窗口背景 |
| `blur` | 数字 | 毛玻璃强度 |
| `radius` | 数字 | 圆角 |
| `opacity` | 数字 | 不透明度 |
| `shadow` | 布尔 | 投影开关 |
| `movable` | 布尔 | 拖动开关 |
| `resizable` | 布尔 | 缩放开关 |
| `closable` | 布尔 | 关闭按钮开关 |
| `sidebar` | 布尔 | 侧边栏启用开关 |
| `sidebarWidth` | 数字 | 侧边栏宽度 |
| `src` | 字符串 | 赋值即加载页面 |
| `html` | 字符串 | 赋值即加载 HTML 片段 |

值可以是字符串、数字、`true` / `false`，或 `$变量名`。

```
main.title = "新标题"
main.w = 900
main.opacity = 0.9
main.src = "pages/about.html"
```

## 窗口方法

语法：`<对象>.<方法>(参数)`

| 方法 | 说明 |
|---|---|
| `open()` | 显示并置顶 |
| `close()` | 关闭 |
| `show()` | 同 `open()` |
| `hide()` | 隐藏 |
| `minimize()` | 最小化 |
| `maximize()` | 最大化 |
| `restore()` | 还原 |
| `focus()` | 置顶 |
| `load(路径)` | 加载 HTML 文件 |
| `html(片段)` | 加载 HTML 片段 |
| `reload()` | 重新加载当前内容 |
| `select(名字)` | 选中侧边栏条目并加载其页面 |
| `selectAt(下标)` | 按条目序号选中 |
| `next()` / `prev()` | 切换上一条 / 下一条 |
| `sidebar(on\|off\|toggle)` | 开合侧边栏 |

## 侧边栏方法

语法：`<对象>.menu.<方法>(参数)`

| 方法 | 说明 |
|---|---|
| `add(名,图标,页面)` | 末尾追加条目 |
| `insert(下标,名,图标,页面)` | 指定位置插入 |
| `before(参照,名,图标,页面)` | 插到某条目前面 |
| `after(参照,名,图标,页面)` | 插到某条目后面 |
| `remove(名)` | 删除条目 |
| `removeAt(下标)` | 按序号删除 |
| `clear()` | 清空全部条目 |
| `update(名,图标,页面)` | 更新条目 |
| `rename(旧,新)` | 重命名 |
| `move(名,下标)` | 移动到指定位置 |
| `swap(名A,名B)` | 交换两条目 |
| `sep(标题)` | 插入分组分隔线 |
| `batch(名:页,名:页)` | 批量追加 |
| `list()` | 打印条目列表 |
| `count()` | 条目数量 |
| `has(名)` | 是否存在 |
| `select(名)` | 选中并加载 |
| `selectAt(下标)` | 按序号选中 |
| `next()` / `prev()` | 切换条目 |
| `open()` / `close()` / `toggle()` | 开合侧边栏 |

说明：
- 条目名重复会报错；下标越界会报错。
- 删除当前选中项时，自动切换到相邻条目。
- `page` 字段若含 `<` 或 `>`，按 HTML 片段处理，否则按路径加载。
- 路径不含 `/` 时自动补 `pages/`，不含 `.html` 时自动补后缀。

## 切换窗口

```
go.<名字>
```

显示、置顶并聚焦指定窗口。

## 系统指令

| 指令 | 说明 |
|---|---|
| `help` | 显示指令总览 |
| `list` | 列出所有对象及其状态 |
| `ls` | 列出已加载的脚本与页面 |
| `source` | 打印清单文件原文 |
| `run <脚本>` | 运行脚本（等价于直接输入脚本名） |
| `clear` / `cls` | 清屏 |
| `echo <文本>` | 回显文本 |
| `set <键>=<值>` | 定义变量，用 `$键` 引用 |
| `strict <on\|off>` | 脚本遇错是否中断 |

## 脚本编写

`.txt` 脚本一行一条指令，`#` 或 `//` 开头为注释。

执行时终端会逐行回显，每条指令下方给出结果，最后统计成功与失败条数。

```
# 示例
new window main title="无闻云" w=820 h=540
main.sidebar = true
main.menu.add("首页", "<svg .../>", "pages/home.html")
main.menu.select("首页")
main.open()
go.main
```

默认容错：单行出错继续执行下一行。开启 `strict on` 后遇错立即中断。

## 加载 HTML 的融合机制

窗口加载页面时通过 `iframe srcdoc` 注入以下样式，保证页面与窗口毛玻璃背景浑然一体：

```css
html,body{background:transparent!important;margin:0;padding:0}
::-webkit-scrollbar{width:0;height:0}
```

因此页面文件本身**不需要**写背景色，也不需要处理滚动条，直接写内容即可。

## 当前测试脚本

| 脚本 | 内容 |
|---|---|
| `startup` | 启动文件，页面打开后自动执行：设置 Bing 壁纸信息源，然后打开主页窗口 |
| `home` | 打开单个带侧边栏的主页窗口 |
| `demo` | 创建三个窗口，演示侧边栏全部增删改移操作 |

`startup` 由引擎自动执行，无需手动输入。想测试更多窗口，在终端输入：

```
demo
```