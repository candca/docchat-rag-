# DocChat 前端工作日志

记录每次对话中的实质性进展。每完成一个有意义的任务就追加一条。

## 格式约定

- 按日期分节，节内按时间顺序追加
- 每条格式：`- 状态 任务名 — 说明`
- 状态用：✅ 完成 / 🔄 进行中 / ⏸ 暂停 / ❌ 放弃
- 涉及具体文件或决策时列出，便于回溯
- 时间精度：能记到几点几分就记，不行就只记日期

---

## 2026-04-29

**阶段：项目设计（pre-coding）**

- ✅ 创建项目文件夹 — `D:\docchat\new\docchat-frontend\`
- ✅ 初始化 `CLAUDE.md` — 写入项目目标、技术栈、参考项目（rag-chatbot）前端文件清单
- ✅ 讨论 Claude Artifacts 适配性 — 结论：原型期推荐用 Artifacts 设计单组件再回贴到 Vite 项目
- ✅ 讨论项目结构，敲定 3 个关键决策
  - 状态管理：Zustand 单 store
  - UI 组件：shadcn CLI 接入
  - 页面数量：仅做主聊天页（线框图里的登录/文档管理只在 PPT 上呈现）
- ✅ 更新 `CLAUDE.md` — 加入决策表、完整目录结构、MVC 拆解、shadcn/Zustand 的引入说明
- ✅ 建立 `doc/` 目录和本工作日志 — 同步在 `CLAUDE.md` 加入"工作日志维护约定"

**阶段产物**：项目骨架文件夹 + CLAUDE.md（设计层完成，未开始编码）

**下一步候选**（待用户决定顺序）：
1. 搭脚手架（Vite + Tailwind v4 + Zustand + shadcn CLI + react-markdown）
2. 定义 `types/index.ts` 和 `data/` 下的 mock 数据
3. 用 Claude Artifacts 出三栏视觉稿

---

**阶段：组件开发（Artifacts → 回贴）**

- ✅ 写入 `src/components/chat/chat-header.tsx` — 由用户在 Claude Artifacts 设计后回贴
  - Props：`theme` / `onNewChat` / `onClearHistory` / `onToggleTheme`
  - 依赖：`lucide-react`、`@/components/ui/button`、`@/components/ui/tooltip`
  - 待办：脚手架搭好后需要 `npx shadcn add button tooltip` 才能编译通过
- ✅ 写入 `src/components/chat/chat-viewport.tsx` — 由用户在 Claude Artifacts 设计后回贴
  - Props：`messages` / `isThinking` / `onExampleClick`
  - 依赖：`lucide-react`、`@/components/ui/scroll-area`、`@/lib/utils`
  - 内含三个子结构：`InlineChatMessage`（占位，后续被正式 `chat-message.tsx` 替换）、`ThinkingIndicator`、`EmptyState`（含 4 条示例问题 chips）
  - 临时在文件内 `export` 了 `Citation` / `Message` 类型，待 `types/index.ts` 建好后迁出
  - 自动滚动策略：仅当用户贴近底部（`AUTO_SCROLL_THRESHOLD = 100px`）时新消息才触发 `scrollIntoView`
  - 兼容 shadcn ScrollArea 新旧 viewport 选择器（`data-slot` / `data-radix-scroll-area-viewport`）
  - 待办：`npx shadcn add scroll-area`；落实 `chat-message.tsx` 后替换 `InlineChatMessage`；类型迁到 `types/index.ts`
- ✅ 写入 `src/components/chat/chat-message.tsx` — 由用户在 Claude Artifacts 设计后回贴
  - Props：`role` / `content` / `citations` / `isStreaming` / `onCitationClick`
  - 依赖：`react-markdown`、`remark-gfm`、`lucide-react`、`@/components/ui/button`、`@/lib/utils`
  - 用 `ReactMarkdown` 渲染气泡内容，自定义 `p` / `li` 节点把字符串子节点中的 `[N]` 解析成可点击的 `<CitationMark>` 上标
  - 助手消息底部显示引用 chips（点击同样触发 `onCitationClick(index)`）；hover 出现复制按钮；`isStreaming` 时显示打字光标并隐藏复制按钮
  - 注意：本组件的 `Citation` 形状（`index` / 可选 `page` / 可选 `snippet`）与 `chat-viewport.tsx` 临时定义的（`id` / 必填 `page` / 必填 `snippet`）**不一致**。需要在 `types/index.ts` 落地时统一为单一定义，再让两边 import
  - 修复：粘贴时原稿 `a:` 节点的开标签 `<a` 缺失，已补回
  - 待办：`npx shadcn add button`；统一 `Citation` 类型；把 viewport 中的 `InlineChatMessage` 替换为本组件
- ✅ 写入 `src/components/chat/chat-input.tsx` — 由用户在 Claude Artifacts 设计后回贴
  - Props：`onSend` / `isGenerating` / `onStop` / `selectedDocCount` / `placeholder` / `maxLength`
  - 依赖：`lucide-react`（其余样式纯 Tailwind，未引入 shadcn / `cn()`）
  - 功能：自适应高度（最大 200px，每次 value 变化重算）、Enter 发送 / Shift+Enter 换行、IME 组合期不触发发送、字数计数（90% 时变琥珀色）、生成中按钮变停止、`selectedDocCount === 0` 时整体禁用并提示
  - **风格不一致警告（待统一）**：
    - 默认导出 `export default function ChatInput`，与 chat-header / chat-viewport / chat-message 的具名导出不一致
    - 全文用硬编码 `bg-white` / `text-neutral-*` 等中性色，未走 shadcn 主题 token（`bg-background` / `text-foreground` / `border-border`），所以 chat-header 的主题切换按钮**对此组件无效**
    - 用 `[...].join(" ")` 拼 className，未用项目里其他组件统一的 `cn()` helper
  - 待办：以上三项风格在合并联调时统一；`selectedDocCount` 后续要从 Zustand 的 `documents` 派生

---

**阶段：技术债清理（动手设计 document-list 之前的收口）**

### 问题怎么产生

- 4 个组件全部由 Claude Artifacts 独立产出后回贴，每次会话都是"冷启动"——Artifacts 不知道仓库里其他组件长什么样，于是各自现造类型与样式。
- 项目骨架先于 `types/index.ts` 就开始铺组件，没有"先定共享形状再写组件"的硬约束。
- 结果是：1) `Citation` 出现两份不同形状（viewport 一份用 `id` / 必填 `page,snippet`；message 一份用 `index` / 可选 `page,snippet`），如果直接把 viewport 的 `InlineChatMessage` 替换成 `<ChatMessage>` 必然 TS 编译不过；2) `chat-input` 用 `bg-white` / `text-neutral-*` 等硬编码色，与 chat-header 的主题切换完全脱钩，深色模式下会变成"白底浅灰字"。

### 修复了哪些问题

1. `Citation` / `Message` 在两个文件里被各自定义且形状不一致
2. `Document` 在 `document-list` / `document-upload` 写出之前没有事先约束（潜在风险，提前堵）
3. `chat-viewport.tsx` 里的 `InlineChatMessage` 占位组件与正式 `chat-message.tsx` 并存，是一颗待引爆的 TS 不一致雷
4. `chat-input.tsx` 与其他三个组件三项风格不统一：默认导出、`[...].join(" ")` 拼 className、硬编码 neutral 色

### 怎么修的

- ✅ 新建 `src/types/index.ts`，作为全项目共享类型的唯一来源
  - `Citation` 以 chat-message 那版为准（`index` 比 `id` 更贴合"引用编号"语义；`page` / `snippet` 设可选更现实）
  - `Message` 沿用 viewport 那版形状（`id` / `role` / `content` / `citations?` / `timestamp`）
  - `Document` 提前一次性敲死（`id` / `name` / `type: "pdf" | "docx" | "md"` / `status: "ready" | "indexing" | "error"` / `uploadedAt` / `size?`），避免 document-list/upload 写出来时再出第三份
- ✅ `chat-message.tsx`：删掉本地 `Citation` 定义，改 `import type { Citation } from "@/types"`
- ✅ `chat-viewport.tsx`：
  - 删掉本地 `Citation` / `Message` 定义，改 `import type { Message } from "@/types"`
  - 整段删掉 `InlineChatMessage` 占位组件
  - `import { ChatMessage } from "./chat-message"`，渲染处替换为 `<ChatMessage role={m.role} content={m.content} citations={m.citations} onCitationClick={onCitationClick} />`
  - `ChatViewportProps` 增加可选 `onCitationClick: (index: number) => void`，让 App.tsx / Zustand 来注入"点 [N] → 高亮右栏"信号
- ✅ `chat-input.tsx`：
  - 默认导出 → 具名导出 `export function ChatInput`
  - 引入 `cn`，所有 `[...].join(" ")` 改为 `cn(...)`，并把 `cond ? "x" : ""` 简化成 `cond && "x"`
  - 颜色全量替换为 shadcn 主题 token：
    - `bg-white` → `bg-background`
    - `text-neutral-900` → `text-foreground`
    - `text-neutral-400` / `text-neutral-500` → `text-muted-foreground`
    - `text-neutral-700` → `text-foreground`
    - `border-neutral-200` → `border-border`；focused 状态 `border-neutral-300` → `border-ring`
    - `bg-neutral-50` / `bg-neutral-100` → `bg-muted`
    - 发送按钮 `bg-neutral-900 text-white hover:bg-neutral-700` → `bg-primary text-primary-foreground hover:bg-primary/90`
    - 禁用态 `bg-neutral-100 text-neutral-300` → `bg-muted text-muted-foreground/50`
    - 思考动画两层圆点 `bg-neutral-400` / `bg-neutral-500` → 都用 `bg-muted-foreground`，靠 `opacity-75` + `animate-ping` 维持层次
  - `text-amber-600`（字数 90% 告警）保留——shadcn token 里没有 warning 色，硬编码反而合理
  - 行为零改动：自适应高度、Enter / Shift+Enter / IME 组合期、字数计数、生成中切停止、`selectedDocCount === 0` 整体禁用 全部保持原样

### 现在的状态

- 4 个组件全部具名导出、全部用 `cn()`、全部走 shadcn 主题 token，主题切换可以一致生效
- `Citation` / `Message` / `Document` 仅 `src/types/index.ts` 一处定义
- 中栏数据流已贯通：`messages → ChatViewport → ChatMessage`，`onCitationClick` 信号也已串好，等右栏 `citation-panel.tsx` 实现后即可联动

### 下一步

按原计划继续设计 `document-list.tsx` / `document-upload.tsx` / `citation-panel.tsx`。新组件应直接 `import type { Document } from "@/types"`、具名导出、用 `cn()`、用主题 token，避免再次产生上述债务。

---

**阶段：组件开发（document-upload）**

- ✅ 写入 `src/components/chat/document-upload.tsx` — 由用户在 Claude Artifacts 设计后回贴，**粘贴时按上一阶段确立的项目风格做了同步修复**
  - Props：`onUploadComplete(file: File)` / `accept` / `maxSizeMB` / `disabled`
  - 依赖：`lucide-react`、`@/lib/utils`
  - 双形态渲染：
    - 默认态：拖拽 + 点击上传区，含 hover / dragOver 视觉反馈、Enter / Space 键盘可达
    - 进度态：上传中（loader + 进度条）/ 成功（emerald 勾选 + "上传成功,正在解析"，1.2s 后自动隐藏）/ 失败（destructive 红 + 错误文案 + 取消按钮）

#### 这次发现并修复的问题（与上一轮技术债同源）

问题怎么产生：依旧是 Artifacts 冷启动产物——它不知道仓库里 chat-input 已经被翻新过、也不知道 `Document` 类型刚刚定义。所以同样的债务再次出现。

| 问题 | 原始写法 | 修正 |
|------|---------|------|
| 默认导出 | `export default function DocumentUpload` | `export function DocumentUpload` |
| className 拼接 | `[...].join(" ")`（共 3 处大块） | `cn(...)` |
| 容器底色 | `bg-white` | `bg-background` |
| 默认态边框 | `border-neutral-200` / hover `border-neutral-300` | `border-border` / hover `border-muted-foreground/40` |
| 默认态 hover 底 | `hover:bg-neutral-50/50` | `hover:bg-muted/30` |
| 拖拽激活边框 | `border-neutral-900` | `border-primary` |
| 拖拽激活底 | `bg-neutral-50` | `bg-muted/50` |
| 主标题文字 | `text-neutral-900` | `text-foreground` |
| 副标题文字 | `text-neutral-500` | `text-muted-foreground` |
| focus ring | `focus:ring-neutral-900` | `focus:ring-ring` |
| 圆形图标默认底 | `bg-neutral-100 text-neutral-500` | `bg-muted text-muted-foreground` |
| 圆形图标 hover | `group-hover:bg-neutral-200 group-hover:text-neutral-700` | `group-hover:bg-accent group-hover:text-foreground` |
| 圆形图标拖拽态 | `bg-neutral-900 text-white` | `bg-primary text-primary-foreground` |
| Loader 颜色 | `text-neutral-500` | `text-muted-foreground` |
| 错误图标 | `text-red-500` | `text-destructive` |
| 错误卡片 | `border-red-200 bg-red-50/50` | `border-destructive/30 bg-destructive/5` |
| 成功卡片 | `border-emerald-200 bg-emerald-50/50` | `border-emerald-500/30 bg-emerald-500/5`（emerald 无 shadcn token，保留语义色但用透明度叠加，保证深色模式下可读） |
| 取消按钮 | `text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700` | `text-muted-foreground hover:bg-muted hover:text-foreground` |
| 进度条轨道 | `bg-neutral-100` | `bg-muted` |
| 进度条填充 | `bg-neutral-900` | `bg-primary` |

#### 顺手做的一处类型对齐（不是风格问题，是新发现的小坑）

- `accept` 默认值 `.pdf,.docx,.txt,.md` → `.pdf,.docx,.md`
  - 原因：`Document.type: "pdf" | "docx" | "md"` 不允许 `txt`。如果不改，用户上传 `.txt` 时父组件无法构造合法 `Document`，会绕一圈出现新的"两份不一致"。
  - 同步把底部说明文字 "PDF / DOCX / TXT" 改为 "PDF / DOCX / MD"。

#### 未改动但要记一笔（避免遗忘）

- `timerRef` 的 `setInterval` 在组件卸载时没有清理——属于潜在内存泄漏 / setState-on-unmounted 风险，不属于本轮风格问题，留给接 store 时一起处理。
- `onUploadComplete(file: File)` 仅向上抛 `File`。父组件（document-list / App）需要负责把它转成 `Document`：`{ id: nanoid(), name: file.name, type: extOf(file.name), status: "indexing", uploadedAt: Date.now(), size: file.size }`。这套转换逻辑应放在 `useDocuments` hook 里。
- 待办：`npx shadcn add` 不需要新增（本组件只用 lucide + cn）；外接 store 时由父组件注入 `disabled`（已上传中或选择中状态）。

---

## 2026-04-30

**阶段：组件全量复盘（动手接 store / 写 App.tsx 之前的体检）**

### 背景

8 个组件文件都已落地（types + 7 个 chat 组件）。在接 Zustand store / 写 App.tsx 之前再过一遍代码，把**会让 TS 编译失败 / 运行时出 bug** 的硬伤、以及**风格漂移**单独列出来，避免联调阶段挨个翻车。

### 🔴 Critical（会编译失败或运行时出错，必须修）

1. **`citation-panel.tsx` 原文片段重复渲染** — `src/components/chat/citation-panel.tsx:156-158`
   - 现状：blockquote 里先 `renderHighlighted(cite.snippet, isActive ? undefined : undefined)`（两个分支都是 undefined → 等同于直接返回原文），紧接着又写了一行 `{cite.snippet}`。snippet 会**显示两次**。
   - 注释里说"如果有 highlight 字段可传入"，但 `Citation` 类型里根本没有 `highlight` 字段，是死代码。
   - 修法：要么删掉第二行 `{cite.snippet}`（保留 `renderHighlighted` 逻辑，等以后 Citation 加 highlight 字段时把第二个参数填上）；要么删掉 `renderHighlighted` 那一坨 + `escapeRegExp`，直接 `{cite.snippet}`。我倾向后者——mock 阶段没 highlight 概念，先做减法。

2. **`document-list.tsx` formatDate 类型与实参不匹配** — `src/components/chat/document-list.tsx:33`
   - 函数签名 `formatDate(iso: string)`，但调用处 `formatDate(doc.uploadedAt)` 传的是 `number`（`Document.uploadedAt: number /* ms 时间戳 */`）。开 strict 编译直接红。
   - 修法：把参数类型改成 `number`，函数体里 `new Date(ts)` 对 number 也合法，逻辑无需动。

3. **`document-list.tsx` 一天的秒数写错** — `src/components/chat/document-list.tsx:39`
   - `if (diff < 84600)` —— 一天是 `86400` 秒（24×3600），不是 84600。300 秒（5 分钟）的偏差会让"23 小时 30 分前"以后到"24 小时前"这段窗口直接跳过"小时前"显示，落到 `toLocaleDateString`。
   - 修法：`84600` → `86400`。

4. **`chat-message.tsx` 用了 react-markdown 已删除的 `inline` prop** — `src/components/chat/chat-message.tsx:148`
   - `code: ({ inline, children, className, ...rest })` 来判定行内代码 vs 代码块。**react-markdown v9 起已经移除 `inline` 这个 prop**（v8 还有）。如果 `package.json` 里装的是 v9+，`inline` 永远是 `undefined`，三元判断永远走"非 inline"分支，所有行内代码的浅灰底样式失效。
   - 修法（v9 写法）：通过 `className` 是否含 `language-*` 判断；或者直接交给 `pre > code` 的层级，自己只写 `code` 简单样式。
   - 待确认：`package.json` 还没建（脚手架未搭），等 `npm create vite` 之后看锁的 react-markdown 版本再定具体改法。但**默认会装最新版 = v9**，所以九成要改。

### 🟡 风格 / 一致性（不影响编译，但联调会膈应）

5. **Props 接口导出不一致**
   - 已导出：`ChatHeaderProps` / `ChatViewportProps` / `ChatMessageProps`
   - 未导出：`ChatInputProps` / `DocumentUploadProps` / `DocumentListProps` / `CitationPanelProps`
   - 未来 App.tsx 要根据 store state 拼参数对象时，未导出的会逼父组件再写一份重复结构。统一改为全部 `export interface`。

6. **`TooltipProvider` 应该上提到 App.tsx**
   - 现状：`chat-header.tsx:33` 自己包了 `<TooltipProvider>`。
   - 接下来 `citation-panel`（"查看原文"按钮）、`document-list`（"更多操作"按钮）大概率也要 tooltip，每个组件各包一份会出现 provider 嵌套与 delay 配置漂移。
   - 修法：删掉 chat-header 里的 TooltipProvider，把它放到 `App.tsx` 顶层包整个三栏。

7. **滚动容器实现不统一**
   - `chat-viewport.tsx` 用了 shadcn `<ScrollArea>`（带自定义滚动条样式 + 需要 `data-slot` 找 viewport）
   - `document-list.tsx:93` 和 `citation-panel.tsx:93` 直接 `overflow-y-auto`
   - 选哪种都行，但要统一。建议**主聊天流用 ScrollArea**（视觉精致 + 自动滚动需要 viewport ref），**侧栏列表用原生 overflow**（简单、不需要 ref）——也就是维持现状，但要在 worklog 里写明这是有意分化，不是债。

8. **`chat-input.tsx` 阴影硬编码 RGB**
   - `src/components/chat/chat-input.tsx:74-75`：`shadow-[0_0_0_4px_rgba(0,0,0,0.04),...]`、`shadow-[0_1px_2px_rgba(0,0,0,0.04)]`
   - 黑色 rgba 在深色模式下不会自动反相，深色主题下阴影会消失/变诡异。
   - 修法：换成 `shadow-sm` / `shadow` / `ring-1 ring-ring/20` 之类的 token；或者用 `shadow-[...] dark:shadow-[...]` 双写。

9. **`citation-panel.tsx` 用了未定义的 `custom-scrollbar` 类** — `src/components/chat/citation-panel.tsx:93`
   - 全局 `index.css` 还没建，这个类名目前是空 class，等于没用。要么删掉，要么之后在 `index.css` 里实现。

10. **`document-list` 的文件类型色 / `citation-panel` 的 amber 激活态** 都用了硬编码语义色（`bg-red-500/10`、`bg-amber-500/5` 等）
    - 与上一阶段确立的"全量走 shadcn token"约定相左，但属于"shadcn 没有对应语义 token"的合理妥协（和 document-upload 的 emerald 同一类）。
    - **不修，但写一笔**：项目里硬编码语义色仅限 `red`（destructive 无法表达"PDF" 这种非错误语义）/ `blue` / `amber` / `emerald` 四种且都用 `xxx-500/10` 透明度叠加方式。后续新增不要扩大这个白名单。

### 🟢 已知技术债（worklog 之前已经记过一笔，这次确认仍在）

11. **`document-upload.tsx` `timerRef` 未在卸载时清理** — 上一节已写。
12. **`chat-input.tsx` `selectedDocCount = 1` 这个默认值很危险** — 父组件忘了传，会让 input 永远 enabled，相当于把 store 接错也没人会发现。建议改成默认 `0`（默认禁用）+ 父组件**必须**显式传值。

### 🔵 顺手发现的小事（不一定要现在改）

- `chat-viewport` 的 `onCitationClick` 是 optional，`chat-message` 的 `onCitationClick` 也是 optional——两层 optional 串起来意味着 App.tsx 漏注入也不报错。可以考虑顶层（viewport）改 required，让 TS 强制 App 必须连线。
- `document-list` 的"更多操作"用 `fixed inset-0` 做点击外侧关闭——能用，但多个 li 同时打开菜单时会出现两层全屏背板叠加。当前 `menuOpenId` 是单值所以不会发生，留个隐患记号即可。
- `chat-input` 的 `Paperclip` 附件按钮目前是纯 mock 占位，没接 `<DocumentUpload>` 也没回调出去。演示前要么藏掉，要么接到上传流程，避免现场被问"这个回形针点了为啥没反应"。

### 接下来怎么做

按 Critical → 风格 → 技术债 的顺序处理：

1. ✅ 先把 4 条 Critical 修掉（可一次提交）
2. ✅ 风格类（5 / 6 / 8 / 9）合并一次提交
3. ✅ 12 改默认值；11 在接 store 时一并处理（`useEffect cleanup`）
4. 然后才进入"搭脚手架 → npm i → 写 App.tsx + Zustand store"阶段

---

**阶段：技术债清理 Round 2（复盘发现问题全量修复）**

### 本次修复清单

#### 🔴 Critical（已修）

| # | 文件 | 问题 | 修法 |
|---|------|------|------|
| 1 | `citation-panel.tsx` | snippet 双重渲染：`renderHighlighted(...)` + `{cite.snippet}` 并存 | 删除 `renderHighlighted` / `escapeRegExp` 两个函数，直接 `{cite.snippet}` |
| 2 | `document-list.tsx:33` | `formatDate(iso: string)` 参数类型与实参 `number` 不符 | 改为 `formatDate(ts: number)`，函数体变量同步重命名 |
| 3 | `document-list.tsx:39` | 一天秒数写错：`84600`（差 300 秒）| 改为 `86400` |
| 4 | `chat-message.tsx:148` | `inline` prop 在 react-markdown v9 已移除，永远 `undefined` | 改为通过 `className` 是否含 `language-` 前缀判断行内 vs 块级代码 |

#### 🟡 风格（已修）

| # | 文件 | 问题 | 修法 |
|---|------|------|------|
| 5 | 四个组件 | `ChatInputProps` / `DocumentUploadProps` / `DocumentListProps` / `CitationPanelProps` 未导出 | 全部改为 `export interface` |
| 6 | `chat-header.tsx` | `<TooltipProvider>` 包在组件内，后续多处组件若各自包会出现嵌套 | 删掉 header 内的 Provider + import；上提到 App.tsx 顶层（App.tsx 写时补） |
| 7 | 滚动容器 | `chat-viewport` 用 shadcn `<ScrollArea>`，侧栏用原生 `overflow-y-auto` | **维持现状**：主聊天流需要 viewport ref 自动滚动用 ScrollArea；侧栏列表无此需求用原生，有意分化，非债务 |
| 8 | `chat-input.tsx:74-75` | `shadow-[rgba(0,0,0,...)]` 深色模式不自动反相 | 改为 focused: `shadow-md ring-4 ring-ring/5`；默认: `shadow-sm` |
| 9 | `citation-panel.tsx:93` | `custom-scrollbar` 类名未定义（`index.css` 尚未建立） | 删掉该类名，恢复干净的 `overflow-y-auto` |
| 10 | `document-list` / `citation-panel` 语义色 | `bg-red-500/10` / `bg-amber-500/5` 等硬编码色 | **不改**：shadcn 无对应 token，透明度叠加方案已是合理妥协；项目白名单：red / blue / amber / emerald，不再扩大 |

#### 🔴 技术债（已修）

| # | 文件 | 问题 | 修法 |
|---|------|------|------|
| 12 | `chat-input.tsx` | `selectedDocCount = 1` 默认值危险，父组件漏传导致 input 永远 enabled | 改为默认 `0`（默认禁用），父组件必须显式传值 |

#### 🔴 技术债（未修，留存）

| # | 文件 | 问题 | 计划 |
|---|------|------|------|
| 11 | `document-upload.tsx` | `timerRef` `setInterval` 卸载时未清理 | 在接 Zustand store 的 `useEffect` 阶段一并处理 |

### 当前状态

- 所有 Critical 已修，无已知会让 TS 编译失败或运行时出 bug 的硬伤
- 所有 Props 接口已统一导出
- `TooltipProvider` 已从 chat-header 移除，待 App.tsx 顶层补上
- 代码已为"搭脚手架 → npm i → 写 App.tsx + Zustand store"做好准备

---

## 2026-04-30（续）

**阶段：脚手架搭建 + 全量接线**

### 本次完成

- ✅ 建立项目配置文件
  - `package.json`：React 19 + Vite 7 + Tailwind v4 + Zustand v5 + react-markdown v9 + remark-gfm v4
  - `vite.config.ts`：`@tailwindcss/vite` 插件 + `@` alias → `src/`
  - `tsconfig.json` / `tsconfig.app.json` / `tsconfig.node.json`：strict 模式全开
  - `index.html`：`lang="zh-CN" class="dark"` 初始深色

- ✅ 写入 `src/main.tsx` — StrictMode 入口，CSS 侧效导入加 `@ts-expect-error`

- ✅ 写入 `src/index.css` — Tailwind v4 全局样式
  - `:root` 为浅色主题，`.dark` 为深色主题（电蓝色 primary，来自 rag-chatbot 参考项目）
  - `@theme inline` 完整映射所有 shadcn token
  - 自定义滚动条样式

- ✅ 写入 `src/lib/utils.ts` — `cn()` (clsx + tailwind-merge)

- ✅ 写入 6 个 shadcn UI 组件（直接从参考项目拷贝，不走 CLI）
  - `button.tsx`、`textarea.tsx`、`scroll-area.tsx`、`tooltip.tsx`、`avatar.tsx`、`progress.tsx`

- ✅ 写入 `src/data/documents.ts` — 3 份预置演示文档（全 ready 状态，开屏即可提问）
  - `RAG_技术白皮书_2026.pdf`（2.4MB）/ `DocChat_产品规格书_v1.2.pdf`（1.1MB）/ `用户研究报告_2026Q1.md`（0.3MB）

- ✅ 写入 `src/data/scripted-qa.ts` — 4 套演示问答对 + fallback
  - 覆盖关键词：RAG/检索/架构 / 讲了什么/简介 / 核心观点/总结 / 关键数据/指标
  - 每套答案含 2-3 个 `Citation`（带 `snippet` 原文，供右栏展示）

- ✅ 写入 `src/services/mockApi.ts` — `getAnswer(question)` + `delay(ms)`

- ✅ 写入 `src/stores/appStore.ts` — Zustand 单 store
  - 状态：`messages` / `documents` / `activeCitationIndex` / `activeDocId` / `theme`
  - `clearMessages` 同步清 `activeCitationIndex`；`removeDocument` 同步清 `activeDocId`

- ✅ 写入 `src/hooks/useChat.ts` — 发消息流程：用户消息 → 2s 思考 → 逐字流式输出（25ms/tick，1-3字/次）→ 附加 citations；支持 `stop()` 中断

- ✅ 写入 `src/hooks/useDocuments.ts` — 文件上传 → indexing 状态 → 2s 后转 ready；useEffect 清理未完成的 timer

- ✅ 写入 `src/App.tsx` — 三栏布局
  - `TooltipProvider` 顶层包裹（解决上一轮 chat-header 嵌套问题）
  - 左 260px / 中 flex-1 / 右 320px，`overflow-hidden` 防滚出屏
  - `useEffect` 同步 theme → `document.documentElement.classList`
  - `citations` 取最近一条 assistant 消息的 citations（useMemo）
  - `handleSend` 在 `sendMessage` 前清 `activeCitationIndex`

- ✅ `npm install` — 0 vulnerabilities
- ✅ `npm run build` — TypeScript 零报错，Vite 构建成功（JS 496KB gzip 154KB）
- ✅ `npm run dev` — 本地服务启动，http://localhost:5173/ 可访问

### 遗留 / 下一步

- ⏸ `document-upload.tsx` 的 `timerRef` 卸载清理 — 已在 `useDocuments.ts` 层面解决（store 侧 timer 清理）；组件内部 `timerRef` 仍在，但 mock 阶段影响极小，按上一轮结论留存
- 🔄 下一步：打开浏览器验证三栏交互（引用点击、流式输出、上传假文档），记录截图时需要的调整
