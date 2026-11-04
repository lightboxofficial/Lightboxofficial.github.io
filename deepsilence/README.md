# DeepSilence 引擎核心（deepsilence）

本目录是 DeepSilence 网站引擎的内核入口。目前只实现了第一阶段能力：**把指令文件 `DeepSilenceFile.txt` 静默缓存到浏览器本地**，为后续的指令集 / 模拟文件系统打底。

## 目录结构

| 文件 | 说明 |
| --- | --- |
| `core.html` | 内核页面，内含缓存模块（`window.DeepSilenceFS`） |
| `core.css` | 内核样式，暂为空 |
| `../DeepSilenceFile.txt` | 指令集数据源（当前为空文件，待指令集落地后填充） |

## 数据源

```
SOURCE = '../DeepSilenceFile.txt'
```

`DeepSilenceFile.txt` 是引擎唯一的持久化数据源。将来指令集解析、虚拟文件系统的读写都以它为准。

## 缓存机制

### 存储位置与结构

缓存写在 `localStorage`，键名：

```
deepsilence.fs.v1:../DeepSilenceFile.txt
```

值是一个 JSON 记录，而不是裸文本：

```json
{
  "url": "https://example.com/DeepSilenceFile.txt",
  "text": "文件全部内容",
  "bytes": 1234,
  "savedAt": "2026-11-01T08:00:00.000Z"
}
```

保留 `url / bytes / savedAt` 是为了后续做版本校验、容量统计与调试，也方便指令集在写回时保留元信息。

### 下载时机

为了不打断页面体验，下载被拆成两步：

1. **预取（warm）**：往 `head` 挂一个 `rel="prefetch"` 的 `<link>`，让浏览器在空闲时段静默拉取一次。
2. **落库（ensure）**：在 `load` 事件之后通过 `requestIdleCallback` 执行（不支持该 API 时降级为 `setTimeout(fn, 1200)`）。

整个过程没有进度条、没有 iframe、不阻塞渲染，用户无感知。

### 去重策略

- **命中即跳过**：`ensure()` 先读本地记录，存在则直接返回，**不会发起任何网络请求**。
- **并发去重**：内部维护 `pending` Promise，同一时刻最多只有一次 `fetch` 在飞，多次调用共享同一个结果。
- **预取同样判断**：`warm()` 在已缓存的情况下直接 return，不会重复挂 `<link>`。

### 容错处理

| 场景 | 行为 |
| --- | --- |
| `file://` 协议打开（本地双击） | 跳过网络请求，直接返回 `null`，避免 CORS 报错 |
| `fetch` 返回非 2xx | 抛错后被 catch，返回 `null`，不污染控制台 |
| `localStorage` 写入失败（配额超限等） | 返回 `null`，静默降级 |
| 本地记录 JSON 损坏 | 视为未缓存，走重新下载 |

## API

全局对象 `window.DeepSilenceFS`：

| 方法 | 签名 | 说明 |
| --- | --- | --- |
| `isCached()` | `→ boolean` | 同步判断是否已缓存，**不触发网络** |
| `ensure()` | `→ Promise<record \| null>` | 有缓存返回缓存，无缓存才下载 |
| `read()` | `→ string \| null` | 同步读取本地文本，未缓存返回 `null` |
| `write(text)` | `→ record \| null` | 覆盖本地文本，供指令集修改文件内容 |
| `remove()` | `→ void` | 清除缓存 |
| `meta()` | `→ {url, bytes, savedAt} \| null` | 读取元信息 |
| `warm()` | `→ void` | 手动触发预取（已缓存则空转） |

### 使用示例

```js
// 等待本地文件就绪（不会重复下载）
const rec = await DeepSilenceFS.ensure();
const text = rec ? rec.text : '';

// 指令集执行完毕后写回
DeepSilenceFS.write(newContent);

// 排查缓存状态
console.log(DeepSilenceFS.isCached(), DeepSilenceFS.meta());

// 清空缓存，下次访问重新拉取
DeepSilenceFS.remove();
```

## 注意事项

1. **空文件也会被判定为"已缓存"**。`DeepSilenceFile.txt` 目前为空，`fetch` 得到 `""`，类型仍是字符串，因此会正常落库。等指令集写入真实内容后，浏览器里的旧空记录会挡住新内容，需要调用一次 `DeepSilenceFS.remove()`，或把键名中的 `v1` 升级为 `v2` 强制失效。
2. **容量限制**。`localStorage` 通常只有 5MB 左右。指令集文件若持续膨胀，需要迁移到 `IndexedDB`（`write` / `read` 的调用方无需改动，只换内部实现）。
3. **`file://` 下不缓存**。本地直接打开 `core.html` 时只会走空分支，缓存逻辑必须通过 HTTP(S) 访问（如 `python -m http.server`、GitHub Pages）才能生效。
4. **缓存不自动更新**。当前策略是"一次写入，长期复用"，没有 TTL 和版本比对。若源文件会频繁变更，需要在 `ensure()` 中加入基于 `ETag` / `Last-Modified` 的校验。

## 后续规划

- 指令集解析器：把 `DeepSilenceFile.txt` 的内容解析为可执行的指令序列。
- 模拟文件系统：以 `DeepSilenceFile.txt` 为持久化后端，`read()` / `write()` 作为底层读写接口。
- 引擎外壳：`core.html` 承载渲染层，`core.css` 承载样式。