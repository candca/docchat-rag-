import { useEffect, useMemo, useRef, useState } from "react";
import { Quote, ExternalLink, Hash, FileText, X, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Citation } from "@/types";
import {
  getDocumentContent,
  getDocumentFileUrl,
  getPdfPageImageUrl,
  getPdfPagePreview,
  type PdfPagePreviewResponse,
} from "@/services/api";

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
  const [sourceView, setSourceView] = useState<{
    citation: Citation;
    content?: string;
    fileUrl: string;
    filename: string;
    mode: "pdf" | "text";
    pdfPreview?: PdfPagePreviewResponse;
    pdfImageUrl?: string;
  } | null>(null);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);

  const handleViewSource = async (citation: Citation) => {
    onJumpToSource?.(citation);
    setSourceError(null);
    setSourceLoading(true);
    try {
      const isPdf = citation.docName.toLowerCase().endsWith(".pdf");
      if (isPdf) {
        let pdfPreview: PdfPagePreviewResponse | undefined;
        try {
          pdfPreview = await getPdfPagePreview(citation.docName, citation.page, citation.snippet);
        } catch {
          pdfPreview = undefined;
        }
        setSourceView({
          citation,
          fileUrl: getDocumentFileUrl(citation.docName),
          filename: citation.docName,
          mode: "pdf",
          pdfPreview,
          pdfImageUrl: pdfPreview ? getPdfPageImageUrl(citation.docName, pdfPreview.page) : undefined,
        });
        return;
      }

      const data = await getDocumentContent(citation.docName);
      setSourceView({
        citation,
        content: data.content,
        fileUrl: getDocumentFileUrl(data.filename),
        filename: data.filename,
        mode: "text",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "原文加载失败";
      setSourceError(message);
    } finally {
      setSourceLoading(false);
    }
  };

  // 监听激活索引变化,执行平滑滚动
  useEffect(() => {
    if (typeof activeCitationIndex !== "number") return;
    const el = itemRefs.current.get(activeCitationIndex);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeCitationIndex]);

  return (
    <aside className={cn("relative flex h-full w-full flex-col bg-background border-l border-border", className)}>
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
                      onClick={() => handleViewSource(cite)}
                      className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    >
                      {sourceLoading ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <ExternalLink className="h-3 w-3" />
                      )}
                      查看原文
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

      {sourceError && (
        <div className="border-t border-destructive/20 bg-destructive/5 px-4 py-3 text-[12px] text-destructive">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5" />
            <span>{sourceError}</span>
          </div>
        </div>
      )}

      {sourceView && (
        <SourceDrawer
          filename={sourceView.filename}
          content={sourceView.content}
          fileUrl={sourceView.fileUrl}
          mode={sourceView.mode}
          pdfPreview={sourceView.pdfPreview}
          pdfImageUrl={sourceView.pdfImageUrl}
          snippet={sourceView.citation.snippet}
          page={sourceView.citation.page}
          onClose={() => setSourceView(null)}
        />
      )}
    </aside>
  );
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function compactTextWithMap(text: string) {
  const chars: string[] = [];
  const map: number[] = [];
  for (let idx = 0; idx < text.length; idx += 1) {
    const char = text[idx];
    if (/\s/.test(char)) continue;
    chars.push(char.toLowerCase());
    map.push(idx);
  }
  return { compact: chars.join(""), map };
}

function findSnippetRange(content: string, snippet?: string) {
  if (!snippet) return null;

  const exactIdx = content.indexOf(snippet);
  if (exactIdx !== -1) {
    return { start: exactIdx, end: exactIdx + snippet.length };
  }

  const lowerContent = content.toLowerCase();
  const lowerSnippet = snippet.toLowerCase();
  const lowerIdx = lowerContent.indexOf(lowerSnippet);
  if (lowerIdx !== -1) {
    return { start: lowerIdx, end: lowerIdx + snippet.length };
  }

  const source = compactTextWithMap(content);
  const target = compactTextWithMap(snippet);
  if (!target.compact) return null;

  const compactIdx = source.compact.indexOf(target.compact);
  if (compactIdx === -1) return null;

  const start = source.map[compactIdx];
  const end = source.map[compactIdx + target.compact.length - 1] + 1;
  return { start, end };
}

function getPdfSearchTerm(snippet?: string) {
  if (!snippet) return "";
  const normalized = normalizeText(snippet)
    .replace(/^#+\s*Page\s+\d+\s*/i, "")
    .replace(/[<>{}[\]\\^`|]/g, " ")
    .trim();

  const sentence =
    normalized.match(/[A-Za-z0-9][^.!?。！？]{24,140}[.!?。！？]?/)?.[0] ??
    normalized;

  return sentence
    .split(/\s+/)
    .slice(0, 18)
    .join(" ")
    .slice(0, 120)
    .trim();
}

function withPdfFragment(fileUrl: string, snippet?: string, page?: number) {
  const params: string[] = [];
  if (typeof page === "number" && page > 0) {
    params.push(`page=${page}`);
  }

  const searchTerm = getPdfSearchTerm(snippet);
  if (searchTerm) {
    params.push(`search=${encodeURIComponent(searchTerm)}`);
  }

  return params.length > 0 ? `${fileUrl}#${params.join("&")}` : fileUrl;
}

function SourceDrawer({
  filename,
  content,
  fileUrl,
  mode,
  pdfPreview,
  pdfImageUrl,
  snippet,
  page,
  onClose,
}: {
  filename: string;
  content?: string;
  fileUrl: string;
  mode: "pdf" | "text";
  pdfPreview?: PdfPagePreviewResponse;
  pdfImageUrl?: string;
  snippet?: string;
  page?: number;
  onClose: () => void;
}) {
  const highlightRef = useRef<HTMLElement | null>(null);
  const previewUrl = useMemo(() => {
    return mode === "pdf" ? withPdfFragment(fileUrl, snippet, page) : fileUrl;
  }, [fileUrl, mode, page, snippet]);

  const parts = useMemo(() => {
    const sourceContent = content ?? "";
    if (!snippet) return [{ text: sourceContent, match: false }];

    const range = findSnippetRange(sourceContent, snippet);
    if (!range) return [{ text: sourceContent, match: false }];

    return [
      { text: sourceContent.slice(0, range.start), match: false },
      { text: sourceContent.slice(range.start, range.end), match: true },
      { text: sourceContent.slice(range.end), match: false },
    ];
  }, [content, mode, snippet]);

  const scrollToHighlight = () => {
    highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    highlightRef.current?.animate(
      [
        { outlineColor: "rgba(245, 158, 11, 0)", outlineWidth: "0px" },
        { outlineColor: "rgba(245, 158, 11, 0.9)", outlineWidth: "3px" },
        { outlineColor: "rgba(245, 158, 11, 0)", outlineWidth: "0px" },
      ],
      { duration: 900, easing: "ease-out" },
    );
  };

  useEffect(() => {
    if (!parts.some((part) => part.match)) return;
    window.setTimeout(scrollToHighlight, 120);
  }, [parts]);

  const handleSnippetClick = () => {
    if (mode === "pdf") {
      document.getElementById("pdf-highlight-page")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    scrollToHighlight();
  };

  const renderedText = (
    <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-7 text-foreground">
      {parts.map((part, idx) =>
        part.match ? (
          <mark
            key={idx}
            ref={highlightRef}
            className="rounded bg-amber-400/45 px-0.5 text-foreground ring-1 ring-amber-500/50"
          >
            {part.text}
          </mark>
        ) : (
          <span key={idx}>{part.text}</span>
        ),
      )}
    </pre>
  );

  return (
    <div className="absolute bottom-0 right-0 top-0 z-30 flex w-screen max-w-[calc(100vw-1rem)] flex-col border-l border-border bg-background shadow-2xl sm:w-[min(78vw,1040px)] lg:max-w-[calc(100vw-260px)]">
      <div className="flex h-14 items-center justify-between border-b border-border px-4">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {mode === "pdf" ? "原始 PDF" : "原文"}
          </p>
          <h3 className="truncate text-sm font-semibold text-foreground">{filename}</h3>
        </div>
        <div className="flex items-center gap-1">
          <a
            href={previewUrl}
            target="_blank"
            rel="noreferrer"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            aria-label="新窗口打开原文"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            aria-label="关闭原文"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {snippet && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-3 shadow-[inset_0_-1px_0_rgba(245,158,11,0.15)]">
          <div className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
            <Quote className="h-3.5 w-3.5" />
            最相关片段
            {mode === "pdf" && page && (
              <span className="rounded bg-background/70 px-1.5 py-0.5 font-mono text-[10px] tracking-normal text-muted-foreground">
                Page {page}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleSnippetClick}
            className="block h-24 w-full overflow-y-auto whitespace-pre-wrap rounded-md border border-amber-500/30 bg-amber-300/45 px-2.5 py-2 text-left text-[12px] leading-5 text-foreground shadow-sm transition-colors hover:bg-amber-300/60 focus:outline-none focus:ring-2 focus:ring-amber-500/70 dark:bg-amber-400/25 dark:hover:bg-amber-400/35"
            title={mode === "pdf" ? "点击重新加载 PDF 的页码/搜索定位" : "点击定位原文中的相关片段"}
          >
            {snippet}
          </button>
        </div>
      )}

      {mode === "pdf" ? (
        <PdfPageView
          filename={filename}
          imageUrl={pdfImageUrl}
          preview={pdfPreview}
          fallbackUrl={previewUrl}
        />
      ) : (
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {renderedText}
        </div>
      )}
    </div>
  );
}

function PdfPageView({
  filename,
  imageUrl,
  preview,
  fallbackUrl,
}: {
  filename: string;
  imageUrl?: string;
  preview?: PdfPagePreviewResponse;
  fallbackUrl: string;
}) {
  if (!imageUrl || !preview) {
    return (
      <iframe
        title={`原始 PDF: ${filename}`}
        src={fallbackUrl}
        className="h-full min-h-0 flex-1 border-0 bg-muted"
      />
    );
  }

  const highlightBox = preview.boxes.length > 0
    ? preview.boxes.reduce(
        (acc, box) => [
          Math.min(acc[0], box[0]),
          Math.min(acc[1], box[1]),
          Math.max(acc[2], box[2]),
          Math.max(acc[3], box[3]),
        ],
        [...preview.boxes[0]],
      )
    : null;

  return (
    <div className="flex-1 overflow-auto bg-muted px-6 py-5">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-3 flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="font-medium tabular-nums">
            Page {preview.page} / {preview.page_count}
          </span>
          {highlightBox ? (
            <span>已高亮相关片段</span>
          ) : (
            <span>未能精确匹配片段，已定位到页面</span>
          )}
        </div>
        <div
          id="pdf-highlight-page"
          className="relative overflow-hidden rounded-md border border-border bg-background shadow-sm"
          style={{ aspectRatio: `${preview.width} / ${preview.height}` }}
        >
          <img
            src={imageUrl}
            alt={`${filename} page ${preview.page}`}
            className="absolute inset-0 h-full w-full object-contain"
          />
          {highlightBox && (() => {
            const [x0, y0, x1, y1] = highlightBox;
            return (
              <div
                className="pointer-events-none absolute rounded-md bg-amber-300/35 ring-2 ring-amber-500/75 shadow-[0_0_0_9999px_rgba(0,0,0,0.08)]"
                style={{
                  left: `${(x0 / preview.width) * 100}%`,
                  top: `${((preview.height - y1) / preview.height) * 100}%`,
                  width: `${((x1 - x0) / preview.width) * 100}%`,
                  height: `${((y1 - y0) / preview.height) * 100}%`,
                }}
              />
            );
          })()}
        </div>
      </div>
    </div>
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
