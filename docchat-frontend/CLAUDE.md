# DocChat 前端项目

我（成员 A）负责的前端原型。目标：做出可交互的高保真聊天界面，所有数据用 mock，支撑第二周答辩现场演示。

详细需求见 [`../DocChat_Week2_作战手册.md`](../DocChat_Week2_作战手册.md) 中"成员 A（前端）"章节。

## 技术栈

React 19 + TypeScript + Vite 7 + Tailwind CSS v4 + shadcn/ui（Radix UI）+ Zustand + react-markdown

（与参考项目 `D:\docchat\rag-chatbot\frontend\` 大体对齐；mock 阶段不引入 axios / websocket）

## 关键决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 状态管理 | **Zustand** 单 store | 跨栏联动（中栏点引用 → 右栏高亮）需要共享状态；和答辩 Q2 话术一致 |
| UI 组件 | **shadcn CLI** 接入 | 与参考项目目录一致，组件源码在仓库内可改 |
| 页面数量 | **只做主聊天页** | 演示剧本仅用单页；线框图里的"登录/文档管理"页只在 PPT 上呈现 |

## 三栏布局核心交互

- 左栏：文档列表 + 上传按钮（兼任"文档管理"职责）
- 中栏：聊天界面（消息气泡 + 输入框）
- 右栏：引用来源面板

关键 mock 交互：
- 上传文档 → 假 loading 2 秒 → 列表多出一项
- 输入问题 → 假思考 2 秒 → 流式打字显示回答（带 `[1][2]` 引用）
- 点击 `[1]` → 右栏高亮对应原文

## 项目目录结构

```
docchat-frontend/
├── src/
│   ├── main.tsx
│   ├── App.tsx                       # 三栏布局容器
│   ├── index.css                     # Tailwind 全局
│   │
│   ├── components/
│   │   ├── chat/                     # 业务组件
│   │   │   ├── chat-header.tsx
│   │   │   ├── chat-viewport.tsx     # 消息流
│   │   │   ├── chat-message.tsx      # 单条气泡（含 [1][2] 引用渲染）
│   │   │   ├── chat-input.tsx
│   │   │   ├── document-list.tsx     # 左栏
│   │   │   ├── document-upload.tsx
│   │   │   └── citation-panel.tsx    # 右栏
│   │   └── ui/                       # shadcn 通用 UI（CLI 生成）
│   │
│   ├── hooks/                        # Controller
│   │   ├── useChat.ts                # 假流式回答
│   │   └── useDocuments.ts           # 假上传
│   │
│   ├── stores/
│   │   └── appStore.ts               # Zustand: messages / documents / activeCitation
│   │
│   ├── services/
│   │   └── mockApi.ts                # 假 API：思考 2 秒 + 流式打字
│   │
│   ├── data/                         # 演示用写死数据
│   │   ├── documents.ts              # 3 个假文档
│   │   └── scripted-qa.ts            # 演示问答对
│   │
│   ├── lib/
│   │   └── utils.ts                  # cn() 等
│   │
│   └── types/
│       └── index.ts                  # Message / Document / Citation
```

| 内容 | 位置 |
|------|------|
| 业务组件 | `src/components/chat/` |
| 通用 UI 组件 | `src/components/ui/` |
| 业务 Hook | `src/hooks/` |
| 全局状态 | `src/stores/` |
| Mock API | `src/services/` |
| 写死数据 | `src/data/` |
| 工具函数 | `src/lib/` |
| 类型定义 | `src/types/` |

## MVC 拆解（对应作战手册 Q2 答辩话术）

- **Model**：`services/mockApi.ts`（演示期 mock，未来对应真实 `api.ts`）+ `stores/appStore.ts`（Zustand 全局状态）
- **View**：纯展示组件 `<ChatViewport>`、`<DocumentList>`、`<CitationPanel>`、`<ChatMessage>`
- **Controller**：`hooks/useChat.ts`、`hooks/useDocuments.ts`，协调 Model 与 View

## 工作日志维护约定

- 所有实质性进展记录在 [`doc/worklog.md`](doc/worklog.md)
- 每次完成一项有意义的任务（建文件 / 做决策 / 完成组件 / 修 bug 等）后追加一条
- 格式见日志文件开头；状态用 ✅ / 🔄 / ⏸ / ❌
- `doc/` 目录专放项目过程文档，未来可加设计稿、调试记录等

## 当前阶段（演示原型）注意事项

- 数据全部 mock，**不连后端**
- 准备 2-3 个写死的"演示问答对"，让现场演示讲一个故事
- 上传/思考的 loading 用 `setTimeout` 模拟即可
- 流式输出可用 `setInterval` 一字一字打出
- 截图要在浏览器最大化、隐藏书签栏，方便给 PPT 用（P6 高保真原型页）

## 参考项目前端文件清单

参考路径：`D:\docchat\rag-chatbot\frontend\`，遇到不确定的命名/写法可对照查阅。

### 构建/配置（项目根）
- `package.json`、`yarn.lock`、`vite.config.ts`
- `tsconfig.json`、`tsconfig.app.json`、`tsconfig.node.json`
- `eslint.config.js`、`knip.json`、`index.html`、`README.md`

### 入口与全局样式（`src/`）
- `main.tsx` — React 入口
- `App.tsx` — 根组件
- `index.css` — Tailwind v4 全局样式

### 业务组件（`src/components/chat/`）
- `chat-header.tsx`、`chat-input.tsx`、`chat-message.tsx`、`chat-viewport.tsx`、`document-upload.tsx`、`mode-toggle.tsx`、`index.ts`

### UI 基础组件（`src/components/ui/`）
- `avatar.tsx`、`button.tsx`、`progress.tsx`、`scroll-area.tsx`、`textarea.tsx`、`tooltip.tsx`

### Hooks（`src/hooks/`）
- `useChat.ts`、`useDocuments.ts`

### 服务层（`src/services/`）
- `api.ts`（axios HTTP）、`websocket.ts`（流式对话）

### 工具与资源
- `src/lib/utils.ts`、`src/assets/`、`public/`
