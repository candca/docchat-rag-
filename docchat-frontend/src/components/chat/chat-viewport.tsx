import { useEffect, useRef, useCallback } from "react";
import { Sparkles } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Message } from "@/types";
import { ChatMessage } from "./chat-message";

// ============ 类型定义 ============

export interface ChatViewportProps {
  messages: Message[];
  isThinking: boolean;
  onExampleClick: (question: string) => void;
  /** 点击消息中的 [N] 引用上标或引用 chip 时触发 */
  onCitationClick?: (index: number) => void;
}

// ============ 常量 ============

const EXAMPLE_QUESTIONS = [
  "这篇文档讲了什么?",
  "总结一下核心观点",
  "有哪些关键数据?",
  "作者的结论是什么?",
];

const EMPTY_TITLE = "开始与文档对话";
const EMPTY_SUBTITLE = "上传文档后,在下方输入框中提问";
const THINKING_TEXT = "DocChat 正在思考…";

// 距离底部多少 px 内算"贴近底部"——只有贴近底部时新消息才会自动滚动
const AUTO_SCROLL_THRESHOLD = 100;

// ============ 思考中指示器 ============

function ThinkingIndicator() {
  return (
    <div
      className="flex items-center gap-3 px-1 py-2 text-muted-foreground"
      role="status"
      aria-label="DocChat 正在思考"
    >
      <div className="flex items-center gap-1">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
      <span className="text-sm">{THINKING_TEXT}</span>
    </div>
  );
}

// ============ 空状态引导卡片 ============

interface EmptyStateProps {
  onExampleClick: (question: string) => void;
}

function EmptyState({ onExampleClick }: EmptyStateProps) {
  return (
    <div className="flex h-full min-h-[400px] flex-col items-center justify-center px-4 py-12 text-center">
      <Sparkles
        className="mb-4 h-12 w-12 text-muted-foreground/50"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <h2 className="text-lg font-semibold text-foreground">{EMPTY_TITLE}</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">{EMPTY_SUBTITLE}</p>

      <div className="mt-8 flex flex-wrap justify-center gap-2">
        {EXAMPLE_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onExampleClick(q)}
            className={cn(
              "rounded-full bg-secondary px-4 py-2 text-sm text-secondary-foreground",
              "transition-colors hover:bg-secondary/70",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            )}
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

// ============ ChatViewport 主组件 ============

export function ChatViewport({
  messages,
  isThinking,
  onExampleClick,
  onCitationClick,
}: ChatViewportProps) {
  // 用一个 wrapper ref 引用 ScrollArea 元素,挂载后再去找内部 viewport
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const bottomAnchorRef = useRef<HTMLDivElement | null>(null);

  // 组件挂载后,去 ScrollArea 内部找到真正可滚动的 viewport 元素
  // shadcn ScrollArea 内部 viewport 带有 data-slot="scroll-area-viewport" 属性
  // (旧版本 shadcn 是 data-radix-scroll-area-viewport,如果下面 selector 没生效请改成旧名)
  useEffect(() => {
    if (!scrollAreaRef.current) return;
    const viewport = scrollAreaRef.current.querySelector<HTMLDivElement>(
      "[data-slot='scroll-area-viewport'], [data-radix-scroll-area-viewport]"
    );
    viewportRef.current = viewport;
  }, []);

  // 判断当前是否贴近底部
  const isNearBottom = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return true;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    return distanceFromBottom <= AUTO_SCROLL_THRESHOLD;
  }, []);

  // messages 长度或 isThinking 变化时,如果用户贴近底部,就滚到底
  useEffect(() => {
    if (!isNearBottom()) return;
    bottomAnchorRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages.length, isThinking, isNearBottom]);

  const isEmpty = messages.length === 0 && !isThinking;

  return (
    <div className="flex-1 min-h-0 w-full">
      <ScrollArea ref={scrollAreaRef} className="h-full w-full">
        <div
          className="mx-auto w-full max-w-3xl px-6 py-6"
          aria-live="polite"
          aria-relevant="additions"
        >
          {isEmpty ? (
            <EmptyState onExampleClick={onExampleClick} />
          ) : (
            <div className="flex flex-col gap-6">
              {messages.map((m) => (
                <ChatMessage
                  key={m.id}
                  role={m.role}
                  content={m.content}
                  citations={m.citations}
                  onCitationClick={onCitationClick}
                />
              ))}
              {isThinking && <ThinkingIndicator />}
            </div>
          )}

          {/* 底部锚点,用于 scrollIntoView */}
          <div ref={bottomAnchorRef} aria-hidden="true" />
        </div>
      </ScrollArea>
    </div>
  );
}
