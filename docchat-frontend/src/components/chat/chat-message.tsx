import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Citation } from "@/types";

// ============ 类型定义 ============

export interface ChatMessageProps {
  /** 消息角色 */
  role: "user" | "assistant";
  /** 消息内容,支持 Markdown 语法和 [1][2] 形式的引用标记 */
  content: string;
  /** 引用列表(仅 assistant 消息会用到) */
  citations?: Citation[];
  /** 是否处于流式生成状态(末尾显示打字光标,隐藏操作栏) */
  isStreaming?: boolean;
  /** 点击 [N] 引用上标时触发,N 是 citation 的 index */
  onCitationClick?: (index: number) => void;
}

// ============ 引用上标:把 [N] 渲染成可点击的蓝色徽标 ============

interface CitationMarkProps {
  index: number;
  onClick?: () => void;
}

function CitationMark({ index, onClick }: CitationMarkProps) {
  return (
    <sup
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={cn(
        "mx-0.5 inline-flex items-center justify-center rounded px-1 text-[10px] font-bold cursor-pointer select-none",
        "bg-primary/10 text-primary hover:bg-primary/20 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
      )}
      aria-label={`查看引用 ${index}`}
    >
      {index}
    </sup>
  );
}

// ============ 把字符串中的 [N] 替换为 <CitationMark /> ============

function renderTextWithCitations(
  text: string,
  onCitationClick?: (index: number) => void
): React.ReactNode[] {
  // 同时切分并捕获 [数字]
  const parts = text.split(/(\[\d+\])/g);
  return parts.map((part, i) => {
    const match = part.match(/^\[(\d+)\]$/);
    if (match) {
      const index = parseInt(match[1], 10);
      return (
        <CitationMark
          key={i}
          index={index}
          onClick={() => onCitationClick?.(index)}
        />
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

// ============ ChatMessage 主组件 ============

export function ChatMessage({
  role,
  content,
  citations,
  isStreaming = false,
  onCitationClick,
}: ChatMessageProps) {
  const isUser = role === "user";
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API 在某些环境下不可用,静默失败
    }
  };

  return (
    <div
      className={cn(
        "group flex w-full",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "flex max-w-[85%] flex-col gap-1.5",
          isUser ? "items-end" : "items-start"
        )}
      >
        {/* 气泡本体 */}
        <div
          className={cn(
            "rounded-2xl px-4 py-3 text-[15px] leading-[1.7]",
            isUser
              ? "bg-secondary text-secondary-foreground"
              : "bg-transparent text-foreground"
          )}
        >
          <div className="prose prose-sm dark:prose-invert max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={{
                // 段落:把字符串子节点中的 [N] 替换成引用上标
                p: ({ children }) => (
                  <p>
                    {React.Children.map(children, (child) =>
                      typeof child === "string"
                        ? renderTextWithCitations(child, onCitationClick)
                        : child
                    )}
                  </p>
                ),
                // 列表项:同样处理 [N]
                li: ({ children }) => (
                  <li>
                    {React.Children.map(children, (child) =>
                      typeof child === "string"
                        ? renderTextWithCitations(child, onCitationClick)
                        : child
                    )}
                  </li>
                ),
                // 行内代码 (react-markdown v9: 通过 className 有无 language- 前缀区分行内 vs 块)
                code: ({ children, className, ...rest }) => {
                  const isBlock = /language-/.test(className || "");
                  return isBlock ? (
                    <code className={className} {...rest}>
                      {children}
                    </code>
                  ) : (
                    <code
                      className={cn(
                        "rounded bg-muted px-1.5 py-0.5 text-[13px] font-mono",
                        className
                      )}
                      {...rest}
                    >
                      {children}
                    </code>
                  );
                },
                // 代码块外壳
                pre: ({ children }) => (
                  <pre className="my-3 overflow-x-auto rounded-md bg-muted p-3 text-[13px]">
                    {children}
                  </pre>
                ),
                // 链接默认在新标签打开
                a: ({ children, href }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    {children}
                  </a>
                ),
              }}
            >
              {content}
            </ReactMarkdown>

            {/* 流式打字光标 */}
            {isStreaming && (
              <span
                className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-pulse bg-foreground/70 align-middle"
                aria-hidden="true"
              />
            )}
          </div>
        </div>

        {/* 引用来源 chip 列表(仅助手消息且有引用时显示) */}
        {!isUser && citations && citations.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-1">
            {citations.map((c) => (
              <button
                key={c.index}
                type="button"
                onClick={() => onCitationClick?.(c.index)}
                className={cn(
                  "inline-flex max-w-[280px] items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground",
                  "transition-colors hover:bg-muted/80 hover:text-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                )}
                aria-label={`引用 ${c.index}: ${c.docName}`}
              >
                <span className="font-mono font-semibold">[{c.index}]</span>
                <span className="truncate">{c.docName}</span>
                {typeof c.page === "number" && (
                  <span className="shrink-0 opacity-70">· p.{c.page}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* 操作栏(仅助手消息且非流式状态) */}
        {!isUser && !isStreaming && (
          <div
            className={cn(
              "flex items-center gap-1 px-1 transition-opacity",
              "opacity-0 group-hover:opacity-100 focus-within:opacity-100"
            )}
          >
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCopy}
              aria-label={copied ? "已复制" : "复制回答"}
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
