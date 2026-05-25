import { useState } from "react";
import {
  AlertCircle,
  Check,
  Database,
  Edit3,
  Eye,
  FileText,
  FileType2,
  ListTree,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Sparkles,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Document, KnowledgeBase } from "@/types";
import { DocumentUpload } from "./document-upload";
import { getDocumentFileUrlById } from "@/services/api";

export interface DocumentListProps {
  /** 当前文档列表 */
  documents: Document[];
  knowledgeBases?: KnowledgeBase[];
  activeKnowledgeBaseId?: string | null;
  /** 当前选中(active)的文档 id */
  activeDocId?: string | null;
  /** 已勾选用于本轮检索的文档 id 列表（多选） */
  selectedDocIds?: string[];
  /** 切换某个文档的勾选状态 */
  onToggleSelected?: (id: string) => void;
  /** 选择文档回调 */
  onSelect?: (id: string) => void;
  /** 删除文档回调 */
  onDelete?: (id: string) => void;
  onViewOriginal?: (id: string) => void;
  onRebuildDocument?: (id: string) => void;
  onCreateKnowledgeBase?: (name: string) => void;
  onRenameKnowledgeBase?: (id: string, name: string) => void;
  onDeleteKnowledgeBase?: (id: string) => void;
  onRebuildKnowledgeBase?: (id: string) => void;
  onSelectKnowledgeBase?: (id: string) => void;
  /** 新文档上传完成 */
  onUpload?: (file: File) => void;
  /** 为文档生成/重新生成摘要 */
  onGenerateSummary?: (id: string) => void;
  summarizingDocId?: string | null;
  /** 自定义外层样式 */
  className?: string;
}

// ============================================================================
// 工具函数
// ============================================================================

