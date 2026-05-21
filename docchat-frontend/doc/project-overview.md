# DocChat 前端项目梳理文档

> 生成日期：2026-04-30  
> 作者：Claude Code 辅助整理

---

## 一、项目定位

DocChat 前端是一个**高保真演示原型**，目标是在答辩现场展示"基于文档的 AI 问答"核心体验。

- 所有数据全部 mock，不连接任何真实后端
- 只做一个主聊天页，三栏布局
- 演示剧本由写死的问答对驱动，支撑可信的 demo 叙事

---

## 二、技术栈全览

| 技术 | 版本 | 解决什么问题 |
|------|------|-------------|
| **React 19** | ^19.0.0 | UI 框架，声明式管理界面状态与渲染 |
| **TypeScript** | ~5.7.2 | 静态类型，让 `Message / Document / Citation` 等领域模型在编译期就能发现类型错误 |
| **Vite 7** | ^7.1.11 | 构建工具，基于原生 ESM 实现毫秒级热更新（HMR），开发体验远优于 webpack |
| **Tailwind CSS v4** | ^4.2.0 | 原子化 CSS，通过 utility class 快速构建 UI，支持 `dark:` 前缀实现暗色主题切换 |
| **shadcn/ui（Radix UI）** | via @radix-ui/* | 无障碍可访问的原始 UI 原语（Tooltip、ScrollArea、Avatar 等），组件源码直接在仓库内，可随意定制 |
| **Zustand 5** | ^5.0.0 | 轻量全局状态管理，跨栏联动（中栏点 `[1]` → 右栏高亮）需要共享 `activeCitationIndex`，Zustand 比 Context + Reducer 更简洁 |
| **react-markdown + remark-gfm** | ^9.0.1 / ^4.0.0 | 将 AI 回答（Markdown 字符串）渲染成富文本，并在段落/列表中插入可点击的 `[N]` 引用标注 |
| **lucide-react** | ^0.577.0 | 一致的图标库，提供文件、操作等所有图标 |
| **class-variance-authority + clsx + tailwind-merge** | 合称 shadcn 工具链 | 安全合并 Tailwind class，避免样式冲突；`cn()` 是全项目最常用的工具函数 |

---

## 三、整体架构：MVC 拆解

```
┌──────────────────────────────────────────────────────┐
│                        View                          │
│  ChatHeader  ChatViewport  ChatMessage  ChatInput     │
│  DocumentList  DocumentUpload  CitationPanel          │
│  (src/components/chat/ + src/components/ui/)         │
└──────────────────┬───────────────────────────────────┘
                   │ props / callbacks
┌──────────────────▼───────────────────────────────────┐
│                    Controller                         │
│          useChat.ts    useDocuments.ts                │
│                  (src/hooks/)                        │
└──────────┬───────────────────┬───────────────────────┘
           │ read/write        │ read/write
┌──────────▼──────────┐  ┌────▼──────────────────────┐
│     Model (状态)     │  │     Model (数据/服务)       │
│  appStore.ts        │  │  mockApi.ts               │
│  (src/stores/)      │  │  documents.ts             │
│                     │  │  scripted-qa.ts           │
└─────────────────────┘  └───────────────────────────┘
```

- **Model**：`appStore.ts` 保存运行时状态（消息列表、文档列表、当前激活引用）；`mockApi.ts + data/` 提供静态数据和延迟逻辑，演示期替代真实 HTTP/WebSocket
- **View**：所有 `.tsx` 组件，只接收 props、调用回调，自身不持有业务逻辑
- **Controller**：`useChat.ts` 和 `useDocuments.ts`，协调"用户动作 → 调用服务 → 更新 store → 触发重渲染"的完整链路

---

## 四、目录结构详解

### `src/types/index.ts` — 领域类型中心

定义了三个核心接口，全项目唯一来源：

```typescript
Citation  // 一条引用：{ index, docName, page?, snippet? }
Message   // 一条消息：{ id, role, content, citations?, timestamp }
Document  // 一个文档：{ id, name, type, status, uploadedAt, size? }
```

**为什么单独抽出来**：防止各组件各自定义"长得差不多但不兼容"的同名类型，是整个项目的类型源头。

---

### `src/stores/appStore.ts` — 全局状态

用 Zustand 管理以下状态：

| 字段 | 类型 | 作用 |
|------|------|------|
| `messages` | `Message[]` | 聊天消息历史 |
| `documents` | `Document[]` | 左栏文档列表（初始化为 3 条 mock 数据） |
| `activeCitationIndex` | `number \| null` | 右栏当前高亮的引用编号 |
| `activeDocId` | `string \| null` | 左栏当前选中的文档 |
| `theme` | `'light' \| 'dark'` | 当前主题，同步到 `<html>` 的 `dark` class |

所有修改通过纯函数 action（`addMessage`、`updateMessage`、`clearMessages` 等）进行，组件不直接操作数组。

**Zustand 而非 Redux 的原因**：不需要 reducer/action type 样板代码，`set()` 直接更新，代码量减少 60% 以上。

---

### `src/services/mockApi.ts` — Mock 服务层

两个导出：

```typescript
getAnswer(question: string): MockAnswer
// 关键词匹配 → 返回对应的 scripted 答案（content + citations[]）
// 无匹配时返回 FALLBACK_ANSWER

delay(ms: number): Promise<void>
// 包装 setTimeout，用于模拟网络延迟
```

**演示期存在的意义**：让 `useChat.ts` 的调用姿势与真实 `api.ts` 保持一致（`await getAnswer()`），未来只需换掉这层即可接入后端，不改 hooks 和组件。

---

### `src/data/` — 写死演示数据

| 文件 | 内容 |
|------|------|
| `documents.ts` | 3 个初始文档对象（RAG白皮书、产品规格书、用户研究报告），直接注入 store |
| `scripted-qa.ts` | 4 组问答对，每组含 `keywords[]`（关键词匹配触发条件）、`content`（Markdown 回答正文）、`citations[]`（引用列表）；另有兜底 `FALLBACK_ANSWER` |

**4 组问答覆盖的演示场景**：
1. RAG 原理 / 架构（触发词：rag、检索、原理）
2. 文档内容简介（触发词：讲了什么、主要内容）
3. 核心观点提炼（触发词：核心观点、总结）
4. 关键数据汇总（触发词：关键数据、数字、指标）

---

### `src/hooks/` — Controller 层

#### `useChat.ts`

核心流程：

```
用户调用 sendMessage(content)
  → 写入用户消息到 store
  → setIsThinking(true) + await delay(2000)   ← 模拟思考
  → getAnswer(content) 匹配答案
  → 写入空白助手消息占位
  → setInterval(25ms) 逐字符打印                ← 模拟流式输出
     · 每 tick 推进 1-3 个字符（随机，更自然）
     · 打印完毕后一次性附加 citations
  → setIsStreaming(false)
```

`stop()` 通过 `abortedRef.current = true` + `clearInterval` 实现中断，是标准的 React ref 中断模式（不需要 AbortController）。

#### `useDocuments.ts`

```
用户调用 handleUpload(file)
  → 创建 Document 对象，status = 'indexing'
  → 立即写入 store（左栏立刻出现，显示"索引中..."动画）
  → setTimeout(2000) 后 updateDocument(id, { status: 'ready' })
  → 使用 timersRef 跟踪所有 timer，组件卸载时清理（防内存泄漏）
```

---

### `src/components/chat/` — 业务组件

| 组件 | 位置 | 职责 |
|------|------|------|
| `ChatHeader` | 中栏顶部 | 标题栏 + 新建对话/清空/切换主题按钮 |
| `ChatViewport` | 中栏主体 | 消息流滚动容器，空状态展示引导示例问题 |
| `ChatMessage` | 消息气泡 | 渲染单条消息；内嵌 `react-markdown`，把 `[N]` 替换成可点击的 `<CitationMark>`；流式状态显示打字光标 |
| `ChatInput` | 中栏底部 | 自适应高度 textarea，Enter 发送 / Shift+Enter 换行，生成中变成停止按钮 |
| `DocumentList` | 左栏 | 文档列表，显示索引状态、文件大小、上传时间；右键菜单支持删除 |
| `DocumentUpload` | 左栏上部 | 文件选择触发区，接受 PDF/DOCX/MD |
| `CitationPanel` | 右栏 | 显示最新一条助手消息的 citations；激活项高亮（橙色边框 + 阴影）并自动滚动到可视区 |

**`ChatMessage` 中 `[N]` 的渲染机制**（这是最复杂的部分）：

```
Markdown 字符串 "RAG 是... [1][2]"
  → react-markdown 解析
  → 自定义 p / li 渲染器拦截字符串子节点
  → renderTextWithCitations() 用正则 /(\[\d+\])/g 切分
  → 数字部分替换为 <CitationMark onClick={() => setActiveCitationIndex(N)} />
  → CitationMark 渲染成蓝色上标 sup，可点击/可键盘访问
```

---

### `src/components/ui/` — 通用 UI 原语

由 shadcn CLI 生成，源码在仓库内可改：

| 组件 | 来自 | 用途 |
|------|------|------|
| `button.tsx` | Radix Slot | 按钮，支持 variant/size 变体 |
| `textarea.tsx` | HTML | 受控文本域（ChatInput 内部用） |
| `scroll-area.tsx` | Radix ScrollArea | 自定义滚动条的滚动容器 |
| `tooltip.tsx` | Radix Tooltip | Header 按钮的悬浮提示 |
| `avatar.tsx` | Radix Avatar | 头像（暂备用） |
| `progress.tsx` | Radix Progress | 进度条（暂备用） |

---

### `src/lib/utils.ts` — `cn()` 工具函数

```typescript
cn(...inputs) = twMerge(clsx(...inputs))
```

作用：将任意条件化的 Tailwind class 安全合并，解决 `px-4 px-6` 这类冲突（tailwind-merge 会保留后者）。全项目几乎每个组件都在用。

---

### `src/App.tsx` — 三栏布局容器

```
<div class="flex h-screen w-screen">
  ├── 左栏 260px   <DocumentList>
  ├── 中栏 flex-1  <ChatHeader> + <ChatViewport> + <ChatInput>
  └── 右栏 320px   <CitationPanel>
</div>
```

`App.tsx` 是唯一连接所有 hooks 和 store 的地方：

- 从 `useAppStore` 取 theme / activeCitationIndex 等
- 从 `useChat` 取 messages / isThinking / isStreaming / sendMessage / stop
- 从 `useDocuments` 取 documents / addDocument / removeDocument
- 把数据和回调以 props 形式下发给子组件

**一个重要计算**：`citations` 从消息列表中动态提取（取最后一条完成的 assistant 消息的 citations），用 `useMemo` 缓存。

---

## 五、核心数据流图

```
用户输入问题 → handleSend()
                │
                ▼
          useChat.sendMessage()
                │
        ┌───────┴───────┐
        │               │
   addMessage        delay(2000)
   (user msg)        isThinking=true
        │               │
        │         getAnswer(question)   ← mockApi + scripted-qa
        │               │
        │         addMessage(assistant placeholder, content='')
        │               │
        │         setInterval(25ms) 逐字更新 content
        │               │
        │         打字完毕 → updateMessage(citations)
        │               │
        └───────────────┘
                │；k
          appStore.messages[] 更新
                │
          React 重渲染 ChatViewport
                │
          用户点击 [N]
                │
          setActiveCitationIndex(N)   ← appStore
                │
          CitationPanel 检测到 activeCitationIndex 变化
                │
          scrollIntoView(平滑滚动到对应引用卡片)
```

---

## 六、主题切换机制

```typescript
// App.tsx
useEffect(() => {
  theme === 'dark'
    ? document.documentElement.classList.add('dark')
    : document.documentElement.classList.remove('dark')
}, [theme])
```

Tailwind v4 的 `dark:` 前缀依赖 `<html>` 标签上的 `dark` class，所以只需动态添加/移除该 class，所有组件的深色样式自动生效。

---

## 七、与真实后端对接时需要替换的部分

| 当前 mock | 真实替换目标 |
|-----------|-------------|
| `services/mockApi.ts` → `getAnswer()` | `services/api.ts` → HTTP POST `/chat` |
| `delay(2000)` 思考模拟 | 等待服务器首字节（TTFT） |
| `setInterval` 逐字打印 | WebSocket / SSE 流式接收 chunk |
| `useDocuments.ts` 的 `setTimeout` | 轮询或 WebSocket 监听索引状态 |
| `data/documents.ts` 初始数据 | GET `/documents` 接口 |
## 八、快速上手

```bash
# 安装依赖
npm install

# 启动开发服务器（默认 http://localhost:5173）
npm run dev

# 构建生产产物
npm run build
```

演示脚本提示词（效果最佳）：
- `"这几篇文档讲了什么？"` → 触发三文档概述回答
- `"RAG 是怎么工作的？"` → 触发架构原理回答
- `"有哪些关键数据？"` → 触发数据汇总表格回答
- `"核心观点是什么？"` → 触发跨文档总结回答
