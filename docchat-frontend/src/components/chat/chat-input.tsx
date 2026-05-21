import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { ArrowUp, Square, Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================================
// 类型
// ============================================================================

export interface ChatInputProps {
  /** 发送消息的回调 */
  onSend?: (content: string) => void;
  /** 是否正在生成回复(此时按钮变成"停止") */
  isGenerating?: boolean;
  /** 中断生成的回调 */
  onStop?: () => void;
  /** 当前选中的文档数(为 0 时输入框 disabled) */
  selectedDocCount?: number;
  /** placeholder */
  placeholder?: string;
  /** 最大字符数 */
  maxLength?: number;
}

// ============================================================================
// 组件
// ============================================================================

export function ChatInput({
  onSend,
  isGenerating = false,
  onStop,
  selectedDocCount = 0,
  placeholder = "向文档提问…(Shift + Enter 换行)",
  maxLength = 2000,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSend =
    value.trim().length > 0 && !isGenerating && selectedDocCount > 0;
  const isEmpty = selectedDocCount === 0;

  // 自适应高度:随内容增长,最大 200px
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [value]);

  const handleSend = () => {
    if (!canSend) return;
    onSend?.(value.trim());
    setValue("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter 发送,Shift+Enter 换行,IME 组合期不触发
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="w-full px-6 pb-6 pt-2">
      {/* 输入框容器 */}
      <div
        className={cn(
          "relative mx-auto max-w-3xl rounded-2xl border bg-background",
          "transition-all duration-200 ease-out",
          isFocused
            ? "border-ring shadow-md ring-4 ring-ring/5"
            : "border-border shadow-sm",
          isEmpty && "opacity-60"
        )}
      >
        {/* 文本输入区 */}
        <div className="flex items-end gap-2 px-4 pt-3.5 pb-2">
          {/* 附件按钮(占位 mock,点了不会真的上传) */}
          <button
            type="button"
            disabled={isEmpty || isGenerating}
            className={cn(
              "shrink-0 mb-1 flex h-8 w-8 items-center justify-center rounded-lg",
              "text-muted-foreground hover:text-foreground hover:bg-muted",
              "transition-colors duration-150",
              "disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground disabled:cursor-not-allowed"
            )}
            title="附加文件"
            aria-label="附加文件"
          >
            <Paperclip className="h-4 w-4" strokeWidth={2} />
          </button>

          {/* textarea */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value.slice(0, maxLength))}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            disabled={isEmpty}
            placeholder={isEmpty ? "请先选择一个文档…" : placeholder}
            rows={1}
            className={cn(
              "flex-1 resize-none bg-transparent",
              "text-[15px] leading-6 text-foreground",
              "placeholder:text-muted-foreground",
              "focus:outline-none",
              "disabled:cursor-not-allowed",
              "py-1"
            )}
            style={{ maxHeight: "200px" }}
          />

          {/* 发送 / 停止 按钮 */}
          <button
            type="button"
            onClick={isGenerating ? onStop : handleSend}
            disabled={!isGenerating && !canSend}
            className={cn(
              "shrink-0 mb-1 flex h-8 w-8 items-center justify-center rounded-lg",
              "transition-all duration-150",
              isGenerating
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : canSend
                ? "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95"
                : "bg-muted text-muted-foreground/50 cursor-not-allowed"
            )}
            aria-label={isGenerating ? "停止生成" : "发送"}
          >
            {isGenerating ? (
              <Square className="h-3 w-3 fill-current" strokeWidth={0} />
            ) : (
              <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
            )}
          </button>
        </div>

        {/* 底部状态栏:左侧提示,右侧字数 */}
        <div className="flex items-center justify-between px-4 pb-2.5 pt-0.5">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {isGenerating ? (
              <>
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-muted-foreground opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                </span>
                <span>正在思考…</span>
              </>
            ) : isEmpty ? (
              <span>请在左栏选择文档后开始提问</span>
            ) : (
              <span>
                <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
                  Enter
                </kbd>{" "}
                发送 ·{" "}
                <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
                  Shift+Enter
                </kbd>{" "}
                换行
              </span>
            )}
          </div>
          <div
            className={cn(
              "text-[11px] tabular-nums",
              value.length > maxLength * 0.9
                ? "text-amber-600"
                : "text-muted-foreground"
            )}
          >
            {value.length} / {maxLength}
          </div>
        </div>
      </div>

      {/* 底部声明(Claude.ai 风格) */}
      <p className="mt-3 text-center text-[11px] text-muted-foreground">
        DocChat 可能会犯错。请核对引用来源。
      </p>
    </div>
  );
}
