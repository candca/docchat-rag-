import { useEffect, useRef } from "react";
import { Quote, ExternalLink, Hash, FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Citation } from "@/types";

export interface CitationPanelProps {
  /** 全部引用列表 */
  citations?: Citation[];
  /** 当前激活的引用索引(对应 Citation.index) */
  activeCitationIndex?: number | null;
  /** 关闭面板回调(移动端/窄屏用) */
  onClose?: () => void;
  /** 跳转到原文位置 */
  onJumpToSource?: (citation: Citation) => void;
  /** 外层样式 */
  className?: string;
}

// ============================================================================
// 组件
// ============================================================================

export function CitationPanel({
  citations = [],
  activeCitationIndex,
  onClose,
  onJumpToSource,
  className,
}: CitationPanelProps) {
  const itemRefs = useRef<Map<number, HTMLLIElement>>(new Map());

  // 监听激活索引变化,执行平滑滚动
  useEffect(() => {
    if (typeof activeCitationIndex !== "number") return;
    const el = itemRefs.current.get(activeCitationIndex);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeCitationIndex]);

  return (
    <aside className={cn("flex h-full w-full flex-col bg-background border-l border-border", className)}>
      {/* 顶部标题栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Quote className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2.5} />
          <h2 className="text-[12px] font-bold tracking-wider text-foreground uppercase">
            引用来源
          </h2>
          {citations.length > 0 && (
            <span className="inline-flex items-center justify-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
              {citations.length}
            </span>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto">
        {citations.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="px-3 py-4 space-y-3">
            {citations.map((cite) => {
              const isActive = cite.index === activeCitationIndex;
              return (
                <li
                  key={cite.index}
                  ref={(el) => {
                    if (el) itemRefs.current.set(cite.index, el);
                    else itemRefs.current.delete(cite.index);
                  }}
                  className={cn(
                    "group relative rounded-xl border p-4 transition-all duration-300 ease-in-out",
                    isActive
                      ? "border-amber-500/50 bg-amber-500/5 shadow-[0_0_15px_-5px_rgba(245,158,11,0.2)]"
                      : "border-border bg-card hover:border-muted-foreground/30 hover:bg-accent/5"
                  )}
                >
                  {/* 顶部:序号 + 文档名 */}
                  <div className="flex items-start gap-3 mb-3">
                    <div
                      className={cn(
                        "shrink-0 flex h-6 min-w-[24px] px-1.5 items-center justify-center rounded-md",
                        "text-[11px] font-bold tabular-nums transition-colors",
                        isActive
                          ? "bg-amber-500 text-white"
                          : "bg-muted text-muted-foreground group-hover:bg-muted-foreground/20"
                      )}
                    >
                      {cite.index}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate text-[13px] font-semibold text-foreground">
                          {cite.docName}
                        </span>
                      </div>
                      
                      {/* 页码标记 */}
                      {cite.page && (
                        <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground/80">
                          <Hash className="h-2.5 w-2.5" />
                          <span className="tabular-nums">第 {cite.page} 页</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 原文片段 (Snippet) */}
                  {cite.snippet && (
                    <blockquote
                      className={cn(
                        "relative mt-2 rounded-lg border-l-2 py-2 px-3",
                        "text-[13px] leading-relaxed",
                        isActive
                          ? "border-amber-500 bg-background/50 text-foreground"
                          : "border-border bg-muted/30 text-muted-foreground group-hover:text-foreground/90"
                      )}
                    >
                      {cite.snippet}
                    </blockquote>
                  )}

                  {/* 底部交互 */}
                  <div
                    className={cn(
                      "mt-3 flex justify-end transition-opacity duration-200",
                      isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onJumpToSource?.(cite)}
                      className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    >
                      查看原文
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 底部提示 */}
      {citations.length > 0 && (
        <div className="border-t border-border bg-muted/10 px-4 py-3">
          <p className="text-[11px] leading-relaxed text-muted-foreground/70">
            点击对话中的{" "}
            <kbd className="pointer-events-none inline-flex h-4 select-none items-center gap-1 rounded border border-border bg-muted px-1 font-mono text-[10px] font-medium opacity-100">
              [N]
            </kbd>{" "}
            可快速在此定位溯源码片段。
          </p>
        </div>
      )}
    </aside>
  );
}

// ============================================================================
// 空状态 (对齐整体视觉)
// ============================================================================

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 py-20 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground/40">
        <Quote className="h-6 w-6" strokeWidth={1.5} />
      </div>
      <p className="text-sm font-semibold text-foreground">暂无引用</p>
      <p className="mt-2 text-[12px] leading-normal text-muted-foreground">
        AI 生成的回答若包含文档依据，
        <br />
        点击标注序号即可在此查看原文。
      </p>
    </div>
  );
}