# postMessage-catcher 架构升级调研

> 基线：v2.0.0（483 LOC，4 个 JS 文件）
> 调研时间：2026-11-15
> 结论状态：待决策（见 §9）

---

## 0. TL;DR

1. **现状不是"缺个 UI"，是捕获层本身有结构性缺陷。** `document_idle` 才注入、没有 `all_frames`、靠 `<script src=web_accessible_resource>` 注入页面、只 patch 同源 iframe 的 `postMessage`。结果是：页面加载期的消息、子帧里的消息、`srcdoc`/`about:blank`/`sandbox` 帧、严格 CSP 站点，全都抓不到或部分抓不到。
2. **体验差距已经很明显。** 我们现在 2.0k 用户 / 4.0 分 / 2025-04 之后未更新（chrome-stats 估算）；2026-11 出现的 PostMessage Inspector 已经有 DevTools 面板、全帧注入、Handlers 归因、噪声规则、可配置截断、导出脱敏。纯 `console.log` 方案已经没有竞争力。
3. **一个决定架构的实测结论：不能拦发送侧。** 在 `window.postMessage` 上包一层会让接收方看到的 `event.source` 变成"接收方自己"，从而破坏页面里所有同源 iframe 的发送方校验。我用 headless Chrome 做了对照实验（§3.1 有原始输出）。→ 架构必须是**全帧接收侧观察**，不能是"hook postMessage"。
4. **建议目标架构**：`MAIN world` 全帧接收侧探针 → `ISOLATED world` 桥 → `service worker` 作为无状态路由/环形缓冲 → **DevTools 面板**（主界面）+ 极简 popup（开关/入口）。差异化优先做**拓扑/协议地图**与**Handlers + Origin 校验审计**（已确认方向，§6）。技术栈对齐 `niexia/customize-tab-icon`：WXT + React 19 + TS + Tailwind 4 + shadcn，pnpm + Vitest + 同一套 `AGENTS.md`/`docs`/`store` 约定（§7）。
5. **一个工程约束**：正式版 Chrome 137+ 已移除 `--load-extension`（我本机 Chrome 157 实测加载失败），E2E 必须用 Chrome for Testing / Playwright 自带 Chromium（§3.3）。这直接影响测试方案。

---

## 1. 现状体检

### 1.1 捕获能力

| #   | 问题                                                      | 证据                                                                                                   | 影响                                                                                                                                    | 严重度 |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| A1  | 注入时机 `document_idle`                                  | `manifest.json` `run_at`                                                                               | 页面加载期（OAuth 回调、SDK 握手、iframe 初始化）的消息全部丢失；而这类消息恰恰是最难复现的                                             | 高     |
| A2  | 没有 `all_frames`                                         | `manifest.json`                                                                                        | 子帧收到的消息完全不可见；子帧**发出**的消息只能靠父帧"碰巧收到"才看得到                                                                | 高     |
| A3  | 无 `match_about_blank` / `match_origin_as_fallback`       | `manifest.json`                                                                                        | `srcdoc`、`about:blank`、`data:`、`blob:`、`sandbox` 帧不注入。现代微前端/SDK 大量使用 `srcdoc`                                         | 高     |
| A4  | 用 `<script src=chrome-extension://…>` 注入页面           | `content-script.js:35-47` + `web_accessible_resources`                                                 | `script-src` 严格（无 `chrome-extension:`）的站点会直接拦截，发送侧功能在这些站点上**整体失效**；同时该资源对全站可加载、可被页面指纹化 | 高     |
| A5  | 只 patch `iframe.contentWindow.postMessage`               | `injected-script.js:30-56`                                                                             | 只能覆盖"父→同源子"这一个方向；跨源子帧赋值直接抛异常被 `catch` 吞掉；顶层页面自己的发送完全没抓                                        | 高     |
| A6  | `MutationObserver` + 300ms 节流                           | `injected-script.js:2-25, 82-92`                                                                       | 新建 iframe 后立即发送的首条消息必然错过（这是最常见的模式）                                                                            | 中     |
| A7  | 完全不覆盖 `MessagePort` / `BroadcastChannel` / `Worker`  | 无相关代码                                                                                             | 现代应用越来越多用 `MessageChannel` 代替 `window.postMessage`                                                                           | 中     |
| A8  | 接收侧对 `null` data 误判                                 | `content-script.js:10` `const { type } = event.data` 解构抛错 → 走 catch，输出"source is cross-origin" | 错误归因，误导排查                                                                                                                      | 低     |
| A9  | 页面自己发 `type: 'postMessage-catcher'` 的消息被静默过滤 | `content-script.js:12`                                                                                 | 抓不全                                                                                                                                  | 低     |

### 1.2 交互与工程