function formatSize(bytes?: number): string {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

function getFileIcon(type: Document["type"]) {
  return type === "pdf" ? FileType2 : FileText;
}

function getTypeStyles(type: Document["type"]) {
  // 采用透明度叠加方案,兼顾深色模式
  switch (type) {
    case "pdf":
      return "bg-red-500/10 text-red-600 dark:text-red-400";
    case "docx":
      return "bg-blue-500/10 text-blue-600 dark:text-blue-400";
    case "md":
      return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
    default:
      return "bg-muted text-muted-foreground";
  }
}

// ============================================================================
// 组件
// ============================================================================

export function DocumentList({
  documents = [],
  knowledgeBases = [],
  activeKnowledgeBaseId,
  activeDocId,
  selectedDocIds,
  onToggleSelected,
  onSelect,
  onDelete,
  onViewOriginal,
  onRebuildDocument,
  onCreateKnowledgeBase,
  onRenameKnowledgeBase,
  onDeleteKnowledgeBase,
  onRebuildKnowledgeBase,
  onSelectKnowledgeBase,
  onUpload,
  onGenerateSummary,
  summarizingDocId,
  className,
}: DocumentListProps) {
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [newKbName, setNewKbName] = useState("");
  const [editingKbId, setEditingKbId] = useState<string | null>(null);
  const [editingKbName, setEditingKbName] = useState("");
  const [sourceDoc, setSourceDoc] = useState<Document | null>(null);
  const selectedSet = new Set(selectedDocIds ?? []);
  const selectedCount = selectedSet.size;
  const readyCount = documents.filter((d) => d.status === "ready").length;
  const activeDocument = documents.find((doc) => doc.id === activeDocId);

  return (
    <aside className={cn("flex h-full w-full flex-col bg-muted/30 border-r border-border", className)}>
      <div className="border-b border-border px-3 py-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[12px] font-bold tracking-wider text-muted-foreground uppercase">知识库管理</h2>
          {activeKnowledgeBaseId && (
            <button
              type="button"
              onClick={() => onRebuildKnowledgeBase?.(activeKnowledgeBaseId)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              title="重建当前知识库索引"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <form
          className="mb-2 flex gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            const name = newKbName.trim();
            if (!name) return;
            onCreateKnowledgeBase?.(name);
            setNewKbName("");
          }}
        >
          <input
            value={newKbName}
            onChange={(event) => setNewKbName(event.target.value)}
            placeholder="新建知识库"
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-[12px] outline-none focus:border-primary"
          />
          <button
            type="submit"
            className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            title="新建知识库"
          >
            <Plus className="h-4 w-4" />
          </button>
        </form>

        <div className="max-h-36 space-y-1 overflow-y-auto">
          {knowledgeBases.map((kb) => {
            const active = kb.id === activeKnowledgeBaseId;
            const editing = editingKbId === kb.id;
            return (
              <div
                key={kb.id}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px]",
                  active ? "bg-background ring-1 ring-border" : "hover:bg-background/60",
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelectKnowledgeBase?.(kb.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <Database className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  {editing ? (
                    <input
                      value={editingKbName}
                      autoFocus
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => setEditingKbName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          onRenameKnowledgeBase?.(kb.id, editingKbName);
                          setEditingKbId(null);
                        }
                        if (event.key === "Escape") setEditingKbId(null);
                      }}
                      className="min-w-0 flex-1 rounded border border-border bg-background px-1 py-0.5 outline-none"
                    />
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-foreground">{kb.name}</span>
                  )}
                  <span className="tabular-nums text-muted-foreground">{kb.documentCount}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (editing) {
                      onRenameKnowledgeBase?.(kb.id, editingKbName);
                      setEditingKbId(null);
                    } else {
                      setEditingKbId(kb.id);
                      setEditingKbName(kb.name);
                    }
                  }}
                  className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="重命名"
                >
                  <Edit3 className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteKnowledgeBase?.(kb.id)}
                  className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  title="删除知识库"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-baseline gap-2">
          <h3 className="text-[12px] font-bold tracking-wider text-muted-foreground uppercase">文档</h3>
          <span className="text-[11px] tabular-nums text-muted-foreground/60">{documents.length}</span>
        </div>
        {readyCount > 0 && (
          <span className="text-[10px] tabular-nums text-muted-foreground/70">
            {selectedCount > 0 ? `已勾选 ${selectedCount}` : "全部检索"}
          </span>
        )}
      </div>

      {/* 上传区 */}
      <DocumentUpload onSelectFile={onUpload} />

      {/* 列表区 */}
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground/50">
              <FileText className="h-5 w-5" strokeWidth={1.5} />
            </div>
            <p className="text-[13px] font-medium text-foreground">暂无文档</p>
            <p className="mt-1 text-[11px] text-muted-foreground">上传 PDF 或 Markdown 开始聊天</p>
          </div>
        ) : (
          <ul className="space-y-1">
            {documents.map((doc) => {
              const Icon = getFileIcon(doc.type);
              const typeStyle = getTypeStyles(doc.type);
              const isActive = doc.id === activeDocId;
              const isMenuOpen = menuOpenId === doc.id;
              const isReady = doc.status === "ready";
              const isChecked = selectedSet.has(doc.id);

              return (
                <li key={doc.id} className="relative group">
                  <button
                    type="button"
                    disabled={!isReady}
                    onClick={() => onSelect?.(doc.id)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-lg p-2.5 text-left",
                      "transition-all duration-200 ease-in-out",
                      isActive
                        ? "bg-background shadow-sm ring-1 ring-border"
                        : "hover:bg-background/60",
                      !isReady && "opacity-70 cursor-default"
                    )}
                  >
                    {/* 勾选用于本轮检索 */}
                    <span
                      role="checkbox"
                      aria-checked={isChecked}
                      aria-label={`将 ${doc.name} 加入检索范围`}
                      tabIndex={isReady ? 0 : -1}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isReady) onToggleSelected?.(doc.id);
                      }}
                      onKeyDown={(e) => {
                        if ((e.key === "Enter" || e.key === " ") && isReady) {
                          e.preventDefault();
                          e.stopPropagation();
                          onToggleSelected?.(doc.id);
                        }
                      }}
                      className={cn(
                        "mt-1 shrink-0 flex h-4 w-4 items-center justify-center rounded border transition-colors",
                        isChecked
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/40 bg-background hover:border-foreground/60",
                        !isReady && "opacity-40 pointer-events-none"
                      )}
                    >
                      {isChecked && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>

                    {/* 文件图标容器 */}
                    <div className={cn(
                      "shrink-0 flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
                      typeStyle
                    )}>
                      <Icon className="h-5 w-5" strokeWidth={2} />
                    </div>

                    {/* 文件信息 */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className={cn(
                          "truncate text-[13px] leading-tight",
                          isActive ? "font-semibold text-foreground" : "text-foreground/80 group-hover:text-foreground"
                        )}>
                          {doc.name}
                        </p>
                        {isActive && isReady && (
                          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" strokeWidth={3} />
                        )}
                      </div>
                      
                      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground tabular-nums">
                        {doc.status === "error" ? (
                          <span className="flex items-center gap-1 text-destructive">
                            <AlertCircle className="h-3 w-3" />
                            解析失败
                          </span>
                        ) : doc.status === "indexing" ? (
                          <span className="flex items-center gap-1 text-primary">
                            <RefreshCw className="h-3 w-3 animate-spin" />
                            构建索引中
                          </span>
                        ) : (
                          <>
                            <span className="uppercase">{doc.type}</span>
                            <span className="opacity-40">·</span>
                            <span>{formatSize(doc.size)}</span>
                            <span className="opacity-40">·</span>
                            <span>{formatDate(doc.uploadedAt)}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* 更多按钮 (仅 ready 时显示) */}
                    {isReady && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenId(isMenuOpen ? null : doc.id);
                        }}
                        className={cn(
                          "shrink-0 -mr-1 flex h-7 w-7 items-center justify-center rounded-md",
                          "text-muted-foreground hover:bg-muted hover:text-foreground",
                          "opacity-0 group-hover:opacity-100 transition-opacity duration-200",
                          isMenuOpen && "opacity-100 bg-muted text-foreground"
                        )}
                        aria-label="更多操作"
                      >
                        <MoreHorizontal className="h-4 w-4" strokeWidth={2} />
                      </button>
                    )}
                  </button>

                  {/* 操作菜单 (Dropdown Mock) */}
                  {isMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setMenuOpenId(null)} />
                      <div className={cn(
                        "absolute right-2 top-11 z-20 w-36 overflow-hidden rounded-md border border-border bg-popover shadow-md animate-in fade-in zoom-in-95 duration-100",
                      )}>
                        <button
                          type="button"
                          onClick={() => {
                            onDelete?.(doc.id);
                            setMenuOpenId(null);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                          删除文档
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onRebuildDocument?.(doc.id);
                            setMenuOpenId(null);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-foreground hover:bg-muted transition-colors"
                        >
                          <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
                          重建索引
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onViewOriginal?.(doc.id);
                            setSourceDoc(doc);
                            setMenuOpenId(null);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-foreground hover:bg-muted transition-colors"
                        >
                          <Eye className="h-3.5 w-3.5" strokeWidth={2} />
                          查看原文
                        </button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {activeDocument && (
        <DocumentSummaryPanel
          document={activeDocument}
          onGenerateSummary={onGenerateSummary}
          isSummarizing={summarizingDocId === activeDocument.id}
        />
      )}

      {/* 底部容量统计 */}
      {documents.length > 0 && (
        <div className="border-t border-border bg-muted/20 px-4 py-3">
          <div className="flex justify-between items-center text-[11px] text-muted-foreground">
            <span>存储空间</span>
            <span className="tabular-nums">
              {formatSize(documents.reduce((sum, d) => sum + (d.size || 0), 0))}
            </span>
          </div>
        </div>
      )}

      {sourceDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-6 backdrop-blur-sm">
          <div className="flex h-[86vh] w-[78vw] flex-col overflow-hidden rounded-lg border border-border bg-background shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{sourceDoc.name}</p>
                <p className="text-[11px] text-muted-foreground">原文档预览</p>
              </div>
              <button
                type="button"
                onClick={() => setSourceDoc(null)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <iframe
              src={getDocumentFileUrlById(sourceDoc.id)}
              title={`原文档: ${sourceDoc.name}`}
              className="h-full w-full bg-white"
            />
          </div>
        </div>
      )}
    </aside>
  );
}

function hasSummaryContent(summary: Document["summary"]): boolean {
  if (!summary) return false;
  return Boolean(
    summary.one_sentence ||
    summary.detailed ||
    summary.keywords.length ||
    summary.outline.length ||
    summary.section_summaries.length,
  );
}

function DocumentSummaryPanel({
  document,
  onGenerateSummary,
  isSummarizing,
}: {
  document: Document;
  onGenerateSummary?: (id: string) => void;
  isSummarizing?: boolean;
}) {
  const summary = document.summary;
  const hasContent = hasSummaryContent(summary);

  return (
    <div className="max-h-[34%] overflow-y-auto border-t border-border bg-background/70 px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[12px] font-bold uppercase tracking-wider text-muted-foreground">文档详情</h3>
        <div className="flex min-w-0 items-center gap-2">
          {summary?.summary_origin === "local_fallback" && (
            <span className="shrink-0 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-400">
              本地兜底
            </span>
          )}
          {summary?.summary_origin?.startsWith("llm") && (
            <span className="shrink-0 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">
              AI 摘要
            </span>
          )}
          <span className="max-w-36 truncate text-[10px] text-muted-foreground">{document.name}</span>
        </div>
      </div>

      {!hasContent && (
        <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-3">
          <p className="text-[12px] font-medium text-foreground">暂无摘要</p>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
            旧文档可能还没有摘要，可以手动生成。
          </p>
          {onGenerateSummary && (
            <button
              type="button"
              disabled={isSummarizing}
              onClick={() => onGenerateSummary(document.id)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-wait disabled:opacity-70"
            >
              {isSummarizing ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              {isSummarizing ? "生成中" : "生成摘要"}
            </button>
          )}
        </div>
      )}

      {summary?.one_sentence && (
        <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-[12px] leading-5 text-foreground">
          {summary.one_sentence}
        </p>
      )}

      {summary && summary.keywords.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
            <Tags className="h-3 w-3" />
            关键词
          </div>
          <div className="flex flex-wrap gap-1">
            {summary.keywords.map((keyword) => (
              <span key={keyword} className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                {keyword}
              </span>
            ))}
          </div>
        </div>
      )}

      {summary?.detailed && (
        <div className="mt-3">
          <h4 className="mb-1 text-[11px] font-semibold text-muted-foreground">详细摘要</h4>
          <p className="text-[12px] leading-5 text-foreground/85">{summary.detailed}</p>
        </div>
      )}

      {summary && summary.outline.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
            <ListTree className="h-3 w-3" />
            文档大纲
          </div>
          <ol className="space-y-1 text-[12px] text-foreground/85">
            {summary.outline.map((item, idx) => (
              <li key={`${item}-${idx}`} className="flex gap-2">
                <span className="text-muted-foreground">{idx + 1}.</span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {summary && summary.section_summaries.length > 0 && (
        <div className="mt-3">
          <h4 className="mb-1.5 text-[11px] font-semibold text-muted-foreground">章节摘要</h4>
          <div className="space-y-2">
            {summary.section_summaries.map((section, idx) => (
              <div key={`${section.title}-${idx}`} className="rounded-md border border-border bg-card px-3 py-2">
                <p className="text-[12px] font-semibold text-foreground">{section.title || `章节 ${idx + 1}`}</p>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{section.summary}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