| #   | 问题                                                | 证据                                                                     | 影响                                                                                                          |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| B1  | 只有 `console.log`                                  | `content-script.js:15-29`、`injected-script.js:46-50`                    | 无列表、无详情、无过滤、无历史、无导出；控制台被刷屏，与页面日志混在一起（`img/screenshot.png` 就是典型现场） |
| B2  | popup 开关对**当前窗口所有 tab** 广播               | `popup.js:73-89` `chrome.tabs.query({currentWindow:true})` + `forEach`   | 关一个 tab 等于关全部；不存在"只录这个 tab"的概念                                                             |
| B3  | 开关状态全局 + 无每 tab 状态                        | `storage.sync`                                                           | 面板/徽标无法表达"这个 tab 正在录吗"                                                                          |
| B4  | 图标映射 32↔48 写反                                 | `manifest.json` `"32": "img/icon-48.png"`、`"48": "img/icon-32.png"`     | 商店/工具栏图标模糊                                                                                           |
| B5  | `js/background.js` 是 0 字节却声明为 service worker | `manifest.json`                                                          | 无路由/无缓冲的浪费；以后必须变成真正的 router                                                                |
| B6  | 无 `background.type: module`、无构建、无测试、无 CI | 仓库根目录                                                               | 改不动、不敢改                                                                                                |
| B7  | `assets/postMessage-catcher.zip` 1.6MB 提交进 git   | `unzip -l` 显示含 `.git/`、`__MACOSX/`、顶层 `postMessage-catcher/` 目录 | Web Store 要求 `manifest.json` 在 zip 根；包陈旧（2022）且泄露仓库结构                                        |
| B8  | `__openLogPostMessage()` 被调用两次                 | `injected-script.js:79` 与 `:107`                                        | 第一个 `MutationObserver` 泄漏（未 disconnect）                                                               |

**结论：** 应当把"抓取引擎"当作一个全新模块重写，而不是在现有 124 行 content script 上叠加 UI。UI 只是重写后的自然产物。

---

## 2. 竞品与先例

（数据来自 chrome-stats 与各项目 README，2026-11 前后）

| 工具                                                    | 拦截方式                                                                             | UI                                                                                   | 关键短板                                                                 |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| **opnsec/postMessage-logger** 105★                      | MV2，`document_start` + `all_frames`，只听 `message`                                 | 仅控制台                                                                             | 只收不发、无历史/过滤，2020 年后停更                                     |
| **fransr/postMessage-tracker** 1.3k★                    | page-world 注入，包装 `addEventListener`/`onmessage`/`MessagePort.addEventListener`  | 控制台 + 徽标计数                                                                    | MV2、Listener 视角、无 payload 面板                                      |
| **FancyTracker** 132★                                   | fransr 的 MV3 重写                                                                   | 独立 UI：高亮、去重、正则过滤、JSON 导入导出                                         | 仍是 Listener 视角，作者自述粗糙                                         |
| **Postmaster** 76 用户                                  | DevTools 面板                                                                        | 正则过滤/搜索/排序/美化/暂停                                                         | 用户极少，无 handler 归因                                                |
| **postMessageObserver** 923 用户                        | Side panel                                                                           | payload/source/target                                                                | 无过滤/导出，2023 停更                                                   |
| **PostMessage Inspector** 416 用户，v0.6.1 (2026-11-08) | `MAIN world` + `document_start` + `all_frames` + `match_about_blank`，**只做接收侧** | DevTools 面板：列表 + Payload/Handlers、帧深度、搜索、噪声规则、暂停、JSON 导出+脱敏 | 只收不发（拿不到 `targetOrigin`）、无回放、无 Port/BC/Worker、无拓扑视图 |
| **postMessage-catcher**（我们）2.0k 用户                | `document_idle`，父帧 patch 同源 iframe                                              | 控制台 + popup 开关                                                                  | 见 §1                                                                    |
| **原生 DevTools**                                       | 无                                                                                   | Network 面板（WebSocket frames 有 "Messages"）                                       | 对 postMessage 完全没有面板                                              |

### 需要达到/超过的基线（PostMessage Inspector 做到的 7 件事）

1. DevTools 面板 + 列表/详情双栏
2. 全帧 + MAIN world + `document_start`
3. Handlers 归因（谁处理了这条消息，源码位置可点进 Sources）
4. 噪声规则（React/Redux/Vue devtools、HMR、MetaMask、reCAPTCHA…）
5. 截断限制可在面板里配置（它踩过的坑：早期在捕获期截断 2000 字符，导致导出也是残缺的）
6. SW 环形缓冲（5,000 条/tab），面板可以"事后打开"仍看到前因
7. 导出 JSON 并脱敏

### 系统性空白（我们的机会）

| 空白                                        | 说明                                                          |
| ------------------------------------------- | ------------------------------------------------------------- |
| **发送侧 `targetOrigin` 审计**              | 所有工具都拿不到。原因见 §3.1——不是懒，是技术上会破坏页面     |
| **MessagePort / BroadcastChannel / Worker** | 只有 fransr 碰了 `MessagePort`，没有一个做全                  |
| **回放 / 改写重发**                         | 调研范围内**没有任何工具**提供                                |
| **拓扑 / 会话视图**                         | 全部是扁平日志；postMessage 本质是"帧 ↔ 帧"的图，不是请求列表 |
| **协议地图**                                | 按 `type`/`action` 聚合、统计、给出"这个协议长什么样"         |
| **Origin 校验缺失的自动标记**               | PostMessage Inspector 只做到 roadmap                          |
| **中文界面/文档**                           | 无                                                            |

---

## 3. 决定架构的关键约束

### 3.1 ⚠️ 发送侧拦截不可行（实测）

设想：在 `MAIN world` 里包一层 `window.postMessage`，记录 `(message, targetOrigin)` 再调用原生。看起来最直接，但会改变 `event.source`。

**原因**：`postMessage` 的 `source` 取"当前执行脚本所属的 realm"（incumbent realm）。包装函数是在**接收方**的 realm 里创建的；当子帧调用 `parent.postMessage(...)` 时，实际执行的是父帧里那个 wrapper，于是浏览器认为调用者是父帧自己。

**实测**（headless Chrome 157，同源 `srcdoc` 子帧向父帧发送，两种配置各跑一次）：

```
wrap=false  RESULT[wrap=false sourceIsParentSelf=false sourceIsChild=true]
wrap=true   RESULT[wrap=true  sourceIsParentSelf=true  sourceIsChild=false]
```

`wrap=true` 时父帧收到的消息 `event.source === window`，页面里任何 `if (event.source === iframe.contentWindow)` 的校验都会失效。**这是会改坏别人线上代码的那类 bug。**

顺带验证的两件事（都通过）：

- `window.postMessage` 是 window 的**自有属性**（`Object.getOwnPropertyDescriptor(window,'postMessage')` → `writable:true, configurable:true`），`Window.prototype.postMessage` 是 `undefined`——所以网上常见的 `Window.prototype.postMessage = …` 写法**一行都不会执行**（PostMessage Inspector 作者自述踩了这个坑 7 个月）。
- 跨源发送方仍可归因：不同端口（跨源）子帧发消息给父帧时，`event.origin` 准确，且 `event.source === iframe.contentWindow` 为 `true`——`WindowProxy` 身份比较跨源也成立。

**推论（架构级）：**

- 只做**接收侧**。每条消息最终都会在某个 window 触发 `message` 事件；只要每一帧都装了探针，就能看到全部**送达**的消息。
- 代价：拿不到 `targetOrigin`，也看不到"因为 targetOrigin 不匹配而被丢弃"的发送。这一点必须写进文档，不要假装能看到。
- `chrome.debugger` + CDP 理论上可以无侵入观测，但它与 DevTools 面板**互斥**（一个 tab 只能挂一个 debugger，打开 DevTools 会 detach），所以不能作为面板方案的基础。可作为"实验性严格模式"另议，不作为主线。

### 3.2 MAIN world 是唯一可靠入口

| 需求                            | 方案                                                  | 结论                                                                                                                                                 |
| ------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 在页面脚本之前拿到控制权        | `content_scripts.run_at: "document_start"`            | 官方语义：CSS 之后、任何 DOM 构建与页面脚本之前                                                                                                      |
| 能看到页面自己的 `window` 对象  | `"world": "MAIN"`（Chrome 111+）                      | 必须；`ISOLATED` 看不到页面对象                                                                                                                      |
| 覆盖所有帧                      | `all_frames: true` + `match_origin_as_fallback: true` | 后者覆盖 `about:blank`/`srcdoc`/`data:`/`blob:`；仅 `all_frames` 不够，因为每个帧独立匹配 URL                                                        |
| 不被页面 CSP 的 `script-src` 拦 | MAIN world 由浏览器直接注入，不经过 `<script>` 标签   | 比现在的 WAR 注入稳；注意 MAIN world **仍受页面 CSP 约束**（如 `eval`），所以探针代码里不要用 `eval`/`new Function`                                  |
| 把数据传回扩展                  | MAIN world 没有 `chrome.*`                            | 用 `document.dispatchEvent(new CustomEvent(name,{detail: JSON字符串}))`，`ISOLATED` world 监听后转发。detail 用**字符串**，避免跨 world 对象克隆问题 |

### 3.3 测试环境的硬约束（实测踩到）

正式版 Chrome 137+ 已移除 `--load-extension`（Chromium extensions 公告；[StackOverflow 佐证](https://stackoverflow.com/questions/79652912)）。我本机 Chrome **157** 实测：`--load-extension --disable-extensions-except` 加载测试扩展，页面里完全看不到注入（`patchedAtFirstScript=false`）。

→ E2E 必须用 **Playwright 自带 Chromium / Chrome for Testing**（`launchPersistentContext`），不能用系统 Chrome。这条要写进 CONTRIBUTING，否则每个新贡献者都会先浪费半天。

### 3.4 序列化

- `window.postMessage` 本身走 structured clone：函数、DOM 节点、带方法的对象**不能被克隆**（`DataCloneError`）；循环引用、`Map`/`Set`/`Date`/`RegExp`/`TypedArray` 可以。
- **绝不传 `transfer`**：会把页面自己的 `ArrayBuffer` detach 掉，直接改坏页面。
- **绝不对页面数据直接 `JSON.stringify`**：循环引用和 `BigInt` 会抛错（`TypeError`）。
- 正确做法：在 MAIN world 里做**有预算的快照**（深度、键数、数组长度、字符串长度、总节点数），把 `Map`/`Set`/`Error`/`ArrayBuffer`/`MessagePort`/循环引用/超深/超长都转成带标记的 JSON-safe 结构（例如 `{"$t":"ArrayBuffer","bytes":1024}`）。
- 关键教训（对手踩过的）：**不要在捕获期硬截断**。一旦在页面里截断，面板、导出、复制拿到的都是残缺数据。正确做法是"捕获期只做保命上限（如 1MB），面板里再按需截断，且导出用全量"。

### 3.5 状态与生命周期

| 事实                                                                | 影响                                                                |
| ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| MV3 SW 空闲 30s 被回收，全局变量丢失                                | 不能把消息只放内存；面板断开重连要能拿到快照                        |
| 长连接端口能续命（Chrome 114+）                                     | 面板打开期间用 `chrome.runtime.connect` 保活 + 实时推送             |
| `chrome.storage.session` 内存态、10MB、默认不对 content script 开放 | 适合放"最近 1-2k 条/tab"的落盘快照；不适合每条一次 `set`（写放大）  |
| `sender.tab / frameId / documentId / documentLifecycle` 可用        | 每条消息由 SW 打上来源标签，`documentId` 可以把"哪一次页面加载"分组 |

**推荐缓冲策略**：SW 内存环形缓冲（如 5,000 条/tab）作为"事后打开面板"的回放窗口 + 每 500ms 或每 200 条批量落 `storage.session`（保留最近 1,000 条元数据、payload 截到 32KB）。规模再大再上 IndexedDB；MVP 不必。

### 3.6 权限

- manifest 里声明的 `content_scripts` **不需要** `host_permissions`（官方明确豁免），所以"读取所有网站"的权限提示不会被放大。
- 需要：`storage`；`devtools_page`（不是权限，是 manifest 字段）；如果做 side panel 才加 `sidePanel`。
- **不要**加 `debugger`（商店审核慢 + 红条 + 与 DevTools 冲突）、**不要**加 `tabs`（面板里用不了 `chrome.tabs`，而且会多一条隐私提示）、**不要**加 `webNavigation`。
- 删掉 `web_accessible_resources`（改用 MAIN world 后不再需要，同时去掉指纹面）。

### 3.7 面板自身的安全

面板展示的是**页面可控数据**，而面板本身是有 `chrome.*` 权限的扩展页面。因此：

- 一律用 `textContent` / `createTextNode` 渲染，**禁止 `innerHTML`**；
- 不做任何 `eval` / `new Function`（包括"美化 JSON"）；
- 导出的 JSON 要能脱敏（`token`/`password`/`authorization`/`cookie` 等键名）；
- 声明"数据只在本机、不上传"，商店隐私表单照实填。

---

## 4. 目标架构

```
┌─ 页面（每个 frame，document_start） ───────────────────────────┐
│  MAIN world  probe.js                                          │
│    · window 'message' 捕获阶段监听（先于页面注册）             │
│    · addEventListener/onmessage 记账（可选，见 §6.3）          │
│    · 有预算快照 → JSON-safe                                   │
│    · document.dispatchEvent(CustomEvent('pmc:cap', {detail}))  │
│  ISOLATED world  bridge.js                                     │
│    · 校验/去重、补 frame 元信息                                │
│    · 批量通过 chrome.runtime.connect 长连接发给 SW              │
└────────────────────────────────────────────────────────────────┘
                    │ port（批量，16-50ms 合并）
                    ▼
┌─ Service worker  router.js ────────────────────────────────────┐
│  · 按 sender.tab/frameId/documentId 打标                        │
│  · 每 tab 环形缓冲 5,000 条（事后打开面板可回溯）               │
│  · 批量落 storage.session（最近 1,000 条元数据）                │
│  · 广播给所有已连接的 UI 端口；维护徽标计数                     │
└────────────────────────────────────────────────────────────────┘
                    │ port（快照 + 增量）
                    ▼
┌─ UI ───────────────────────────────────────────────────────────┐
│  DevTools 面板（主）  Messages / Protocol / Frames             │
│  popup（极简）        开关、本 tab 计数、"打开面板"             │
└────────────────────────────────────────────────────────────────┘
```

### 4.1 目录结构

```
entrypoints/
  probe.content.ts          # MAIN world，document_start，全帧
  bridge.content.ts         # ISOLATED world，document_start，全帧
  background.ts             # SW（type: module）
  devtools/index.html       # chrome.devtools.panels.create → panel
  panel/index.html          # DevTools 面板页（React + Tailwind）
  popup/index.html          # 开关/计数/入口
lib/
  protocol.ts               # 消息与字段契约（单一来源）
  snapshot.ts               # JSON-safe 快照（探针与面板共用语义）
  frames.ts                 # 帧拓扑/方向归因
  audit.ts                  # handler 记账与 origin 校验评分
  storage.ts                # 环形缓冲、设置项
components/                 # 面板与 popup 的 React 组件
docs/  store/  .agents/skills/
.output/                    # WXT 产物（chrome-mv3），gitignore
```

### 4.2 数据模型（草案）

```jsonc
{
  "v": 1,
  "id": "018f…", // 单调递增 + 随机，用于面板去重/定位
  "ts": 1763200000123.45, // performance.timeOrigin 对齐后的绝对时间
  "tabId": 12,
  "documentId": "…", // 同一次页面加载
  "receiver": {
    // 由 SW 从 sender 打标，准确
    "frameId": 3,
    "url": "https://shop.example/checkout",
    "origin": "https://shop.example",
  },
  "sender": {
    // 接收侧推断，见 §4.3
    "kind": "parent", // self | parent | child | other | unknown
    "origin": "https://pay.example", // event.origin，准确
    "url": "https://pay.example/card", // 可读时为 frame.src / source.location.href
  },
  "data": { "$t": "Object", "…": "…" }, // JSON-safe 快照
  "size": 812, // 原始字节估计
  "truncated": { "strings": 2, "nodes": 0 }, // 截断提示，供 UI 显示"部分内容被省略"
  "handlers": [
    // 可选，§6.3
    { "count": 2, "originChecked": true, "stack": ["app.js:120:5"] },
  ],
}
```

### 4.3 发送方归因（能做到什么程度）

接收侧只知道 `event.source`（WindowProxy）和 `event.origin`。做法：

- `event.source === window` → `self`
- `event.source === window.parent` → `parent`
- `event.source === window.top` → `top`
- 与 `document.querySelectorAll('iframe')` 的 `contentWindow` 逐个比较 → `child`，并能拿到 `iframe.src`（跨源也可读）
- 都不匹配 → `other`（sibling / opener）

跨源身份比较实测可行（§3.1）。做不到的：准确拿到发送方的 `frameId`（子帧自己是知道的，但接收方无法跨源查询）。**诚实地显示 origin + 位置关系，不要伪造精度。** 若将来需要精确拓扑，可让 SW 用 `webNavigation.getAllFrames` 补全——那要加权限，暂不做。

### 4.4 开关模型（替换现在的"全局一把闸"）

三层，语义清晰：

1. **扩展总开关**（`storage.sync`）：关闭 = 探针不安装，零开销。
2. **每 tab 录制状态**（`storage.session`）：popup 切换只影响当前 tab，徽标显示该 tab 计数。
3. **面板内暂停**：只冻结视图，采集继续（对手也这么做；这样"暂停时发生的 bug"不会丢）。

---

## 5. 体验设计

### 5.1 信息架构

- **Messages（默认）**：虚拟列表 + 详情面板。
- **Protocol**：按消息类型聚合（推断 `type`/`action`/`event`/`method` 字段），显示频次、来源/目标帧、样例、最近时间。
- **Frames**：帧树 + 边，点击边过滤消息（差异化，见 §6.1）。
- 顶部：录制状态、暂停、清空、Preserve log、搜索、过滤 chips、导出。

### 5.2 列表

| 列       | 内容                                                                    |
| -------- | ----------------------------------------------------------------------- |
| #        | 序号（单调，跨导航用分隔线隔开）                                        |
| Time     | `HH:mm:ss.SSS`，相对时间可选                                            |
| ⇄        | 方向：发送 origin → 接收 origin，附带帧层级小图标                       |
| Type     | 推断出的消息类型（`$t` 或 `type` 字段）                                 |
| Size     | 字节数，>32KB 标黄                                                      |
| ⚠        | 告警：`origin` 为 `"null"`、handler 未校验 origin、payload 里有疑似密钥 |
| Handlers | 处理该消息的监听器数量                                                  |

- 相同 payload 连续重复 → 折叠成一行 `×N`，可展开。
- 噪声规则命中的行**变灰而不是删除**（保留上下文，对手的细节做得对）。
- 固定 5,000 行上限 + 虚拟滚动（不引框架，手写 windowing）。

### 5.3 详情

Tab：**Overview / Payload / Handlers / Raw**

- Overview：时间、发送/接收帧与 origin、帧层级、大小、`documentId`、是否同源。
- Payload：树形，懒展开；`ArrayBuffer` 显示十六进制预览 + 字节数；循环引用显示 `↩ 引用 #id`；超长字符串"显示全部"按钮（数据在内存里是全量）。
- Handlers：监听器列表 + 注册栈，点击用 `chrome.devtools.panels.openResource(url, line-1, col-1)` 跳到 Sources（注意 0-based，对手踩过）。
- Raw：完整 JSON，可复制。
- 底部：`复制 JSON` / `复制为代码片段`（`parent.postMessage(payload, origin)`）/ `导出选中` / `回放`（§6.4）。

### 5.4 交互细节

- `Cmd/Ctrl+F` 聚焦搜索；`↑/↓` 移动；`Esc` 清空搜索。
- 搜索支持字段限定：`origin:pay.example`、`type:ready`、`size:>10kb`、`-origin:devtools`。
- 右键菜单：隐藏此类消息 / 复制 / 在此消息前后过滤 / 导出。
- 空状态要教人做事：「还没有消息。在页面里操作一下，或在 DevTools 里打开 Preserve log 后刷新页面。」
- 首次安装的 popup 给一条引导："打开 DevTools → PostMessage 面板"。
- 主题跟随 DevTools（`chrome.devtools.panels.themeName` → `data-theme`，不要跟系统主题，两者可能不一致）；行高/字号与 Network 面板对齐；列宽可拖拽并持久化。
- 键盘可达 + 焦点可见 + `aria-live` 通告新消息数量（a11y）。
- i18n：`_locales/{en,zh_CN}`，面板文案走 `chrome.i18n`；语言跟随浏览器。

### 5.5 popup 的定位

不承载列表。只做：本 tab 录制开关、计数、当前页帧数、"打开 DevTools 面板"提示、GitHub 链接。保持 240px 宽。

---

## 6. 差异化（对手都没有的事）

### 6.1 拓扑 / 帧视图

把页面画成帧树，边表示消息流向，边上标消息数。点边 = 过滤。这对"微前端、支付、广告 iframe"场景极直观——这些正是 postMessage 的主战场（对手作者自己就是在赌场项目里被 10 个第三方 iframe 逼出来的）。

### 6.2 协议地图

聚合出"这个页面的消息协议"：有哪些类型、谁发谁、多频繁、样例 payload、字段结构。可以进一步做"字段推断"（这个 type 的 payload 稳定字段集）。这是比列表更高一层的抽象，也是新人接手老项目时最想要的。

### 6.3 Handlers + Origin 校验审计

包装 `addEventListener`/`removeEventListener`/`onmessage` setter 做**记账**（不改变派发语义，native 一定被 `Reflect.apply` 调用）：

- 消息到达时列出"当下这个 window 上有哪些 `message` 监听器、各自注册在哪"。
- 用 `Function.prototype.toString()` + 启发式判断 handler 源码里有没有读 `event.origin`；配合运行时：如果 handler 执行时从未读 `origin`，标记"未校验来源"。
- 输出一个"风险评分"和修复建议（检查 `origin` 白名单、不要用 `includes`/`startsWith` 做校验、不要信任 `"null"` origin）。
- **风险**：这是全项目唯一"修改页面行为"的部分（虽然只记账）。必须：开关可关、先取原生引用、`once`/`signal`/重复注册语义对齐、异常绝不影响页面。建议放在 P2，不要和 P0 一起上。

### 6.4 回放

把选中的消息重新发一次（可编辑 payload），通过 `chrome.devtools.inspectedWindow.eval` 在目标帧上下文执行（`frameURL` 定位）。必须显式提示：**回放发出的消息，其 `event.source` 是执行 eval 的那个帧**，与原始发送方不同。这是协议联调最省时间的功能，且目前没人做。

### 6.5 其他

- `MessagePort` / `BroadcastChannel` / `Worker` 覆盖（开关，默认关，避免侵入）。
- 中文界面与中文文档（对手全英文）。
- 大 payload 友好：捕获不截断、查看才截断、导出用全量。

---

## 7. 工程化

### 7.1 技术栈：与 `niexia/customize-tab-icon` 保持一致

参考实现已经定下技术栈与仓库约定，直接沿用，避免维护两套心智模型：

| 层     | 选型                                                                   | 说明                                                                         |
| ------ | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 构建   | **WXT**（参考仓库 `^0.20.7`；当前 0.21.5，API 兼容）                   | `entrypoints/` 约定，自动生成 manifest                                       |
| UI     | **React 19 + Tailwind 4 + shadcn/Radix**                               | 虚拟列表、JSON 树、筛选器用 React 更省事；面板是复杂 UI，不是 240px 的 popup |
| 语言   | TypeScript 5（`noUncheckedIndexedAccess`）                             |                                                                              |
| 包管理 | pnpm 12，Node ≥ 22（`.nvmrc`）                                         |                                                                              |
| 消息   | `@webext-core/messaging`                                               | 与参考仓库同一套 typed protocol                                              |
| 测试   | Vitest                                                                 |                                                                              |
| 质量   | ESLint 10 + Prettier 3                                                 |                                                                              |
| 版本   | changelogen + Conventional Commits                                     |                                                                              |
| CI     | GitHub Actions `ci.yml` + `release.yml`                                | 可照抄                                                                       |
| 目录   | `entrypoints/` `lib/` `components/` `docs/` `store/` `.agents/skills/` | 同构                                                                         |

WXT 已确认支持本方案的两个关键能力：`defineContentScript({ world: 'MAIN', runAt: 'document_start', allFrames: true, matchOriginAsFallback: true })`，以及 `entrypoints/devtools.html` 这个 devtools page 入口。

入口映射：

| 角色            | 入口                                                                  | 关键配置                                                                       |
| --------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| MAIN world 探针 | `entrypoints/probe.content.ts`                                        | `world:'MAIN'`、`runAt:'document_start'`、`allFrames`、`matchOriginAsFallback` |
| ISOLATED 桥     | `entrypoints/bridge.content.ts`                                       | 同上，`world` 默认                                                             |
| 路由            | `entrypoints/background.ts`                                           | `defineBackground({ type: 'module' })`                                         |
| DevTools 页     | `entrypoints/devtools/index.html`                                     | `chrome.devtools.panels.create(...)` 指向面板页                                |
| 面板页          | `entrypoints/panel/index.html`（unlisted page）                       | React 挂载                                                                     |
| popup           | `entrypoints/popup/index.html`                                        | React 挂载                                                                     |
| 纯逻辑          | `lib/protocol.ts`、`lib/snapshot.ts`、`lib/frames.ts`、`lib/audit.ts` | 全部 Vitest 覆盖                                                               |

scripts（用参考仓库的 `check` 作为完成定义）：

```json
{
  "dev": "wxt",
  "build": "wxt build",
  "zip": "wxt zip",
  "compile": "tsc --noEmit",
  "lint": "eslint .",
  "format": "prettier --write .",
  "test": "vitest run",
  "check": "pnpm compile && pnpm lint && pnpm test && pnpm build",
  "changelog": "changelogen --bump",
  "postinstall": "wxt prepare"
}
```

**与参考仓库唯一的架构偏离：保留 background service worker。** 那边的第 3 条不变量是"能从 popup 满足就不要 SW"，因为它的一切都由用户手势触发；我们相反——每个帧在页面加载前就要开始采集，必须有一个跨帧汇聚点。这里的 SW 是**无状态路由**，真相存在 `storage.session`，SW 被回收也不丢数据（§3.5）。

**施工顺序上的三个 spike（先验证再铺开）：**

1. WXT 的 `world:'MAIN'` 入口在 `document_start` 是否真的早于页面脚本，且 WXT 注入的 `ctx`（会碰 `browser.runtime`）在 MAIN world 不抛错。若有问题，退路是把探针改成 _unlisted script_，由 `manifest.content_scripts` 直接声明。
2. DevTools 面板页在扩展 CSP 下能否正常加载 React/Tailwind 产物。
3. `wxt dev` 的开发模式对 MAIN world 可能受页面 CSP 限制（dev 用 `import()` 从 localhost 加载），必要时 MAIN world 只在 `wxt build` 下验证。

### 7.2 仓库约定（照搬，价值很高）

- `AGENTS.md`：给 agent 的操作手册 + 不变量 + 验证矩阵。我们的不变量草案：
  1. **不改页面行为**：禁止 patch `window.postMessage`（§3.1）；handler 记账必须调用原生、可关闭、失败不影响页面。
  2. **探针绝不抛错**：所有采集路径 `try/catch`，错误只进自己的日志。
  3. **面板禁止 `innerHTML` / `eval`**（§3.7）。
  4. **无网络、无遥测、无远程代码**。
  5. **消息协议是契约**：`lib/protocol.ts` 单一来源，改字段必须带版本迁移。
  6. **不新增权限**：`storage` + `devtools_page` 足够；加权限必须单独讨论。
  7. **每次 release 更新文档标记**，由测试强制。
- `docs/architecture.md`（Mermaid + `<!-- release: X.Y.Z -->` 标记）、`docs/release-process.md`、`docs/privacy.md`。
- `store/README.md`：商店文案 + 每条权限的审核话术。
- `.agents/skills/release-chrome-extension`、`store-listing`：发布流程技能，几乎可以直接复用。
- `.github/workflows/{ci,release}.yml`：`check` + zip + `v*` tag 触发 GitHub Release。

这些不是锦上添花：它们决定这个项目两年后还能不能改，而参考仓库里已经有可抄的模板。

### 7.3 测试

- **单元**（Vitest，node 环境）：快照器（循环/`Map`/`BigInt`/超预算）、过滤表达式解析、噪声规则匹配、方向归因（注入 fake `window`/`frames`，不依赖 jsdom——jsdom 的 `event.origin`/`event.source` 不可信）。
- **E2E**（Playwright + 自带 Chromium）：`launchPersistentContext({ args: ['--disable-extensions-except=.output/chrome-mv3','--load-extension=.output/chrome-mv3'] })`，`context.serviceWorkers()` 拿 SW。注意绝不能用系统 Chrome（§3.3）。
- **Torture fixture**（必须建立，长期资产）：两个端口提供两个 origin；页面含同源 iframe、跨源 iframe、`srcdoc`、`sandbox="allow-scripts"`、嵌套帧、`MessageChannel`、`BroadcastChannel`、`Worker`、一次 1,000 条突发、一条 `BigInt`/循环引用/函数 payload、一条 `type:'postMessage-catcher'` 的干扰消息。
- **断言**：收件数/顺序/origin/方向；`srcdoc` 帧内可见；关开两次后只剩一个监听器且页面行为不变；突发无丢失（或有明确丢弃计数）；`event.source` 未被改坏（关键回归测试，见 §3.1）；页面零报错。
- 参考仓库目前没有 E2E，这部分要新建；WXT 有 e2e 指南可参考。

### 7.4 发布

- `wxt zip` → `.output/postmessage-catcher-<version>-chrome.zip`，`manifest.json` 在 zip 根。
- 版本号单一来源 `package.json`，WXT 自动写入 manifest；**不要手改构建产物**。
- `git rm --cached assets/postMessage-catcher.zip`，改为 GitHub Release 附件；`.gitignore` 加 `.output/`、`.wxt/`、`node_modules/`、`*.zip`、`test-results/`、`.store-demo/`。
- 修正图标映射（16/32/48/128）。
- 商店素材由脚本生成到 `store/assets/`（参考仓库的 `store:assets` harness 可复用：mock `chrome.*` + headless 截图 + 尺寸校验）。
- 隐私说明："只在本地处理消息内容，不上传"；CWS 隐私表单按实际填写。

---

## 8. 路线图

| 阶段            | 内容                                                                                                                      | 验收标准                                                                                                   | 估时     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------- |
| **P-1 脚手架**  | 迁到 WXT + React + TS + Tailwind + pnpm；跑通 §7.1 的三个 spike；旧 `js/` 保留在 `legacy/` 只读参照                       | `pnpm check` 全绿；MAIN world 探针在真实页面上确实早于页面脚本执行；面板页能加载 React 产物                | 1 人日   |
| **P0 引擎**     | 重写捕获层：MAIN world 全帧探针 + ISOLATED 桥 + SW 路由 + 环形缓冲；删除 WAR/`<script>` 注入；修 B2/B4/B5/B8；改 3 层开关 | torture fixture 里 `srcdoc`/跨源/加载期消息全部可见；页面 `event.source` 回归测试通过；严格 CSP 站点仍工作 | 3-4 人日 |
| **P1 面板 MVP** | DevTools 面板：列表+详情+过滤+搜索+Payload 树+导出+preserve+pause；popup 精简                                             | 与 PostMessage Inspector 功能对齐；5,000 行不卡                                                            | 4-5 人日 |
| **P2 差异化**   | 拓扑/帧视图 + 协议地图；Handlers 归因 + Origin 审计；噪声规则                                                             | 能对一条消息给出"谁处理、是否校验来源"；协议页可聚合                                                       | 4-6 人日 |
| **P3 打磨**     | 回放、Port/BC/Worker、i18n、a11y、商店素材、CI、文档、README 重写                                                         | 商店可发布                                                                                                 | 4-6 人日 |

**建议：P-1 + P0 + P1 一起发 v3.0**（约 1.5 周），再用 P2 建立差异化。P0 单独发布没有意义（用户看不到变化），P1 单独做会踩在烂地基上。

---

## 9. 仍需确认的小决策

1. **最低 Chrome 版本**：MAIN world 111+、长连接保活 114+。建议 `"minimum_chrome_version": "114"`，覆盖 99%+ 的活跃 Chrome。
2. **Firefox**：本轮建议只做 Chrome（WXT 切 `-b firefox` 的成本主要在 Xray 和 `browser.*` 差异，等面板稳定后再评估）。
3. **旧 console 输出**：建议保留一个"同时输出到 console"的开关，默认关，照顾习惯旧行为的用户。
4. **Handler 记账默认值**：建议默认**开**（这是差异化核心），但必须在面板里能一键关闭，且提供"关闭后零侵入"的明确说明。

---

## 10. 证据与来源

**实测（本机 headless Chrome 157，2026-11-15，脚本见附录 A）**

- 包裹 `window.postMessage` → `event.source` 变成接收方自己（`sourceIsParentSelf=true`）。
- 跨源（不同端口）子帧 → `event.origin` 准确、`event.source === iframe.contentWindow` 为真。
- `window.postMessage` 为 window 自有属性且可写；`Window.prototype.postMessage` 为 `undefined`。
- 正式版 Chrome 157 加 `--load-extension` 加载测试扩展失败（`patchedAtFirstScript=false`）。

**文档**

- Content scripts（`run_at`、`world`、`all_frames`、`match_origin_as_fallback`、CSP）：https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- 权限声明（`content_scripts` 免 host permission）：https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions
- Service worker 生命周期：https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- `chrome.storage` / `storage.session`：https://developer.chrome.com/docs/extensions/reference/api/storage
- DevTools panels：https://developer.chrome.com/docs/extensions/reference/api/devtools/panels
- `chrome.runtime.MessageSender`（`documentId`/`frameId`）：https://developer.chrome.com/docs/extensions/reference/api/runtime
- CWS 审核时长因素：https://developer.chrome.com/docs/webstore/review-process
- CWS 图片规格：https://developer.chrome.com/docs/webstore/images

**竞品/先例**

- https://github.com/opnsec/postMessage-logger
- https://github.com/fransr/postMessage-tracker
- https://github.com/Zeetaz/FancyTracker
- https://ncctcr.com/blog/building-postmessage-inspector （PostMessage Inspector 作者自述，含 `event.source`、`Window.prototype.postMessage`、截断策略等一手教训）
- https://github.com/oferlmntr/post-message-devtool
- chrome-stats：https://chrome-stats.com/d/henlmhlhpgnkeecjjcbhhcfmecohnilo

**工程**

- 参考架构（技术栈/仓库约定来源）：https://github.com/niexia/customize-tab-icon
- WXT 内容脚本（`world`/`allFrames`/`matchOriginAsFallback`）：https://wxt.dev/guide/essentials/content-scripts.html
- WXT 入口（`devtools` 入口）：https://wxt.dev/guide/essentials/entrypoints.html
- Playwright 扩展测试：https://playwright.dev/docs/chrome-extensions
- Chrome 137 移除 `--load-extension`：https://groups.google.com/a/chromium.org/g/chromium-extensions/c/FxMU1TvxWWg/m/daZVTYNlBQAJ
- CWS API v2：https://developer.chrome.com/blog/cws-api-v2

---

## 附录 A：验证脚本要点

`probe3.html`（`event.source` 实验）核心：父页面创建 `srcdoc` 子帧，子帧 `parent.postMessage(...)`；父页面比较 `e.source === window` 与 `e.source === frame.contentWindow`；用 `?wrap=1` 决定是否在父页面替换 `window.postMessage` 为 `Reflect.apply(native, this, arguments)` 的包装。

`probe2.html`（属性归属）核心：`Object.getOwnPropertyDescriptor(window,'postMessage')`、`Object.getOwnPropertyDescriptor(Object.getPrototypeOf(window),'postMessage')`。

`parent-xo.html`（跨源归因）核心：子帧来自 `127.0.0.1:8766`、父页面在 `127.0.0.1:8765`，比较 `e.source === iframe.contentWindow`。

`ext/`（MAIN world 注入实验）：Chrome 157 正式版拒绝 `--load-extension`，实验未能在正式版上完成；改用 Playwright Chromium 后应作为 P0 的第一个测试用例。
